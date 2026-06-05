import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { Modal } from './ui'
import toast from 'react-hot-toast'
import { AlertTriangle, Package, Users, CheckCircle, XCircle, ChevronDown } from 'lucide-react'
import DeliveryReceipt from './DeliveryReceipt'
import { useAuth } from '../context/AuthContext'

// الانتقالات المسموحة لـ receptionist فقط
const RECEPTIONIST_ALLOWED = ['new', 'diagnosing', 'ready', 'delivered', 'cancelled']

// ── خريطة الانتقالات المسموحة لكل حالة ──────────────────
const TRANSITIONS = {
  new: [
    { to: 'diagnosing',       label: 'بدء الفحص التفصيلي',        icon: '🔬', color: '#8B5CF6' },
    { to: 'waiting_part',     label: 'طلب قطعة غيار',             icon: '📦', color: '#F97316', needsPart: true },
    { to: 'waiting_approval', label: 'طلب التواصل مع العميل',      icon: '📞', color: '#F59E0B', needsMsg: true },
    { to: 'in_repair',        label: 'بدء الإصلاح مباشرة',        icon: '🔧', color: '#3B82F6' },
    { to: 'rejected',         label: 'رفض / إغلاق التذكرة',        icon: '✗',  color: '#EF4444', needsReason: true },
  ],
  diagnosing: [
    { to: 'in_repair',        label: 'بدء الإصلاح',               icon: '🔧', color: '#3B82F6' },
    { to: 'waiting_part',     label: 'طلب قطعة غيار',             icon: '📦', color: '#F97316', needsPart: true },
    { to: 'waiting_approval', label: 'طلب التواصل مع العميل',      icon: '📞', color: '#F59E0B', needsMsg: true },
    { to: 'rejected',         label: 'غير قابل للإصلاح',           icon: '✗',  color: '#EF4444', needsReason: true },
  ],
  in_repair: [
    { to: 'ready',            label: 'تم الإصلاح — جاهز للتسليم', icon: '✅', color: '#10B981' },
    { to: 'waiting_part',     label: 'نقص قطعة أثناء الإصلاح',    icon: '📦', color: '#F97316', needsPart: true },
    { to: 'waiting_approval', label: 'طلب التواصل مع العميل',      icon: '📞', color: '#F59E0B', needsMsg: true },
    { to: 'diagnosing',       label: 'إعادة الفحص',               icon: '🔬', color: '#8B5CF6' },
  ],
  waiting_part: [
    { to: 'in_repair',        label: 'وصلت القطعة — استمرار الإصلاح', icon: '🔧', color: '#3B82F6' },
    { to: 'waiting_approval', label: 'طلب التواصل مع العميل',      icon: '📞', color: '#F59E0B', needsMsg: true },
    { to: 'rejected',         label: 'إلغاء — القطعة غير متوفرة',  icon: '✗',  color: '#EF4444', needsReason: true },
  ],
  waiting_approval: [
    { to: 'in_repair',        label: 'وافق العميل — بدء الإصلاح', icon: '✅', color: '#10B981' },
    { to: 'waiting_part',     label: 'انتظار قطعة',                icon: '📦', color: '#F97316', needsPart: true },
    { to: 'awaiting_technician_rejection', label: 'رفض العميل — انتظر تأكيد الفني', icon: '⚠️', color: '#EF4444', needsReason: true },
    { to: 'diagnosing',       label: 'إعادة الفحص',                icon: '🔬', color: '#8B5CF6' },
  ],
  awaiting_technician_rejection: [
    { to: 'rejected',  label: 'القطعة لم تُركَّب — أعدها للمخزون', icon: '↩️', color: '#10B981', restorePart: true },
    { to: 'rejected',  label: 'القطعة رُكِّبت — أغلق بدون إرجاع', icon: '✗',  color: '#EF4444' },
  ],
  ready: [
    { to: 'delivered',        label: 'تم تسليم الجهاز للعميل',    icon: '🏠', color: '#10B981' },
    { to: 'in_repair',        label: 'إعادة للإصلاح',             icon: '🔧', color: '#F59E0B' },
  ],
  delivered: [],
  rejected: [],
  cancelled: [],
  quick_check: [],
}

const STATUS_AR = {
  new: 'تم الاستلام', quick_check: 'فحص سريع', diagnosing: 'قيد الفحص',
  waiting_approval: 'انتظار موافقة العميل', in_repair: 'داخل الورشة',
  waiting_part: 'ينتظر قطعة', part_transferred: 'القطعة في الطريق',
  awaiting_technician_rejection: '⚠️ انتظار تأكيد الفني',
  ready: 'جاهز للتسليم',
  delivered: 'تم التسليم', rejected: 'مرفوض', cancelled: 'ملغي'
}

// ── مكوّن تغيير الحالة ───────────────────────────────────
export function StatusChangeButton({ ticket, onSuccess }) {
  const [open, setOpen] = useState(false)
  const [selectedTransition, setSelectedTransition] = useState(null)
  const { user } = useAuth()

  let transitions = TRANSITIONS[ticket.status] || []

  // receptionist يرى فقط الانتقالات المسموحة له
  if (user?.role === 'receptionist') {
    transitions = transitions.filter(t => RECEPTIONIST_ALLOWED.includes(t.to))
  }

  if (!transitions.length) return null

  return (
    <>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
      >
        تغيير الحالة <ChevronDown size={12}/>
      </button>

      {open && (
        <StatusChangeModal
          ticket={ticket}
          transitions={transitions}
          onClose={() => { setOpen(false); setSelectedTransition(null) }}
          onSuccess={() => { setOpen(false); setSelectedTransition(null); onSuccess?.() }}
        />
      )}
    </>
  )
}

// ── نافذة تغيير الحالة ────────────────────────────────────
function StatusChangeModal({ ticket, transitions, onClose, onSuccess }) {
  const qc = useQueryClient()
  const [selected, setSelected]   = useState(null)
  const [note, setNote]           = useState('')
  const [partName, setPartName]   = useState('')
  const [customerMsg, setCustomerMsg] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showDelivery, setShowDelivery] = useState(false)

  const { data: partsData } = useQuery({
    queryKey: ['parts-list'],
    queryFn: () => api.get('/inventory/parts?limit=200'),
    enabled: !!selected?.needsPart
  })

  const updateStatus = useMutation({
    mutationFn: () => {
      const body = {
        status: selected.to,
        note: buildNote(),
      }
      if (selected.needsReason) body.rejection_reason = rejectReason
      return api.patch(`/tickets/${ticket.id}/status`, body)
    },
    onSuccess: () => {
      qc.invalidateQueries(['tickets'])
      qc.invalidateQueries(['tickets-board'])
      qc.invalidateQueries(['dashboard'])
      qc.invalidateQueries(['ticket', ticket.id])
      toast.success(`تم تغيير الحالة إلى: ${STATUS_AR[selected.to]}`)
      onSuccess()
    },
    onError: err => toast.error(err?.message || 'خطأ في تغيير الحالة')
  })

  const buildNote = () => {
    const parts = []
    if (note)         parts.push(note)
    if (partName)     parts.push(`القطعة المطلوبة: ${partName}`)
    if (customerMsg)  parts.push(`رسالة للعميل: ${customerMsg}`)
    if (rejectReason) parts.push(`سبب الرفض: ${rejectReason}`)
    return parts.join(' | ') || null
  }

  const canSubmit = () => {
    if (!selected) return false
    if (selected.needsReason && !rejectReason.trim()) return false
    return true
  }

  // الخطوة 1: اختيار الحالة
  if (!selected) {
    return (
      <Modal open={true} onClose={onClose}
        title={`تغيير حالة: ${ticket.order_number}`}
        footer={<button className="btn btn-ghost" onClick={onClose}>إلغاء</button>}>

        <div style={{ marginBottom:12, padding:'8px 12px', background:'var(--ink-3)', borderRadius:6, fontSize:12 }}>
          الحالة الحالية: <strong style={{ color:'var(--blue)' }}>{STATUS_AR[ticket.status]}</strong>
          {' ← '} <span style={{ color:'var(--muted-2)' }}>اختر الحالة الجديدة</span>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {transitions.map(tr => (
            <div key={tr.to} onClick={() => setSelected(tr)} style={{
              display:'flex', alignItems:'center', gap:12,
              padding:'12px 14px', borderRadius:8, cursor:'pointer',
              border:`1px solid var(--border)`, background:'var(--ink-3)',
              transition:'all .15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = tr.color; e.currentTarget.style.background = `${tr.color}12` }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--ink-3)' }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{tr.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:500, color:'var(--text-2)', fontSize:13 }}>{tr.label}</div>
                <div style={{ fontSize:11, color:'var(--muted-2)', marginTop:2 }}>
                  → {STATUS_AR[tr.to]}
                  {tr.needsPart   && ' • يُرسل إشعار لمسؤول المخزن'}
                  {tr.needsMsg    && ' • يُرسل إشعار لموظف خدمة العملاء'}
                </div>
              </div>
              <div style={{ width:10, height:10, borderRadius:'50%', background:tr.color, flexShrink:0 }}/>
            </div>
          ))}
        </div>
      </Modal>
    )
  }

  // الخطوة 2: تفاصيل الحالة المختارة
  return (
    <Modal open={true} onClose={onClose}
      title={`${selected.icon} ${selected.label}`}
      footer={
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>← رجوع</button>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button
            className={`btn ${selected.to === 'rejected' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              // عند التسليم — أظهر وصل التسليم أولاً
              if (selected.to === 'delivered') {
                setShowDelivery(true)
              } else {
                updateStatus.mutate()
              }
            }}
            disabled={updateStatus.isPending || !canSubmit()}>
            {updateStatus.isPending ? 'جاري التحديث...' : `تأكيد — ${STATUS_AR[selected.to]}`}
          </button>
        </div>
      }>

        {/* وصل التسليم */}
        {showDelivery && (
          <DeliveryReceipt
            ticket={ticket}
            onClose={() => setShowDelivery(false)}
            onConfirm={() => {
              setShowDelivery(false)
              updateStatus.mutate()
            }}
          />
        )}

      {/* معلومات التذكرة */}
      <div style={{ display:'flex', gap:16, padding:'10px 14px', background:'var(--ink-3)', borderRadius:8, marginBottom:16, fontSize:13 }}>
        <div>
          <div className="text-xs text-muted">العميل</div>
          <div style={{ fontWeight:500 }}>{ticket.customer_name}</div>
          <div className="text-xs text-muted2">{ticket.customer_phone}</div>
        </div>
        <div>
          <div className="text-xs text-muted">الجهاز</div>
          <div style={{ fontWeight:500 }}>{ticket.brand} {ticket.model}</div>
        </div>
        <div>
          <div className="text-xs text-muted">الحالة الجديدة</div>
          <div style={{ fontWeight:600, color: selected.color }}>{STATUS_AR[selected.to]}</div>
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* طلب قطعة غيار */}
        {selected.needsPart && (
          <div style={{ padding:14, background:'rgba(249,115,22,.06)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, color:'#F97316', fontWeight:500 }}>
              <Package size={15}/> طلب قطعة غيار
            </div>
            <div className="form-group mb-2">
              <label className="form-label">اسم القطعة المطلوبة *</label>
              <div style={{ display:'flex', gap:8 }}>
                <input className="form-input" value={partName}
                  onChange={e => setPartName(e.target.value)}
                  placeholder="مثال: شاشة iPhone 14 Pro" style={{ flex:1 }} />
              </div>
              {/* اقتراحات من المخزون */}
              {partsData?.data?.length > 0 && (
                <div style={{ marginTop:6 }}>
                  <div className="text-xs text-muted mb-1">اختر من المخزون:</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                    {partsData.data.slice(0,8).map(p => (
                      <span key={p.id} onClick={() => setPartName(p.name)}
                        style={{ padding:'2px 8px', borderRadius:4, background:'var(--ink-4)',
                          fontSize:11, cursor:'pointer', color:'var(--muted-2)',
                          border:'1px solid var(--border)' }}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ fontSize:11, color:'#F97316', marginTop:4 }}>
              ⚡ سيُرسل إشعار تلقائي لمسؤول المخزن بهذا الطلب
            </div>
          </div>
        )}

        {/* طلب التواصل مع العميل */}
        {selected.needsMsg && (
          <div style={{ padding:14, background:'rgba(245,158,11,.06)', border:'1px solid rgba(245,158,11,.25)', borderRadius:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, color:'#F59E0B', fontWeight:500 }}>
              <Users size={15}/> التواصل مع العميل
            </div>
            <div className="form-group">
              <label className="form-label">ما الذي يجب إبلاغ العميل به؟ *</label>
              <textarea className="form-textarea" rows={3} value={customerMsg}
                onChange={e => setCustomerMsg(e.target.value)}
                placeholder="مثال: تكلفة الإصلاح ستكون 350 ريال، هل تريد المتابعة؟&#10;مثال: الجهاز يحتاج استبدال الشاشة بتكلفة 450 ريال" />
            </div>
            <div style={{ fontSize:11, color:'#F59E0B', marginTop:4 }}>
              ⚡ سيُرسل إشعار لموظف خدمة العملاء مع هذه الرسالة
            </div>
          </div>
        )}

        {/* سبب الرفض */}
        {selected.needsReason && (
          <div style={{ padding:14, background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, color:'#EF4444', fontWeight:500 }}>
              <XCircle size={15}/> رفض التذكرة
            </div>
            <div className="form-group">
              <label className="form-label">سبب الرفض / الإغلاق *</label>
              <textarea className="form-textarea" rows={2} value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="مثال: رفض العميل التكلفة&#10;مثال: الجهاز غير قابل للإصلاح&#10;مثال: القطعة غير متوفرة في السوق" />
            </div>
          </div>
        )}

        {/* ملاحظة إضافية */}
        <div className="form-group">
          <label className="form-label">ملاحظة إضافية (اختياري)</label>
          <input className="form-input" value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="أي معلومات إضافية..." />
        </div>

      </div>
    </Modal>
  )
}
