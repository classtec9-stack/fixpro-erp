import { useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import toast from 'react-hot-toast'
import { Bell, Package, Users, Clock, Wrench, X } from 'lucide-react'

// ── أيقونات وألوان الإشعارات ──────────────────────────────
const NOTIF_CONFIG = {
  part_request:     { icon: Package, color: '#F97316', bg: 'rgba(249,115,22,.15)', label: 'طلب قطعة' },
  customer_review:  { icon: Users,   color: '#3B82F6', bg: 'rgba(59,130,246,.15)',  label: 'مراجعة عميل' },
  abandoned_device: { icon: Clock,   color: '#EF4444', bg: 'rgba(239,68,68,.15)',   label: 'جهاز متروك' },
  status_change:    { icon: Wrench,  color: '#10B981', bg: 'rgba(16,185,129,.15)',  label: 'تحديث حالة' },
  general:          { icon: Bell,    color: '#8B5CF6', bg: 'rgba(139,92,246,.15)', label: 'إشعار' },
}

// ── Popup Toast مخصص للإشعارات ────────────────────────────
function NotifToast({ notif, onClose }) {
  const cfg = NOTIF_CONFIG[notif.type] || NOTIF_CONFIG.general
  const Icon = cfg.icon

  return (
    <div style={{
      display:'flex', alignItems:'flex-start', gap:12,
      padding:'12px 14px', borderRadius:10,
      background:'var(--ink-2)', border:`1px solid ${cfg.color}40`,
      boxShadow:`0 4px 20px rgba(0,0,0,.4), 0 0 0 1px ${cfg.color}20`,
      minWidth:280, maxWidth:360, direction:'rtl', fontFamily:'var(--font)',
      position:'relative', overflow:'hidden'
    }}>
      {/* خط لوني على اليمين */}
      <div style={{ position:'absolute', right:0, top:0, bottom:0, width:3, background:cfg.color, borderRadius:'0 10px 10px 0' }}/>

      <div style={{
        width:34, height:34, borderRadius:8, background:cfg.bg,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
      }}>
        <Icon size={17} color={cfg.color}/>
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:3 }}>
          {cfg.label}
        </div>
        <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.4 }}>
          {notif.message}
        </div>
        {notif.order_number && (
          <div style={{ fontSize:11, color:cfg.color, marginTop:4, fontFamily:'var(--mono)' }}>
            {notif.order_number}
          </div>
        )}
      </div>

      <button onClick={onClose} style={{
        background:'none', border:'none', cursor:'pointer',
        color:'var(--muted)', padding:2, flexShrink:0,
        display:'flex', alignItems:'center'
      }}>
        <X size={14}/>
      </button>
    </div>
  )
}

// ── Hook الرئيسي للإشعارات الحية ─────────────────────────
export function useNotifications() {
  const qc = useQueryClient()
  const prevCountRef = useRef(0)
  const shownIds = useRef(new Set())

  const { data } = useQuery({
    queryKey: ['notifications-live'],
    queryFn: () => api.get('/notifications?limit=20'),
    refetchInterval: 15000, // كل 15 ثانية
    refetchIntervalInBackground: true,
    retry: false,
  })

  const notifications = data?.data || []
  const unread = notifications.filter(n => !n.is_read)
  const unreadCount = unread.length

  // عرض popup لكل إشعار جديد غير مقروء
  useEffect(() => {
    if (!notifications.length) return

    unread.forEach(notif => {
      if (!shownIds.current.has(notif.id)) {
        shownIds.current.add(notif.id)

        // لا تعرض popup للإشعارات القديمة (أكثر من دقيقتين)
        const age = Date.now() - new Date(notif.created_at).getTime()
        if (age > 120000) return

        const cfg = NOTIF_CONFIG[notif.type] || NOTIF_CONFIG.general

        toast.custom(
          (t) => (
            <NotifToast
              notif={notif}
              onClose={() => toast.dismiss(t.id)}
            />
          ),
          {
            duration: 6000,
            position: 'top-left',
            id: notif.id,
          }
        )
      }
    })
  }, [notifications])

  const markAllRead = useCallback(async () => {
    await api.patch('/notifications/read-all')
    qc.invalidateQueries({ queryKey: ['notifications-live'] })
    qc.invalidateQueries({ queryKey: ['notif-count'] })
  }, [qc])

  return { notifications, unread, unreadCount, markAllRead }
}

// ── Badge الإشعارات في الـ Sidebar ────────────────────────
export function NotificationBadge({ count }) {
  if (!count) return null
  return (
    <span style={{
      marginRight:'auto',
      background: count > 0 ? '#EF4444' : 'transparent',
      color:'#fff',
      fontSize:10, fontWeight:700,
      padding:'1px 6px', borderRadius:10,
      minWidth:18, textAlign:'center',
      animation: count > 0 ? 'pulse 2s infinite' : 'none',
      boxShadow: count > 0 ? '0 0 8px rgba(239,68,68,.6)' : 'none',
    }}>
      {count > 9 ? '9+' : count}
    </span>
  )
}

// ── CSS للـ pulse animation ────────────────────────────────
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: .8; }
    }
  `
  document.head.appendChild(style)
}
