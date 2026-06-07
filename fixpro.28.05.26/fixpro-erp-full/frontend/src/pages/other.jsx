// ── Customers Page ────────────────────────────────────────
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState, Pagination } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Search, Users, Edit2, Trash2, Package, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export function CustomersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ full_name:'', phone:'', email:'', city:'', notes:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => api.get(`/customers?page=${page}&limit=20&search=${search}`)
  })

  const addCustomer = useMutation({
    mutationFn: () => api.post('/customers', form),
    onSuccess: () => { toast.success('تم إضافة العميل'); setShowAdd(false); qc.invalidateQueries(['customers']); setForm({ full_name:'',phone:'',email:'',city:'',notes:'' }) },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const customers = data?.data || []
  const pagination = data?.pagination || {}

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">العملاء</div>
          <div className="page-sub">{pagination.total || 0} عميل مسجل</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15}/>إضافة عميل</button>
      </div>

      <div className="filter-bar">
        <div className="search-wrap" style={{ flex:1, maxWidth:320 }}>
          <Search />
          <input className="search-input" placeholder="بحث بالاسم أو الجوال..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} />
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : !customers.length ? <EmptyState icon={Users} message="لا يوجد عملاء" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>الاسم</th><th>الجوال</th><th>المدينة</th><th>الأوردرات</th><th>الإجمالي المدفوع</th><th>VIP</th></tr></thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight:500, color:'var(--text-2)' }}>{c.full_name}</td>
                    <td className="font-mono text-sm">{c.phone}</td>
                    <td className="text-sm text-muted2">{c.city || '—'}</td>
                    <td className="font-mono text-sm">{c.total_orders || 0}</td>
                    <td className="font-mono text-sm text-green">{Number(c.total_spent||0).toLocaleString('ar-SA')} ر</td>
                    <td>{c.is_vip ? <span className="badge badge-vip">VIP</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pagination.pages} onPage={setPage} />
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة عميل جديد"
        footer={<><button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button><button className="btn btn-primary" onClick={() => addCustomer.mutate()} disabled={addCustomer.isPending||!form.full_name||!form.phone}>{addCustomer.isPending?'جاري الحفظ...':'حفظ'}</button></>}>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">الاسم الكامل *</label><input className="form-input" value={form.full_name} onChange={e=>set('full_name',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">رقم الجوال *</label><input className="form-input" value={form.phone} onChange={e=>set('phone',e.target.value)} dir="ltr" /></div>
          <div className="form-group"><label className="form-label">البريد الإلكتروني</label><input className="form-input" value={form.email} onChange={e=>set('email',e.target.value)} dir="ltr" /></div>
          <div className="form-group"><label className="form-label">المدينة</label><input className="form-input" value={form.city} onChange={e=>set('city',e.target.value)} /></div>
          <div className="form-group form-full"><label className="form-label">ملاحظات</label><textarea className="form-textarea" value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
        </div>
      </Modal>
    </div>
  )
}

// ── Inventory Page ────────────────────────────────────────
export function InventoryPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const canEdit   = ['admin','branch_manager','warehouse'].includes(user?.role)
  const canDelete = ['admin','branch_manager'].includes(user?.role)

  const [activeTab, setActiveTab]           = useState('parts') // 'parts' | 'movements'
  const [selectedPartId, setSelectedPartId] = useState(null)
  const [defectivePartTarget, setDefectivePartTarget] = useState(null)
  const [defectiveQty, setDefectiveQty]       = useState(1)
  const [defectiveReason, setDefectiveReason] = useState('')

  const sendToDefective = useMutation({
    mutationFn: () => api.post('/defective', {
      part_id: defectivePartTarget.id,
      quantity: defectiveQty,
      source_type: 'stock',
      reason: defectiveReason
    }),
    onSuccess: () => {
      toast.success('✅ تم نقل القطعة لمنطقة التوالف')
      setDefectivePartTarget(null); setDefectiveReason(''); setDefectiveQty(1)
      qc.invalidateQueries(['parts'])
    },
    onError: e => toast.error(e?.response?.data?.message || 'خطأ')
  })

  const [search, setSearch]                 = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [lowOnly, setLowOnly]               = useState(false)
  const [showAddPart, setShowAddPart]       = useState(false)
  const [showAddCat, setShowAddCat]         = useState(false)
  const [newCatName, setNewCatName]         = useState('')
  const [editPart, setEditPart]             = useState(null)
  const [restockPart, setRestockPart]       = useState(null)
  const [deletePart_, setDeletePart_]       = useState(null)
  const [restockQty, setRestockQty]         = useState(1)
  const [form, setForm] = useState({ name:'', category:'', quantity:0, min_quantity:5, cost_price:0, sell_price:0, supplier_id:'', location:'', brand_compat:'' })

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=100')
  })
  const suppliersList = suppliersData?.data || []
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data, isLoading } = useQuery({
    queryKey: ['parts', search, categoryFilter, lowOnly],
    queryFn: () => api.get(`/inventory/parts?search=${search}&category=${categoryFilter}&low_stock=${lowOnly}`)
  })
  const { data: alerts } = useQuery({ queryKey: ['alerts'], queryFn: () => api.get('/inventory/alerts') })

  const savedCats = (() => { try { return JSON.parse(localStorage.getItem('invCategories') || '[]') } catch { return [] } })()
  const partsCats = [...new Set((data?.data || []).map(p => p.category).filter(Boolean))]
  const allCats   = [...new Set([...savedCats, ...partsCats])].sort()

  const addCategory = () => {
    if (!newCatName.trim()) return
    const cats = (() => { try { return JSON.parse(localStorage.getItem('invCategories') || '[]') } catch { return [] } })()
    if (!cats.includes(newCatName)) { cats.push(newCatName); localStorage.setItem('invCategories', JSON.stringify(cats)) }
    setShowAddCat(false); setNewCatName(''); qc.invalidateQueries(['parts']); toast.success('تم إضافة القسم')
  }

  const [similarParts,   setSimilarParts]   = useState([])  // اقتراحات مشابهة
  const [duplicatePart,  setDuplicatePart]  = useState(null) // تطابق كامل

  const addPart = useMutation({
    mutationFn: (forceCreate = false) => api.post('/inventory/parts', { ...form, force_create: forceCreate }),
    onSuccess: (res) => {
      // SIMILAR_PARTS_FOUND — HTTP 200 مع code خاص
      if (res.data?.code === 'SIMILAR_PARTS_FOUND') {
        setSimilarParts(res.data.data?.suggestions || [])
        return
      }
      toast.success('تم إضافة القطعة ✅')
      setShowAddPart(false)
      setSimilarParts([])
      qc.invalidateQueries(['parts'])
      setForm({ name:'',category:'',quantity:0,min_quantity:5,cost_price:0,sell_price:0,supplier_id:'',location:'',brand_compat:'' })
    },
    onError: (err) => {
      const data = err?.response?.data
      if (data?.code === 'DUPLICATE_PART') {
        setDuplicatePart(data.data?.existing)
        return
      }
      toast.error(data?.message || 'خطأ')
    }
  })

  const updatePart = useMutation({
    mutationFn: () => api.put(`/inventory/parts/${editPart.id}`, editPart),
    onSuccess: () => { toast.success('تم تحديث القطعة ✅'); setEditPart(null); qc.invalidateQueries(['parts']) },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const restock = useMutation({
    mutationFn: () => api.post(`/inventory/parts/${restockPart.id}/restock`, { quantity: restockQty }),
    onSuccess: () => { toast.success(`تم إضافة ${restockQty} وحدة ✅`); setRestockPart(null); setRestockQty(1); qc.invalidateQueries(['parts']) },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const deletePart = useMutation({
    mutationFn: () => api.delete(`/inventory/parts/${deletePart_.id}`),
    onSuccess: (res) => { toast.success(res.data?.message || 'تم الحذف'); setDeletePart_(null); qc.invalidateQueries(['parts']) },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const parts = data?.data || []

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">المخزون وقطع الغيار</div>
          <div className="page-sub">{data?.pagination?.total || 0} صنف في {allCats.length} قسم</div>
        </div>
        {/* تبويبات */}
        <div style={{ display:'flex', gap:4, background:'var(--ink-3)', borderRadius:8, padding:3 }}>
          {[{key:'parts',label:'القطع'},{key:'movements',label:'سجل الحركات'},{key:'adjustments',label:'طلبات الجرد'}].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{ padding:'5px 14px', borderRadius:6, border:'none', cursor:'pointer',
                fontFamily:'var(--font)', fontSize:12, fontWeight:500,
                background: activeTab===t.key ? 'var(--blue)' : 'transparent',
                color: activeTab===t.key ? '#fff' : 'var(--muted)' }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ width:1, background:'var(--border)', margin:'0 4px' }}/>
        <div style={{ display:'flex', gap:8 }}>
          {canEdit && <button className="btn btn-ghost" onClick={() => setShowAddCat(true)}>+ قسم جديد</button>}
          <button className={`btn ${lowOnly ? 'btn-danger' : 'btn-ghost'}`} onClick={() => setLowOnly(!lowOnly)}>
            {lowOnly ? 'عرض الكل' : `تنبيهات النفاد (${alerts?.count || 0})`}
          </button>
          {canEdit && <button className="btn btn-primary" onClick={() => setShowAddPart(true)}><Plus size={15}/>إضافة صنف</button>}
        </div>
      </div>

      {allCats.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
          <button onClick={() => setCategoryFilter('')} className={`btn ${!categoryFilter ? 'btn-primary' : 'btn-ghost'} btn-sm`}>الكل</button>
          {allCats.map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
              className={`btn ${categoryFilter === cat ? 'btn-primary' : 'btn-ghost'} btn-sm`}>{cat}</button>
          ))}
        </div>
      )}

      <div className="filter-bar">
        <div className="search-wrap" style={{ flex:1, maxWidth:320 }}>
          <Search /><input className="search-input" placeholder="بحث بالاسم أو SKU أو الباركود..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : !parts.length ? <EmptyState message="لا توجد قطع غيار" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>اسم القطعة</th><th>القسم</th><th>SKU</th>
                <th>الكمية</th><th>الحد الأدنى</th>
                <th>سعر الشراء</th><th>سعر البيع</th><th>الحالة</th>
                {canEdit && <th>إجراءات</th>}
              </tr></thead>
              <tbody>
                {parts.map(p => (
                  <tr key={p.id} onClick={() => setSelectedPartId(p.id)}
                    style={{ cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--ink-3)'}
                    onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ fontWeight:500, color:'var(--text-2)' }}>{p.name}</td>
                    <td><span style={{ padding:'2px 8px', borderRadius:4, background:'var(--ink-3)', fontSize:11, color:'var(--muted-2)' }}>{p.category || '—'}</span></td>
                    <td className="font-mono text-xs text-muted2">{p.sku || '—'}</td>
                    <td className={`font-mono font-bold ${p.quantity <= p.min_quantity ? 'text-red' : 'text-green'}`}>{p.quantity}</td>
                    <td className="font-mono text-sm text-muted">{p.min_quantity}</td>
                    <td className="font-mono text-sm">{Number(p.cost_price).toLocaleString()} ر</td>
                    <td className="font-mono text-sm text-blue">{Number(p.sell_price).toLocaleString()} ر</td>
                    <td>
                      {p.quantity <= 0 ? <span className="badge badge-cancel">نفد</span>
                        : p.quantity <= p.min_quantity ? <span className="badge badge-wait">منخفض</span>
                        : <span className="badge badge-ready">متوفر</span>}
                    </td>
                    {canEdit && (
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button title="إضافة كمية" className="btn-icon" style={{ color:'var(--green)' }}
                            onClick={() => { setRestockPart(p); setRestockQty(1) }}><ChevronUp size={14}/></button>
                          <button title="تعديل" className="btn-icon" style={{ color:'var(--blue)' }}
                            onClick={() => setEditPart({ ...p })}><Edit2 size={14}/></button>
                          <button title="نقل للتوالف" className="btn-icon" style={{ color:'var(--amber)' }}
                            onClick={() => setDefectivePartTarget(p)}><AlertTriangle size={14}/></button>
                          {canDelete && (
                            <button title="حذف" className="btn-icon" style={{ color:'var(--red)' }}
                              onClick={() => setDeletePart_(p)}><Trash2 size={14}/></button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* إضافة كمية */}
      {activeTab === 'movements'   && <MovementsTab />}
      {activeTab === 'adjustments' && <AdjustmentsTab />}
      {selectedPartId && (
        <PartDetailModal partId={selectedPartId} onClose={() => setSelectedPartId(null)} />
      )}

      {/* نافذة نقل للتوالف */}
      {defectivePartTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,.7)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target===e.currentTarget && setDefectivePartTarget(null)}>
          <div style={{ background:'var(--ink-2)', borderRadius:12, padding:24, maxWidth:400, width:'100%',
            border:'1px solid var(--border)' }}>
            <div style={{ fontWeight:700, fontSize:14, color:'var(--amber)', marginBottom:8 }}>
              ⚠️ نقل قطعة لمنطقة التوالف
            </div>
            <div style={{ fontSize:13, color:'var(--text-2)', marginBottom:4 }}>
              <strong>{defectivePartTarget.name}</strong>
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>
              الكمية الحالية في المخزون: {defectivePartTarget.quantity}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-group">
                <label className="form-label">الكمية التالفة</label>
                <input className="form-input" type="number" min="1" max={defectivePartTarget.quantity}
                  value={defectiveQty} onChange={e => setDefectiveQty(Math.max(1, Math.min(parseInt(e.target.value)||1, defectivePartTarget.quantity)))}/>
              </div>
              <div className="form-group">
                <label className="form-label">سبب التلف *</label>
                <input className="form-input" value={defectiveReason}
                  onChange={e => setDefectiveReason(e.target.value)}
                  placeholder="مثال: معيبة من المصنع، تلف في التخزين..."/>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setDefectivePartTarget(null)}>إلغاء</button>
              <button style={{ flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer',
                background:'var(--amber)', color:'#fff', fontWeight:600, fontSize:12,
                opacity: !defectiveReason || sendToDefective.isPending ? .6 : 1 }}
                onClick={() => sendToDefective.mutate()}
                disabled={!defectiveReason || sendToDefective.isPending}>
                {sendToDefective.isPending ? 'جاري...' : '⚠️ نقل للتوالف'}
              </button>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'parts' && (<>
      <Modal open={!!restockPart} onClose={() => setRestockPart(null)}
        title={`إضافة كمية — ${restockPart?.name || ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setRestockPart(null)}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => restock.mutate()} disabled={restock.isPending || restockQty < 1}>
            {restock.isPending ? 'جاري...' : `إضافة ${restockQty} وحدة`}</button></>}>
        <div style={{ display:'flex', flexDirection:'column', gap:16, padding:'8px 0' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--ink-3)', borderRadius:8, padding:'10px 16px' }}>
            <span style={{ fontSize:13, color:'var(--muted)' }}>الكمية الحالية</span>
            <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--text-2)', fontSize:18 }}>{restockPart?.quantity}</span>
          </div>
          <div className="form-group">
            <label className="form-label">الكمية المضافة</label>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setRestockQty(q => Math.max(1,q-1))}><ChevronDown size={14}/></button>
              <input className="form-input" type="number" min="1" value={restockQty}
                onChange={e => setRestockQty(Math.max(1, parseInt(e.target.value)||1))}
                style={{ textAlign:'center', fontFamily:'monospace', fontSize:20, fontWeight:700, maxWidth:100 }}/>
              <button className="btn btn-ghost btn-sm" onClick={() => setRestockQty(q => q+1)}><ChevronUp size={14}/></button>
            </div>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center' }}>
            الكمية بعد الإضافة: <strong style={{ color:'var(--green)' }}>{(restockPart?.quantity||0)+restockQty}</strong>
          </div>
        </div>
      </Modal>

      {/* تعديل قطعة */}
      <Modal open={!!editPart} onClose={() => setEditPart(null)} title="تعديل بيانات القطعة"
        footer={<><button className="btn btn-ghost" onClick={() => setEditPart(null)}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => updatePart.mutate()} disabled={updatePart.isPending || !editPart?.name}>
            {updatePart.isPending ? 'جاري...' : 'حفظ التعديلات'}</button></>}>
        {editPart && (
          <div className="form-grid">
            <div className="form-group form-full"><label className="form-label">اسم الصنف *</label>
              <input className="form-input" value={editPart.name} onChange={e => setEditPart(p => ({...p,name:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">القسم</label>
              <select className="form-select" value={editPart.category||''} onChange={e => setEditPart(p => ({...p,category:e.target.value}))}>
                <option value="">-- اختر قسم --</option>
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">الحد الأدنى</label>
              <input className="form-input" type="number" value={editPart.min_quantity} onChange={e => setEditPart(p => ({...p,min_quantity:parseInt(e.target.value)||0}))} /></div>
            <div className="form-group"><label className="form-label">سعر الشراء</label>
              <input className="form-input" type="number" value={editPart.cost_price} onChange={e => setEditPart(p => ({...p,cost_price:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">سعر البيع</label>
              <input className="form-input" type="number" value={editPart.sell_price} onChange={e => setEditPart(p => ({...p,sell_price:e.target.value}))} /></div>
            <div className="form-group form-full"><label className="form-label">ملاحظات</label>
              <input className="form-input" value={editPart.notes||''} onChange={e => setEditPart(p => ({...p,notes:e.target.value}))} placeholder="ملاحظات اختيارية..."/></div>
          </div>
        )}
      </Modal>

      {/* تأكيد الحذف */}
      <Modal open={!!deletePart_} onClose={() => setDeletePart_(null)} title="تأكيد الحذف"
        footer={<><button className="btn btn-ghost" onClick={() => setDeletePart_(null)}>إلغاء</button>
          <button className="btn btn-danger" onClick={() => deletePart.mutate()} disabled={deletePart.isPending}>
            {deletePart.isPending ? 'جاري...' : 'تأكيد الحذف'}</button></>}>
        <div style={{ display:'flex', gap:12, padding:'8px 0' }}>
          <AlertTriangle size={20} color="var(--amber)" style={{ flexShrink:0, marginTop:2 }}/>
          <div>
            <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:4 }}>هل تريد حذف "{deletePart_?.name}"؟</div>
            <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
              إذا كانت القطعة مستخدمة في تذاكر سابقة سيتم إخفاؤها فقط وليس حذفها نهائياً.
            </div>
          </div>
        </div>
      </Modal>

      {/* إضافة قسم */}
      <Modal open={showAddCat} onClose={() => setShowAddCat(false)} title="إضافة قسم جديد"
        footer={<><button className="btn btn-ghost" onClick={() => setShowAddCat(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addCategory} disabled={!newCatName.trim()}>إضافة</button></>}>
        <div className="form-group">
          <label className="form-label">اسم القسم</label>
          <input className="form-input" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="مثال: شاشات — بطاريات" />
        </div>
        <div style={{ marginTop:12 }}>
          <div className="text-xs text-muted mb-2">أقسام مقترحة:</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {['شاشات','بطاريات','كيبورد','كاميرات','شواحن','مكبرات صوت','أجهزة تبريد','ذاكرة','كروت شاشة','أدوات أخرى'].map(c => (
              <span key={c} onClick={() => setNewCatName(c)}
                style={{ padding:'3px 10px', borderRadius:4, background:'var(--ink-3)', fontSize:12, cursor:'pointer', border:'1px solid var(--border)', color:'var(--muted-2)' }}>{c}</span>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={showAddPart} onClose={() => { setShowAddPart(false); setSimilarParts([]); setDuplicatePart(null) }} title="إضافة صنف جديد"
        footer={<>
          <button className="btn btn-ghost" onClick={() => { setShowAddPart(false); setSimilarParts([]); setDuplicatePart(null) }}>إلغاء</button>
          {similarParts.length > 0
            ? <button className="btn btn-primary" onClick={() => { setSimilarParts([]); addPart.mutate(true) }}>
                إضافة على أي حال
              </button>
            : <button className="btn btn-primary" onClick={() => addPart.mutate(false)}
                disabled={addPart.isPending || !form.name || !form.sell_price}>
                {addPart.isPending ? 'جاري...' : 'حفظ'}
              </button>
          }
        </>}>
        <div className="form-grid">
          {/* تحذير: تطابق كامل */}
          {duplicatePart && (
            <div className="form-group form-full">
              <div style={{ padding:'10px 14px', background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8 }}>
                <div style={{ fontWeight:600, color:'var(--red)', fontSize:12, marginBottom:4 }}>⛔ الصنف موجود مسبقاً</div>
                <div style={{ fontSize:12, color:'var(--text)' }}>"{duplicatePart.name}" — الكمية الحالية: {duplicatePart.quantity}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>استخدم زر ▲ (إضافة كمية) على الصنف الموجود.</div>
              </div>
            </div>
          )}
          {/* تحذير: أصناف مشابهة */}
          {similarParts.length > 0 && (
            <div className="form-group form-full">
              <div style={{ padding:'10px 14px', background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.3)', borderRadius:8 }}>
                <div style={{ fontWeight:600, color:'var(--amber)', fontSize:12, marginBottom:8 }}>⚠️ هل تقصد أحد هذه الأصناف؟</div>
                {similarParts.map(s => (
                  <div key={s.id} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12, borderBottom:'1px solid var(--border)' }}>
                    <span style={{ color:'var(--text-2)' }}>{s.name}</span>
                    <span style={{ color:'var(--green)', fontFamily:'monospace' }}>كمية: {s.quantity}</span>
                  </div>
                ))}
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>إذا لم تجد ما تبحث عنه اضغط "إضافة على أي حال".</div>
              </div>
            </div>
          )}
          {/* الاسم */}
          <div className="form-group form-full">
            <label className="form-label">اسم الصنف *</label>
            <input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="مثال: شاشة iPhone 14 Pro"/>
          </div>
          {/* القسم */}
          <div className="form-group">
            <label className="form-label">القسم</label>
            <select className="form-select" value={form.category} onChange={e=>set('category',e.target.value)}>
              <option value="">-- اختر قسم --</option>
              {allCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* المورد */}
          <div className="form-group">
            <label className="form-label">المورد</label>
            <select className="form-select" value={form.supplier_id} onChange={e=>set('supplier_id',e.target.value)}>
              <option value="">-- اختر مورداً --</option>
              {suppliersList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {/* SKU */}
          <div className="form-group">
            <label className="form-label" style={{ color:'var(--muted)' }}>رمز SKU</label>
            <div className="form-input" style={{ color:'var(--muted)', fontSize:12 }}>يُولَّد تلقائياً عند الحفظ</div>
          </div>
          {/* الكمية الابتدائية */}
          <div className="form-group">
            <label className="form-label">الكمية الابتدائية</label>
            <input className="form-input" type="number" min="0" value={form.quantity} onChange={e=>set('quantity',e.target.value)}/>
          </div>
          {/* الحد الأدنى */}
          <div className="form-group">
            <label className="form-label">الحد الأدنى للتنبيه</label>
            <input className="form-input" type="number" min="0" value={form.min_quantity} onChange={e=>set('min_quantity',e.target.value)}/>
          </div>
          {/* سعر الشراء */}
          <div className="form-group">
            <label className="form-label">سعر الشراء (للحساب الداخلي)</label>
            <input className="form-input" type="number" min="0" value={form.cost_price} onChange={e=>set('cost_price',e.target.value)}/>
          </div>
          {/* سعر البيع */}
          <div className="form-group">
            <label className="form-label">سعر البيع للعميل *</label>
            <input className="form-input" type="number" min="0" value={form.sell_price} onChange={e=>set('sell_price',e.target.value)}/>
          </div>
          {/* الموقع */}
          <div className="form-group">
            <label className="form-label">موقع في المخزن</label>
            <input className="form-input" value={form.location} onChange={e=>set('location',e.target.value)} placeholder="مثال: رف A-3"/>
          </div>
          {/* التوافق */}
          <div className="form-group">
            <label className="form-label">الأجهزة المتوافقة</label>
            <input className="form-input" value={form.brand_compat} onChange={e=>set('brand_compat',e.target.value)} placeholder="مثال: Apple, Samsung"/>
          </div>
          {/* معلومة */}
          {form.quantity > 0 && form.cost_price > 0 && (
            <div className="form-group form-full">
              <div style={{ padding:'8px 12px', background:'rgba(59,130,246,.06)', borderRadius:6,
                border:'1px solid rgba(59,130,246,.2)', fontSize:12, color:'var(--blue)' }}>
                ✓ ستُسجَّل كمية ابتدائية {form.quantity} وحدة في سجل الحركات بتكلفة {Number(form.cost_price).toLocaleString('ar-SA')} ريال/وحدة
              </div>
            </div>
          )}
        </div>
      </Modal>
      </>)}
    </div>
  )
}

// ── Movements Tab Component ────────────────────────────────
// ── Part Detail Modal ──────────────────────────────────────
function PartDetailModal({ partId, onClose }) {
  const { user } = useAuth()
  const canSeeCost   = ['admin','branch_manager','warehouse','accountant'].includes(user?.role)
  const canSeeAudit  = ['admin','branch_manager','accountant'].includes(user?.role)
  const [detailTab, setDetailTab] = useState('movements') // 'movements' | 'audit'

  const { data, isLoading } = useQuery({
    queryKey: ['part-detail', partId],
    queryFn: () => api.get(`/inventory/parts/${partId}`),
    enabled: !!partId
  })
  const p = data?.data

  const { data: auditData } = useQuery({
    queryKey: ['part-audit', partId],
    queryFn: () => api.get(`/inventory/parts/${partId}/audit`),
    enabled: !!partId && canSeeAudit && detailTab === 'audit'
  })
  const auditRows = auditData?.data || []

  const MOVEMENT_CONFIG = {
    purchase:     { label:'شراء',       color:'#10B981', icon:'📦', sign:'+' },
    issue:        { label:'صرف',        color:'#EF4444', icon:'↗️', sign:'-' },
    return:       { label:'إرجاع',      color:'#3B82F6', icon:'↩️', sign:'+' },
    adjustment_add:{ label:'تسوية +',   color:'#10B981', icon:'⚙️', sign:'+' },
    adjustment_sub:{ label:'تسوية -',   color:'#F97316', icon:'⚙️', sign:'-' },
    initial:      { label:'كمية ابتدائية', color:'#8B5CF6', icon:'🏷️', sign:'+' },
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:300,
      background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center',
      padding:16
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:'var(--ink-2)', borderRadius:12, width:'100%', maxWidth:780,
        maxHeight:'90vh', display:'flex', flexDirection:'column',
        border:'1px solid var(--border)', boxShadow:'0 24px 64px rgba(0,0,0,.5)'
      }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div style={{ fontWeight:700, fontSize:16, color:'var(--text-2)' }}>
            {isLoading ? 'جاري التحميل...' : p?.name}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer',
            color:'var(--muted)', fontSize:20, lineHeight:1 }}>×</button>
        </div>

        {isLoading ? (
          <div style={{ padding:40, textAlign:'center' }}><Loading /></div>
        ) : !p ? null : (
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:16 }}>

            {/* بطاقة المعلومات */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
              {/* اليسار — بيانات أساسية */}
              <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>بيانات القطعة</div>
                {[
                  { label:'SKU', value: p.sku || '—', mono:true },
                  { label:'الفئة', value: p.category || '—' },
                  { label:'الفرع', value: p.branch_name || '—' },
                  { label:'المورد', value: p.supplier_name || '—' },
                  { label:'الموقع', value: p.location || '—' },
                ].map(item => (
                  <div key={item.label} style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                    <span style={{ color:'var(--muted)' }}>{item.label}</span>
                    <span style={{ color:'var(--text-2)', fontFamily: item.mono ? 'monospace' : 'inherit' }}>{item.value}</span>
                  </div>
                ))}
              </div>

              {/* اليمين — أرقام */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { label:'الكمية الحالية', value: p.quantity, color: p.quantity <= p.min_quantity ? 'var(--red)' : 'var(--green)', big:true },
                  canSeeCost && { label:'متوسط التكلفة', value: `${Number(p.avg_cost||0).toLocaleString('ar-SA')} ريال`, color:'var(--amber)' },
                  { label:'سعر البيع', value: `${Number(p.sell_price||0).toLocaleString('ar-SA')} ريال`, color:'var(--blue)' },
                  canSeeCost && { label:'قيمة المخزون', value: `${Number(p.inventory_value||0).toLocaleString('ar-SA')} ريال`, color:'var(--green)' },
                ].filter(Boolean).map(item => (
                  <div key={item.label} style={{ background:'var(--ink-3)', borderRadius:8, padding:'10px 14px' }}>
                    <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>{item.label}</div>
                    <div style={{ fontWeight:700, color:item.color, fontSize:item.big?20:15, fontFamily:'monospace' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ملخص الحركات */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {[
                { label:'إجمالي الشراء', value:p.total_purchased, color:'var(--green)' },
                { label:'إجمالي الصرف',  value:p.total_issued,    color:'var(--red)' },
                { label:'إجمالي الإرجاع',value:p.total_returned,  color:'var(--blue)' },
              ].map(item => (
                <div key={item.label} style={{ background:'var(--ink-3)', borderRadius:8, padding:'8px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{item.label}</div>
                  <div style={{ fontWeight:700, color:item.color, fontSize:16, fontFamily:'monospace' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* معلومات التتبع */}
            <div style={{ fontSize:11, color:'var(--muted)', display:'flex', gap:20, flexWrap:'wrap' }}>
              {p.created_by_name && <span>أُضيفت بواسطة <strong style={{ color:'var(--text)' }}>{p.created_by_name}</strong> — {p.created_at ? new Date(p.created_at).toLocaleDateString('ar-SA') : ''}</span>}
              {p.updated_by_name && <span>آخر تعديل بواسطة <strong style={{ color:'var(--text)' }}>{p.updated_by_name}</strong> — {p.updated_at ? new Date(p.updated_at).toLocaleDateString('ar-SA') : ''}</span>}
            </div>

            {/* التبويبات */}
            <div style={{ display:'flex', gap:4, background:'var(--ink-3)', borderRadius:8, padding:3, alignSelf:'flex-start' }}>
              {[{key:'movements',label:'سجل الحركات'}, ...(canSeeAudit ? [{key:'audit',label:'سجل التعديلات'}] : [])].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)}
                  style={{ padding:'4px 12px', borderRadius:6, border:'none', cursor:'pointer',
                    fontFamily:'var(--font)', fontSize:12, fontWeight:500,
                    background: detailTab===t.key ? 'var(--blue)' : 'transparent',
                    color: detailTab===t.key ? '#fff' : 'var(--muted)' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* سجل الحركات */}
            {detailTab === 'movements' && (
            <div>
              <div style={{ fontWeight:600, color:'var(--text-2)', fontSize:13, marginBottom:10 }}>
                سجل الحركات ({p.movements?.length || 0})
              </div>
              {!p.movements?.length ? (
                <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'16px 0' }}>لا توجد حركات مسجلة</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {p.movements.map((m, i) => {
                    const cfg = MOVEMENT_CONFIG[m.movement_type] || { label:m.movement_type, color:'var(--muted)', icon:'•', sign:'' }
                    const isIn = ['+'].includes(cfg.sign)
                    return (
                      <div key={m.id || i} style={{
                        display:'grid', gridTemplateColumns:'110px 70px 60px 60px 60px 1fr',
                        gap:8, padding:'8px 12px', borderRadius:6,
                        background:'var(--ink-3)', alignItems:'center', fontSize:12
                      }}>
                        <span style={{ color:'var(--muted)', fontFamily:'monospace', fontSize:11 }}>
                          {new Date(m.created_at).toLocaleString('ar-SA', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </span>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 6px', borderRadius:4,
                          background:`${cfg.color}18`, color:cfg.color, fontSize:11, fontWeight:600 }}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span style={{ fontFamily:'monospace', fontWeight:700,
                          color: isIn ? 'var(--green)' : 'var(--red)', textAlign:'center' }}>
                          {cfg.sign}{m.quantity}
                        </span>
                        <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-2)', textAlign:'center' }}>
                          {m.quantity_after ?? '—'}
                        </span>
                        {canSeeCost && <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--muted)', textAlign:'right' }}>
                          {m.unit_cost ? `${Number(m.unit_cost).toLocaleString('ar-SA')}ر` : '—'}
                        </span>}
                        <span style={{ color:'var(--text)', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                          {m.performed_by_name && <strong>{m.performed_by_name}</strong>}
                          {m.order_number && <span style={{ color:'var(--blue)', fontFamily:'monospace', fontSize:11 }}>#{m.order_number}</span>}
                          {m.customer_name && <span style={{ color:'var(--text-2)', fontSize:11 }}>← {m.customer_name}</span>}
                          {(m.device_brand || m.device_model) && (
                            <span style={{ color:'var(--muted)', fontSize:11 }}>
                              ({m.device_brand} {m.device_model})
                            </span>
                          )}
                          {m.technician_name && <span style={{ color:'var(--amber)', fontSize:11 }}>🔧 {m.technician_name}</span>}
                          {m.supplier_name && <span style={{ color:'var(--amber)', fontSize:11 }}>📦 {m.supplier_name}</span>}
                          {m.notes && !m.order_number && <span style={{ color:'var(--muted)', fontSize:11 }}>— {m.notes}</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            )}

            {/* سجل التعديلات */}
            {detailTab === 'audit' && canSeeAudit && (
            <div>
              <div style={{ fontWeight:600, color:'var(--text-2)', fontSize:13, marginBottom:10 }}>
                سجل التعديلات على بيانات القطعة
              </div>
              {!auditRows.length ? (
                <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'16px 0' }}>
                  لا توجد تعديلات مسجلة بعد
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {auditRows.map((r, i) => {
                    const oldVal = r.old_value ? Object.values(r.old_value)[0] : '—'
                    const newVal = r.new_value ? Object.values(r.new_value)[0] : '—'
                    return (
                      <div key={r.id || i} style={{
                        display:'flex', gap:12, padding:'8px 12px', borderRadius:6,
                        background:'var(--ink-3)', alignItems:'center', fontSize:12
                      }}>
                        <span style={{ color:'var(--muted)', fontFamily:'monospace', fontSize:11, flexShrink:0, width:120 }}>
                          {new Date(r.created_at).toLocaleString('ar-SA', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </span>
                        <span style={{ color:'var(--text-2)', fontWeight:600, flexShrink:0, width:110 }}>{r.field_label}</span>
                        <span style={{ color:'var(--red)', fontFamily:'monospace', textDecoration:'line-through', flexShrink:0 }}>{oldVal}</span>
                        <span style={{ color:'var(--muted)', flexShrink:0 }}>→</span>
                        <span style={{ color:'var(--green)', fontFamily:'monospace', flexShrink:0 }}>{newVal}</span>
                        <span style={{ color:'var(--muted)', marginRight:'auto', fontSize:11 }}>
                          {r.performed_by_name || 'النظام'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

// ── Adjustments Tab ────────────────────────────────────────
function AdjustmentsTab() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const canApprove = ['admin','branch_manager'].includes(user?.role)
  const canCreate  = ['admin','branch_manager','warehouse'].includes(user?.role)

  const [showNew,        setShowNew]        = useState(false)
  const [rejectTarget,   setRejectTarget]   = useState(null)
  const [rejectReason,   setRejectReason]   = useState('')
  const [statusFilter,   setStatusFilter]   = useState('')
  const [partSearch,     setPartSearch]     = useState('')
  const [selectedPartId, setSelectedPartId] = useState('')
  const [qtyActual,      setQtyActual]      = useState('')
  const [reason,         setReason]         = useState('')
  const [notes,          setNotes]          = useState('')

  const { data: adjData, isLoading } = useQuery({
    queryKey: ['adjustments', statusFilter],
    queryFn: () => api.get(`/inventory/adjustments?status=${statusFilter}&limit=50`)
  })
  const adjs = adjData?.data || []

  const { data: partsData } = useQuery({
    queryKey: ['parts-for-adj', partSearch],
    queryFn: () => api.get(`/inventory/parts?search=${partSearch}&limit=30`),
    enabled: showNew
  })
  const partsList = partsData?.data || []
  const selectedPart = partsList.find(p => p.id === selectedPartId)

  const createMutation = useMutation({
    mutationFn: () => api.post('/inventory/adjustments', {
      part_id: selectedPartId, quantity_actual: parseInt(qtyActual), reason, notes
    }),
    onSuccess: () => {
      toast.success('تم إرسال طلب التسوية للاعتماد ✅')
      qc.invalidateQueries(['adjustments'])
      setShowNew(false); setSelectedPartId(''); setQtyActual(''); setReason(''); setNotes('')
    },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  const approveMutation = useMutation({
    mutationFn: (id) => api.post(`/inventory/adjustments/${id}/approve`),
    onSuccess: () => { toast.success('تمت الموافقة ✅'); qc.invalidateQueries(['adjustments']); qc.invalidateQueries(['parts']) },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/inventory/adjustments/${rejectTarget}/reject`, { reason: rejectReason }),
    onSuccess: () => { toast.success('تم الرفض'); qc.invalidateQueries(['adjustments']); setRejectTarget(null); setRejectReason('') },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  const STATUS_CONFIG = {
    pending:  { label:'معلق',    color:'var(--amber)' },
    approved: { label:'معتمد',   color:'var(--green)' },
    rejected: { label:'مرفوض',   color:'var(--red)' },
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ display:'flex', gap:8 }}>
          {['','pending','approved','rejected'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`btn btn-sm ${statusFilter===s ? 'btn-primary' : 'btn-ghost'}`}>
              {s === '' ? 'الكل' : STATUS_CONFIG[s]?.label}
            </button>
          ))}
        </div>
        {canCreate && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
            <Plus size={13}/> جرد جديد
          </button>
        )}
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : !adjs.length ? <EmptyState message="لا توجد طلبات جرد" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>التاريخ</th><th>القطعة</th><th>النظام</th><th>الفعلي</th>
                <th>الفرق</th><th>السبب</th><th>الحالة</th><th>مقدَّم من</th>
                {canApprove && <th>إجراء</th>}
              </tr></thead>
              <tbody>
                {adjs.map(a => {
                  const sc = STATUS_CONFIG[a.status] || {}
                  return (
                    <tr key={a.id}>
                      <td className="font-mono text-xs text-muted">
                        {new Date(a.created_at).toLocaleDateString('ar-SA')}
                      </td>
                      <td style={{ fontWeight:500, color:'var(--text-2)' }}>{a.part_name}
                        {a.sku && <div className="font-mono text-xs text-muted">{a.sku}</div>}
                      </td>
                      <td className="font-mono text-sm text-muted">{a.quantity_system}</td>
                      <td className="font-mono text-sm">{a.quantity_actual}</td>
                      <td className="font-mono font-bold" style={{
                        color: a.difference > 0 ? 'var(--green)' : a.difference < 0 ? 'var(--red)' : 'var(--muted)'
                      }}>
                        {a.difference > 0 ? '+' : ''}{a.difference}
                      </td>
                      <td style={{ fontSize:12, color:'var(--text)', maxWidth:150 }}>{a.reason}</td>
                      <td>
                        <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                          background:`${sc.color}18`, color:sc.color }}>{sc.label}</span>
                        {a.status === 'rejected' && a.rejected_reason && (
                          <div style={{ fontSize:10, color:'var(--red)', marginTop:2 }}>{a.rejected_reason}</div>
                        )}
                      </td>
                      <td style={{ fontSize:12 }}>{a.created_by_name || '—'}</td>
                      {canApprove && (
                        <td>
                          {a.status === 'pending' && (
                            <div style={{ display:'flex', gap:6 }}>
                              <button className="btn btn-sm" style={{ background:'rgba(16,185,129,.1)', color:'var(--green)', border:'1px solid rgba(16,185,129,.2)', padding:'3px 10px', fontSize:11 }}
                                disabled={approveMutation.isPending}
                                onClick={() => approveMutation.mutate(a.id)}>اعتماد</button>
                              <button className="btn btn-sm" style={{ background:'rgba(239,68,68,.1)', color:'var(--red)', border:'1px solid rgba(239,68,68,.2)', padding:'3px 10px', fontSize:11 }}
                                onClick={() => { setRejectTarget(a.id); setRejectReason('') }}>رفض</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نافذة جرد جديد */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="طلب تسوية مخزون جديد"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowNew(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !selectedPartId || qtyActual === ''}>
            {createMutation.isPending ? 'جاري...' : 'إرسال للاعتماد'}
          </button>
        </>}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="form-group">
            <label className="form-label">القطعة *</label>
            <input className="form-input" placeholder="ابحث عن القطعة..." value={partSearch}
              onChange={e => { setPartSearch(e.target.value); setSelectedPartId('') }}/>
            {partsData && partSearch && (
              <div style={{ border:'1px solid var(--border)', borderRadius:6, maxHeight:150, overflowY:'auto', marginTop:4 }}>
                {partsList.map(p => (
                  <div key={p.id} onClick={() => { setSelectedPartId(p.id); setPartSearch(p.name); setQtyActual('') }}
                    style={{ padding:'6px 10px', cursor:'pointer', fontSize:12,
                      background: selectedPartId===p.id ? 'var(--blue-dim)' : 'transparent',
                      display:'flex', justifyContent:'space-between' }}>
                    <span style={{ color:'var(--text-2)' }}>{p.name}</span>
                    <span style={{ color:'var(--green)', fontFamily:'monospace' }}>الكمية: {p.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedPart && (
            <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'10px 14px',
              display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span style={{ color:'var(--muted)' }}>الكمية في النظام</span>
              <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--text-2)', fontSize:18 }}>
                {selectedPart.quantity}
              </span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">الكمية الفعلية *</label>
            <input className="form-input" type="number" min="0" value={qtyActual}
              onChange={e => setQtyActual(e.target.value)} placeholder="أدخل الكمية الفعلية بعد العد"/>
            {selectedPart && qtyActual !== '' && (
              <div style={{ marginTop:6, fontSize:12 }}>
                الفرق:
                <strong style={{
                  marginRight:6, color: parseInt(qtyActual)-selectedPart.quantity > 0 ? 'var(--green)'
                    : parseInt(qtyActual)-selectedPart.quantity < 0 ? 'var(--red)' : 'var(--muted)',
                  fontFamily:'monospace'
                }}>
                  {parseInt(qtyActual)-selectedPart.quantity > 0 ? '+' : ''}{parseInt(qtyActual)-selectedPart.quantity}
                </strong>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">السبب *</label>
            <select className="form-select" value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">-- اختر السبب --</option>
              <option value="تالف أو مكسور">تالف أو مكسور</option>
              <option value="فقدان">فقدان</option>
              <option value="خطأ إدخال سابق">خطأ إدخال سابق</option>
              <option value="عد يدوي دوري">عد يدوي دوري</option>
              <option value="أخرى">أخرى</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="تفاصيل إضافية..."/>
          </div>
        </div>
      </Modal>

      {/* نافذة رفض مع سبب */}
      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="رفض طلب التسوية"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setRejectTarget(null)}>إلغاء</button>
          <button className="btn btn-danger" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
            {rejectMutation.isPending ? 'جاري...' : 'تأكيد الرفض'}
          </button>
        </>}>
        <div className="form-group">
          <label className="form-label">سبب الرفض</label>
          <input className="form-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="اشرح سبب الرفض..."/>
        </div>
      </Modal>
    </div>
  )
}

function MovementsTab() {
  const { user } = useAuth()
  const [partFilter,   setPartFilter]   = useState('')
  const [typeFilter,   setTypeFilter]   = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [page,         setPage]         = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-movements', partFilter, typeFilter, dateFrom, dateTo, page],
    queryFn: () => api.get(
      `/inventory/movements?part_id=${partFilter}&movement_type=${typeFilter}&date_from=${dateFrom}&date_to=${dateTo}&page=${page}&limit=30`
    )
  })

  const rows       = data?.data || []
  const pagination = data?.pagination || {}

  const TYPE_LABELS = {
    purchase:    { label:'شراء',    color:'var(--green)',  icon:'📦' },
    issue:       { label:'صرف',     color:'var(--red)',    icon:'↗️' },
    return:      { label:'إرجاع',   color:'var(--blue)',   icon:'↩️' },
    adjustment:  { label:'تسوية',   color:'var(--amber)',  icon:'⚙️' },
    transfer_in: { label:'استلام نقل', color:'var(--green)', icon:'📥' },
    transfer_out:{ label:'نقل خارج',  color:'var(--red)',   icon:'📤' },
  }

  return (
    <div>
      {/* فلاتر */}
      <div className="filter-bar" style={{ flexWrap:'wrap', gap:8 }}>
        <select className="form-select" style={{ width:140 }} value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setPage(1)}}>
          <option value="">كل الحركات</option>
          <option value="purchase">شراء</option>
          <option value="issue">صرف</option>
          <option value="return">إرجاع</option>
          <option value="adjustment">تسوية</option>
        </select>
        <input className="form-input" type="date" style={{ width:145 }} value={dateFrom}
          onChange={e=>{setDateFrom(e.target.value);setPage(1)}} placeholder="من تاريخ" />
        <input className="form-input" type="date" style={{ width:145 }} value={dateTo}
          onChange={e=>{setDateTo(e.target.value);setPage(1)}} placeholder="إلى تاريخ" />
        {(typeFilter||dateFrom||dateTo) && (
          <button className="btn btn-ghost btn-sm" onClick={()=>{setTypeFilter('');setDateFrom('');setDateTo('');setPage(1)}}>
            مسح الفلاتر
          </button>
        )}
        <div style={{ marginRight:'auto', fontSize:12, color:'var(--muted)' }}>
          {pagination.total || 0} حركة
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : !rows.length ? <EmptyState message="لا توجد حركات بعد" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>القطعة</th>
                  <th>نوع الحركة</th>
                  <th>الكمية</th>
                  <th>قبل</th>
                  <th>بعد</th>
                  <th>التكلفة</th>
                  <th>المستخدم</th>
                  <th>المرجع</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const t = TYPE_LABELS[r.movement_type] || { label: r.movement_type, color:'var(--muted)', icon:'•' }
                  const isIn = ['purchase','return','transfer_in'].includes(r.movement_type)
                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-xs text-muted">
                        {new Date(r.created_at).toLocaleString('ar-SA', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                      </td>
                      <td>
                        <div style={{ fontWeight:500, color:'var(--text-2)', fontSize:13 }}>{r.part_name}</div>
                        {r.part_sku && <div className="font-mono text-xs text-muted">{r.part_sku}</div>}
                      </td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                          padding:'2px 8px', borderRadius:4,
                          background:`${t.color}18`, color:t.color, fontSize:12, fontWeight:600 }}>
                          {t.icon} {t.label}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily:'monospace', fontWeight:700,
                          color: isIn ? 'var(--green)' : 'var(--red)' }}>
                          {isIn ? '+' : '-'}{r.quantity}
                        </span>
                      </td>
                      <td className="font-mono text-sm text-muted">{r.quantity_before ?? '—'}</td>
                      <td className="font-mono text-sm" style={{ color: isIn ? 'var(--green)' : 'var(--text-2)' }}>
                        {r.quantity_after ?? '—'}
                      </td>
                      <td className="font-mono text-sm">
                        {r.unit_cost ? `${Number(r.unit_cost).toLocaleString()} ر` : '—'}
                      </td>
                      <td style={{ fontSize:12, color:'var(--text)' }}>{r.performed_by_name || '—'}</td>
                      <td>
                        {r.order_number
                          ? <span className="font-mono text-xs text-blue">{r.order_number}</span>
                          : <span className="text-xs text-muted">{r.reference_type || '—'}</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination.pages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:12 }}>
          <button className="btn btn-ghost btn-sm" disabled={page===1} onClick={()=>setPage(p=>p-1)}>السابق</button>
          <span style={{ fontSize:12, color:'var(--muted)', padding:'4px 8px' }}>{page} / {pagination.pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)}>التالي</button>
        </div>
      )}
    </div>
  )
}


// ── Defective Parts Page ──────────────────────────────────
export function DefectivePage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const canManage = ['admin','branch_manager','warehouse'].includes(user?.role)
  const canApprove = ['admin','branch_manager'].includes(user?.role)

  const [activeTab, setActiveTab]   = useState('defective') // 'defective' | 'returns'
  const [statusFilter, setStatusFilter] = useState('waiting')
  const [showAddDefective, setShowAddDefective] = useState(false)
  const [showCreateReturn, setShowCreateReturn] = useState(false)
  const [showResolve, setShowResolve]   = useState(null) // return object
  const [selectedIds, setSelectedIds]   = useState([])
  const [addForm, setAddForm]       = useState({ part_id:'', quantity:1, source_type:'stock', reason:'' })
  const [returnNotes, setReturnNotes]   = useState('')
  const [resolveItems, setResolveItems] = useState([])

  const { data: defData, isLoading: defLoading } = useQuery({
    queryKey: ['defective', statusFilter],
    queryFn: () => api.get(`/defective?status=${statusFilter}`)
  })
  const defParts = defData?.data || []

  const { data: retData, isLoading: retLoading } = useQuery({
    queryKey: ['supplier-returns'],
    queryFn: () => api.get('/defective/returns'),
    enabled: activeTab === 'returns'
  })
  const returns = retData?.data || []

  const { data: partsData } = useQuery({
    queryKey: ['parts-for-defective'],
    queryFn: () => api.get('/inventory/parts?limit=200'),
    enabled: showAddDefective
  })
  const partsList = partsData?.data || []

  const addMutation = useMutation({
    mutationFn: () => api.post('/defective', addForm),
    onSuccess: () => { toast.success('تم إضافة القطعة لمنطقة التوالف ✅'); qc.invalidateQueries(['defective']); setShowAddDefective(false); setAddForm({ part_id:'', quantity:1, source_type:'stock', reason:'' }) },
    onError: e => toast.error(e?.response?.data?.message || 'خطأ')
  })

  const writeoffMutation = useMutation({
    mutationFn: (id) => api.post(`/defective/${id}/writeoff`, { reason: 'شطب بموافقة المدير' }),
    onSuccess: () => { toast.success('تم شطب القطعة ✅'); qc.invalidateQueries(['defective']) },
    onError: e => toast.error(e?.response?.data?.message || 'خطأ')
  })

  const createReturnMutation = useMutation({
    mutationFn: () => {
      const supplierId = defParts.find(d => selectedIds.includes(d.id))?.supplier_id
      if (!supplierId) throw new Error('لا يوجد مورد مرتبط بهذه القطع')
      return api.post('/defective/returns', { supplier_id: supplierId, defective_ids: selectedIds, notes: returnNotes })
    },
    onSuccess: (res) => { toast.success(`✅ ${res.data.message}`); qc.invalidateQueries(['defective']); qc.invalidateQueries(['supplier-returns']); setShowCreateReturn(false); setSelectedIds([]); setReturnNotes('') },
    onError: e => toast.error(e?.response?.data?.message || 'خطأ')
  })

  const resolveMutation = useMutation({
    mutationFn: () => api.post(`/defective/returns/${showResolve.id}/resolve`, { items: resolveItems }),
    onSuccess: () => { toast.success('تم تسجيل رد المورد ✅'); qc.invalidateQueries(['defective']); qc.invalidateQueries(['supplier-returns']); setShowResolve(null) },
    onError: e => toast.error(e?.response?.data?.message || 'خطأ')
  })

  const openResolve = async (ret) => {
    const res = await api.get(`/defective/returns/${ret.id}`)
    const items = res.data.data.items.map(i => ({ item_id: i.id, part_name: i.part_name, quantity_sent: i.quantity_sent, quantity_replaced:0, quantity_rejected:0, notes:'' }))
    setResolveItems(items)
    setShowResolve(res.data.data)
  }

  const STATUS_LABELS = { waiting:'انتظار', sent_to_supplier:'مع المورد', returned:'تم الاستبدال', written_off:'مشطوبة' }
  const STATUS_COLORS = { waiting:'var(--amber)', sent_to_supplier:'var(--blue)', returned:'var(--green)', written_off:'var(--muted)' }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">القطع التالفة وإرجاعات الموردين</div>
          <div className="page-sub">{defParts.length} قطعة في المنطقة الحالية</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {canManage && activeTab==='defective' && selectedIds.length > 0 && (
            <button className="btn btn-primary" onClick={() => setShowCreateReturn(true)}>
              📤 أرسل للمورد ({selectedIds.length})
            </button>
          )}
          {canManage && (
            <button className="btn btn-ghost" onClick={() => setShowAddDefective(true)}>
              + إضافة قطعة تالفة
            </button>
          )}
        </div>
      </div>

      {/* التبويبات */}
      <div style={{ display:'flex', gap:4, background:'var(--ink-3)', borderRadius:8, padding:3, alignSelf:'flex-start', marginBottom:16, width:'fit-content' }}>
        {[{k:'defective',l:'القطع التالفة'},{k:'returns',l:'إرجاعات الموردين'}].map(t => (
          <button key={t.k} onClick={() => setActiveTab(t.k)}
            style={{ padding:'5px 14px', borderRadius:6, border:'none', cursor:'pointer',
              fontFamily:'var(--font)', fontSize:12, fontWeight:500,
              background: activeTab===t.k ? 'var(--blue)' : 'transparent',
              color: activeTab===t.k ? '#fff' : 'var(--muted)' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* تبويب القطع التالفة */}
      {activeTab === 'defective' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            {['waiting','sent_to_supplier','returned','written_off'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`btn btn-sm ${statusFilter===s?'btn-primary':'btn-ghost'}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            {defLoading ? <Loading /> : !defParts.length ? <EmptyState message="لا توجد قطع تالفة" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    {canManage && statusFilter==='waiting' && <th style={{width:32}}></th>}
                    <th>القطعة</th><th>المورد</th><th>الكمية</th>
                    <th>المصدر</th><th>السبب</th><th>الحالة</th>
                    {canApprove && statusFilter==='waiting' && <th>إجراء</th>}
                  </tr></thead>
                  <tbody>
                    {defParts.map(d => (
                      <tr key={d.id}>
                        {canManage && statusFilter==='waiting' && (
                          <td>
                            <input type="checkbox" checked={selectedIds.includes(d.id)}
                              onChange={e => setSelectedIds(prev => e.target.checked ? [...prev,d.id] : prev.filter(x=>x!==d.id))}
                              disabled={!d.supplier_id}/>
                          </td>
                        )}
                        <td style={{ fontWeight:500, color:'var(--text-2)' }}>
                          {d.part_name}
                          {d.sku && <div className="font-mono text-xs text-muted">{d.sku}</div>}
                        </td>
                        <td style={{ fontSize:12 }}>{d.supplier_name || <span style={{color:'var(--red)',fontSize:11}}>بدون مورد</span>}</td>
                        <td className="font-mono text-sm text-center">{d.quantity}</td>
                        <td style={{ fontSize:11, color:'var(--muted)' }}>
                          {d.source_type==='warranty_ticket' ? `ضمان: ${d.ticket_number||'—'}` :
                           d.source_type==='stock' ? 'من المخزون' : 'عند الاستلام'}
                        </td>
                        <td style={{ fontSize:12, maxWidth:150, color:'var(--text)' }}>{d.reason || '—'}</td>
                        <td>
                          <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                            background:`${STATUS_COLORS[d.status]}18`, color:STATUS_COLORS[d.status] }}>
                            {STATUS_LABELS[d.status]}
                          </span>
                        </td>
                        {canApprove && statusFilter==='waiting' && (
                          <td>
                            <button className="btn btn-sm" style={{ background:'rgba(239,68,68,.1)', color:'var(--red)', border:'1px solid rgba(239,68,68,.2)', fontSize:11 }}
                              onClick={() => { if(confirm('شطب هذه القطعة نهائياً؟')) writeoffMutation.mutate(d.id) }}>
                              شطب
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* تبويب الإرجاعات */}
      {activeTab === 'returns' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {retLoading ? <Loading /> : !returns.length ? <EmptyState message="لا توجد طلبات إرجاع" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>رقم الطلب</th><th>المورد</th><th>القطع</th>
                  <th>التاريخ</th><th>الحالة</th><th>إجراء</th>
                </tr></thead>
                <tbody>
                  {returns.map(r => (
                    <tr key={r.id}>
                      <td className="font-mono text-blue">{r.return_number}</td>
                      <td style={{ fontWeight:500 }}>{r.supplier_name}</td>
                      <td className="text-center font-mono">{r.items_count}</td>
                      <td className="font-mono text-xs text-muted">{new Date(r.created_at).toLocaleDateString('ar-SA')}</td>
                      <td>
                        <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                          background: r.status==='resolved' ? 'rgba(16,185,129,.1)' : 'rgba(59,130,246,.1)',
                          color: r.status==='resolved' ? 'var(--green)' : 'var(--blue)' }}>
                          {r.status==='draft'?'مسودة':r.status==='sent'?'مع المورد':'تم الحل'}
                        </span>
                      </td>
                      <td>
                        {r.status === 'sent' && canManage && (
                          <button className="btn btn-sm btn-primary" style={{ fontSize:11 }}
                            onClick={() => openResolve(r)}>
                            📥 سجّل رد المورد
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* نافذة إضافة قطعة تالفة */}
      <Modal open={showAddDefective} onClose={() => setShowAddDefective(false)} title="إضافة قطعة لمنطقة التوالف"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowAddDefective(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => addMutation.mutate()} disabled={addMutation.isPending||!addForm.part_id}>
            {addMutation.isPending?'جاري...':'إضافة'}
          </button>
        </>}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-group">
            <label className="form-label">القطعة *</label>
            <select className="form-select" value={addForm.part_id} onChange={e => setAddForm(f=>({...f,part_id:e.target.value}))}>
              <option value="">— اختر القطعة —</option>
              {partsList.map(p => <option key={p.id} value={p.id}>{p.name} (متوفر: {p.quantity})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">المصدر</label>
            <select className="form-select" value={addForm.source_type} onChange={e => setAddForm(f=>({...f,source_type:e.target.value}))}>
              <option value="stock">من المخزون (اكتُشفت تالفة)</option>
              <option value="warranty_ticket">من تذكرة ضمان</option>
              <option value="receiving">عند الاستلام من المورد</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">الكمية</label>
            <input className="form-input" type="number" min="1" value={addForm.quantity} onChange={e=>setAddForm(f=>({...f,quantity:parseInt(e.target.value)||1}))}/>
          </div>
          <div className="form-group">
            <label className="form-label">سبب التلف</label>
            <input className="form-input" value={addForm.reason} onChange={e=>setAddForm(f=>({...f,reason:e.target.value}))} placeholder="مثال: شاشة معيبة من المصنع..."/>
          </div>
        </div>
      </Modal>

      {/* نافذة إرسال للمورد */}
      <Modal open={showCreateReturn} onClose={() => setShowCreateReturn(false)} title="إرسال قطع للمورد"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreateReturn(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => createReturnMutation.mutate()} disabled={createReturnMutation.isPending}>
            {createReturnMutation.isPending?'جاري...':'📤 إرسال للمورد'}
          </button>
        </>}>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:13, color:'var(--text-2)', marginBottom:8 }}>القطع المحددة للإرسال:</div>
          {selectedIds.map(id => {
            const d = defParts.find(x=>x.id===id)
            return d ? (
              <div key={id} style={{ padding:'6px 10px', background:'var(--ink-3)', borderRadius:6, marginBottom:4, fontSize:12 }}>
                {d.part_name} × {d.quantity} — المورد: {d.supplier_name||'غير محدد'}
              </div>
            ) : null
          })}
        </div>
        <div className="form-group">
          <label className="form-label">ملاحظات للمورد</label>
          <input className="form-input" value={returnNotes} onChange={e=>setReturnNotes(e.target.value)} placeholder="تفاصيل للمورد..."/>
        </div>
      </Modal>

      {/* نافذة تسجيل رد المورد */}
      {showResolve && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,.7)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target===e.currentTarget && setShowResolve(null)}>
          <div style={{ background:'var(--ink-2)', borderRadius:12, padding:24, maxWidth:560, width:'100%',
            border:'1px solid var(--border)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--text-2)', marginBottom:16 }}>
              📥 تسجيل رد المورد — {showResolve.return_number}
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
              المورد: <strong>{showResolve.supplier_name}</strong>
            </div>

            {resolveItems.map((item, i) => (
              <div key={item.item_id} style={{ padding:'12px 14px', background:'var(--ink-3)', borderRadius:8, marginBottom:8 }}>
                <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:10, fontSize:13 }}>
                  📦 {item.part_name} — أُرسل: {item.quantity_sent}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color:'var(--green)' }}>استبدل (سليمة)</label>
                    <input className="form-input" type="number" min="0" max={item.quantity_sent}
                      value={item.quantity_replaced}
                      onChange={e => setResolveItems(prev => prev.map((x,j) => j===i ? {...x, quantity_replaced: parseInt(e.target.value)||0} : x))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color:'var(--red)' }}>رفض (تالفة)</label>
                    <input className="form-input" type="number" min="0" max={item.quantity_sent}
                      value={item.quantity_rejected}
                      onChange={e => setResolveItems(prev => prev.map((x,j) => j===i ? {...x, quantity_rejected: parseInt(e.target.value)||0} : x))}/>
                  </div>
                </div>
                {item.quantity_replaced + item.quantity_rejected > item.quantity_sent && (
                  <div style={{ fontSize:11, color:'var(--red)', marginTop:4 }}>⚠️ الإجمالي أكبر من الكمية المرسلة</div>
                )}
              </div>
            ))}

            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setShowResolve(null)}>إلغاء</button>
              <button className="btn btn-primary" style={{ flex:1 }} onClick={() => resolveMutation.mutate()} disabled={resolveMutation.isPending}>
                {resolveMutation.isPending ? 'جاري...' : '✅ تأكيد رد المورد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Suppliers Page ────────────────────────────────────────
export function SuppliersPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const canEdit = ['admin','branch_manager'].includes(user?.role)

  const [showForm, setShowForm]       = useState(false)
  const [editSupplier, setEditSupplier] = useState(null)
  const [selectedId, setSelectedId]   = useState(null)
  const [search, setSearch]           = useState('')
  const [form, setForm] = useState({ name:'', contact_name:'', phone:'', email:'', address:'', tax_number:'', payment_terms:'', notes:'' })
  const setF = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => api.get(`/suppliers?search=${search}`)
  })
  const suppliers = data?.data || []

  const { data: detailData } = useQuery({
    queryKey: ['supplier-detail', selectedId],
    queryFn: () => api.get(`/suppliers/${selectedId}`),
    enabled: !!selectedId
  })
  const detail = detailData?.data

  const saveMutation = useMutation({
    mutationFn: () => editSupplier
      ? api.put(`/suppliers/${editSupplier.id}`, form)
      : api.post('/suppliers', form),
    onSuccess: () => {
      toast.success(editSupplier ? 'تم تحديث المورد ✅' : 'تم إضافة المورد ✅')
      qc.invalidateQueries(['suppliers'])
      if (selectedId) qc.invalidateQueries(['supplier-detail', selectedId])
      setShowForm(false); setEditSupplier(null)
      setForm({ name:'', contact_name:'', phone:'', email:'', address:'', tax_number:'', payment_terms:'', notes:'' })
    },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/suppliers/${id}`),
    onSuccess: () => { toast.success('تم تعطيل المورد'); qc.invalidateQueries(['suppliers']); setSelectedId(null) },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  const openEdit = (s) => {
    setEditSupplier(s)
    setForm({ name:s.name||'', contact_name:s.contact_name||'', phone:s.phone||'',
              email:s.email||'', address:s.address||'', tax_number:s.tax_number||'',
              payment_terms:s.payment_terms||'', notes:s.notes||'' })
    setShowForm(true)
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">الموردون</div>
          <div className="page-sub">{data?.pagination?.total || 0} مورد</div>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => { setEditSupplier(null); setForm({ name:'', contact_name:'', phone:'', email:'', address:'', tax_number:'', payment_terms:'', notes:'' }); setShowForm(true) }}><Plus size={15}/>إضافة مورد</button>}
      </div>

      <div style={{ display:'flex', gap:16, height:'calc(100vh - 140px)', overflow:'hidden' }}>

        {/* القائمة */}
        <div style={{ width:320, flexShrink:0, display:'flex', flexDirection:'column', gap:8 }}>
          <div className="search-wrap"><Search size={14}/><input className="search-input" placeholder="بحث باسم أو جوال..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
            {isLoading ? <Loading /> : suppliers.map(s => (
              <div key={s.id} onClick={() => setSelectedId(s.id)}
                style={{ padding:'12px 14px', borderRadius:8, cursor:'pointer',
                  background: selectedId===s.id ? 'var(--blue-dim)' : 'var(--ink-2)',
                  border: `1px solid ${selectedId===s.id ? 'var(--blue)' : 'var(--border)'}`,
                  transition:'all .15s' }}>
                <div style={{ fontWeight:600, color:'var(--text-2)', fontSize:13 }}>{s.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  {s.phone} {s.total_purchased > 0 && `· ${Number(s.total_purchased).toLocaleString('ar-SA')} ريال`}
                </div>
                <div style={{ display:'flex', gap:8, marginTop:4 }}>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{s.total_orders || 0} طلبية</span>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>·</span>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{s.parts_count || 0} قطعة</span>
                </div>
              </div>
            ))}
            {!isLoading && !suppliers.length && <EmptyState message="لا يوجد موردون" />}
          </div>
        </div>

        {/* التفاصيل */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {!selectedId ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--muted)', fontSize:13 }}>
              اختر مورداً لعرض تفاصيله
            </div>
          ) : !detail ? <Loading /> : (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

              {/* Header */}
              <div className="card" style={{ padding:'16px 20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:18, color:'var(--text-2)' }}>{detail.name}</div>
                    {detail.contact_name && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>تواصل: {detail.contact_name}</div>}
                  </div>
                  {canEdit && (
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(detail)}>تعديل</button>
                      <button className="btn btn-sm" style={{ background:'rgba(239,68,68,.1)', color:'var(--red)', border:'1px solid rgba(239,68,68,.2)' }}
                        onClick={() => { if(confirm('تعطيل المورد؟')) deleteMutation.mutate(detail.id) }}>تعطيل</button>
                    </div>
                  )}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:16 }}>
                  {[
                    { label:'إجمالي المشتريات', value: `${Number(detail.total_purchased||0).toLocaleString('ar-SA')} ريال`, color:'var(--green)' },
                    { label:'عدد الطلبيات',      value: detail.total_orders || 0 },
                    { label:'القطع المورَّدة',    value: detail.parts_count || 0 },
                  ].map(item => (
                    <div key={item.label} style={{ background:'var(--ink-3)', borderRadius:8, padding:'10px 14px' }}>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{item.label}</div>
                      <div style={{ fontWeight:700, color: item.color || 'var(--text-2)', fontSize:16, fontFamily:'monospace' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:16, marginTop:12, fontSize:12, color:'var(--muted)' }}>
                  {detail.phone && <span>📞 {detail.phone}</span>}
                  {detail.email && <span>✉️ {detail.email}</span>}
                  {detail.tax_number && <span>🔢 {detail.tax_number}</span>}
                  {detail.payment_terms && <span>💳 {detail.payment_terms}</span>}
                  {detail.address && <span>📍 {detail.address}</span>}
                </div>
              </div>

              {/* القطع */}
              {detail.parts?.length > 0 && (
                <div className="card" style={{ padding:'16px 20px' }}>
                  <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:12, fontSize:13 }}>القطع التي يوفرها ({detail.parts.length})</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {detail.parts.map(p => (
                      <span key={p.id} style={{ padding:'4px 10px', borderRadius:6, background:'var(--ink-3)',
                        border:'1px solid var(--border)', fontSize:11, color:'var(--text-2)' }}>
                        {p.name}
                        <span style={{ color:'var(--green)', marginRight:6, fontFamily:'monospace' }}>{p.quantity}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* سجل المشتريات */}
              {detail.purchases?.length > 0 && (
                <div className="card" style={{ padding:'16px 20px' }}>
                  <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:12, fontSize:13 }}>سجل المشتريات</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>التاريخ</th><th>القطعة</th><th>الكمية</th><th>التكلفة</th><th>الإجمالي</th><th>المرجع</th><th>استلم</th></tr></thead>
                      <tbody>
                        {detail.purchases.map(p => (
                          <tr key={p.id}>
                            <td className="font-mono text-xs text-muted">{new Date(p.purchased_at).toLocaleDateString('ar-SA')}</td>
                            <td style={{ fontWeight:500, color:'var(--text-2)', fontSize:13 }}>{p.part_name}</td>
                            <td className="font-mono text-sm">{p.quantity}</td>
                            <td className="font-mono text-sm">{Number(p.unit_cost).toLocaleString('ar-SA')} ر</td>
                            <td className="font-mono text-sm text-blue">{Number(p.total_cost).toLocaleString('ar-SA')} ر</td>
                            <td className="font-mono text-xs text-muted">{p.invoice_ref || '—'}</td>
                            <td style={{ fontSize:12 }}>{p.received_by_name || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* نافذة إضافة/تعديل مورد */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditSupplier(null) }}
        title={editSupplier ? 'تعديل مورد' : 'إضافة مورد جديد'}
        footer={<>
          <button className="btn btn-ghost" onClick={() => { setShowForm(false); setEditSupplier(null) }}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>
            {saveMutation.isPending ? 'جاري...' : 'حفظ'}
          </button>
        </>}>
        <div className="form-grid">
          <div className="form-group form-full"><label className="form-label">اسم المورد *</label>
            <input className="form-input" value={form.name} onChange={e=>setF('name',e.target.value)} placeholder="اسم الشركة أو المورد"/></div>
          <div className="form-group"><label className="form-label">جهة التواصل</label>
            <input className="form-input" value={form.contact_name} onChange={e=>setF('contact_name',e.target.value)} placeholder="اسم المسؤول"/></div>
          <div className="form-group"><label className="form-label">الجوال</label>
            <input className="form-input" value={form.phone} onChange={e=>setF('phone',e.target.value)} placeholder="05xxxxxxxx" dir="ltr"/></div>
          <div className="form-group"><label className="form-label">البريد الإلكتروني</label>
            <input className="form-input" value={form.email} onChange={e=>setF('email',e.target.value)} placeholder="email@example.com" dir="ltr"/></div>
          <div className="form-group"><label className="form-label">الرقم الضريبي</label>
            <input className="form-input" value={form.tax_number} onChange={e=>setF('tax_number',e.target.value)} dir="ltr"/></div>
          <div className="form-group"><label className="form-label">شروط الدفع</label>
            <input className="form-input" value={form.payment_terms} onChange={e=>setF('payment_terms',e.target.value)} placeholder="مثال: 30 يوم"/></div>
          <div className="form-group form-full"><label className="form-label">العنوان</label>
            <input className="form-input" value={form.address} onChange={e=>setF('address',e.target.value)}/></div>
          <div className="form-group form-full"><label className="form-label">ملاحظات</label>
            <input className="form-input" value={form.notes} onChange={e=>setF('notes',e.target.value)}/></div>
        </div>
      </Modal>
    </div>
  )
}


export function InvoicesPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, statusFilter],
    queryFn: () => api.get(`/invoices?page=${page}&limit=20&status=${statusFilter}`)
  })

  const invoices = data?.data || []
  const pagination = data?.pagination || {}

  const statusBadge = s => {
    const map = { paid:'badge-paid', pending:'badge-pending', partial:'badge-repair', cancelled:'badge-cancel', draft:'badge-normal' }
    const labels = { paid:'مدفوع', pending:'معلق', partial:'دفع جزئي', cancelled:'ملغي', draft:'مسودة' }
    return <span className={`badge ${map[s]||''}`}>{labels[s]||s}</span>
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">الفواتير</div>
          <div className="page-sub">{pagination.total || 0} فاتورة</div>
        </div>
      </div>

      <div className="filter-bar">
        <select className="form-select" style={{ width:160 }} value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}>
          <option value="">كل الفواتير</option>
          <option value="pending">معلق</option>
          <option value="paid">مدفوع</option>
          <option value="partial">دفع جزئي</option>
        </select>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : !invoices.length ? <EmptyState message="لا توجد فواتير" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>رقم الفاتورة</th><th>الأوردر</th><th>العميل</th><th>المجموع</th><th>المدفوع</th><th>الرصيد</th><th>الحالة</th><th>التاريخ</th></tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="font-mono text-xs text-blue">{inv.invoice_number}</td>
                    <td className="font-mono text-xs text-muted2">{inv.order_number}</td>
                    <td style={{ fontWeight:500, color:'var(--text-2)' }}>{inv.customer_name}</td>
                    <td className="font-mono text-sm">{Number(inv.total).toLocaleString()} ر</td>
                    <td className="font-mono text-sm text-green">{Number(inv.paid_amount).toLocaleString()} ر</td>
                    <td className={`font-mono text-sm ${inv.balance_due > 0 ? 'text-amber' : 'text-muted'}`}>{Number(inv.balance_due).toLocaleString()} ر</td>
                    <td>{statusBadge(inv.status)}</td>
                    <td className="text-xs text-muted font-mono">{inv.created_at ? new Date(inv.created_at).toLocaleDateString('ar-SA') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pagination.pages} onPage={setPage} />
      </div>
    </div>
  )
}

// ── Reports Page ──────────────────────────────────────────
export function ReportsPage() {
  const [period, setPeriod]       = useState('monthly')
  const [year, setYear]           = useState(new Date().getFullYear())
  const [reportTab, setReportTab] = useState('daily')

  const { data: revenue } = useQuery({
    queryKey: ['rev-report', period, year],
    queryFn: () => api.get(`/reports/revenue?period=${period}&year=${year}`)
  })

  const { data: techs } = useQuery({
    queryKey: ['tech-report', year],
    queryFn: () => api.get(`/reports/technicians?year=${year}`)
  })

  const { data: daily } = useQuery({
    queryKey: ['daily-report'],
    queryFn: () => api.get('/reports/daily')
  })

  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

  const TABS = [
    { id:'daily', label:'تقرير اليوم' },
    { id:'revenue', label:'الإيرادات' },
    { id:'technicians', label:'أداء الفنيين' },
  ]

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-title">التقارير والتحليلات</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select className="form-select" style={{ width:100 }} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* تبويبات */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setReportTab(t.id)} style={{
            padding:'9px 16px', background:'none', border:'none', cursor:'pointer',
            fontSize:13, fontFamily:'var(--font)',
            color: reportTab===t.id ? 'var(--blue)' : 'var(--muted-2)',
            borderBottom: reportTab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom:-1
          }}>{t.label}</button>
        ))}
      </div>

      {/* تقرير اليوم */}
      {reportTab === 'daily' && (
        <div>
          {/* إحصائيات اليوم */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            {[
              { label:'تذاكر اليوم',     value: daily?.data?.today_tickets    || 0, color:'blue' },
              { label:'تم إصلاحها',       value: daily?.data?.completed_today  || 0, color:'green' },
              { label:'مرفوضة',           value: daily?.data?.rejected_today   || 0, color:'red' },
              { label:'جاهزة للتسليم',   value: daily?.data?.ready_count      || 0, color:'amber' },
            ].map((s,i) => (
              <div key={i} className={`stat-card ${s.color}`}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          {/* أداء الفنيين اليوم */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">أداء الفنيين اليوم</span>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{new Date().toLocaleDateString('ar-SA')}</span>
            </div>
            {!(daily?.data?.tech_performance?.length) ? (
              <div style={{ textAlign:'center', padding:'30px 0', color:'var(--muted)', fontSize:13 }}>لا توجد بيانات لهذا اليوم</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>الفني</th><th>تذاكر نشطة</th><th>مكتملة اليوم</th><th>نسبة الإنجاز</th></tr></thead>
                  <tbody>
                    {daily.data.tech_performance.map(t => {
                      const total = (t.active_orders||0) + (t.completed_today||0)
                      const pct = total > 0 ? Math.round((t.completed_today||0) / total * 100) : 0
                      return (
                        <tr key={t.id}>
                          <td style={{ fontWeight:500, color:'var(--text-2)' }}>{t.full_name}</td>
                          <td className="font-mono text-amber">{t.active_orders || 0}</td>
                          <td className="font-mono text-green">{t.completed_today || 0}</td>
                          <td>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ flex:1, height:6, background:'var(--ink-4)', borderRadius:3 }}>
                                <div style={{ width:`${pct}%`, height:'100%', background:'var(--green)', borderRadius:3 }}/>
                              </div>
                              <span className="font-mono text-xs" style={{ color:'var(--muted-2)', minWidth:30 }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* الإيرادات */}
      {reportTab === 'revenue' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">الإيرادات الشهرية — {year}</span>
            <select className="form-select" style={{ width:120 }} value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="monthly">شهري</option>
              <option value="daily">يومي</option>
            </select>
          </div>
          {!revenue?.data?.length ? (
            <div style={{ textAlign:'center', padding:'30px 0', color:'var(--muted)', fontSize:13 }}>لا توجد بيانات</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>الفترة</th><th>عدد الفواتير</th><th>الإيرادات</th><th>الضريبة</th><th>الإجمالي مع الضريبة</th></tr></thead>
                <tbody>
                  {revenue.data.map((r,i) => {
                    const d = new Date(r.period)
                    const label = period === 'monthly'
                      ? months[d.getMonth()]
                      : d.toLocaleDateString('ar-SA')
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight:500, color:'var(--text-2)' }}>{label}</td>
                        <td className="font-mono">{r.invoice_count}</td>
                        <td className="font-mono text-blue">{Number(r.revenue||0).toLocaleString('ar-SA')} ر</td>
                        <td className="font-mono text-muted">{Number(r.vat_collected||0).toLocaleString('ar-SA')} ر</td>
                        <td className="font-mono text-green font-bold">
                          {(Number(r.revenue||0) + Number(r.vat_collected||0)).toLocaleString('ar-SA')} ر
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ background:'var(--blue-dim)', fontWeight:700 }}>
                    <td style={{ color:'var(--blue)' }}>الإجمالي</td>
                    <td className="font-mono text-blue">{revenue.data.reduce((s,r)=>s+Number(r.invoice_count||0),0)}</td>
                    <td className="font-mono text-blue">{revenue.data.reduce((s,r)=>s+Number(r.revenue||0),0).toLocaleString('ar-SA')} ر</td>
                    <td className="font-mono text-blue">{revenue.data.reduce((s,r)=>s+Number(r.vat_collected||0),0).toLocaleString('ar-SA')} ر</td>
                    <td className="font-mono text-blue">{revenue.data.reduce((s,r)=>s+Number(r.revenue||0)+Number(r.vat_collected||0),0).toLocaleString('ar-SA')} ر</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* أداء الفنيين */}
      {reportTab === 'technicians' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">أداء الفنيين — {year}</span>
          </div>
          {!techs?.data?.length ? (
            <div style={{ textAlign:'center', padding:'30px 0', color:'var(--muted)', fontSize:13 }}>لا توجد بيانات</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>الفني</th><th>إجمالي التذاكر</th><th>مكتملة</th><th>متوسط الوقت</th><th>إيرادات محققة</th><th>نسبة النجاح</th></tr></thead>
                <tbody>
                  {techs.data.map(t => {
                    const successRate = t.total_orders > 0
                      ? Math.round((t.completed||0) / t.total_orders * 100) : 0
                    return (
                      <tr key={t.id}>
                        <td style={{ fontWeight:500, color:'var(--text-2)' }}>{t.full_name}</td>
                        <td className="font-mono">{t.total_orders || 0}</td>
                        <td className="font-mono text-green">{t.completed || 0}</td>
                        <td className="font-mono text-muted">{t.avg_hours ? `${t.avg_hours}س` : '—'}</td>
                        <td className="font-mono text-blue">{Number(t.revenue_generated||0).toLocaleString('ar-SA')} ر</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ flex:1, height:5, background:'var(--ink-4)', borderRadius:3 }}>
                              <div style={{ width:`${successRate}%`, height:'100%', background: successRate>75?'var(--green)':successRate>50?'var(--amber)':'var(--red)', borderRadius:3 }}/>
                            </div>
                            <span className="font-mono text-xs text-muted2">{successRate}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
