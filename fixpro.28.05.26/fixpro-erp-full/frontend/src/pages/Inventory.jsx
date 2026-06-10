import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState, Pagination } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import {
  Plus, Search, Package, AlertTriangle, BarChart2,
  ArrowLeftRight, RefreshCw, Eye, Edit, Trash2,
  Scan, MapPin, Tag, TrendingUp, Truck, ChevronLeft
} from 'lucide-react'

const TABS = [
  { id:'parts',      label:'الأصناف',           icon: Package },
  { id:'movements',  label:'سجل الحركات',        icon: BarChart2 },
  { id:'adjustments',label:'تسويات الجرد',        icon: RefreshCw },
  { id:'transfers',  label:'تحويل بين الفروع',    icon: ArrowLeftRight },
  { id:'reorder',    label:'إعادة الطلب',          icon: TrendingUp },
  { id:'categories', label:'التصنيفات',            icon: Tag },
  { id:'locations',  label:'مواضع التخزين',        icon: MapPin },
]


// ══════════════════════════════════════════════════════════
// Modal سريع لإرسال قطعة للتوالف من المخزون
// ══════════════════════════════════════════════════════════
function QuickDefectiveModal({ part, onClose, onSuccess }) {
  const [form, setForm] = useState({
    quantity: 1, source_type: 'stock', reason: ''
  })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const mut = useMutation({
    mutationFn: () => api.post('/defective', {
      part_id: part.id,
      quantity: form.quantity,
      source_type: form.source_type,
      reason: form.reason,
      supplier_id: part.supplier_id || null,
    }),
    onSuccess,
    onError: e => toast.error(e?.message || 'فشل الإرسال'),
  })

  return (
    <Modal open onClose={onClose} title="إرسال للتوالف"
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary"
            style={{ background:'var(--amber)', borderColor:'var(--amber)' }}
            disabled={!form.reason || mut.isPending}
            onClick={() => mut.mutate()}>
            {mut.isPending ? '...' : 'إرسال للتوالف'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:12 }}>
        <div style={{ padding:'10px 14px', background:'var(--ink-3)', borderRadius:8, fontSize:13 }}>
          <div style={{ fontWeight:600, color:'var(--text-2)' }}>{part.name}</div>
          {part.sku && <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--muted)' }}>{part.sku}</div>}
          <div style={{ fontSize:11, color:'var(--amber)', marginTop:4 }}>متاح في المخزون: {part.quantity}</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="form-label">الكمية التالفة *</label>
            <input className="form-input" type="number" min="1" max={part.quantity}
              value={form.quantity} onChange={e => set('quantity', Number(e.target.value))}/>
          </div>
          <div>
            <label className="form-label">المصدر *</label>
            <select className="form-select" value={form.source_type}
              onChange={e => set('source_type', e.target.value)}>
              <option value="stock">من المخزون (خصم تلقائي)</option>
              <option value="incoming">عند الاستلام من المورد</option>
            </select>
          </div>
        </div>

        <div>
          <label className="form-label">سبب التلف *</label>
          <textarea className="form-input" rows={2} style={{ resize:'none' }}
            value={form.reason} onChange={e => set('reason', e.target.value)}
            placeholder="مثال: كسر، تلف في الشحن، عيب تصنيع..."/>
        </div>

        {!part.supplier_id && (
          <div style={{ padding:'8px 12px', background:'rgba(245,158,11,.1)', borderRadius:6,
            fontSize:12, color:'var(--amber)' }}>
            ⚠️ هذه القطعة بدون مورد — لن يمكن إرجاعها، ستحتاج شطبها لاحقاً
          </div>
        )}
      </div>
    </Modal>
  )
}
export default function InventoryPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const canEdit   = ['admin','branch_manager','warehouse'].includes(user?.role)
  const canDelete = ['admin','branch_manager'].includes(user?.role)
  const canApprove = ['admin','branch_manager'].includes(user?.role)

  const [tab, setTab] = useState('parts')

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-title">إدارة المخزون</div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', marginBottom:20, overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', border:'none',
              background:'none', cursor:'pointer', color: tab===t.id ? 'var(--blue)' : 'var(--muted-2)',
              fontFamily:'var(--font)', fontSize:13, fontWeight: tab===t.id ? 600 : 400, whiteSpace:'nowrap',
              borderBottom: tab===t.id ? '2px solid var(--blue)' : '2px solid transparent', marginBottom:-1 }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {tab === 'parts'       && <PartsTab canEdit={canEdit} canDelete={canDelete} qc={qc}/>}
      {tab === 'movements'   && <MovementsTab/>}
      {tab === 'adjustments' && <AdjustmentsTab canApprove={canApprove} qc={qc}/>}
      {tab === 'transfers'   && <TransfersTab canApprove={canApprove} qc={qc}/>}
      {tab === 'reorder'     && <ReorderTab canEdit={canEdit} qc={qc}/>}
      {tab === 'categories'  && <CategoriesTab canEdit={canEdit} qc={qc}/>}
      {tab === 'locations'   && <LocationsTab canEdit={canEdit} qc={qc}/>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Parts Tab
// ══════════════════════════════════════════════════════════
function PartsTab({ canEdit, canDelete, qc }) {
  const [search, setSearch]   = useState('')
  const [catFilter, setCat]   = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [page, setPage]       = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [editPart, setEditPart]   = useState(null)
  const [detailPart, setDetailPart] = useState(null)
  const [restockPart, setRestockPart] = useState(null)
  const [defectivePart, setDefectivePart] = useState(null)
  const [scanMode, setScanMode]   = useState(false)
  const barcodeRef = useRef()

  const { data, isLoading } = useQuery({
    queryKey: ['parts', search, catFilter, lowOnly, page],
    queryFn: () => api.get(`/inventory/parts?search=${search}&category=${catFilter}&low_stock=${lowOnly}&page=${page}&limit=25`),
    keepPreviousData: true,
  })

  const { data: alerts } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => api.get('/inventory/alerts'),
  })

  const { data: catsData } = useQuery({
    queryKey: ['part-categories'],
    queryFn: () => api.get('/inventory/categories'),
  })

  const { data: locsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/inventory/locations'),
  })

  const { data: suppData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=100'),
  })

  const parts      = data?.data       || []
  const pagination = data?.pagination || {}
  const categories = catsData?.data   || []
  const locations  = locsData?.data   || []
  const suppliers  = suppData?.data   || []
  const alertCount = alerts?.count    || 0

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/inventory/parts/${id}`),
    onSuccess: (res) => { toast.success(res.message || 'تم'); qc.invalidateQueries(['parts']) },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  const scanMut = useMutation({
    mutationFn: (barcode) => api.post('/inventory/scan', { barcode }),
    onSuccess: (res) => { setDetailPart(res.data); setScanMode(false) },
    onError: (e) => toast.error(e?.message || 'لم يُعثر على الباركود'),
  })

  const handleScan = (e) => {
    e.preventDefault()
    const val = barcodeRef.current?.value?.trim()
    if (val) { scanMut.mutate(val); barcodeRef.current.value = '' }
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      {/* إحصاء سريع */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <div className="stat-card blue">
          <div className="stat-label">إجمالي الأصناف</div>
          <div className="stat-value">{pagination.total || 0}</div>
        </div>
        <div className={`stat-card ${alertCount > 0 ? 'amber' : 'green'}`}>
          <div className="stat-label">منخفضة الكمية</div>
          <div className="stat-value">{alertCount}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">قيمة المخزون</div>
          <div className="stat-value" style={{ fontSize:'1.1rem' }}>
            {parts.reduce((s,p) => s + (p.quantity * parseFloat(p.avg_cost||p.cost_price||0)), 0)
              .toLocaleString('ar-SA', { maximumFractionDigits:0 })}
          </div>
          <div className="stat-sub">ر.س</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">التصنيفات</div>
          <div className="stat-value">{categories.length}</div>
        </div>
      </div>

      {/* شريط أدوات */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <div className="search-wrap" style={{ flex:1, minWidth:200, maxWidth:300 }}>
          <Search size={14}/>
          <input className="search-input" placeholder="اسم، SKU، باركود..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}/>
        </div>
        <select className="form-select" value={catFilter} onChange={e => { setCat(e.target.value); setPage(1) }}>
          <option value="">كل التصنيفات</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <button className={`btn ${lowOnly ? 'btn-primary' : 'btn-ghost'}`}
          style={{ background: lowOnly ? 'var(--amber-dim)' : '', color: lowOnly ? 'var(--amber)' : '' }}
          onClick={() => { setLowOnly(!lowOnly); setPage(1) }}>
          <AlertTriangle size={13}/> منخفض فقط
        </button>
        <button className="btn btn-ghost" onClick={() => setScanMode(true)}>
          <Scan size={13}/> مسح باركود
        </button>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={14}/> إضافة صنف
          </button>
        )}
      </div>

      {/* جدول الأصناف */}
      {isLoading ? <Loading/> : !parts.length ? <EmptyState icon={Package} message="لا توجد أصناف"/> : (
        <div className="card" style={{ padding:0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الصنف</th><th>SKU</th><th>التصنيف</th>
                  <th>الكمية</th><th>الحد الأدنى</th><th>الموضع</th>
                  <th>سعر الشراء</th><th>سعر البيع</th><th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {parts.map(p => (
                  <tr key={p.id} style={{ background: p.quantity <= p.min_quantity ? 'rgba(245,158,11,0.04)' : '' }}>
                    <td>
                      <div style={{ fontWeight:500, color:'var(--text-2)' }}>{p.name}</div>
                      {p.brand_compat && <div style={{ fontSize:11, color:'var(--muted)' }}>{p.brand_compat}</div>}
                    </td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted)' }}>{p.sku || '—'}</td>
                    <td>
                      {p.category_name || p.category
                        ? <span className="badge badge-normal">{p.category_name || p.category}</span>
                        : '—'}
                    </td>
                    <td>
                      <span style={{
                        fontWeight:700, fontSize:15,
                        color: p.quantity === 0 ? 'var(--red)' : p.quantity <= p.min_quantity ? 'var(--amber)' : 'var(--green)'
                      }}>{p.quantity}</span>
                      {p.quantity <= p.min_quantity && p.quantity > 0 && (
                        <AlertTriangle size={12} color="var(--amber)" style={{ marginRight:4 }}/>
                      )}
                    </td>
                    <td style={{ color:'var(--muted)' }}>{p.min_quantity}</td>
                    <td style={{ fontSize:11, color:'var(--muted)' }}>{p.location_name || p.location || '—'}</td>
                    <td style={{ color:'var(--muted)' }}>{parseFloat(p.avg_cost||p.cost_price||0).toLocaleString('ar-SA')}</td>
                    <td style={{ color:'var(--green)', fontWeight:600 }}>{parseFloat(p.sell_price||0).toLocaleString('ar-SA')}</td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="btn btn-ghost btn-sm" title="تفاصيل" onClick={() => setDetailPart(p)}><Eye size={13}/></button>
                        {canEdit && (
                          <>
                            <button className="btn btn-ghost btn-sm" title="إضافة مخزون" style={{ color:'var(--green)' }}
                              onClick={() => setRestockPart(p)}>
                              <Plus size={13}/>
                            </button>
                            <button className="btn btn-ghost btn-sm" title="تعديل" onClick={() => setEditPart({...p})}>
                              <Edit size={13}/>
                            </button>
                          </>
                        )}
                        {canDelete && (
                          <button className="btn btn-ghost btn-sm" title="حذف" style={{ color:'var(--red)' }}
                            onClick={() => { if(confirm(`حذف "${p.name}"?`)) deleteMut.mutate(p.id) }}>
                            <Trash2 size={13}/>
                          </button>
                        )}
                        {canEdit && (
                          <button className="btn btn-ghost btn-sm" title="إرسال للتوالف"
                            style={{ color:'var(--amber)' }}
                            onClick={() => setDefectivePart(p)}>
                            <AlertTriangle size={13}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} pages={pagination.pages} onPage={setPage}/>

      {/* Modal مسح الباركود */}
      {scanMode && (
        <Modal open onClose={() => setScanMode(false)} title="مسح الباركود">
          <form onSubmit={handleScan} style={{ display:'grid', gap:12 }}>
            <div style={{ fontSize:13, color:'var(--muted)' }}>
              وجّه قارئ الباركود أو أدخل الرقم يدوياً:
            </div>
            <input ref={barcodeRef} className="form-input" autoFocus
              placeholder="باركود أو SKU..." style={{ fontSize:16, textAlign:'center' }}/>
            <button type="submit" className="btn btn-primary" style={{ justifyContent:'center' }}
              disabled={scanMut.isLoading}>
              <Scan size={14}/> بحث
            </button>
          </form>
        </Modal>
      )}

      {/* Modals */}
      {showAdd    && <PartFormModal mode="add"  onClose={() => setShowAdd(false)} qc={qc} categories={categories} locations={locations} suppliers={suppliers}/>}
      {editPart   && <PartFormModal mode="edit" part={editPart} onClose={() => setEditPart(null)} qc={qc} categories={categories} locations={locations} suppliers={suppliers}/>}
      {restockPart && <RestockModal part={restockPart} onClose={() => setRestockPart(null)} qc={qc} suppliers={suppliers}/>}
      {defectivePart && <QuickDefectiveModal part={defectivePart} onClose={() => setDefectivePart(null)} onSuccess={() => { setDefectivePart(null); toast.success('تم إرسال القطعة للتوالف ✅'); qc.invalidateQueries(['parts']) }}/>}
      {detailPart && <PartDetailModal part={detailPart} onClose={() => setDetailPart(null)}/>}
    </div>
  )
}

// ── Part Form Modal ──────────────────────────────────────
function PartFormModal({ mode, part, onClose, qc, categories, locations, suppliers }) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState(part || {
    name:'', category_id:'', location_id:'', quantity:0, min_quantity:5,
    cost_price:0, sell_price:0, supplier_id:'', brand_compat:'', sku:'',
    barcode:'', notes:'', unit_of_measure:'piece', units_per_pack:1,
  })
  const set = (k,v) => setForm(f => ({...f, [k]:v}))

  const mut = useMutation({
    mutationFn: () => isEdit
      ? api.put(`/inventory/parts/${part.id}`, form)
      : api.post('/inventory/parts', form),
    onSuccess: () => { toast.success(isEdit ? 'تم التحديث' : 'تم الإضافة'); qc.invalidateQueries(['parts']); onClose() },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  return (
    <Modal open onClose={onClose} title={isEdit ? 'تعديل الصنف' : 'إضافة صنف جديد'} maxWidth={600}
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => mut.mutate()} disabled={!form.name || mut.isLoading}>
            {mut.isLoading ? '...' : isEdit ? 'حفظ التعديلات' : 'إضافة الصنف'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ gridColumn:'1/-1' }}>
          <label className="form-label">اسم الصنف *</label>
          <input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="مثال: شاشة آيفون 14 برو"/>
        </div>
        <div>
          <label className="form-label">SKU</label>
          <input className="form-input" value={form.sku||''} onChange={e=>set('sku',e.target.value)}/>
        </div>
        <div>
          <label className="form-label">باركود</label>
          <input className="form-input" value={form.barcode||''} onChange={e=>set('barcode',e.target.value)}/>
        </div>
        <div>
          <label className="form-label">التصنيف</label>
          <select className="form-select" value={form.category_id||''} onChange={e=>set('category_id',e.target.value)}>
            <option value="">اختر التصنيف</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">موضع التخزين</label>
          <select className="form-select" value={form.location_id||''} onChange={e=>set('location_id',e.target.value)}>
            <option value="">اختر الموضع</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">وحدة القياس</label>
          <select className="form-select" value={form.unit_of_measure||'piece'} onChange={e=>set('unit_of_measure',e.target.value)}>
            <option value="piece">قطعة</option>
            <option value="box">علبة</option>
            <option value="meter">متر</option>
            <option value="kg">كيلو</option>
            <option value="liter">لتر</option>
          </select>
        </div>
        <div>
          <label className="form-label">المورد الرئيسي</label>
          <select className="form-select" value={form.supplier_id||''} onChange={e=>set('supplier_id',e.target.value)}>
            <option value="">اختر المورد</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {!isEdit && (
          <div>
            <label className="form-label">الكمية الابتدائية</label>
            <input className="form-input" type="number" min="0" value={form.quantity} onChange={e=>set('quantity',Number(e.target.value))}/>
          </div>
        )}
        <div>
          <label className="form-label">الحد الأدنى للتنبيه</label>
          <input className="form-input" type="number" min="0" value={form.min_quantity} onChange={e=>set('min_quantity',Number(e.target.value))}/>
        </div>
        <div>
          <label className="form-label">سعر الشراء (ر.س)</label>
          <input className="form-input" type="number" min="0" step="0.01" value={form.cost_price} onChange={e=>set('cost_price',e.target.value)}/>
        </div>
        <div>
          <label className="form-label">سعر البيع (ر.س) *</label>
          <input className="form-input" type="number" min="0" step="0.01" value={form.sell_price} onChange={e=>set('sell_price',e.target.value)}/>
        </div>
        <div>
          <label className="form-label">توافق الماركات</label>
          <input className="form-input" value={form.brand_compat||''} onChange={e=>set('brand_compat',e.target.value)} placeholder="Apple, Samsung, ..."/>
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label className="form-label">ملاحظات</label>
          <textarea className="form-input" rows={2} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/>
        </div>
      </div>
    </Modal>
  )
}

// ── Restock Modal ────────────────────────────────────────
function RestockModal({ part, onClose, qc, suppliers }) {
  const [qty, setQty] = useState(1)
  const [cost, setCost] = useState(part.cost_price || 0)
  const [suppId, setSuppId] = useState(part.supplier_id || '')
  const [ref, setRef] = useState('')

  const mut = useMutation({
    mutationFn: () => api.post(`/inventory/parts/${part.id}/restock`, {
      quantity: qty, unit_cost: cost, supplier_id: suppId || null, invoice_ref: ref
    }),
    onSuccess: () => { toast.success(`تم إضافة ${qty} وحدة`); qc.invalidateQueries(['parts']); onClose() },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  return (
    <Modal open onClose={onClose} title={`إضافة مخزون — ${part.name}`}
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => mut.mutate()} disabled={qty < 1 || mut.isLoading}>
            {mut.isLoading ? '...' : 'تأكيد الإضافة'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="form-label">الكمية المضافة *</label>
            <input className="form-input" type="number" min="1" value={qty} onChange={e=>setQty(Number(e.target.value))}/>
          </div>
          <div>
            <label className="form-label">سعر الوحدة (ر.س) *</label>
            <input className="form-input" type="number" min="0" step="0.01" value={cost} onChange={e=>setCost(e.target.value)}/>
          </div>
        </div>
        <div>
          <label className="form-label">المورد</label>
          <select className="form-select" value={suppId} onChange={e=>setSuppId(e.target.value)}>
            <option value="">اختر المورد</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">رقم الفاتورة (اختياري)</label>
          <input className="form-input" value={ref} onChange={e=>setRef(e.target.value)} placeholder="INV-001"/>
        </div>
        <div style={{ background:'var(--ink-3)', padding:12, borderRadius:6, fontSize:13, display:'grid', gap:4 }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ color:'var(--muted)' }}>الكمية الحالية</span>
            <strong>{part.quantity}</strong>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ color:'var(--muted)' }}>بعد الإضافة</span>
            <strong style={{ color:'var(--green)' }}>{part.quantity + qty}</strong>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ color:'var(--muted)' }}>إجمالي التكلفة</span>
            <strong>{(qty * parseFloat(cost||0)).toLocaleString('ar-SA')} ر.س</strong>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Part Detail Modal ────────────────────────────────────
function PartDetailModal({ part, onClose }) {
  const { data } = useQuery({
    queryKey: ['part-detail', part.id],
    queryFn: () => api.get(`/inventory/parts/${part.id}`),
  })
  const { data: catalogData } = useQuery({
    queryKey: ['supplier-catalog', part.id],
    queryFn: () => api.get(`/inventory/supplier-catalog/${part.id}`),
  })
  const d = data?.data || part
  const catalog = catalogData?.data || []

  return (
    <Modal open onClose={onClose} title={d.name} maxWidth={680}>
      <div style={{ display:'grid', gap:16 }}>
        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {[
            { label:'الكمية', value: d.quantity, color: d.quantity <= d.min_quantity ? 'var(--amber)' : 'var(--green)' },
            { label:'متوسط التكلفة', value: `${parseFloat(d.avg_cost||d.cost_price||0).toLocaleString('ar-SA')} ر`, color:'var(--text-2)' },
            { label:'قيمة المخزون', value: `${(d.quantity * parseFloat(d.avg_cost||d.cost_price||0)).toLocaleString('ar-SA')} ر`, color:'var(--blue)' },
            { label:'إجمالي مُصرَف', value: d.total_issued || 0, color:'var(--muted-2)' },
          ].map(s => (
            <div key={s.label} style={{ background:'var(--ink-3)', borderRadius:6, padding:10, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:16, fontWeight:700, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* أسعار الموردين */}
        {catalog.length > 0 && (
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-2)', marginBottom:8 }}>
              <Truck size={14} style={{ marginLeft:6 }}/>أسعار الموردين
            </div>
            <table style={{ fontSize:12, width:'100%' }}>
              <thead><tr><th>المورد</th><th>السعر</th><th>وقت التوريد</th><th>الحد الأدنى</th></tr></thead>
              <tbody>
                {catalog.map(c => (
                  <tr key={c.id}>
                    <td>
                      {c.supplier_name}
                      {c.is_preferred && <span style={{ marginRight:6, color:'var(--amber)', fontSize:10 }}>★ مفضل</span>}
                    </td>
                    <td style={{ color:'var(--green)', fontWeight:600 }}>{parseFloat(c.unit_cost).toLocaleString('ar-SA')} ر.س</td>
                    <td style={{ color:'var(--muted)' }}>{c.lead_time_days} يوم</td>
                    <td style={{ color:'var(--muted)' }}>{c.min_order_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* آخر 10 حركات */}
        {d.movements?.length > 0 && (
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-2)', marginBottom:8 }}>آخر الحركات</div>
            <div style={{ maxHeight:180, overflowY:'auto', display:'grid', gap:6 }}>
              {d.movements.slice(0,10).map(m => (
                <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'6px 10px', background:'var(--ink-3)', borderRadius:6, fontSize:12 }}>
                  <div>
                    <span style={{ color: m.movement_type.includes('purchase')||m.movement_type.includes('add') ? 'var(--green)' : 'var(--red)',
                      fontWeight:600 }}>
                      {m.movement_type.includes('purchase')||m.movement_type.includes('add') ? '+' : '-'}{m.quantity}
                    </span>
                    {' '}<span style={{ color:'var(--muted)' }}>{m.movement_type}</span>
                    {m.order_number && <span style={{ color:'var(--blue)', marginRight:6, fontFamily:'var(--mono)' }}>{m.order_number}</span>}
                    {m.customer_name && <span style={{ color:'var(--muted)' }}> — {m.customer_name}</span>}
                  </div>
                  <span style={{ color:'var(--muted)', fontSize:11 }}>{new Date(m.created_at).toLocaleDateString('ar-SA')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════
// Movements Tab
// ══════════════════════════════════════════════════════════
function MovementsTab() {
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['movements', page, typeFilter, dateFrom, dateTo],
    queryFn: () => api.get(`/inventory/movements?page=${page}&limit=30&movement_type=${typeFilter}&date_from=${dateFrom}&date_to=${dateTo}`),
    keepPreviousData: true,
  })

  const rows = data?.data || []
  const pagination = data?.pagination || {}
  const TYPE_COLOR = { purchase:'var(--green)', issue:'var(--red)', return:'var(--blue)', adjustment_add:'var(--green)', adjustment_sub:'var(--red)' }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <select className="form-select" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="">كل الحركات</option>
          <option value="purchase">شراء</option>
          <option value="issue">صرف</option>
          <option value="return">إرجاع</option>
          <option value="adjustment_add">تسوية +</option>
          <option value="adjustment_sub">تسوية -</option>
        </select>
        <input className="form-input" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ width:160 }}/>
        <input className="form-input" type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   style={{ width:160 }}/>
      </div>

      {isLoading ? <Loading/> : (
        <div className="card" style={{ padding:0 }}>
          <div className="table-wrap">
            <table style={{ fontSize:13 }}>
              <thead><tr><th>الصنف</th><th>نوع الحركة</th><th>الكمية</th><th>قبل</th><th>بعد</th><th>تكلفة الوحدة</th><th>المرجع</th><th>بواسطة</th><th>التاريخ</th></tr></thead>
              <tbody>
                {rows.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight:500 }}>{m.part_name}</td>
                    <td><span className="badge badge-normal" style={{ color: TYPE_COLOR[m.movement_type]||'var(--muted)' }}>{m.movement_type}</span></td>
                    <td style={{ fontWeight:700, color: ['purchase','adjustment_add','return'].includes(m.movement_type) ? 'var(--green)' : 'var(--red)' }}>
                      {['purchase','adjustment_add','return'].includes(m.movement_type) ? '+' : '-'}{m.quantity}
                    </td>
                    <td style={{ color:'var(--muted)' }}>{m.quantity_before ?? '—'}</td>
                    <td style={{ color:'var(--muted)' }}>{m.quantity_after ?? '—'}</td>
                    <td style={{ color:'var(--muted)' }}>{m.unit_cost ? parseFloat(m.unit_cost).toLocaleString('ar-SA') : '—'}</td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--blue)' }}>{m.order_number || '—'}</td>
                    <td style={{ fontSize:11, color:'var(--muted)' }}>{m.performed_by_name || '—'}</td>
                    <td style={{ fontSize:11, color:'var(--muted)' }}>{new Date(m.created_at).toLocaleDateString('ar-SA')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pagination page={page} pages={pagination.pages} onPage={setPage}/>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Adjustments Tab
// ══════════════════════════════════════════════════════════
function AdjustmentsTab({ canApprove, qc }) {
  const [showNew, setShowNew] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['adjustments'],
    queryFn: () => api.get('/inventory/adjustments?limit=30'),
  })

  const approveMut = useMutation({
    mutationFn: (id) => api.post(`/inventory/adjustments/${id}/approve`),
    onSuccess: () => { toast.success('تمت الموافقة'); qc.invalidateQueries(['adjustments', 'parts']) },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/inventory/adjustments/${id}/reject`, { reason }),
    onSuccess: () => { toast.success('تم الرفض'); qc.invalidateQueries(['adjustments']) },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  const rows = data?.data || []
  const STATUS = { pending:{ label:'انتظار', badge:'badge-wait' }, approved:{ label:'موافق', badge:'badge-ready' }, rejected:{ label:'مرفوض', badge:'badge-cancel' } }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={14}/> طلب تسوية</button>
      </div>

      {isLoading ? <Loading/> : (
        <div className="card" style={{ padding:0 }}>
          <div className="table-wrap">
            <table style={{ fontSize:13 }}>
              <thead><tr><th>الصنف</th><th>كمية النظام</th><th>الكمية الفعلية</th><th>الفرق</th><th>السبب</th><th>الحالة</th><th>إجراءات</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight:500 }}>{r.part_name}</td>
                    <td>{r.quantity_system}</td>
                    <td>{r.quantity_actual}</td>
                    <td style={{ fontWeight:700, color: r.difference > 0 ? 'var(--green)' : r.difference < 0 ? 'var(--red)' : 'var(--muted)' }}>
                      {r.difference > 0 ? '+' : ''}{r.difference}
                    </td>
                    <td style={{ color:'var(--muted)', fontSize:12 }}>{r.reason || '—'}</td>
                    <td><span className={`badge ${STATUS[r.status]?.badge}`}>{STATUS[r.status]?.label}</span></td>
                    <td>
                      {r.status === 'pending' && canApprove && (
                        <div style={{ display:'flex', gap:6 }}>
                          <button className="btn btn-sm" style={{ background:'var(--green-dim)', color:'var(--green)', border:'none' }}
                            onClick={() => approveMut.mutate(r.id)}>موافقة</button>
                          <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }}
                            onClick={() => { const reason = prompt('سبب الرفض:'); if(reason !== null) rejectMut.mutate({ id:r.id, reason }) }}>رفض</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showNew && <NewAdjustmentModal onClose={() => setShowNew(false)} qc={qc}/>}
    </div>
  )
}

function NewAdjustmentModal({ onClose, qc }) {
  const [partSearch, setPartSearch] = useState('')
  const [partId, setPartId] = useState('')
  const [qtyActual, setQtyActual] = useState('')
  const [reason, setReason] = useState('')

  const { data: partsData } = useQuery({
    queryKey: ['parts-search-adj', partSearch],
    queryFn: () => api.get(`/inventory/parts?search=${partSearch}&limit=10`),
    enabled: partSearch.length > 1,
  })

  const mut = useMutation({
    mutationFn: () => api.post('/inventory/adjustments', { part_id:partId, quantity_actual:Number(qtyActual), reason }),
    onSuccess: () => { toast.success('تم إرسال طلب التسوية'); qc.invalidateQueries(['adjustments']); onClose() },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  return (
    <Modal open onClose={onClose} title="طلب تسوية مخزون"
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={!partId || qtyActual === '' || mut.isLoading}
            onClick={() => mut.mutate()}>{mut.isLoading ? '...' : 'إرسال الطلب'}</button>
        </div>
      }>
      <div style={{ display:'grid', gap:12 }}>
        <div>
          <label className="form-label">الصنف</label>
          <input className="form-input" placeholder="ابحث عن الصنف..." value={partSearch}
            onChange={e => setPartSearch(e.target.value)}/>
          {partsData?.data?.length > 0 && !partId && (
            <div style={{ background:'var(--ink-3)', border:'1px solid var(--border)', borderRadius:6, marginTop:4 }}>
              {partsData.data.map(p => (
                <div key={p.id} onClick={() => { setPartId(p.id); setPartSearch(`${p.name} (${p.quantity} وحدة)`) }}
                  style={{ padding:'8px 12px', cursor:'pointer', fontSize:13, borderBottom:'1px solid var(--border)' }}>
                  {p.name} — كمية النظام: <strong>{p.quantity}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="form-label">الكمية الفعلية عند الجرد</label>
          <input className="form-input" type="number" min="0" value={qtyActual} onChange={e=>setQtyActual(e.target.value)}/>
        </div>
        <div>
          <label className="form-label">السبب</label>
          <input className="form-input" value={reason} onChange={e=>setReason(e.target.value)} placeholder="تلف، فقدان، خطأ في العد..."/>
        </div>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════
// Transfers Tab
// ══════════════════════════════════════════════════════════
function TransfersTab({ canApprove, qc }) {
  const [showNew, setShowNew] = useState(false)
  const [detail, setDetail] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-transfers'],
    queryFn: () => api.get('/inventory/transfers?limit=30'),
  })

  const approveMut = useMutation({
    mutationFn: (id) => api.patch(`/inventory/transfers/${id}/approve`),
    onSuccess: () => { toast.success('تمت الموافقة وخُصم المخزون'); qc.invalidateQueries(['inventory-transfers','parts']) },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  const receiveMut = useMutation({
    mutationFn: (id) => api.patch(`/inventory/transfers/${id}/receive`),
    onSuccess: () => { toast.success('تم الاستلام وتحديث المخزون'); qc.invalidateQueries(['inventory-transfers','parts']) },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  const rows = data?.data || []
  const STATUS = {
    pending:    { label:'انتظار موافقة', badge:'badge-wait' },
    approved:   { label:'موافق عليه',   badge:'badge-repair' },
    in_transit: { label:'في الطريق',     badge:'badge-diag' },
    received:   { label:'مستلم',         badge:'badge-ready' },
    cancelled:  { label:'ملغي',          badge:'badge-cancel' },
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <ArrowLeftRight size={14}/> طلب تحويل جديد
        </button>
      </div>

      {isLoading ? <Loading/> : !rows.length ? <EmptyState icon={ArrowLeftRight} message="لا توجد تحويلات"/> : (
        <div className="card" style={{ padding:0 }}>
          <div className="table-wrap">
            <table style={{ fontSize:13 }}>
              <thead><tr><th>الرقم</th><th>من فرع</th><th>إلى فرع</th><th>الأصناف</th><th>الحالة</th><th>التاريخ</th><th>إجراءات</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{r.transfer_number}</td>
                    <td>{r.from_branch_name}</td>
                    <td>{r.to_branch_name}</td>
                    <td style={{ color:'var(--muted)' }}>{r.items_count} صنف</td>
                    <td><span className={`badge ${STATUS[r.status]?.badge}`}>{STATUS[r.status]?.label}</span></td>
                    <td style={{ fontSize:11, color:'var(--muted)' }}>{new Date(r.created_at).toLocaleDateString('ar-SA')}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDetail(r)}><Eye size={13}/></button>
                        {r.status === 'pending' && canApprove && (
                          <button className="btn btn-sm" style={{ background:'var(--blue-dim)', color:'var(--blue)', border:'none' }}
                            onClick={() => approveMut.mutate(r.id)}>موافقة</button>
                        )}
                        {r.status === 'in_transit' && (
                          <button className="btn btn-sm" style={{ background:'var(--green-dim)', color:'var(--green)', border:'none' }}
                            onClick={() => receiveMut.mutate(r.id)}>استلام</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && <NewTransferModal onClose={() => setShowNew(false)} qc={qc}/>}
      {detail && <TransferDetailModal transfer={detail} onClose={() => setDetail(null)}/>}
    </div>
  )
}

function NewTransferModal({ onClose, qc }) {
  const [toBranch, setToBranch] = useState('')
  const [items, setItems] = useState([{ part_id:'', quantity_sent:1, part_name:'' }])
  const [notes, setNotes] = useState('')
  const [partSearch, setPartSearch] = useState('')
  const [searchIdx, setSearchIdx] = useState(null)

  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches?limit=50'),
  })
  const { data: partsData } = useQuery({
    queryKey: ['parts-transfer-search', partSearch],
    queryFn: () => api.get(`/inventory/parts?search=${partSearch}&limit=8`),
    enabled: partSearch.length > 1 && searchIdx !== null,
  })

  const branches = branchesData?.data || []
  const addItem = () => setItems([...items, { part_id:'', quantity_sent:1, part_name:'' }])
  const removeItem = (i) => setItems(items.filter((_,idx) => idx !== i))
  const updateItem = (i, field, val) => setItems(items.map((item,idx) => idx===i ? {...item,[field]:val} : item))

  const mut = useMutation({
    mutationFn: () => api.post('/inventory/transfers', { to_branch_id:toBranch, items, notes }),
    onSuccess: () => { toast.success('تم إرسال طلب التحويل'); qc.invalidateQueries(['inventory-transfers']); onClose() },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  return (
    <Modal open onClose={onClose} title="طلب تحويل مخزون" maxWidth={600}
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={!toBranch || items.some(i=>!i.part_id) || mut.isLoading}
            onClick={() => mut.mutate()}>{mut.isLoading ? '...' : 'إرسال الطلب'}</button>
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        <div>
          <label className="form-label">الفرع المستقبل *</label>
          <select className="form-select" value={toBranch} onChange={e=>setToBranch(e.target.value)}>
            <option value="">اختر الفرع</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <label className="form-label" style={{ margin:0 }}>الأصناف *</label>
            <button className="btn btn-ghost btn-sm" onClick={addItem}><Plus size={12}/> إضافة</button>
          </div>
          {items.map((item, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, marginBottom:8, position:'relative' }}>
              <div>
                <input className="form-input" placeholder="ابحث عن صنف..."
                  value={item.part_name || ''}
                  onChange={e => { updateItem(i, 'part_name', e.target.value); setPartSearch(e.target.value); setSearchIdx(i) }}/>
                {partsData?.data?.length > 0 && searchIdx === i && !item.part_id && (
                  <div style={{ position:'absolute', top:'100%', right:0, left:0, background:'var(--ink-2)',
                    border:'1px solid var(--border)', borderRadius:6, zIndex:100 }}>
                    {partsData.data.map(p => (
                      <div key={p.id} onClick={() => { updateItem(i,'part_id',p.id); updateItem(i,'part_name',`${p.name} (${p.quantity})`); setSearchIdx(null) }}
                        style={{ padding:'8px 12px', cursor:'pointer', fontSize:12 }}>
                        {p.name} — <span style={{ color:'var(--green)' }}>{p.quantity} متاح</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input className="form-input" type="number" min="1" value={item.quantity_sent}
                onChange={e=>updateItem(i,'quantity_sent',Number(e.target.value))} style={{ width:70 }} placeholder="الكمية"/>
              <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={()=>removeItem(i)}>×</button>
            </div>
          ))}
        </div>
        <div>
          <label className="form-label">ملاحظات</label>
          <textarea className="form-input" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/>
        </div>
      </div>
    </Modal>
  )
}

function TransferDetailModal({ transfer, onClose }) {
  const { data } = useQuery({
    queryKey: ['transfer-detail', transfer.id],
    queryFn: () => api.get(`/inventory/transfers/${transfer.id}`),
  })
  const d = data?.data || transfer

  return (
    <Modal open onClose={onClose} title={`تحويل — ${d.transfer_number}`} maxWidth={580}>
      <div style={{ display:'grid', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13 }}>
          <div><span style={{ color:'var(--muted)' }}>من: </span>{d.from_branch_name}</div>
          <div><span style={{ color:'var(--muted)' }}>إلى: </span>{d.to_branch_name}</div>
          <div><span style={{ color:'var(--muted)' }}>طلب بواسطة: </span>{d.requested_by_name}</div>
          <div><span style={{ color:'var(--muted)' }}>التاريخ: </span>{new Date(d.created_at).toLocaleDateString('ar-SA')}</div>
        </div>
        <table style={{ fontSize:13 }}>
          <thead><tr><th>الصنف</th><th>SKU</th><th>الكمية المُرسَلة</th><th>الكمية المُستلَمة</th></tr></thead>
          <tbody>
            {(d.items||[]).map(item => (
              <tr key={item.id}>
                <td>{item.part_name}</td>
                <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{item.sku||'—'}</td>
                <td>{item.quantity_sent}</td>
                <td style={{ color: item.quantity_received >= item.quantity_sent ? 'var(--green)' : 'var(--muted)' }}>
                  {item.quantity_received}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════
// Reorder Rules Tab
// ══════════════════════════════════════════════════════════
function ReorderTab({ canEdit, qc }) {
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['reorder-rules'],
    queryFn: () => api.get('/inventory/reorder-rules'),
  })

  const checkMut = useMutation({
    mutationFn: () => api.post('/inventory/reorder-rules/check'),
    onSuccess: (res) => toast.success(res.message || 'تم الفحص'),
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  const rows = data?.data || []

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button className="btn btn-ghost" onClick={() => checkMut.mutate()} disabled={checkMut.isLoading}>
          <RefreshCw size={13}/> فحص الآن
        </button>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={14}/> قاعدة جديدة</button>}
      </div>

      {isLoading ? <Loading/> : !rows.length ? <EmptyState icon={TrendingUp} message="لا توجد قواعد إعادة طلب"/> : (
        <div className="card" style={{ padding:0 }}>
          <div className="table-wrap">
            <table style={{ fontSize:13 }}>
              <thead><tr><th>الصنف</th><th>الكمية الحالية</th><th>كمية التفعيل</th><th>كمية الطلب</th><th>المورد</th><th>الحالة</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight:500 }}>{r.part_name}</td>
                    <td style={{ color: r.current_qty <= r.trigger_qty ? 'var(--red)' : 'var(--green)', fontWeight:600 }}>
                      {r.current_qty}
                    </td>
                    <td style={{ color:'var(--amber)' }}>{r.trigger_qty}</td>
                    <td style={{ color:'var(--blue)' }}>{r.reorder_qty}</td>
                    <td style={{ color:'var(--muted)' }}>{r.supplier_name || '—'}</td>
                    <td>
                      {r.current_qty <= r.trigger_qty
                        ? <span className="badge badge-cancel">🔴 يحتاج طلب</span>
                        : <span className="badge badge-ready">✅ طبيعي</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showNew && <NewReorderRuleModal onClose={() => setShowNew(false)} qc={qc}/>}
    </div>
  )
}

function NewReorderRuleModal({ onClose, qc }) {
  const [partSearch, setPartSearch] = useState('')
  const [partId, setPartId] = useState('')
  const [suppId, setSuppId] = useState('')
  const [triggerQty, setTriggerQty] = useState(5)
  const [reorderQty, setReorderQty] = useState(20)

  const { data: partsData } = useQuery({
    queryKey: ['parts-reorder-search', partSearch],
    queryFn: () => api.get(`/inventory/parts?search=${partSearch}&limit=8`),
    enabled: partSearch.length > 1,
  })
  const { data: suppData } = useQuery({ queryKey:['suppliers-list'], queryFn:() => api.get('/suppliers?limit=100') })

  const mut = useMutation({
    mutationFn: () => api.post('/inventory/reorder-rules', { part_id:partId, supplier_id:suppId||null, trigger_qty:triggerQty, reorder_qty:reorderQty }),
    onSuccess: () => { toast.success('تم حفظ قاعدة إعادة الطلب'); qc.invalidateQueries(['reorder-rules']); onClose() },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  return (
    <Modal open onClose={onClose} title="قاعدة إعادة الطلب"
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={!partId || mut.isLoading} onClick={() => mut.mutate()}>
            {mut.isLoading ? '...' : 'حفظ'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:12 }}>
        <div>
          <label className="form-label">الصنف *</label>
          <input className="form-input" placeholder="ابحث عن الصنف..." value={partSearch}
            onChange={e => { setPartSearch(e.target.value); setPartId('') }}/>
          {partsData?.data?.length > 0 && !partId && (
            <div style={{ background:'var(--ink-3)', border:'1px solid var(--border)', borderRadius:6, marginTop:4 }}>
              {partsData.data.map(p => (
                <div key={p.id} onClick={() => { setPartId(p.id); setPartSearch(`${p.name} — ${p.quantity} وحدة`) }}
                  style={{ padding:'8px 12px', cursor:'pointer', fontSize:12 }}>
                  {p.name} — <span style={{ color:'var(--green)' }}>{p.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="form-label">كمية التفعيل (عند الوصول لها يُطلب)</label>
            <input className="form-input" type="number" min="1" value={triggerQty} onChange={e=>setTriggerQty(Number(e.target.value))}/>
          </div>
          <div>
            <label className="form-label">كمية الطلب المقترحة</label>
            <input className="form-input" type="number" min="1" value={reorderQty} onChange={e=>setReorderQty(Number(e.target.value))}/>
          </div>
        </div>
        <div>
          <label className="form-label">المورد المفضل</label>
          <select className="form-select" value={suppId} onChange={e=>setSuppId(e.target.value)}>
            <option value="">اختر المورد</option>
            {(suppData?.data||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════
// Categories Tab
// ══════════════════════════════════════════════════════════
function CategoriesTab({ canEdit, qc }) {
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [parentId, setParentId] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['part-categories'],
    queryFn: () => api.get('/inventory/categories'),
  })
  const cats = data?.data || []
  const roots = cats.filter(c => !c.parent_id)
  const children = cats.filter(c => c.parent_id)

  const createMut = useMutation({
    mutationFn: () => api.post('/inventory/categories', { name:newName, parent_id:parentId||null }),
    onSuccess: () => { toast.success('تم إضافة التصنيف'); qc.invalidateQueries(['part-categories']); setShowNew(false); setNewName('') },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  if (isLoading) return <Loading/>

  return (
    <div style={{ display:'grid', gap:16 }}>
      {canEdit && (
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={14}/> تصنيف جديد</button>
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10 }}>
        {roots.map(cat => (
          <div key={cat.id} className="card" style={{ borderTop:`3px solid ${cat.color||'var(--blue)'}` }}>
            <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:4 }}>{cat.name}</div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>{cat.parts_count} صنف</div>
            {children.filter(c => c.parent_id === cat.id).map(child => (
              <div key={child.id} style={{ display:'flex', justifyContent:'space-between', marginTop:6,
                padding:'4px 8px', background:'var(--ink-3)', borderRadius:4, fontSize:12 }}>
                <span>{child.name}</span>
                <span style={{ color:'var(--muted)' }}>{child.parts_count}</span>
              </div>
            ))}
          </div>
        ))}
        {roots.length === 0 && <EmptyState icon={Tag} message="لا توجد تصنيفات بعد"/>}
      </div>

      {showNew && (
        <Modal open onClose={() => setShowNew(false)} title="تصنيف جديد"
          footer={
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowNew(false)}>إلغاء</button>
              <button className="btn btn-primary" disabled={!newName || createMut.isLoading} onClick={() => createMut.mutate()}>
                {createMut.isLoading ? '...' : 'إضافة'}
              </button>
            </div>
          }>
          <div style={{ display:'grid', gap:12 }}>
            <div>
              <label className="form-label">اسم التصنيف *</label>
              <input className="form-input" autoFocus value={newName} onChange={e=>setNewName(e.target.value)}/>
            </div>
            <div>
              <label className="form-label">تصنيف رئيسي (اختياري)</label>
              <select className="form-select" value={parentId} onChange={e=>setParentId(e.target.value)}>
                <option value="">تصنيف رئيسي</option>
                {roots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Locations Tab
// ══════════════════════════════════════════════════════════
function LocationsTab({ canEdit, qc }) {
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/inventory/locations'),
  })
  const locs = data?.data || []

  const createMut = useMutation({
    mutationFn: () => api.post('/inventory/locations', { name:newName, description:newDesc }),
    onSuccess: () => { toast.success('تم إضافة الموضع'); qc.invalidateQueries(['locations']); setShowNew(false); setNewName(''); setNewDesc('') },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  if (isLoading) return <Loading/>

  return (
    <div style={{ display:'grid', gap:16 }}>
      {canEdit && (
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={14}/> موضع جديد</button>
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
        {locs.map(l => (
          <div key={l.id} className="card" style={{ textAlign:'center' }}>
            <div style={{ fontSize:24, marginBottom:8 }}>📦</div>
            <div style={{ fontWeight:600, fontFamily:'var(--mono)', color:'var(--text-2)' }}>{l.name}</div>
            {l.description && <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{l.description}</div>}
            <div style={{ fontSize:12, color:'var(--blue)', marginTop:8 }}>{l.parts_count} صنف</div>
          </div>
        ))}
        {locs.length === 0 && <EmptyState icon={MapPin} message="لا توجد مواضع تخزين"/>}
      </div>

      {showNew && (
        <Modal open onClose={() => setShowNew(false)} title="موضع تخزين جديد"
          footer={
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowNew(false)}>إلغاء</button>
              <button className="btn btn-primary" disabled={!newName || createMut.isLoading} onClick={() => createMut.mutate()}>
                {createMut.isLoading ? '...' : 'إضافة'}
              </button>
            </div>
          }>
          <div style={{ display:'grid', gap:12 }}>
            <div>
              <label className="form-label">رمز الموضع *</label>
              <input className="form-input" autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder="مثال: A-1-3"/>
            </div>
            <div>
              <label className="form-label">وصف (اختياري)</label>
              <input className="form-input" value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="رف A، خانة 1، موضع 3"/>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
