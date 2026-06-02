// ── Customers Page ────────────────────────────────────────
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState, Pagination } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Search, Users } from 'lucide-react'

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
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [showAddPart, setShowAddPart] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [form, setForm] = useState({ name:'', category:'', quantity:0, min_quantity:5, cost_price:0, sell_price:0 })
  // توليد SKU وباركود تلقائياً
  const genSKU = (name, cat) => {
    const prefix = (cat||'PART').slice(0,3).toUpperCase()
    const num = String(Date.now()).slice(-4)
    return `${prefix}-${num}`
  }
  const genBarcode = () => String(Date.now()) + String(Math.floor(Math.random()*1000)).padStart(3,'0')
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data, isLoading } = useQuery({
    queryKey: ['parts', search, categoryFilter, lowOnly],
    queryFn: () => api.get(`/inventory/parts?search=${search}&category=${categoryFilter}&low_stock=${lowOnly}`)
  })

  const { data: alerts } = useQuery({ queryKey: ['alerts'], queryFn: () => api.get('/inventory/alerts') })

  // استخرج الأقسام من القطع الموجودة + المحفوظة محلياً
  const savedCats = JSON.parse(localStorage.getItem('invCategories') || '[]')
  const partsCats = [...new Set((data?.data || []).map(p => p.category).filter(Boolean))]
  const allCats   = [...new Set([...savedCats, ...partsCats])].sort()

  const addCategory = () => {
    if (!newCatName.trim()) return
    const cats = JSON.parse(localStorage.getItem('invCategories') || '[]')
    if (!cats.includes(newCatName)) {
      cats.push(newCatName)
      localStorage.setItem('invCategories', JSON.stringify(cats))
    }
    setShowAddCat(false)
    setNewCatName('')
    qc.invalidateQueries(['parts'])
    toast.success('تم إضافة القسم')
  }

  const addPart = useMutation({
    mutationFn: () => api.post('/inventory/parts', form),
    onSuccess: () => { toast.success('تم إضافة القطعة'); setShowAddPart(false); qc.invalidateQueries(['parts']); setForm({ name:'',category:'',quantity:0,min_quantity:5,cost_price:0,sell_price:0 }) },
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
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => setShowAddCat(true)}>+ قسم جديد</button>
          <button className={`btn ${lowOnly ? 'btn-danger' : 'btn-ghost'}`} onClick={() => setLowOnly(!lowOnly)}>
            {lowOnly ? 'عرض الكل' : `تنبيهات النفاد (${alerts?.count || 0})`}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddPart(true)}><Plus size={15}/>إضافة صنف</button>
        </div>
      </div>

      {/* أزرار الأقسام */}
      {allCats.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
          <button onClick={() => setCategoryFilter('')}
            className={`btn ${!categoryFilter ? 'btn-primary' : 'btn-ghost'} btn-sm`}>الكل</button>
          {allCats.map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
              className={`btn ${categoryFilter === cat ? 'btn-primary' : 'btn-ghost'} btn-sm`}>
              {cat}
            </button>
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
              <thead><tr><th>اسم القطعة</th><th>القسم</th><th>SKU</th><th>الكمية</th><th>الحد الأدنى</th><th>سعر الشراء</th><th>سعر البيع</th><th>الحالة</th></tr></thead>
              <tbody>
                {parts.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight:500, color:'var(--text-2)' }}>{p.name}</td>
                    <td><span style={{ padding:'2px 8px', borderRadius:4, background:'var(--ink-3)', fontSize:11, color:'var(--muted-2)' }}>{p.category || '—'}</span></td>
                    <td className="font-mono text-xs text-muted2">{p.sku || '—'}</td>
                    <td className={`font-mono font-bold ${p.quantity <= p.min_quantity ? 'text-red' : 'text-green'}`}>{p.quantity}</td>
                    <td className="font-mono text-sm text-muted">{p.min_quantity}</td>
                    <td className="font-mono text-sm">{Number(p.cost_price).toLocaleString()} ر</td>
                    <td className="font-mono text-sm text-blue">{Number(p.sell_price).toLocaleString()} ر</td>
                    <td>{p.quantity <= p.min_quantity ? <span className="badge badge-cancel">منخفض</span> : <span className="badge badge-ready">متوفر</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* إضافة قسم */}
      <Modal open={showAddCat} onClose={() => setShowAddCat(false)} title="إضافة قسم جديد"
        footer={<><button className="btn btn-ghost" onClick={() => setShowAddCat(false)}>إلغاء</button><button className="btn btn-primary" onClick={addCategory} disabled={!newCatName.trim()}>إضافة</button></>}>
        <div className="form-group">
          <label className="form-label">اسم القسم</label>
          <input className="form-input" value={newCatName} onChange={e => setNewCatName(e.target.value)}
            placeholder="مثال: شاشات — بطاريات — كيبورد — كاميرات" />
        </div>
        <div style={{ marginTop:12 }}>
          <div className="text-xs text-muted mb-2">أقسام مقترحة:</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {['شاشات','بطاريات','كيبورد','كاميرات','شواحن','مكبرات صوت','أجهزة تبريد','ذاكرة','كروت شاشة','أدوات أخرى'].map(c => (
              <span key={c} onClick={() => setNewCatName(c)}
                style={{ padding:'3px 10px', borderRadius:4, background:'var(--ink-3)', fontSize:12, cursor:'pointer', border:'1px solid var(--border)', color:'var(--muted-2)' }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      </Modal>

      {/* إضافة صنف */}
      <Modal open={showAddPart} onClose={() => setShowAddPart(false)} title="إضافة صنف جديد"
        footer={<><button className="btn btn-ghost" onClick={() => setShowAddPart(false)}>إلغاء</button><button className="btn btn-primary" onClick={() => addPart.mutate()} disabled={addPart.isPending || !form.name || !form.sell_price}>{addPart.isPending?'جاري...':'حفظ'}</button></>}>
        <div className="form-grid">
          <div className="form-group form-full"><label className="form-label">اسم الصنف *</label><input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="مثال: شاشة iPhone 14"/></div>
          <div className="form-group">
            <label className="form-label">القسم</label>
            <select className="form-select" value={form.category} onChange={e=>set('category',e.target.value)}>
              <option value="">-- اختر قسم --</option>
              {allCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color:'var(--muted)' }}>رمز SKU</label>
            <div className="form-input" dir="ltr" style={{ color:'var(--muted-2)', fontSize:12 }}>
              يُولَّد تلقائياً عند الحفظ
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color:'var(--muted)' }}>الباركود</label>
            <div className="form-input" dir="ltr" style={{ color:'var(--muted-2)', fontSize:12 }}>
              يُولَّد تلقائياً عند الحفظ
            </div>
          </div>
          <div className="form-group"><label className="form-label">الكمية</label><input className="form-input" type="number" value={form.quantity} onChange={e=>set('quantity',e.target.value)}/></div>
          <div className="form-group"><label className="form-label">الحد الأدنى</label><input className="form-input" type="number" value={form.min_quantity} onChange={e=>set('min_quantity',e.target.value)}/></div>
          <div className="form-group"><label className="form-label">سعر الشراء</label><input className="form-input" type="number" value={form.cost_price} onChange={e=>set('cost_price',e.target.value)}/></div>
          <div className="form-group"><label className="form-label">سعر البيع *</label><input className="form-input" type="number" value={form.sell_price} onChange={e=>set('sell_price',e.target.value)}/></div>
        </div>
      </Modal>
    </div>
  )
}

// ── Invoices Page ─────────────────────────────────────────
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
