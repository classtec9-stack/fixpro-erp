import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { Plus, Send, CheckCircle, XCircle, Eye, AlertTriangle, RotateCcw } from 'lucide-react'

const STATUS = {
  waiting:           { label:'انتظار',          color:'var(--amber)',  bg:'rgba(245,158,11,.1)'  },
  sent_to_supplier:  { label:'مع المورد',        color:'var(--blue)',   bg:'rgba(59,130,246,.1)'  },
  returned:          { label:'تم الاستبدال',     color:'var(--green)',  bg:'rgba(16,185,129,.1)'  },
  written_off:       { label:'مشطوبة',           color:'var(--muted)',  bg:'rgba(107,114,128,.1)' },
}

export default function DefectivePage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const canManage  = ['admin','branch_manager','warehouse'].includes(user?.role)
  const canApprove = ['admin','branch_manager'].includes(user?.role)

  const [tab, setTab]               = useState('defective')
  const [statusF, setStatusF]       = useState('waiting')
  const [selectedIds, setSelectedIds] = useState([])
  const [showAdd, setShowAdd]       = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [showResolve, setShowResolve] = useState(null)

  // ── Queries ───────────────────────────────────────────
  const { data: defData, isLoading: defLoading } = useQuery({
    queryKey: ['defective', statusF],
    queryFn: () => api.get(`/defective?status=${statusF}`),
  })

  const { data: retData, isLoading: retLoading } = useQuery({
    queryKey: ['supplier-returns'],
    queryFn: () => api.get('/defective/returns'),
    enabled: tab === 'returns',
  })

  const { data: suppData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=100'),
  })

  const defParts  = defData?.data  || []
  const returns   = retData?.data  || []
  const suppliers = suppData?.data || []

  // ── Mutations ─────────────────────────────────────────
  const writeoffMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/defective/${id}/writeoff`, { reason }),
    onSuccess: () => { toast.success('تم شطب القطعة ✅'); qc.invalidateQueries(['defective']) },
    onError: e => toast.error(e?.message || 'خطأ'),
  })

  // تجميع القطع المحددة حسب المورد
  const selectedParts = defParts.filter(d => selectedIds.includes(d.id))
  const supplierGroups = selectedParts.reduce((acc, d) => {
    const key = d.supplier_id || 'no_supplier'
    if (!acc[key]) acc[key] = { supplier_id: d.supplier_id, supplier_name: d.supplier_name, parts: [] }
    acc[key].parts.push(d)
    return acc
  }, {})
  const hasMultipleSuppliers = Object.keys(supplierGroups).length > 1
  const hasNoSupplier = selectedParts.some(d => !d.supplier_id)

  const toggleSelect = (id) =>
    setSelectedIds(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id])

  const selectAll = () =>
    setSelectedIds(defParts.filter(d => d.supplier_id).map(d => d.id))

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">القطع التالفة وإرجاعات الموردين</div>
          <div className="page-sub">
            {tab === 'defective'
              ? `${defParts.length} قطعة — ${STATUS[statusF]?.label}`
              : `${returns.length} طلب إرجاع`}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {canManage && tab === 'defective' && selectedIds.length > 0 && !hasMultipleSuppliers && !hasNoSupplier && (
            <button className="btn btn-primary" onClick={() => setShowReturn(true)}>
              <Send size={14}/> إرسال للمورد ({selectedIds.length})
            </button>
          )}
          {canManage && tab === 'defective' && selectedIds.length > 0 && (hasMultipleSuppliers || hasNoSupplier) && (
            <div style={{ fontSize:11, color:'var(--red)', padding:'6px 10px', background:'rgba(239,68,68,.1)',
              borderRadius:6, display:'flex', alignItems:'center', gap:6 }}>
              <AlertTriangle size={12}/>
              {hasNoSupplier ? 'بعض القطع بلا مورد' : 'قطع من موردين مختلفين'}
            </div>
          )}
          {canManage && tab === 'defective' && (
            <button className="btn btn-ghost" onClick={() => setShowAdd(true)}>
              <Plus size={13}/> إضافة قطعة تالفة
            </button>
          )}
        </div>
      </div>

      {/* تبويبات */}
      <div style={{ display:'flex', gap:4, background:'var(--ink-3)', borderRadius:8,
        padding:3, width:'fit-content', marginBottom:16 }}>
        {[{k:'defective',l:'القطع التالفة'},{k:'returns',l:'إرجاعات الموردين'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding:'5px 16px', borderRadius:6, border:'none', cursor:'pointer',
            fontFamily:'var(--font)', fontSize:12, fontWeight:500,
            background: tab===t.k ? 'var(--blue)' : 'transparent',
            color: tab===t.k ? '#fff' : 'var(--muted)'
          }}>{t.l}</button>
        ))}
      </div>

      {/* ── القطع التالفة ── */}
      {tab === 'defective' && (
        <>
          {/* فلاتر الحالة */}
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
            {Object.entries(STATUS).map(([k,v]) => (
              <button key={k} onClick={() => { setStatusF(k); setSelectedIds([]) }}
                style={{ padding:'5px 12px', border:'none', borderRadius:20, cursor:'pointer',
                  fontFamily:'var(--font)', fontSize:12, fontWeight:500,
                  background: statusF===k ? v.color : 'var(--ink-3)',
                  color: statusF===k ? '#fff' : 'var(--muted)' }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* شريط التحديد */}
          {statusF === 'waiting' && canManage && defParts.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:12,
              padding:'8px 14px', background:'var(--ink-3)', borderRadius:8, marginBottom:10, fontSize:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                <input type="checkbox"
                  checked={selectedIds.length === defParts.filter(d=>d.supplier_id).length && selectedIds.length > 0}
                  onChange={e => e.target.checked ? selectAll() : setSelectedIds([])}/>
                تحديد الكل
              </label>
              {selectedIds.length > 0 && (
                <span style={{ color:'var(--blue)', fontWeight:600 }}>
                  {selectedIds.length} محدد
                </span>
              )}
              <span style={{ color:'var(--muted)', fontSize:11, marginRight:'auto' }}>
                💡 للإرسال للمورد: حدد قطعاً من نفس المورد
              </span>
            </div>
          )}

          {defLoading ? <Loading/> : !defParts.length
            ? <EmptyState icon={AlertTriangle} message={`لا توجد قطع ${STATUS[statusF]?.label}`}/>
            : (
              <div className="card" style={{ padding:0 }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {statusF === 'waiting' && canManage && <th style={{ width:40 }}></th>}
                        <th>القطعة</th>
                        <th>المورد</th>
                        <th>الكمية</th>
                        <th>المصدر</th>
                        <th>السبب</th>
                        <th>الحالة</th>
                        <th>التاريخ</th>
                        {statusF === 'waiting' && canApprove && <th>إجراء</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {defParts.map(d => (
                        <tr key={d.id} style={{ background: selectedIds.includes(d.id) ? 'var(--blue-dim)' : '' }}>
                          {statusF === 'waiting' && canManage && (
                            <td>
                              <input type="checkbox"
                                checked={selectedIds.includes(d.id)}
                                onChange={() => toggleSelect(d.id)}
                                disabled={!d.supplier_id}
                                title={!d.supplier_id ? 'لا يمكن الإرسال — بلا مورد' : ''}/>
                            </td>
                          )}
                          <td>
                            <div style={{ fontWeight:500, color:'var(--text-2)' }}>{d.part_name}</div>
                            {d.sku && <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--muted)' }}>{d.sku}</div>}
                          </td>
                          <td>
                            {d.supplier_name
                              ? <span style={{ fontSize:13 }}>{d.supplier_name}</span>
                              : <span style={{ fontSize:11, color:'var(--red)', display:'flex', alignItems:'center', gap:4 }}>
                                  <AlertTriangle size={11}/> بدون مورد
                                </span>
                            }
                          </td>
                          <td style={{ textAlign:'center', fontFamily:'var(--mono)', fontWeight:600 }}>{d.quantity}</td>
                          <td style={{ fontSize:12, color:'var(--muted)' }}>
                            {d.source_type === 'warranty_ticket'
                              ? <span>🛡️ ضمان: <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{d.ticket_number||'—'}</span></span>
                              : d.source_type === 'stock' ? '📦 من المخزون' : '🔧 عند الاستلام'}
                          </td>
                          <td style={{ fontSize:12, maxWidth:160, color:'var(--text)' }}>
                            {d.reason || '—'}
                          </td>
                          <td>
                            <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                              color: STATUS[d.status]?.color, background: STATUS[d.status]?.bg }}>
                              {STATUS[d.status]?.label || d.status}
                            </span>
                          </td>
                          <td style={{ fontSize:11, color:'var(--muted)' }}>
                            {new Date(d.created_at).toLocaleDateString('ar-SA')}
                          </td>
                          {statusF === 'waiting' && canApprove && (
                            <td>
                              <button
                                style={{ padding:'3px 10px', background:'rgba(239,68,68,.1)', color:'var(--red)',
                                  border:'1px solid rgba(239,68,68,.2)', borderRadius:4, cursor:'pointer',
                                  fontSize:11, fontFamily:'var(--font)' }}
                                onClick={() => {
                                  const reason = prompt('سبب الشطب:') ?? 'شطب بموافقة المدير'
                                  if (reason !== null) writeoffMut.mutate({ id: d.id, reason })
                                }}>
                                شطب
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </>
      )}

      {/* ── إرجاعات الموردين ── */}
      {tab === 'returns' && (
        retLoading ? <Loading/> : !returns.length
          ? <EmptyState icon={RotateCcw} message="لا توجد طلبات إرجاع"/>
          : (
            <div className="card" style={{ padding:0 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>رقم الطلب</th><th>المورد</th><th>القطع</th>
                      <th>الحالة</th><th>التاريخ</th><th>تاريخ الحل</th><th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontFamily:'var(--mono)', color:'var(--blue)', fontWeight:600 }}>
                          {r.return_number}
                        </td>
                        <td>
                          <div style={{ fontWeight:500 }}>{r.supplier_name}</div>
                          {r.supplier_phone && <div style={{ fontSize:11, color:'var(--muted)' }}>{r.supplier_phone}</div>}
                        </td>
                        <td style={{ textAlign:'center', fontFamily:'var(--mono)' }}>{r.items_count}</td>
                        <td>
                          <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                            background: r.status==='resolved'?'rgba(16,185,129,.1)':'rgba(59,130,246,.1)',
                            color: r.status==='resolved'?'var(--green)':'var(--blue)' }}>
                            {r.status === 'resolved' ? '✅ تم الحل' : '📤 مع المورد'}
                          </span>
                        </td>
                        <td style={{ fontSize:11, color:'var(--muted)' }}>
                          {new Date(r.created_at).toLocaleDateString('ar-SA')}
                        </td>
                        <td style={{ fontSize:11, color:'var(--muted)' }}>
                          {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString('ar-SA') : '—'}
                        </td>
                        <td>
                          {r.status !== 'resolved' && canApprove && (
                            <button className="btn btn-sm"
                              style={{ background:'var(--green-dim)', color:'var(--green)', border:'none' }}
                              onClick={() => openResolveModal(r, setShowResolve)}>
                              <CheckCircle size={12}/> تسجيل رد المورد
                            </button>
                          )}
                          {r.status === 'resolved' && (
                            <button className="btn btn-ghost btn-sm"
                              onClick={() => openResolveModal(r, setShowResolve)}>
                              <Eye size={12}/> عرض
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
      )}

      {/* ── Modals ── */}
      {showAdd && (
        <AddDefectiveModal
          suppliers={suppliers}
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); qc.invalidateQueries(['defective']) }}
        />
      )}

      {showReturn && (
        <CreateReturnModal
          selectedParts={selectedParts}
          suppliers={suppliers}
          onClose={() => setShowReturn(false)}
          onSuccess={() => {
            setShowReturn(false)
            setSelectedIds([])
            qc.invalidateQueries(['defective'])
            qc.invalidateQueries(['supplier-returns'])
          }}
        />
      )}

      {showResolve && (
        <ResolveReturnModal
          returnData={showResolve}
          onClose={() => setShowResolve(null)}
          onSuccess={() => {
            setShowResolve(null)
            qc.invalidateQueries(['defective'])
            qc.invalidateQueries(['supplier-returns'])
          }}
        />
      )}
    </div>
  )
}

// ── فتح modal الحل مع تحميل التفاصيل ────────────────────
async function openResolveModal(ret, setShowResolve) {
  try {
    const res = await api.get(`/defective/returns/${ret.id}`)
    setShowResolve(res.data)
  } catch(e) {
    toast.error('خطأ في تحميل التفاصيل')
  }
}

// ══════════════════════════════════════════════════════════
// Modal إضافة قطعة تالفة
// ══════════════════════════════════════════════════════════
function AddDefectiveModal({ suppliers, onClose, onSuccess }) {
  const [form, setForm] = useState({
    part_id: '', supplier_id: '', quantity: 1,
    source_type: 'stock', source_id: '', reason: ''
  })
  const [partSearch, setPartSearch] = useState('')
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data: partsData } = useQuery({
    queryKey: ['parts-defective-search', partSearch],
    queryFn: () => api.get(`/inventory/parts?search=${partSearch}&limit=10`),
    enabled: partSearch.length > 1,
  })
  const parts = partsData?.data || []

  const mut = useMutation({
    mutationFn: () => api.post('/defective', form),
    onSuccess: () => { toast.success('تم إضافة القطعة لمنطقة التوالف ✅'); onSuccess() },
    onError: e => toast.error(e?.message || 'خطأ'),
  })

  return (
    <Modal open onClose={onClose} title="إضافة قطعة تالفة"
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={!form.part_id || mut.isLoading}
            onClick={() => mut.mutate()}>
            {mut.isLoading ? '...' : 'إضافة للتوالف'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:12 }}>

        {/* البحث عن القطعة */}
        <div>
          <label className="form-label">القطعة *</label>
          <input className="form-input" placeholder="ابحث باسم القطعة أو SKU..."
            value={partSearch} onChange={e => { setPartSearch(e.target.value); set('part_id','') }}/>
          {parts.length > 0 && !form.part_id && (
            <div style={{ border:'1px solid var(--border)', borderRadius:6, marginTop:4, maxHeight:160, overflowY:'auto' }}>
              {parts.map(p => (
                <div key={p.id}
                  onClick={() => {
                    set('part_id', p.id)
                    // اقتراح المورد من القطعة تلقائياً
                    if (p.supplier_id) set('supplier_id', p.supplier_id)
                    setPartSearch(`${p.name}${p.sku?' ('+p.sku+')':''}`)
                  }}
                  style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:13 }}
                  className="hover-row">
                  <span style={{ fontWeight:500 }}>{p.name}</span>
                  {p.sku && <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted)', marginRight:8 }}>{p.sku}</span>}
                  <span style={{ float:'left', color:'var(--blue)', fontSize:11 }}>متاح: {p.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="form-label">الكمية *</label>
            <input className="form-input" type="number" min="1" value={form.quantity}
              onChange={e => set('quantity', Number(e.target.value))}/>
          </div>
          <div>
            <label className="form-label">المصدر *</label>
            <select className="form-select" value={form.source_type}
              onChange={e => set('source_type', e.target.value)}>
              <option value="stock">من المخزون (خصم تلقائي)</option>
              <option value="warranty_ticket">من تذكرة ضمان</option>
              <option value="incoming">عند الاستلام من المورد</option>
            </select>
          </div>
        </div>

        {/* المورد — يُملأ تلقائياً أو يدوياً */}
        <div>
          <label className="form-label">
            المورد
            {form.supplier_id && <span style={{ color:'var(--green)', fontSize:11, marginRight:6 }}>✓ محدد تلقائياً</span>}
          </label>
          <select className="form-select" value={form.supplier_id}
            onChange={e => set('supplier_id', e.target.value)}>
            <option value="">بدون مورد (شطب لاحقاً)</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
            💡 القطع بدون مورد لا يمكن إرجاعها — يجب شطبها
          </div>
        </div>

        {form.source_type === 'warranty_ticket' && (
          <div>
            <label className="form-label">رقم التذكرة</label>
            <input className="form-input" value={form.source_id}
              onChange={e => set('source_id', e.target.value)} placeholder="ID التذكرة"/>
          </div>
        )}

        <div>
          <label className="form-label">سبب التلف *</label>
          <textarea className="form-input" rows={2} value={form.reason}
            onChange={e => set('reason', e.target.value)}
            placeholder="مثال: شاشة مكسورة عند الاستلام، قطعة وصلت تالفة من المورد..."/>
        </div>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════
// Modal إنشاء طلب إرجاع
// ══════════════════════════════════════════════════════════
function CreateReturnModal({ selectedParts, suppliers, onClose, onSuccess }) {
  // تجميع القطع حسب المورد
  const supplierId = selectedParts[0]?.supplier_id
  const supplierName = selectedParts[0]?.supplier_name
  const [notes, setNotes] = useState('')

  const mut = useMutation({
    mutationFn: () => api.post('/defective/returns', {
      supplier_id: supplierId,
      defective_ids: selectedParts.map(p => p.id),
      notes
    }),
    onSuccess: (res) => {
      toast.success(`تم إنشاء طلب الإرجاع ✅`)
      onSuccess()
    },
    onError: e => toast.error(e?.message || 'خطأ في إنشاء الطلب'),
  })

  return (
    <Modal open onClose={onClose} title="إرسال قطع للمورد"
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={mut.isLoading}
            onClick={() => mut.mutate()}>
            <Send size={13}/> {mut.isLoading ? '...' : 'إرسال للمورد'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        {/* المورد */}
        <div style={{ padding:'10px 14px', background:'var(--blue-dim)', borderRadius:8, fontSize:13 }}>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:3 }}>إرسال إلى</div>
          <div style={{ fontWeight:600, color:'var(--text-2)', fontSize:15 }}>{supplierName}</div>
        </div>

        {/* القطع */}
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-2)', marginBottom:8 }}>
            القطع المُرجَعة ({selectedParts.length})
          </div>
          <div style={{ display:'grid', gap:6 }}>
            {selectedParts.map(p => (
              <div key={p.id} style={{ display:'flex', justifyContent:'space-between',
                padding:'8px 12px', background:'var(--ink-3)', borderRadius:6, fontSize:13 }}>
                <div>
                  <div style={{ fontWeight:500 }}>{p.part_name}</div>
                  {p.reason && <div style={{ fontSize:11, color:'var(--muted)' }}>{p.reason}</div>}
                </div>
                <span style={{ fontFamily:'var(--mono)', color:'var(--amber)', fontWeight:600 }}>
                  {p.quantity} وحدة
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">ملاحظات (اختياري)</label>
          <textarea className="form-input" rows={2} value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="ملاحظات للمورد..."/>
        </div>

        <div style={{ padding:'8px 12px', background:'var(--amber-dim)', borderRadius:6, fontSize:12, color:'var(--amber)' }}>
          ⚠️ بعد الإرسال ستتحول حالة القطع إلى "مع المورد" — في انتظار رده
        </div>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════
// Modal تسجيل رد المورد
// ══════════════════════════════════════════════════════════
function ResolveReturnModal({ returnData, onClose, onSuccess }) {
  const ret   = returnData?.data || returnData
  const items = ret?.items || []
  const isResolved = ret?.status === 'resolved'

  const [resolveItems, setResolveItems] = useState(
    items.map(i => ({
      item_id:           i.id,
      part_name:         i.part_name,
      quantity_sent:     i.quantity_sent,
      quantity_replaced: i.quantity_replaced || 0,
      quantity_rejected:  i.quantity_rejected  || 0,
      notes:             i.notes || '',
    }))
  )

  const updateItem = (idx, field, val) =>
    setResolveItems(s => s.map((item,i) => i===idx ? {...item,[field]:val} : item))

  const mut = useMutation({
    mutationFn: () => api.post(`/defective/returns/${ret.id}/resolve`, { items: resolveItems }),
    onSuccess: () => { toast.success('تم تسجيل رد المورد وتحديث المخزون ✅'); onSuccess() },
    onError: e => toast.error(e?.message || 'خطأ'),
  })

  return (
    <Modal open onClose={onClose}
      title={isResolved ? `عرض طلب ${ret.return_number}` : `تسجيل رد المورد — ${ret.return_number}`}
      maxWidth={620}
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          {!isResolved && (
            <button className="btn btn-primary" disabled={mut.isLoading}
              onClick={() => mut.mutate()}>
              <CheckCircle size={13}/> {mut.isLoading ? '...' : 'تأكيد رد المورد'}
            </button>
          )}
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        {/* بيانات المورد */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13 }}>
          <div style={{ padding:'8px 10px', background:'var(--ink-3)', borderRadius:6 }}>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>المورد</div>
            <div style={{ fontWeight:600 }}>{ret.supplier_name}</div>
            {ret.supplier_phone && <div style={{ fontSize:11, color:'var(--muted)' }}>{ret.supplier_phone}</div>}
          </div>
          <div style={{ padding:'8px 10px', background:'var(--ink-3)', borderRadius:6 }}>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>تاريخ الإرسال</div>
            <div>{new Date(ret.created_at).toLocaleDateString('ar-SA')}</div>
            {isResolved && ret.resolved_at && (
              <div style={{ fontSize:11, color:'var(--green)', marginTop:2 }}>
                حُل: {new Date(ret.resolved_at).toLocaleDateString('ar-SA')}
              </div>
            )}
          </div>
        </div>

        {/* بنود الطلب */}
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-2)', marginBottom:10 }}>
            البنود ({items.length})
          </div>
          <div style={{ display:'grid', gap:10 }}>
            {resolveItems.map((item, idx) => (
              <div key={item.item_id} style={{ padding:'12px 14px', background:'var(--ink-3)',
                borderRadius:8, border:'1px solid var(--border)' }}>
                <div style={{ fontWeight:600, marginBottom:8, color:'var(--text-2)' }}>
                  {item.part_name}
                  <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted)', marginRight:8 }}>
                    أُرسل: {item.quantity_sent}
                  </span>
                </div>

                {isResolved ? (
                  // عرض فقط
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:12 }}>
                    <div>
                      <span style={{ color:'var(--muted)' }}>مستبدل: </span>
                      <strong style={{ color:'var(--green)' }}>{item.quantity_replaced}</strong>
                    </div>
                    <div>
                      <span style={{ color:'var(--muted)' }}>مرفوض: </span>
                      <strong style={{ color:'var(--red)' }}>{item.quantity_rejected}</strong>
                    </div>
                    {item.notes && <div style={{ gridColumn:'1/-1', color:'var(--muted)', fontSize:11 }}>{item.notes}</div>}
                  </div>
                ) : (
                  // تعديل
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div>
                      <label className="form-label" style={{ color:'var(--green)' }}>
                        ✅ الكمية المستبدلة
                      </label>
                      <input className="form-input" type="number" min="0" max={item.quantity_sent}
                        value={item.quantity_replaced}
                        onChange={e => updateItem(idx, 'quantity_replaced', Number(e.target.value))}/>
                    </div>
                    <div>
                      <label className="form-label" style={{ color:'var(--red)' }}>
                        ❌ الكمية المرفوضة
                      </label>
                      <input className="form-input" type="number" min="0" max={item.quantity_sent}
                        value={item.quantity_rejected}
                        onChange={e => updateItem(idx, 'quantity_rejected', Number(e.target.value))}/>
                    </div>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label className="form-label">ملاحظات</label>
                      <input className="form-input" value={item.notes}
                        onChange={e => updateItem(idx, 'notes', e.target.value)}
                        placeholder="ملاحظة اختيارية..."/>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {!isResolved && (
          <div style={{ padding:'8px 12px', background:'var(--blue-dim)', borderRadius:6,
            fontSize:12, color:'var(--blue)' }}>
            💡 الكميات المستبدلة ستُضاف تلقائياً للمخزون<br/>
            الكميات المرفوضة ستعود للانتظار لاتخاذ قرار الشطب
          </div>
        )}
      </div>
    </Modal>
  )
}
