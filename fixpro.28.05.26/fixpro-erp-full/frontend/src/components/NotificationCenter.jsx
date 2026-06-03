import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, ChevronLeft } from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'

const PRIORITY_DOT = {
  critical: '#EF4444',
  high:     '#F97316',
  normal:   '#3B82F6',
  low:      '#9CA3AF',
}

export default function NotificationCenter({ onCountChange }) {
  const [open, setOpen]   = useState(false)
  const panelRef          = useRef()
  const qc                = useQueryClient()
  const navigate          = useNavigate()

  // جلب الإشعارات — نفس الـ query key كصفحة الإشعارات
  const { data } = useQuery({
    queryKey: ['notifications-internal'],
    queryFn: () => api.get('/notifications?limit=10'),
    refetchInterval: 10000,
  })

  const notifs  = data?.data || []
  const unread  = notifs.filter(n => !n.is_read).length

  // أخبر App.jsx بالعدد
  useEffect(() => {
    onCountChange?.(unread)
  }, [unread])

  // تعليم الكل كمقروء
  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-internal'] })
      toast.success('تم تعليم الكل كمقروء')
    }
  })

  // إغلاق عند النقر خارج النافذة
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div style={{ position:'relative' }} ref={panelRef}>

      {/* زر الجرس */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position:'relative', background:'none', border:'none',
          cursor:'pointer', padding:'6px', borderRadius:8,
          color: open ? 'var(--blue)' : 'var(--muted)',
          display:'flex', alignItems:'center',
          transition:'color .15s'
        }}
      >
        <Bell size={18}/>
        {unread > 0 && (
          <span style={{
            position:'absolute', top:0, right:0,
            background:'#EF4444', color:'#fff',
            fontSize:9, fontWeight:900, borderRadius:10,
            padding:'1px 5px', minWidth:16, textAlign:'center',
            lineHeight:'14px', border:'2px solid var(--ink-2)'
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* النافذة المنبثقة */}
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', left:0,
          width:360, maxHeight:480,
          background:'var(--ink-2)', border:'1px solid var(--border)',
          borderRadius:12, boxShadow:'0 16px 48px rgba(0,0,0,.4)',
          zIndex:200, display:'flex', flexDirection:'column',
          overflow:'hidden'
        }}>

          {/* Header */}
          <div style={{
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Bell size={14} color="var(--blue)"/>
              <span style={{ fontWeight:700, fontSize:13, color:'var(--text-2)' }}>
                الإشعارات
              </span>
              {unread > 0 && (
                <span style={{
                  background:'var(--blue)', color:'#fff',
                  fontSize:10, fontWeight:700, borderRadius:10,
                  padding:'1px 7px'
                }}>{unread}</span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                style={{ background:'none', border:'none', cursor:'pointer',
                  fontSize:11, color:'var(--blue)', fontFamily:'var(--font)',
                  display:'flex', alignItems:'center', gap:4 }}
              >
                <CheckCircle size={12}/> تعليم الكل
              </button>
            )}
          </div>

          {/* القائمة */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {notifs.length === 0 ? (
              <div style={{ padding:'32px 16px', textAlign:'center', color:'var(--muted)', fontSize:12 }}>
                <Bell size={28} style={{ margin:'0 auto 8px', display:'block', opacity:.3 }}/>
                لا توجد إشعارات
              </div>
            ) : notifs.map(n => (
              <div
                key={n.id}
                onClick={() => { setOpen(false); navigate('/notifications') }}
                style={{
                  display:'flex', gap:10, padding:'10px 16px',
                  borderBottom:'1px solid var(--border)',
                  borderRight:`3px solid ${
                    n.priority === 'critical' ? '#EF4444' :
                    n.priority === 'high'     ? '#F97316' : 'transparent'
                  }`,
                  background: n.is_read ? 'transparent' : 'rgba(59,130,246,.04)',
                  cursor:'pointer', transition:'background .1s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--ink-3)'}
                onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(59,130,246,.04)'}
              >
                {/* نقطة الأولوية */}
                <div style={{
                  width:8, height:8, borderRadius:'50%', flexShrink:0, marginTop:5,
                  background: PRIORITY_DOT[n.priority || 'normal'],
                  boxShadow: !n.is_read ? `0 0 6px ${PRIORITY_DOT[n.priority || 'normal']}` : 'none'
                }}/>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{
                    fontSize:12, color: n.is_read ? 'var(--text)' : 'var(--text-2)',
                    fontWeight: n.is_read ? 400 : 500,
                    lineHeight:1.4, marginBottom:3,
                    overflow:'hidden', textOverflow:'ellipsis',
                    display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'
                  }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>
                    {n.created_at ? new Date(n.created_at).toLocaleString('ar-SA', {
                      hour:'2-digit', minute:'2-digit',
                      day:'numeric', month:'short'
                    }) : ''}
                    {n.order_number && (
                      <span style={{ color:'var(--blue)', marginRight:6, fontFamily:'monospace' }}>
                        {n.order_number}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding:'10px 16px', borderTop:'1px solid var(--border)',
            flexShrink:0
          }}>
            <button
              onClick={() => { setOpen(false); navigate('/notifications') }}
              style={{
                width:'100%', padding:'7px', background:'var(--ink-3)',
                border:'1px solid var(--border)', borderRadius:8,
                cursor:'pointer', fontFamily:'var(--font)', fontSize:12,
                color:'var(--text-2)', display:'flex', alignItems:'center',
                justifyContent:'center', gap:6
              }}
            >
              عرض كل الإشعارات <ChevronLeft size={13}/>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
