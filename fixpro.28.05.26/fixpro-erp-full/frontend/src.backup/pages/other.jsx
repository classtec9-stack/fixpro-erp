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
  const [lowOnly, setLowOnly] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name:'', category:'', quantity:0, min_quantity:5, cost_price:0, sell_price:0, sku:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data, isLoading } = useQuery({
    queryKey: ['parts', search, lowOnly],
    queryFn: () => api.get(`/inventory/parts?search=${search}&low_stock=${lowOnly}`)
  })

  const { data: alerts } = useQuery({ queryKey: ['alerts'], queryFn: () => api.get('/inventory/alerts') })

  const addPart = useMutation({
    mutationFn: () => api.post('/inventory/parts', form),
    onSuccess: () => { toast.success('تم إضافة القطعة'); setShowAdd(false); qc.invalidateQueries(['parts']) },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const parts = data?.data || []

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">المخزون وقطع الغيار</div>
          <div className="page-sub">{data?.pagination?.total || 0} صنف</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className={`btn ${lowOnly ? 'btn-danger' : 'btn-ghost'}`} onClick={() => setLowOnly(!lowOnly)}>
            {lowOnly ? 'عرض الكل' : `تنبيهات النفاد (${alerts?.count || 0})`}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15}/>إضافة صنف</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-wrap" style={{ flex:1, maxWidth:320 }}>
          <Search /><input className="search-input" placeholder="بحث بالاسم أو SKU..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : !parts.length ? <EmptyState message="لا توجد قطع غيار" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>اسم القطعة</th><th>SKU</th><th>الفئة</th><th>الكمية</th><th>الحد الأدنى</th><th>سعر الشراء</th><th>سعر البيع</th><th>الحالة</th></tr></thead>
              <tbody>
                {parts.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight:500, color:'var(--text-2)' }}>{p.name}</td>
                    <td className="font-mono text-xs text-muted2">{p.sku || '—'}</td>
                    <td className="text-sm text-muted2">{p.category || '—'}</td>
                    <td className={`font-mono font-bold ${p.quantity <= p.min_quantity ? 'text-red' : 'text-green'}`}>{p.quantity}</td>
                    <td className="font-mono text-sm text-muted">{p.min_quantity}</td>
                    <td className="font-mono text-sm">{Number(p.cost_price).toLocaleString()} ر</td>
                    <td className="font-mono text-sm text-blue">{Number(p.sell_price).toLocaleString()} ر</td>
                    <td>
                      {p.quantity <= p.min_quantity
                        ? <span className="badge badge-cancel">منخفض</span>
                        : <span className="badge badge-ready">متوفر</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة صنف جديد"
        footer={<><button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button><button className="btn btn-primary" onClick={() => addPart.mutate()} disabled={addPart.isPending}>{addPart.isPending?'جاري...':'حفظ'}</button></>}>
        <div className="form-grid">
          <div className="form-group form-full"><label className="form-label">اسم القطعة *</label><input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">SKU</label><input className="form-input" value={form.sku} onChange={e=>set('sku',e.target.value)} dir="ltr" /></div>
          <div className="form-group"><label className="form-label">الفئة</label><input className="form-input" value={form.category} onChange={e=>set('category',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">الكمية الابتدائية</label><input className="form-input" type="number" value={form.quantity} onChange={e=>set('quantity',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">الحد الأدنى</label><input className="form-input" type="number" value={form.min_quantity} onChange={e=>set('min_quantity',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">سعر الشراء</label><input className="form-input" type="number" value={form.cost_price} onChange={e=>set('cost_price',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">سعر البيع *</label><input className="form-input" type="number" value={form.sell_price} onChange={e=>set('sell_price',e.target.value)} /></div>
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
  const { data: revenue } = useQuery({ queryKey: ['rev-report'], queryFn: () => api.get('/reports/revenue') })
  const { data: techs } = useQuery({ queryKey: ['tech-report'], queryFn: () => api.get('/reports/technicians') })

  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-title">التقارير والتحليلات</div>
      </div>

      <div className="two-col mb-4">
        <div className="card">
          <div className="card-header"><span className="card-title">الإيرادات الشهرية</span></div>
          {!revenue?.data?.length ? <div className="text-muted text-sm" style={{padding:'20px 0',textAlign:'center'}}>لا توجد بيانات</div> :
            <div className="table-wrap"><table>
              <thead><tr><th>الشهر</th><th>عدد الفواتير</th><th>الإيرادات</th><th>ضريبة القيمة المضافة</th></tr></thead>
              <tbody>
                {revenue.data.map((r,i) => {
                  const m = new Date(r.period).getMonth()
                  return (
                    <tr key={i}>
                      <td>{months[m]}</td>
                      <td className="font-mono">{r.invoice_count}</td>
                      <td className="font-mono text-green">{Number(r.revenue||0).toLocaleString()} ر</td>
                      <td className="font-mono text-muted">{Number(r.vat_collected||0).toLocaleString()} ر</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          }
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">أداء الفنيين</span></div>
          {!techs?.data?.length ? <div className="text-muted text-sm" style={{padding:'20px 0',textAlign:'center'}}>لا توجد بيانات</div> :
            <div className="table-wrap"><table>
              <thead><tr><th>الفني</th><th>إجمالي</th><th>مكتملة</th><th>متوسط الوقت</th><th>الإيرادات</th></tr></thead>
              <tbody>
                {techs.data.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight:500, color:'var(--text-2)' }}>{t.full_name}</td>
                    <td className="font-mono">{t.total_orders || 0}</td>
                    <td className="font-mono text-green">{t.completed || 0}</td>
                    <td className="font-mono text-muted">{t.avg_hours ? `${t.avg_hours} س` : '—'}</td>
                    <td className="font-mono text-blue">{Number(t.revenue_generated||0).toLocaleString()} ر</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          }
        </div>
      </div>
    </div>
  )
}
