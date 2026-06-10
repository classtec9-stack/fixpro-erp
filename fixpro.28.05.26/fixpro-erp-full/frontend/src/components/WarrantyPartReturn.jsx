// frontend/src/components/WarrantyPartReturn.jsx
// إعادة قطعة الضمان — مع قفل الإجراء بعد التنفيذ وتسجيل المنفّذ
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading } from './ui'
import { Package, AlertTriangle, Lock, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function WarrantyPartReturn({ ticket, onClose }) {
  const qc = useQueryClient()
  const parts = ticket.parts || []

  const [selectedPartId, setSelectedPartId] = useState(parts[0]?.part_id || '')
  const [quantity, setQuantity]             = useState(1)
  const [condition, setCondition]           = useState('')
  const [reason, setReason]                 = useState('')

  // ── فحص حالة الإجراء — هل اتُخذ مسبقاً؟ ──────────────
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['warranty-return-status', ticket.id],
    queryFn: () => api.get(`/warranty/return-status/${ticket.id}`),
  })

  const actionTaken = statusData?.data?.action_taken
  const actions     = statusData?.data?.actions || []

  const mut = useMutation({
    mutationFn: () => api.post('/warranty/return-part', {
      order_id:  ticket.id,
      part_id:   selectedPartId,
      quantity,
      condition,
      reason: condition === 'defective' ? reason : undefined,
    }),
    onSuccess: (res) => {
      toast.success(res.message || 'تم')
      qc.invalidateQueries(['warranty-return-status', ticket.id])
      qc.invalidateQueries(['ticket', ticket.id])
      qc.invalidateQueries(['parts'])
    },
    onError: e => toast.error(e?.message || 'فشل'),
  })

  const selectedPart = parts.find(p => p.part_id === selectedPartId)
  const isValid = selectedPartId && condition && (condition === 'good' || reason.trim())

  // ── حالة التحميل ──────────────────────────────────────
  if (statusLoading) return (
    <Modal open onClose={onClose} title="إعادة قطعة الضمان">
      <Loading/>
    </Modal>
  )

  // ── الإجراء مُتخَذ مسبقاً: اعرض القفل ─────────────────
  if (actionTaken) return (
    <Modal open onClose={onClose} title="إعادة قطعة الضمان"
      footer={
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        <div style={{
          padding:'16px', background:'var(--ink-3)', borderRadius:10,
          textAlign:'center', border:'1px solid var(--border)'
        }}>
          <Lock size={28} color="var(--muted)" style={{ marginBottom:8 }}/>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text-2)', marginBottom:4 }}>
            تم اتخاذ الإجراء مسبقاً
          </div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>
            لا يمكن تكرار إرجاع القطع لهذه التذكرة
          </div>
        </div>

        {/* سجل الإجراءات المتخذة */}
        <div style={{ display:'grid', gap:8 }}>
          {actions.map((a, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'10px 14px', borderRadius:8,
              background: a.action === 'stock' ? 'rgba(16,185,129,.06)' : 'rgba(245,158,11,.06)',
              border: `1px solid ${a.action === 'stock' ? 'rgba(16,185,129,.2)' : 'rgba(245,158,11,.2)'}`
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {a.action === 'stock'
                  ? <CheckCircle size={16} color="var(--green)"/>
                  : <AlertTriangle size={16} color="var(--amber)"/>
                }
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text-2)' }}>
                    {a.part_name} — {a.action_label}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>
                    الكمية: {a.quantity} · بواسطة: <strong style={{ color:'var(--blue)' }}>{a.action_by_name || 'غير معروف'}</strong>
                  </div>
                </div>
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', fontFamily:'var(--mono)' }}>
                {new Date(a.created_at).toLocaleDateString('ar-SA')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )

  // ── لم يُتخذ إجراء بعد: اعرض النموذج ─────────────────
  return (
    <Modal open onClose={onClose} title="إعادة قطعة الضمان"
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button
            className="btn btn-primary"
            disabled={!isValid || mut.isPending}
            style={{
              background: condition === 'good' ? 'var(--green)' :
                          condition === 'defective' ? 'var(--amber)' : ''
            }}
            onClick={() => mut.mutate()}>
            {mut.isPending ? '...' :
             condition === 'good'     ? '📦 إعادة للمخزون' :
             condition === 'defective'? '⚠️ إرسال للتوالف' :
             'تأكيد'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>

        <div style={{ padding:'10px 14px', background:'var(--ink-3)', borderRadius:8, fontSize:13 }}>
          <div style={{ color:'var(--muted)', fontSize:11, marginBottom:3 }}>تذكرة الضمان</div>
          <div style={{ fontWeight:600, color:'var(--text-2)' }}>{ticket.order_number}</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>{ticket.customer_name} — {ticket.brand} {ticket.model}</div>
        </div>

        <div style={{ padding:'8px 12px', background:'rgba(239,68,68,.06)', borderRadius:6,
          fontSize:12, color:'var(--red)', border:'1px solid rgba(239,68,68,.15)' }}>
          ⚠️ تنبيه: هذا الإجراء يُنفَّذ مرة واحدة فقط ويُسجَّل باسمك — تأكد قبل التنفيذ
        </div>

        {parts.length === 0 ? (
          <div style={{ padding:'12px', background:'rgba(239,68,68,.08)', borderRadius:8,
            fontSize:13, color:'var(--red)', textAlign:'center' }}>
            ⚠️ لا توجد قطع مسجّلة في هذه التذكرة
          </div>
        ) : (
          <div>
            <label className="form-label">القطعة المُرجَعة من العميل *</label>
            <select className="form-select" value={selectedPartId}
              onChange={e => setSelectedPartId(e.target.value)}>
              {parts.map(p => (
                <option key={p.id} value={p.part_id}>
                  {p.part_name} {p.sku ? `(${p.sku})` : ''} — كمية التذكرة: {p.quantity}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="form-label">الكمية المُستلَمة من العميل *</label>
          <input className="form-input" type="number" min="1"
            max={selectedPart?.quantity || 99}
            value={quantity}
            onChange={e => setQuantity(parseInt(e.target.value) || 1)}/>
        </div>

        <div>
          <label className="form-label">حالة القطعة بعد الفحص *</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:6 }}>
            <button
              onClick={() => setCondition('good')}
              style={{
                padding:'12px', borderRadius:8, border:`2px solid ${condition==='good' ? 'var(--green)' : 'var(--border)'}`,
                background: condition==='good' ? 'rgba(16,185,129,.08)' : 'var(--ink-3)',
                cursor:'pointer', fontFamily:'var(--font)', textAlign:'center'
              }}>
              <Package size={20} color={condition==='good' ? 'var(--green)' : 'var(--muted)'} style={{ marginBottom:6 }}/>
              <div style={{ fontSize:13, fontWeight:600, color: condition==='good' ? 'var(--green)' : 'var(--text-2)' }}>
                ✅ سليمة
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>ترجع للمخزون</div>
            </button>

            <button
              onClick={() => setCondition('defective')}
              style={{
                padding:'12px', borderRadius:8, border:`2px solid ${condition==='defective' ? 'var(--amber)' : 'var(--border)'}`,
                background: condition==='defective' ? 'rgba(245,158,11,.08)' : 'var(--ink-3)',
                cursor:'pointer', fontFamily:'var(--font)', textAlign:'center'
              }}>
              <AlertTriangle size={20} color={condition==='defective' ? 'var(--amber)' : 'var(--muted)'} style={{ marginBottom:6 }}/>
              <div style={{ fontSize:13, fontWeight:600, color: condition==='defective' ? 'var(--amber)' : 'var(--text-2)' }}>
                ⚠️ تالفة
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>تذهب للتوالف</div>
            </button>
          </div>
        </div>

        {condition === 'defective' && (
          <div>
            <label className="form-label">سبب التلف *</label>
            <textarea className="form-input" rows={2} style={{ resize:'none' }}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="مثال: قطعة معيبة من المورد، كسر أثناء التركيب..."/>
          </div>
        )}

        {condition === 'good' && (
          <div style={{ padding:'8px 12px', background:'rgba(16,185,129,.08)',
            borderRadius:6, fontSize:12, color:'var(--green)' }}>
            💡 ستُضاف القطعة مباشرة لمخزون الفرع باسمك
          </div>
        )}
        {condition === 'defective' && (
          <div style={{ padding:'8px 12px', background:'rgba(245,158,11,.08)',
            borderRadius:6, fontSize:12, color:'var(--amber)' }}>
            💡 ستنتقل للتوالف باسمك — يمكن إرجاعها للمورد لاحقاً
          </div>
        )}
      </div>
    </Modal>
  )
}
