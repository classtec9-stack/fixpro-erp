import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, ChevronLeft, ChevronDown } from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

const PRIORITY_DOT = {
  critical: '#EF4444', high: '#F97316', normal: '#3B82F6', low: '#9CA3AF',
}
const ACTIONABLE = ['part_request', 'customer_review']

export default function NotificationCenter({ onCountChange }) {
  const [open, setOpen]         = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const panelRef                = useRef()
  const qc                      = useQueryClient()
  const navigate                = useNavigate()
  const { user }                = useAuth()

  const { data } = useQuery({
    queryKey: ['notifications-internal'],
    queryFn: () => api.get('/notifications?limit=10'),
    refetchInterval: 10000,
  })
  const notifs = data?.data || []
  const unread = notifs.filter(n => !n.is_read).length

  useEffect(() => { onCountChange?.(unread) }, [unread])

  const claimFirst = async (notifId, actionLabel) => {
    try {
      setClaiming(true)
      await api.patch(`/notifications/${notifId}/claim`, { action_taken: actionLabel })
      qc.invalidateQueries({ queryKey: ['notifications-internal'] })
      return true
    } catch (err) {
      toast.error(err?.already_claimed ? (err.message || 'تم اتخاذ إجراء بالفعل') : (err?.message || 'خطأ'))
      return false
    } finally { setClaiming(false) }
  }

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications-internal'] }); toast.success('تم تعليم الكل كمقروء') }
  })

  const changeStatus = useMutation({
    mutationFn: ({ ticketId, status, note }) => api.patch(`/tickets/${ticketId}/status`, { status, note }),
    onSuccess: () => { toast.success('تم تحديث الحالة'); qc.invalidateQueries({ queryKey: ['notifications-internal'] }); setExpanded(null) },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  const transferPart = useMutation({
    mutationFn: ({ ticketId, partId, price }) => api.post(`/tickets/${ticketId}/parts`, { part_id: partId, quantity: 1, unit_price: price }),
    onSuccess: () => { toast.success('✅ تم تحويل القطعة وخصمها من المخزون'); qc.invalidateQueries({ queryKey: ['notifications-internal'] }); setExpanded(null) },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) { setOpen(false); setExpanded(null) }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isWarehouse = ['admin', 'branch_manager', 'warehouse'].includes(user?.role)
  const isTech      = user?.role === 'technician'

  return (
    <div style={{ position:'relative' }} ref={panelRef}>
      <button onClick={() => setOpen(o => !o)} style={{
        position:'relative', background:'none', border:'none', cursor:'pointer',
        padding:'6px', borderRadius:8, color: open ? 'var(--blue)' : 'var(--muted)',
        display:'flex', alignItems:'center', transition:'color .15s'
      }}>
        <Bell size={18}/>
        {unread > 0 && (
          <span style={{
            position:'absolute', top:0, right:0, background:'#EF4444', color:'#fff',
            fontSize:9, fontWeight:900, borderRadius:10, padding:'1px 5px',
            minWidth:16, textAlign:'center', lineHeight:'14px', border:'2px solid var(--ink-2)'
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', left:0, width:380, maxHeight:520,
          background:'var(--ink-2)', border:'1px solid var(--border)', borderRadius:12,
          boxShadow:'0 16px 48px rgba(0,0,0,.4)', zIndex:200,
          display:'flex', flexDirection:'column', overflow:'hidden'
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Bell size={14} color="var(--blue)"/>
              <span style={{ fontWeight:700, fontSize:13, color:'var(--text-2)' }}>الإشعارات</span>
              {unread > 0 && <span style={{ background:'var(--blue)', color:'#fff', fontSize:10, fontWeight:700, borderRadius:10, padding:'1px 7px' }}>{unread}</span>}
            </div>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()} style={{
                background:'none', border:'none', cursor:'pointer', fontSize:11,
                color:'var(--blue)', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:4
              }}><CheckCircle size={12}/> تعليم الكل</button>
            )}
          </div>

          <div style={{ flex:1, overflowY:'auto' }}>
            {notifs.length === 0 ? (
              <div style={{ padding:'32px 16px', textAlign:'center', color:'var(--muted)', fontSize:12 }}>
                <Bell size={28} style={{ margin:'0 auto 8px', display:'block', opacity:.3 }}/> لا توجد إشعارات
              </div>
            ) : notifs.map(n => {
              const isExp = expanded === n.id
              const canAct = ACTIONABLE.includes(n.type) && !n.claimed_by
              const partTransferredForTech = n.type === 'part_request' && isTech && !n.claimed_by
              const showAction = canAct || partTransferredForTech

              return (
                <div key={n.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <div style={{
                    display:'flex', gap:10, padding:'10px 16px',
                    borderRight:`3px solid ${n.priority==='critical'?'#EF4444':n.priority==='high'?'#F97316':'transparent'}`,
                    background: isExp ? 'var(--ink-3)' : n.is_read ? 'transparent' : 'rgba(59,130,246,.04)',
                    transition:'background .1s'
                  }}>
                    <div style={{
                      width:7, height:7, borderRadius:'50%', flexShrink:0, marginTop:6,
                      background: PRIORITY_DOT[n.priority||'normal'],
                      boxShadow: !n.is_read ? `0 0 5px ${PRIORITY_DOT[n.priority||'normal']}` : 'none'
                    }}/>
                    <div style={{ flex:1, minWidth:0, cursor:'pointer' }}
                      onClick={() => { setOpen(false); navigate('/notifications') }}>
                      <div style={{ fontSize:12, color:n.is_read?'var(--text)':'var(--text-2)', fontWeight:n.is_read?400:500, lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                        {n.order_number && <span style={{ color:'var(--blue)', fontFamily:'monospace', marginLeft:6 }}>{n.order_number} </span>}
                        {n.created_at && new Date(n.created_at).toLocaleString('ar-SA', { hour:'2-digit', minute:'2-digit', day:'numeric', month:'short' })}
                      </div>
                    </div>
                    {showAction && !n.claimed_by && (
                      <button onClick={() => setExpanded(isExp ? null : n.id)} style={{
                        flexShrink:0, background:isExp?'var(--blue)':'var(--blue-dim)', border:'none',
                        borderRadius:6, cursor:'pointer', padding:'4px 8px', fontSize:11,
                        color:isExp?'#fff':'var(--blue)', fontFamily:'var(--font)',
                        display:'flex', alignItems:'center', gap:3
                      }}>
                        إجراء <ChevronDown size={11} style={{ transform:isExp?'rotate(180deg)':'none', transition:'transform .2s' }}/>
                      </button>
                    )}
                    {n.claimed_by && <span style={{ fontSize:10, color:'var(--green)', flexShrink:0, marginTop:4 }}>✓ تم</span>}
                  </div>

                  {isExp && (
                    <div style={{ padding:'12px 16px', background:'var(--ink-3)', borderTop:'1px dashed var(--border)' }}>
                      <QuickAction notif={n} isWarehouse={isWarehouse} isTech={isTech}
                        claiming={claiming} claimFirst={claimFirst}
                        changeStatus={changeStatus} transferPart={transferPart}
                        onClose={() => setExpanded(null)} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
            <button onClick={() => { setOpen(false); navigate('/notifications') }} style={{
              width:'100%', padding:'7px', background:'var(--ink-3)', border:'1px solid var(--border)',
              borderRadius:8, cursor:'pointer', fontFamily:'var(--font)', fontSize:12, color:'var(--text-2)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:6
            }}>عرض كل الإشعارات <ChevronLeft size={13}/></button>
          </div>
        </div>
      )}
    </div>
  )
}

function QuickAction({ notif, isWarehouse, isTech, claiming, claimFirst, changeStatus, transferPart, onClose }) {
  const [partSearch, setPartSearch]   = useState('')
  const [selectedPart, setSelectedPart] = useState(null)

  const { data: ticketData } = useQuery({
    queryKey: ['ticket-quick', notif.order_id],
    queryFn: () => api.get(`/tickets/${notif.order_id}`),
    enabled: !!notif.order_id
  })
  const ticket = ticketData?.data

  const { data: stockData } = useQuery({
    queryKey: ['stock-quick'],
    queryFn: () => api.get('/inventory/parts?limit=200'),
    enabled: notif.type === 'part_request' && isWarehouse
  })
  const parts = (stockData?.data || []).filter(p =>
    !partSearch || p.name?.toLowerCase().includes(partSearch.toLowerCase())
  )

  if (!ticket) return <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'8px 0' }}>جاري التحميل...</div>

  if (notif.type === 'part_request') {
    if (isTech && ticket.status === 'part_transferred') return (
      <div>
        <div style={{ fontSize:12, color:'var(--text)', marginBottom:10 }}>📦 أكّد استلام القطعة لبدء الإصلاح</div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary btn-sm" style={{ flex:1, justifyContent:'center' }} disabled={claiming}
            onClick={async () => {
              const ok = await claimFirst(notif.id, 'الفني أكّد استلام القطعة')
              if (ok) changeStatus.mutate({ ticketId: ticket.id, status: 'in_repair', note: '✅ الفني أكّد الاستلام' })
            }}>✅ استلمت القطعة</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>لاحقاً</button>
        </div>
      </div>
    )

    if (isWarehouse) return (
      <div>
        <div style={{ fontSize:11, color:'var(--amber)', marginBottom:8 }}>
          📦 {ticket.problem_desc || 'قطعة مطلوبة'} — {ticket.brand} {ticket.model}
        </div>
        <input className="form-input" style={{ fontSize:12, padding:'6px 10px', marginBottom:8 }}
          value={partSearch} onChange={e => setPartSearch(e.target.value)} placeholder="ابحث في المخزون..." />
        <div style={{ maxHeight:130, overflowY:'auto', marginBottom:8, border:'1px solid var(--border)', borderRadius:6 }}>
          {parts.slice(0,8).map(p => (
            <div key={p.id} onClick={() => setSelectedPart(selectedPart?.id===p.id?null:p)}
              style={{ padding:'6px 10px', cursor:p.quantity>0?'pointer':'not-allowed', opacity:p.quantity>0?1:.5,
                fontSize:11, background:selectedPart?.id===p.id?'var(--blue-dim)':'transparent',
                display:'flex', justifyContent:'space-between' }}>
              <span style={{ color:'var(--text-2)' }}>{p.name}</span>
              <span style={{ color:p.quantity>0?'var(--green)':'var(--red)', fontFamily:'monospace' }}>
                {p.quantity} | {Number(p.sell_price).toLocaleString('ar-SA')}ر
              </span>
            </div>
          ))}
        </div>
        {selectedPart && <div style={{ fontSize:11, color:'var(--blue)', marginBottom:8 }}>✓ {selectedPart.name}</div>}
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary btn-sm" style={{ flex:1, justifyContent:'center' }}
            disabled={!selectedPart||claiming||transferPart.isPending}
            onClick={async () => {
              const ok = await claimFirst(notif.id, `تحويل: ${selectedPart.name}`)
              if (ok) transferPart.mutate({ ticketId: ticket.id, partId: selectedPart.id, price: selectedPart.sell_price })
            }}>{transferPart.isPending?'...':'📦 تحويل وخصم'}</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    )
    return <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center' }}>هذا الإجراء لمسؤول المخزن فقط</div>
  }

  if (notif.type === 'customer_review') return (
    <div>
      <div style={{ fontSize:12, color:'var(--text)', marginBottom:10 }}>
        📞 {ticket.customer_name} ({ticket.customer_phone})
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn btn-primary btn-sm" style={{ flex:1, justifyContent:'center' }} disabled={claiming}
          onClick={async () => {
            const ok = await claimFirst(notif.id, 'وافق العميل')
            if (ok) changeStatus.mutate({ ticketId: ticket.id, status: 'in_repair', note: 'وافق العميل' })
          }}>✅ وافق</button>
        <button className="btn btn-danger btn-sm" style={{ flex:1, justifyContent:'center' }} disabled={claiming}
          onClick={async () => {
            const ok = await claimFirst(notif.id, 'رفض العميل')
            if (ok) changeStatus.mutate({ ticketId: ticket.id, status: 'rejected', note: 'رفض العميل' })
          }}>✗ رفض</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>لاحقاً</button>
      </div>
    </div>
  )

  return null
}
