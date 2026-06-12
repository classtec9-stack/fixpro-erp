import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Loading, EmptyState, Modal } from '../components/ui'
import { Bell, CheckCircle, Package, Users, Clock, ChevronLeft, Phone, User, AlertTriangle, Wrench } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { StatusChangeButton } from '../components/StatusChange'
import { CheckCircle as CheckIcon, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

const NOTIF_CONFIG = {
  part_request:     { icon: Package, color: '#F97316', bg: 'rgba(249,115,22,.12)', label: 'طلب قطعة غيار' },
  customer_review:  { icon: Users,   color: '#3B82F6', bg: 'rgba(59,130,246,.12)',  label: 'تواصل مع عميل' },
  abandoned_device: { icon: Clock,   color: '#EF4444', bg: 'rgba(239,68,68,.12)',   label: 'جهاز متروك' },
  status_change:    { icon: Wrench,  color: '#10B981', bg: 'rgba(16,185,129,.12)',  label: 'تحديث حالة' },
  part_transfer:    { icon: Package, color: '#F97316', bg: 'rgba(249,115,22,.12)',  label: 'تحويل قطعة' },
  general:          { icon: Bell,    color: '#8B5CF6', bg: 'rgba(139,92,246,.12)', label: 'إشعار' },
  device_ready:     { icon: CheckCircle, color: '#10B981', bg: 'rgba(16,185,129,.12)',  label: 'جهاز جاهز' },
  low_stock:        { icon: AlertTriangle, color: '#EF4444', bg: 'rgba(239,68,68,.12)', label: 'مخزون منخفض' },
  sla_breach:       { icon: Clock,      color: '#EF4444', bg: 'rgba(239,68,68,.12)',   label: 'تجاوز SLA' },
}

const PRIORITY_CONFIG = {
  critical: { label:'حرج',   color:'#EF4444', bg:'rgba(239,68,68,.15)',   border:'rgba(239,68,68,.4)',   dot:'#EF4444' },
  high:     { label:'عالي',  color:'#F97316', bg:'rgba(249,115,22,.1)',   border:'rgba(249,115,22,.3)',  dot:'#F97316' },
  normal:   { label:'عادي',  color:'#3B82F6', bg:'rgba(59,130,246,.08)', border:'rgba(59,130,246,.2)',  dot:'#3B82F6' },
  low:      { label:'منخفض', color:'#6B7280', bg:'rgba(107,114,128,.08)', border:'rgba(107,114,128,.2)', dot:'#9CA3AF' },
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [activeNotif, setActiveNotif] = useState(null)
  const [priorityFilter, setPriorityFilter] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-internal'],
    queryFn: () => api.get('/notifications?limit=50'),
    refetchInterval: 15000
  })

  const { data: abandoned } = useQuery({
    queryKey: ['abandoned'],
    queryFn: () => api.get('/tickets/abandoned'),
    enabled: ['admin','branch_manager','customer_service'].includes(user?.role)
  })

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-internal'] })
      qc.invalidateQueries({ queryKey: ['notifications-live'] })
    }
  })

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-internal'] })
      qc.invalidateQueries({ queryKey: ['notifications-live'] })
      toast.success('تم تعليم الكل كمقروء')
    }
  })

  const notifs  = data?.data || []
  const unread  = notifs.filter(n => !n.is_read)
  const filtered = priorityFilter === 'all'
    ? notifs
    : notifs.filter(n => (n.priority || 'normal') === priorityFilter)

  const handleClick = (notif) => {
    if (!notif.is_read) markRead.mutate(notif.id)
    setActiveNotif(notif)
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">الإشعارات</div>
          <div className="page-sub">{unread.length} غير مقروء</div>
        </div>
        {unread.length > 0 && (
          <button className="btn btn-ghost" onClick={() => markAll.mutate()}>
            <CheckCircle size={14}/> تعليم الكل كمقروء
          </button>
        )}
      </div>

      {/* فلتر الأولوية */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { key:'all',      label:'الكل',   count: notifs.length },
          { key:'critical', label:'حرج',    count: notifs.filter(n=>(n.priority||'normal')==='critical').length },
          { key:'high',     label:'عالي',   count: notifs.filter(n=>(n.priority||'normal')==='high').length },
          { key:'normal',   label:'عادي',   count: notifs.filter(n=>(n.priority||'normal')==='normal').length },
          { key:'low',      label:'منخفض',  count: notifs.filter(n=>(n.priority||'normal')==='low').length },
        ].map(f => {
          const pc = f.key !== 'all' ? PRIORITY_CONFIG[f.key] : null
          const isActive = priorityFilter === f.key
          return (
            <button key={f.key} onClick={() => setPriorityFilter(f.key)} style={{
              padding:'5px 14px', borderRadius:20, border:'1px solid',
              borderColor: isActive ? (pc?.color || 'var(--blue)') : 'var(--border)',
              background: isActive ? (pc?.bg || 'rgba(59,130,246,.1)') : 'transparent',
              color: isActive ? (pc?.color || 'var(--blue)') : 'var(--muted)',
              fontSize:12, fontFamily:'var(--font)', cursor:'pointer', fontWeight: isActive ? 700 : 400,
              display:'flex', alignItems:'center', gap:5
            }}>
              {pc && <span style={{ width:7, height:7, borderRadius:'50%', background:pc.dot, display:'inline-block' }}/>}
              {f.label}
              {f.count > 0 && (
                <span style={{ background: isActive ? (pc?.color||'var(--blue)') : 'var(--ink-3)',
                  color: isActive ? '#fff' : 'var(--muted)', borderRadius:10,
                  padding:'1px 7px', fontSize:10, fontWeight:700 }}>{f.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* أجهزة متروكة */}
      {abandoned?.data?.length > 0 && (
        <div className="card mb-3" style={{ borderColor:'rgba(239,68,68,.3)', background:'rgba(239,68,68,.04)' }}>
          <div className="card-header">
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--red)' }}>
              <AlertTriangle size={16}/>
              <span className="card-title" style={{ color:'var(--red)' }}>
                أجهزة تحتاج متابعة ({abandoned.data.length})
              </span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>رقم التذكرة</th><th>العميل</th><th>الجهاز</th><th>الحالة</th><th>أيام</th><th></th></tr></thead>
              <tbody>
                {abandoned.data.map(a => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs text-blue">{a.order_number}</td>
                    <td>
                      <div style={{ fontWeight:500, color:'var(--text-2)' }}>{a.customer_name}</div>
                      <div className="text-xs text-muted">{a.customer_phone}</div>
                    </td>
                    <td className="text-sm">{a.brand} {a.model}</td>
                    <td><span className="badge badge-ready">{a.status === 'ready' ? 'جاهز' : 'انتظار موافقة'}</span></td>
                    <td>
                      <span style={{ fontFamily:'var(--mono)', fontWeight:700, color: a.days_in_shop > 14 ? 'var(--red)' : 'var(--amber)' }}>
                        {Math.floor(a.days_in_shop)} يوم
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const wa = `https://wa.me/966${a.customer_phone?.replace(/[^0-9]/g,'').replace(/^0/,'')}?text=${encodeURIComponent(`مرحباً ${a.customer_name}،\nجهازك ${a.brand} ${a.model} (${a.order_number}) جاهز للاستلام منذ ${Math.floor(a.days_in_shop)} أيام.\nيرجى الحضور في أقرب وقت.`)}`
                          window.open(wa, '_blank')
                        }}>
                        <Phone size={13}/> تواصل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* قائمة الإشعارات */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : !notifs.length
          ? <EmptyState icon={Bell} message="لا توجد إشعارات" sub="ستظهر هنا إشعارات عملك" />
          : (
            <div>
              {filtered.map(n => {
                const cfg = NOTIF_CONFIG[n.type] || NOTIF_CONFIG.general
                const pc  = PRIORITY_CONFIG[n.priority || 'normal'] || PRIORITY_CONFIG.normal
                const Icon = cfg.icon
                return (
                  <div key={n.id} onClick={() => handleClick(n)} style={{
                    display:'flex', gap:12, padding:'14px 18px',
                    borderBottom:'1px solid var(--border)',
                    borderRight: n.priority === 'critical' ? '3px solid #EF4444' :
                                 n.priority === 'high'     ? '3px solid #F97316' : '3px solid transparent',
                    background: n.is_read ? 'transparent' : 'rgba(59,130,246,.04)',
                    cursor:'pointer', transition:'background .15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--ink-3)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(59,130,246,.04)'}>
                    <div style={{ width:38, height:38, borderRadius:8, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Icon size={17} color={cfg.color}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                          <span style={{ fontSize:11, fontWeight:600, color:cfg.color, padding:'1px 6px', background:cfg.bg, borderRadius:4 }}>
                            {cfg.label}
                          </span>
                          {n.priority && n.priority !== 'normal' && (
                            <span style={{ fontSize:10, fontWeight:700, color:pc.color, padding:'1px 6px',
                              background:pc.bg, borderRadius:4, border:`1px solid ${pc.border}` }}>
                              {pc.label}
                            </span>
                          )}
                        </div>
                        {!n.is_read && <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--blue)', flexShrink:0, marginTop:4 }}/>}
                      </div>
                      <div style={{ fontSize:13, color: n.is_read ? 'var(--text)' : 'var(--text-2)', fontWeight: n.is_read ? 400 : 500, marginTop:4, lineHeight:1.4 }}>
                        {n.message}
                      </div>
                      {n.order_number && (
                        <div className="text-xs text-blue font-mono mt-1">{n.order_number}</div>
                      )}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:4 }}>
                        <div className="text-xs text-muted">
                          {n.created_at ? new Date(n.created_at).toLocaleString('ar-SA') : ''}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4, color:'var(--blue)', fontSize:12 }}>
                          فتح التذكرة <ChevronLeft size={13}/>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }
      </div>

      {/* نافذة تفاصيل الإشعار */}
      {activeNotif && (
        <NotifActionModal
          notif={activeNotif}
          onClose={() => setActiveNotif(null)}
          onDone={() => {
            setActiveNotif(null)
            qc.invalidateQueries({ queryKey: ['notifications-internal'] })
            qc.invalidateQueries({ queryKey: ['notifications-live'] })
          }}
        />
      )}
    </div>
  )
}

// ── نافذة الإجراء على الإشعار ────────────────────────────
function NotifActionModal({ notif, onClose, onDone }) {
  const qc = useQueryClient()
  // هل الإشعار مقفول بالفعل؟
  const [lockInfo, setLockInfo] = useState(
    notif.claimed_by ? { name: notif.claimed_by_name, action: notif.action_taken } : null
  )
  const [claiming, setClaiming] = useState(false)

  // قفل الإشعار — يُستدعى قبل أي إجراء
  const tryClaimFirst = async (actionLabel) => {
    if (lockInfo) return false
    try {
      setClaiming(true)
      await api.patch(`/notifications/${notif.id}/claim`, { action_taken: actionLabel })
      qc.invalidateQueries({ queryKey: ['notifications-internal'] })
      qc.invalidateQueries({ queryKey: ['notifications-live'] })
      return true
    } catch (err) {
      if (err?.already_claimed) {
        setLockInfo({ name: err.claimed_by_name, action: err.action_taken })
        toast.error(err.message)
        return false
      }
      toast.error(err?.message || 'خطأ')
      return false
    } finally {
      setClaiming(false)
    }
  }

  // جلب تفاصيل التذكرة
  const { data: ticketData, isLoading } = useQuery({
    queryKey: ['ticket-notif', notif.order_id],
    queryFn: () => api.get(`/tickets/${notif.order_id}`),
    enabled: !!notif.order_id
  })
  const t = ticketData?.data

  const cfg = (NOTIF_CONFIG[notif.type] || NOTIF_CONFIG.general)
  const Icon = cfg.icon

  return (
    <Modal open={true} onClose={onClose}
      title={
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:30, height:30, borderRadius:6, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon size={15} color={cfg.color}/>
          </div>
          {cfg.label}
          {notif.order_number && <span className="font-mono text-xs text-blue">{notif.order_number}</span>}
        </div>
      }
      maxWidth={580}>

      {isLoading ? <Loading /> : !t ? (
        <div style={{ textAlign:'center', padding:30, color:'var(--muted)' }}>
          <div style={{ fontSize:12 }}>{notif.message}</div>
          <div className="text-xs text-muted mt-2">التذكرة غير متاحة</div>
        </div>
      ) : lockInfo ? (
        <div>
          {/* الرسالة */}
          <div style={{ padding:'10px 14px', background: cfg.bg, borderRadius:8, marginBottom:16, fontSize:13, color:'var(--text-2)', borderRight:`3px solid ${cfg.color}` }}>
            {notif.message}
          </div>
          {/* بانر القفل */}
          <div style={{
            display:'flex', alignItems:'center', gap:12, padding:'16px',
            background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.3)',
            borderRadius:10, marginBottom:8
          }}>
            <div style={{ width:42, height:42, borderRadius:'50%', background:'rgba(16,185,129,.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Lock size={20} color="var(--green)"/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--green)', marginBottom:2 }}>
                تم اتخاذ إجراء على هذا الإشعار
              </div>
              <div style={{ fontSize:12, color:'var(--muted-2)' }}>
                بواسطة: <strong style={{ color:'var(--text-2)' }}>{lockInfo.name || 'موظف آخر'}</strong>
                {lockInfo.action && ` — ${lockInfo.action}`}
              </div>
            </div>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginBottom:12 }}>
            🔒 الإشعار مقفول ولا يمكن اتخاذ إجراء آخر عليه
          </div>
          <button className="btn btn-ghost w-full" onClick={onClose}>إغلاق</button>
        </div>
      ) : (
        <div>
          {/* الرسالة */}
          <div style={{ padding:'10px 14px', background: cfg.bg, borderRadius:8, marginBottom:16, fontSize:13, color:'var(--text-2)', borderRight:`3px solid ${cfg.color}` }}>
            {notif.message}
          </div>

          {/* بيانات التذكرة */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            <InfoItem label="العميل" value={t.customer_name} />
            <InfoItem label="الجوال" value={t.customer_phone} mono />
            <InfoItem label="الجهاز" value={`${t.brand} ${t.model}`} />
            <InfoItem label="الحالة" value={
              <span className={`badge badge-${t.status === 'waiting_part' ? 'wait' : t.status === 'waiting_approval' ? 'wait' : 'new'}`}>
                {t.status === 'waiting_part' ? 'ينتظر قطعة' : t.status === 'waiting_approval' ? 'انتظار موافقة' : t.status}
              </span>
            } />
            {t.problem_desc && <InfoItem label="المشكلة" value={t.problem_desc} span />}
          </div>

          {/* إجراءات حسب نوع الإشعار */}
          {notif.type === 'customer_review' && (
            <CustomerReviewActions ticket={t} onDone={onDone} claimFirst={tryClaimFirst} claiming={claiming} />
          )}
          {notif.type === 'part_request' && (
            <PartRequestActions ticket={t} onDone={onDone} claimFirst={tryClaimFirst} claiming={claiming} />
          )}
          {(notif.type === 'device_ready' || (notif.type === 'status_change' && t?.status === 'ready')) && (
            ['admin','branch_manager','customer_service'].includes(user?.role)
              ? <DeviceReadyWhatsApp ticket={t} notif={notif} onDone={onDone} claimFirst={tryClaimFirst} claiming={claiming} />
              : <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          )}
          {notif.type === 'status_change' && t?.status !== 'ready' && (
            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              <StatusChangeButton ticket={t} onSuccess={onDone} />
              <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
            </div>
          )}
          {!['customer_review','part_request','status_change','device_ready'].includes(notif.type) && (
            <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── إجراءات خدمة العملاء ──────────────────────────────────
function CustomerReviewActions({ ticket, onDone, claimFirst, claiming }) {
  const [msg, setMsg] = useState('')
  const qc = useQueryClient()

  const updateStatus = useMutation({
    mutationFn: (status) => api.patch(`/tickets/${ticket.id}/status`, { status, note: msg }),
    onSuccess: () => { toast.success('تم التحديث'); onDone() },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  // اتخاذ إجراء بعد قفل الإشعار
  const doAction = async (status, label) => {
    const ok = await claimFirst(label)
    if (ok) updateStatus.mutate(status)
  }

  const openWhatsApp = () => {
    const phone = ticket.customer_phone?.replace(/[^0-9]/g,'').replace(/^0/,'')
    const text  = msg || `مرحباً ${ticket.customer_name}، بخصوص إصلاح ${ticket.brand} ${ticket.model} (${ticket.order_number}).`
    window.open(`https://wa.me/966${phone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div>
      <div style={{ fontWeight:500, color:'var(--text-2)', marginBottom:10, fontSize:13 }}>
        📞 التواصل مع العميل
      </div>
      <div className="form-group mb-3">
        <label className="form-label">رسالة للعميل (اختياري)</label>
        <textarea className="form-textarea" rows={3} value={msg} onChange={e => setMsg(e.target.value)}
          placeholder={`مرحباً ${ticket.customer_name}، بخصوص إصلاح ${ticket.brand} ${ticket.model}...`} />
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button className="btn" style={{ background:'#25D366', color:'#fff', border:'none' }} onClick={openWhatsApp}>
          <Phone size={13}/> فتح واتساب
        </button>
        <button className="btn btn-primary" onClick={() => doAction('in_repair', 'وافق العميل — بدء الإصلاح')}
          disabled={updateStatus.isPending || claiming}>
          ✅ وافق العميل — بدء الإصلاح
        </button>
        <button className="btn btn-danger" onClick={() => doAction('rejected', 'رفض العميل')}
          disabled={updateStatus.isPending || claiming}>
          ✗ رفض العميل
        </button>
        <button className="btn btn-ghost" onClick={onDone}>إغلاق</button>
      </div>
    </div>
  )
}

// ── إجراءات المخزن — تحويل القطعة مباشرة ─────────────────

// ── تأكيد استلام القطعة من الفني ────────────────────────
function TechnicianReceivePanel({ ticket, onDone, claimFirst }) {
  const qc = useQueryClient()

  const confirm = useMutation({
    mutationFn: () => api.patch(`/tickets/${ticket.id}/status`, {
      status: 'in_repair',
      note: '✅ الفني أكّد استلام القطعة — بدء الإصلاح'
    }),
    onSuccess: async () => {
      // قفل الإشعار بعد التأكيد
      if (claimFirst) await claimFirst('الفني أكّد استلام القطعة').catch(() => {})
      toast.success('تم تأكيد الاستلام ✅ — التذكرة داخل الورشة')
      qc.invalidateQueries({ queryKey: ['my-tickets'] })
      onDone()
    },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  return (
    <div style={{ textAlign:'center', padding:'20px 10px' }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📦</div>
      <div style={{ fontWeight:700, color:'var(--text-2)', fontSize:15, marginBottom:8 }}>
        وصلت قطعة لتذكرتك
      </div>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20, lineHeight:1.7 }}>
        {ticket.problem_desc || 'قطعة غيار مطلوبة'}
        <br/>
        <span style={{ color:'var(--amber)', fontSize:11 }}>
          أكّد الاستلام لتحويل التذكرة لـ "داخل الورشة"
        </span>
      </div>
      <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
        <button className="btn btn-primary"
          onClick={() => confirm.mutate()}
          disabled={confirm.isPending}>
          {confirm.isPending ? 'جاري...' : '✅ استلمت القطعة — بدء الإصلاح'}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>لاحقاً</button>
      </div>
    </div>
  )
}

// ── قرار الفني عند رفض العميل ─────────────────────────
function TechnicianRejectionPanel({ ticket, onDone, claimFirst }) {
  const qc = useQueryClient()

  const decide = useMutation({
    mutationFn: (return_parts) =>
      api.post(`/tickets/${ticket.id}/rejection-decision`, { return_parts }),
    onSuccess: async (_, return_parts) => {
      if (claimFirst) await claimFirst(
        return_parts ? 'الفني أرجع القطعة للمخزون' : 'الفني: القطعة مركّبة'
      ).catch(() => {})
      toast.success(return_parts
        ? '✅ تم إرجاع القطعة للمخزون وإغلاق التذكرة'
        : '✅ تم إغلاق التذكرة — القطعة مركّبة')
      qc.invalidateQueries({ queryKey: ['my-tickets'] })
      onDone()
    },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  return (
    <div style={{ padding:'16px 10px' }}>
      <div style={{ fontSize:32, textAlign:'center', marginBottom:10 }}>⚠️</div>
      <div style={{ fontWeight:700, color:'var(--amber)', fontSize:14, textAlign:'center', marginBottom:6 }}>
        رفض العميل الإصلاح
      </div>
      <div style={{ fontSize:12, color:'var(--text)', textAlign:'center', marginBottom:20, lineHeight:1.7 }}>
        {ticket.brand} {ticket.model} — {ticket.problem_desc || ''}
        <br/>
        <span style={{ color:'var(--muted)', fontSize:11 }}>
          هل تم تركيب القطعة في الجهاز؟
        </span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <button className="btn btn-primary" style={{ justifyContent:'center' }}
          onClick={() => decide.mutate(true)}
          disabled={decide.isPending}>
          ↩️ لم تُركَّب — أرجعها للمخزون وأغلق التذكرة
        </button>
        <button className="btn" style={{
          justifyContent:'center', background:'var(--red-dim)',
          color:'var(--red)', border:'1px solid rgba(239,68,68,.3)'
        }}
          onClick={() => decide.mutate(false)}
          disabled={decide.isPending}>
          ✗ تم تركيبها — أغلق التذكرة بدون إرجاع
        </button>
        <button className="btn btn-ghost" style={{ justifyContent:'center' }}
          onClick={onDone}>لاحقاً</button>
      </div>
    </div>
  )
}

function PartRequestActions({ ticket, onDone, claimFirst, claiming }) {
  const { user } = useAuth()
  const isWarehouse = ['admin','branch_manager','warehouse'].includes(user?.role)
  const isTech = user?.role === 'technician'

  // إذا الفني — يرى زر تأكيد الاستلام فقط
  if (isTech) {
    if (ticket.status === 'awaiting_technician_rejection') {
      return <TechnicianRejectionPanel ticket={ticket} onDone={onDone} claimFirst={claimFirst} />
    }
    return <TechnicianReceivePanel ticket={ticket} onDone={onDone} claimFirst={claimFirst} />
  }
  // إذا ليس مخزن ولا فني — رسالة إعلامية
  if (!isWarehouse) {
    return (
      <div style={{ textAlign:'center', padding:24 }}>
        <div style={{ fontSize:32, marginBottom:10 }}>📦</div>
        <div style={{ fontSize:13, color:'var(--muted-2)' }}>هذا الإشعار لمسؤول المخزن فقط</div>
        <button className="btn btn-ghost mt-3" onClick={onDone}>إغلاق</button>
      </div>
    )
  }
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [qty, setQty] = useState(1)
  const [done, setDone] = useState(false)
  const transferring = React.useRef(false)  // منع الضغط المزدوج
  const canTransfer = ['admin','branch_manager','warehouse'].includes(user?.role)

  const { data: stockData } = useQuery({
    queryKey: ['warehouse-stock'],
    queryFn: () => api.get('/inventory/parts?limit=300'),
  })
  const parts = (stockData?.data || []).filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku||'').toLowerCase().includes(search.toLowerCase())
  )

  // تحويل مباشر للقطعة — يخصم من المخزون ويربطها بالتذكرة
  const transfer = useMutation({
    mutationFn: async () => {
      if (transferring.current) throw new Error('جاري التحويل — انتظر');
      transferring.current = true;
      return api.post(`/tickets/${ticket.id}/parts`, {
        part_id: selected.id, quantity: qty, unit_price: selected.sell_price
      });
    },
    onSuccess: async () => {
      // قفل الإشعار بعد التحويل
      await claimFirst(`تم تحويل قطعة: ${selected.name} (×${qty})`).catch(() => {})
      toast.success(`✅ تم تحويل ${selected.name} (×${qty}) للتذكرة وخصمها من المخزون`)
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
      setDone(true)
    },
    onError: e => toast.error(e?.message || 'خطأ في التحويل')
  })

  if (done) return (
    <div style={{ textAlign:'center', padding:24 }}>
      <div style={{ fontSize:40, marginBottom:10 }}>✅</div>
      <div style={{ fontWeight:700, color:'var(--green)', fontSize:14, marginBottom:16 }}>
        تم تحويل القطعة للتذكرة
      </div>
      <button className="btn btn-ghost" onClick={onDone}>إغلاق</button>
    </div>
  )

  return (
    <div>
      <div style={{ padding:'8px 12px', background:'rgba(249,115,22,.08)', borderRadius:6,
        marginBottom:12, fontSize:12, color:'var(--orange)', borderRight:'3px solid var(--orange)' }}>
        📦 <strong>{ticket.problem_desc || 'قطعة مطلوبة'}</strong>
        <div style={{ marginTop:2, color:'var(--muted)' }}>ابحث عن القطعة في المخزون وحوّلها للتذكرة</div>
      </div>

      {/* بحث في المخزون */}
      <input className="form-input mb-2" value={search}
        onChange={e => setSearch(e.target.value)} placeholder="ابحث عن القطعة في المخزون..." autoFocus />

      {/* قائمة القطع */}
      <div style={{ maxHeight:220, overflowY:'auto', border:'1px solid var(--border)', borderRadius:6, marginBottom:12, overflow:'hidden' }}>
        {parts.slice(0,20).map(p => (
          <div key={p.id}
            onClick={() => { setSelected(p); setQty(1) }}
            style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'9px 12px', cursor: p.quantity>0?'pointer':'not-allowed',
              opacity: p.quantity>0?1:.5,
              background: selected?.id===p.id ? 'var(--blue-dim)' : 'transparent',
              borderBottom:'1px solid var(--border)', transition:'background .1s'
            }}>
            <div>
              <div style={{ fontSize:12, fontWeight: selected?.id===p.id?700:400, color:'var(--text-2)' }}>{p.name}</div>
              {p.sku && <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'var(--mono)' }}>{p.sku}</div>}
            </div>
            <div style={{ textAlign:'left', flexShrink:0 }}>
              <div style={{ fontSize:12, color:'var(--blue)', fontFamily:'var(--mono)', fontWeight:600 }}>
                {Number(p.sell_price).toLocaleString()} ر
              </div>
              <div style={{ fontSize:10, color: p.quantity>3?'var(--green)':p.quantity>0?'var(--amber)':'var(--red)' }}>
                {p.quantity > 0 ? `متوفر: ${p.quantity}` : 'نفد'}
              </div>
            </div>
          </div>
        ))}
        {!search && parts.length === 0 && (
          <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:12 }}>
            المخزون فارغ
          </div>
        )}
        {search && parts.length === 0 && (
          <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:12 }}>
            لا توجد قطع تطابق "{search}"
          </div>
        )}
      </div>

      {/* القطعة المختارة + الكمية */}
      {selected && (
        <div style={{ padding:'10px 14px', background:'var(--ink-3)', borderRadius:8,
          border:'1px solid var(--blue)', marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text-2)' }}>{selected.name}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>
                المتوفر: {selected.quantity} قطعة
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>الكمية:</span>
              <input type="number" min={1} max={selected.quantity} value={qty}
                onChange={e => setQty(Math.min(Math.max(1,+e.target.value), selected.quantity))}
                style={{ width:55, padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)',
                  background:'var(--ink)', color:'var(--text-2)', fontFamily:'var(--font)',
                  fontSize:13, textAlign:'center' }} />
            </div>
          </div>
          <div style={{ marginTop:6, fontSize:11, color:'var(--blue)', fontFamily:'var(--mono)' }}>
            الإجمالي: {(Number(selected.sell_price)*qty).toLocaleString()} ريال
          </div>
        </div>
      )}

      {!canTransfer && (
        <div style={{ padding:'10px 14px', background:'rgba(245,158,11,.08)', borderRadius:8,
          border:'1px solid rgba(245,158,11,.3)', fontSize:12, color:'var(--amber)', marginBottom:10 }}>
          ⚠️ يمكن لمسؤول المخزن فقط تنفيذ التحويل. حدّد القطعة وأعلم المخزن.
        </div>
      )}
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn btn-primary" style={{ flex:1 }}
          onClick={() => transfer.mutate()}
          disabled={!selected || transfer.isPending || claiming || !canTransfer}>
          {transfer.isPending ? '⏳ جاري التحويل...' : '📦 تحويل وخصم من المخزون'}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>إغلاق</button>
      </div>
    </div>
  )
}

// ── إرسال واتساب لجهاز جاهز ────────────────────────────
function DeviceReadyWhatsApp({ ticket, notif, onDone, claimFirst, claiming }) {
  const [msg, setMsg] = React.useState('')
  const [sent, setSent] = React.useState(false)

  const defaultMsg = ticket
    ? `مرحباً ${ticket.customer_name} 👋\n\nجهازك جاهز للاستلام ✅\n📱 ${ticket.brand} ${ticket.model}\n🔖 رقم التذكرة: ${ticket.order_number}\n\nيسعدنا خدمتكم 🙏`
    : ''

  const send = async () => {
    const ok = await claimFirst('تم إرسال واتساب للعميل')
    if (!ok) return
    const phone = ticket.customer_phone?.replace(/[^0-9]/g,'').replace(/^0/,'')
    window.open(`https://wa.me/966${phone}?text=${encodeURIComponent(msg || defaultMsg)}`, '_blank')
    setSent(true)
    setTimeout(onDone, 1500)
  }

  if (sent) return (
    <div style={{ textAlign:'center', padding:16 }}>
      <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
      <div style={{ color:'var(--green)', fontWeight:600 }}>تم إرسال الرسالة للعميل</div>
    </div>
  )

  return (
    <div>
      <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:10, fontSize:13 }}>
        📱 إرسال إشعار للعميل عبر واتساب
      </div>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
        {ticket?.customer_name} — {ticket?.customer_phone}
      </div>
      <textarea
        className="form-input" rows={4}
        value={msg || defaultMsg}
        onChange={e => setMsg(e.target.value)}
        style={{ marginBottom:10, direction:'rtl', fontSize:12 }}
      />
      <div style={{ display:'flex', gap:8 }}>
        <button
          style={{ flex:1, padding:'9px', background:'#25D366', color:'#fff', border:'none',
            borderRadius:6, cursor:'pointer', fontFamily:'var(--font)', fontSize:13, fontWeight:600,
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            opacity: claiming ? 0.6 : 1 }}
          disabled={claiming} onClick={send}>
          📱 إرسال واتساب
        </button>
        <button className="btn btn-ghost" onClick={onDone}>لاحقاً</button>
      </div>
    </div>
  )
}

function InfoItem({ label, value, mono, span }) {
  return (
    <div style={{ gridColumn: span ? '1/-1' : 'auto', padding:'8px 10px', background:'var(--ink-3)', borderRadius:6 }}>
      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', fontFamily: mono ? 'var(--mono)' : 'inherit' }}>
        {value}
      </div>
    </div>
  )
}
