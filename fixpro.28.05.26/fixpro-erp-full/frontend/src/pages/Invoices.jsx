import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState, Pagination } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Search, Printer, Send, DollarSign, Eye, RefreshCw, FileText, XCircle, RotateCcw } from 'lucide-react'
import { generateQR, buildTrackUrl } from '../utils/printUtils'

const STATUS = {
  draft:    { label:'مسودة',        badge:'badge-normal',  color:'var(--muted)' },
  pending:  { label:'معلقة',        badge:'badge-wait',    color:'var(--amber)' },
  partial:  { label:'دفع جزئي',    badge:'badge-repair',  color:'var(--blue)' },
  paid:     { label:'مدفوعة',       badge:'badge-ready',   color:'var(--green)' },
  cancelled:{ label:'ملغية',        badge:'badge-cancel',  color:'var(--red)' },
  refunded: { label:'مستردة',       badge:'badge-cancel',  color:'var(--purple)' },
}

const PAY_METHODS = [
  { value:'cash',         label:'نقد' },
  { value:'card',         label:'بطاقة بنكية' },
  { value:'bank_transfer',label:'تحويل بنكي' },
  { value:'mada',         label:'مدى' },
  { value:'stc_pay',      label:'STC Pay' },
  { value:'apple_pay',    label:'Apple Pay' },
  { value:'other',        label:'أخرى' },
]

export default function InvoicesPage() {
  const qc = useQueryClient()
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [statusF, setStatusF] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]   = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, statusF, dateFrom, dateTo],
    queryFn: () => api.get(`/invoices?page=${page}&limit=20&status=${statusF}&search=${search}&date_from=${dateFrom}&date_to=${dateTo}`),
    keepPreviousData: true,
  })

  // إحصاءات من API — دقيقة وليس من الصفحة الحالية
  const { data: statsData } = useQuery({
    queryKey: ['invoice-stats'],
    queryFn: () => api.get('/invoices/stats'),
    staleTime: 30000,
  })

  const invoices   = data?.data       || []
  const pagination = data?.pagination || {}
  const stats      = statsData?.data  || {}

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">الفواتير</div>
          <div className="page-sub">{stats.total_count || 0} فاتورة</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => { qc.invalidateQueries(['invoices']); qc.invalidateQueries(['invoice-stats']) }}>
            <RefreshCw size={13}/>
          </button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={14}/> فاتورة جديدة
          </button>
        </div>
      </div>

      {/* إحصاءات من الـ API */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        <div className="stat-card green" style={{ cursor:'pointer' }} onClick={() => setStatusF(statusF==='paid'?'':'paid')}>
          <div className="stat-label">مدفوع هذا الشهر</div>
          <div className="stat-value" style={{ fontSize:'1.3rem' }}>
            {parseFloat(stats.month_revenue||0).toLocaleString('ar-SA', { maximumFractionDigits:0 })}
          </div>
          <div className="stat-sub">ر.س</div>
        </div>
        <div className="stat-card amber" style={{ cursor:'pointer' }} onClick={() => setStatusF(statusF==='pending'?'':'pending')}>
          <div className="stat-label">رصيد معلق</div>
          <div className="stat-value" style={{ fontSize:'1.3rem' }}>
            {parseFloat(stats.total_pending||0).toLocaleString('ar-SA', { maximumFractionDigits:0 })}
          </div>
          <div className="stat-sub">ر.س</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">مدفوعة / معلقة</div>
          <div className="stat-value" style={{ fontSize:'1.3rem' }}>
            {stats.paid_count||0} <span style={{ fontSize:14, color:'var(--muted-2)' }}>/ {stats.pending_count||0}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ملغية / مستردة</div>
          <div className="stat-value" style={{ fontSize:'1.3rem', color:'var(--muted-2)' }}>
            {stats.cancelled_count||0} <span style={{ fontSize:14 }}>/ {stats.refunded_count||0}</span>
          </div>
        </div>
      </div>

      {/* فلاتر */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <div className="search-wrap" style={{ flex:1, minWidth:200, maxWidth:300 }}>
          <Search size={14}/>
          <input className="search-input" value={search} placeholder="رقم الفاتورة، التذكرة، العميل..."
            onChange={e => { setSearch(e.target.value); setPage(1) }}/>
        </div>
        <select className="form-select" value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1) }}>
          <option value="">كل الفواتير</option>
          {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input className="form-input" type="date" style={{ width:150 }} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
        <input className="form-input" type="date" style={{ width:150 }} value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
        {(statusF||dateFrom||dateTo) && (
          <button className="btn btn-ghost" onClick={() => { setStatusF(''); setDateFrom(''); setDateTo(''); setPage(1) }}>
            مسح الفلاتر
          </button>
        )}
      </div>

      {/* جدول */}
      {isLoading ? <Loading/> : !invoices.length
        ? <EmptyState icon={FileText} message="لا توجد فواتير" sub="أنشئ فاتورة من تذكرة منجزة"/>
        : (
          <div className="card" style={{ padding:0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>رقم الفاتورة</th>
                    <th>التذكرة</th>
                    <th>العميل</th>
                    <th>الجهاز</th>
                    <th>الإجمالي</th>
                    <th>المدفوع</th>
                    <th>الرصيد</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const st      = STATUS[inv.status] || STATUS.pending
                    const balance = parseFloat(inv.balance_due || 0)
                    return (
                      <tr key={inv.id}>
                        <td>
                          <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--blue)', fontWeight:600 }}>
                            {inv.invoice_number}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted-2)' }}>
                            {inv.order_number}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight:500, color:'var(--text-2)' }}>{inv.customer_name}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{inv.customer_phone}</div>
                        </td>
                        <td style={{ fontSize:12, color:'var(--muted)' }}>{inv.brand} {inv.model}</td>
                        <td>
                          <span style={{ fontFamily:'var(--mono)', fontWeight:600 }}>
                            {parseFloat(inv.total||0).toLocaleString('ar-SA')} ر
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily:'var(--mono)', color:'var(--green)' }}>
                            {parseFloat(inv.paid_amount||0).toLocaleString('ar-SA')} ر
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily:'var(--mono)', fontWeight:600,
                            color: balance > 0 ? 'var(--amber)' : 'var(--green)' }}>
                            {balance.toLocaleString('ar-SA')} ر
                          </span>
                        </td>
                        <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                        <td style={{ fontSize:11, color:'var(--muted)' }}>
                          {new Date(inv.created_at).toLocaleDateString('ar-SA')}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(inv)}>
                            <Eye size={13}/>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      }

      <Pagination page={page} pages={pagination.pages} onPage={setPage}/>

      {showNew && (
        <NewInvoiceModal
          onClose={() => setShowNew(false)}
          onSuccess={() => { setShowNew(false); qc.invalidateQueries(['invoices']); qc.invalidateQueries(['invoice-stats']) }}
        />
      )}
      {selected && (
        <InvoiceDetailModal
          invoiceId={selected.id}
          onClose={() => setSelected(null)}
          onUpdate={() => { qc.invalidateQueries(['invoices']); qc.invalidateQueries(['invoice-stats']) }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// New Invoice Modal
// ══════════════════════════════════════════════════════════
function NewInvoiceModal({ onClose, onSuccess }) {
  const [ticketSearch, setTicketSearch] = useState('')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [laborCost, setLaborCost] = useState('')
  const [discount,  setDiscount]  = useState('0')
  const [notes,     setNotes]     = useState('')

  const { data: ticketsData } = useQuery({
    queryKey: ['tickets-for-invoice', ticketSearch],
    queryFn: () => api.get(`/tickets?search=${ticketSearch}&limit=10`),
    enabled: ticketSearch.length > 1,
  })

  const { data: ticketDetail } = useQuery({
    queryKey: ['ticket-for-invoice-detail', selectedTicket?.id],
    queryFn: () => api.get(`/tickets/${selectedTicket.id}`),
    enabled: !!selectedTicket?.id,
  })

  const parts     = ticketDetail?.data?.parts || []
  const partsCost = parts.reduce((s,p) => s + parseFloat(p.unit_price||0)*parseFloat(p.quantity||1), 0)
  const laborNum  = parseFloat(laborCost) || 0
  const discNum   = parseFloat(discount)  || 0
  const subtotal  = laborNum + partsCost - discNum
  const vat       = +(subtotal * 0.15).toFixed(2)
  const total     = +(subtotal + vat).toFixed(2)

  const create = useMutation({
    mutationFn: () => api.post('/invoices', {
      order_id: selectedTicket.id, labor_cost: laborNum, discount: discNum, notes
    }),
    onSuccess: () => { toast.success('تم إنشاء الفاتورة ✅'); onSuccess() },
    onError: e => toast.error(e?.message || 'خطأ في الإنشاء'),
  })

  return (
    <Modal open onClose={onClose} title="إنشاء فاتورة جديدة" maxWidth={620}
      footer={
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={!selectedTicket || create.isLoading}
            onClick={() => create.mutate()}>
            {create.isLoading ? '...' : '✓ إنشاء الفاتورة'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        {/* اختيار التذكرة */}
        <div>
          <label className="form-label">ابحث عن التذكرة</label>
          <div className="search-wrap">
            <Search size={14}/>
            <input className="search-input" value={ticketSearch}
              onChange={e => { setTicketSearch(e.target.value); setSelectedTicket(null) }}
              placeholder="رقم التذكرة أو اسم العميل..."/>
          </div>
          {ticketsData?.data?.length > 0 && !selectedTicket && (
            <div style={{ border:'1px solid var(--border)', borderRadius:6, marginTop:4, overflow:'hidden' }}>
              {ticketsData.data.map(t => (
                <div key={t.id} onClick={() => { setSelectedTicket(t); setTicketSearch('') }}
                  style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)',
                    display:'flex', justifyContent:'space-between', fontSize:13 }}
                  className="hover-row">
                  <div>
                    <span style={{ fontFamily:'var(--mono)', color:'var(--blue)', fontSize:11 }}>{t.order_number}</span>
                    <span style={{ marginRight:8, fontWeight:500 }}>{t.customer_name}</span>
                  </div>
                  <span style={{ color:'var(--muted)', fontSize:11 }}>{t.brand} {t.model}</span>
                </div>
              ))}
            </div>
          )}
          {selectedTicket && (
            <div style={{ marginTop:6, padding:'8px 12px', background:'var(--green-dim)', borderRadius:6,
              display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span style={{ color:'var(--green)' }}>
                ✅ {selectedTicket.order_number} — {selectedTicket.customer_name}
              </span>
              <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:12 }}
                onClick={() => setSelectedTicket(null)}>تغيير</button>
            </div>
          )}
        </div>

        {/* القطع المستخدمة */}
        {parts.length > 0 && (
          <div>
            <div style={{ fontSize:12, color:'var(--muted-2)', fontWeight:600, marginBottom:6 }}>القطع المستخدمة</div>
            {parts.map((p,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between',
                padding:'5px 10px', background:'var(--ink-3)', borderRadius:5, marginBottom:4, fontSize:12 }}>
                <span>{p.part_name} × {p.quantity}</span>
                <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>
                  {(parseFloat(p.unit_price)*parseFloat(p.quantity)).toLocaleString('ar-SA')} ر
                </span>
              </div>
            ))}
          </div>
        )}

        {/* بنود الفاتورة */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="form-label">أجرة العمالة (ر.س)</label>
            <input className="form-input" type="number" value={laborCost}
              onChange={e => setLaborCost(e.target.value)} placeholder="0"/>
          </div>
          <div>
            <label className="form-label">خصم (ر.س)</label>
            <input className="form-input" type="number" value={discount}
              onChange={e => setDiscount(e.target.value)}/>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="form-label">ملاحظات</label>
            <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)}/>
          </div>
        </div>

        {/* ملخص */}
        <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'12px 14px' }}>
          <SumRow label="قطع الغيار"           val={`${partsCost.toLocaleString('ar-SA')} ر`}/>
          {laborNum > 0 && <SumRow label="أجرة العمالة"  val={`${laborNum.toLocaleString('ar-SA')} ر`}/>}
          {discNum  > 0 && <SumRow label="خصم"            val={`- ${discNum.toLocaleString('ar-SA')} ر`} color="var(--green)"/>}
          <SumRow label="قبل الضريبة"           val={`${subtotal.toLocaleString('ar-SA')} ر`}/>
          <SumRow label="ضريبة 15%"             val={`${vat.toLocaleString('ar-SA')} ر`}/>
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, marginTop:6,
            display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700 }}>
            <span>الإجمالي</span>
            <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>
              {total.toLocaleString('ar-SA')} ريال
            </span>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════
// Invoice Detail Modal
// ══════════════════════════════════════════════════════════
function InvoiceDetailModal({ invoiceId, onClose, onUpdate }) {
  const qc = useQueryClient()
  const [showPay,    setShowPay]    = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showRefund, setShowRefund] = useState(false)

  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payRef,    setPayRef]    = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')

  // نجلب تفاصيل كاملة بما فيها سجل الدفعات
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoice-detail', invoiceId],
    queryFn: () => api.get(`/invoices/${invoiceId}`),
  })

  const { data: shopData } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api.get('/shop-settings'),
  })

  const inv  = data?.data  || {}
  const shop = shopData?.data || {}
  const pmts = inv.payments || []
  const st   = STATUS[inv.status] || STATUS.pending

  const canPay    = !['paid','cancelled','refunded'].includes(inv.status) && parseFloat(inv.balance_due||0) > 0
  const canCancel = !['paid','cancelled','refunded'].includes(inv.status)
  const canRefund = ['paid','partial'].includes(inv.status) && parseFloat(inv.paid_amount||0) > 0

  const payMut = useMutation({
    mutationFn: () => api.post(`/invoices/${inv.id}/pay`, {
      amount: parseFloat(payAmount), method: payMethod, reference_no: payRef
    }),
    onSuccess: () => {
      toast.success('تم تسجيل الدفعة ✅')
      setShowPay(false); setPayAmount(''); setPayRef('')
      refetch(); onUpdate()
    },
    onError: e => toast.error(e?.message || 'خطأ'),
  })

  const cancelMut = useMutation({
    mutationFn: () => api.post(`/invoices/${inv.id}/cancel`, { reason: cancelReason }),
    onSuccess: () => { toast.success('تم إلغاء الفاتورة ✅'); setShowCancel(false); refetch(); onUpdate() },
    onError: e => toast.error(e?.message || 'خطأ'),
  })

  const refundMut = useMutation({
    mutationFn: () => api.post(`/invoices/${inv.id}/refund`, {
      amount: parseFloat(refundAmount), reason: refundReason
    }),
    onSuccess: () => { toast.success('تم الاسترداد ✅'); setShowRefund(false); refetch(); onUpdate() },
    onError: e => toast.error(e?.message || 'خطأ'),
  })

  if (isLoading) return <Modal open onClose={onClose} title="جاري التحميل..."><Loading/></Modal>

  return (
    <Modal open onClose={onClose}
      title={
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span>فاتورة: {inv.invoice_number}</span>
          <span className={`badge ${st.badge}`}>{st.label}</span>
        </div>
      }
      maxWidth={640}
      footer={
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          <button className="btn btn-ghost" onClick={() => sendWhatsApp(inv, shop)}>
            <Send size={13}/> واتساب
          </button>
          <button className="btn btn-ghost" onClick={() => printInvoice(inv, shop, pmts)}>
            <Printer size={13}/> طباعة
          </button>
          {canPay && (
            <button className="btn btn-primary" onClick={() => { setShowPay(!showPay); setShowCancel(false); setShowRefund(false) }}>
              <DollarSign size={13}/> دفعة
            </button>
          )}
          {canRefund && (
            <button className="btn btn-ghost" style={{ color:'var(--amber)' }}
              onClick={() => { setShowRefund(!showRefund); setShowPay(false); setShowCancel(false) }}>
              <RotateCcw size={13}/> استرداد
            </button>
          )}
          {canCancel && (
            <button className="btn btn-ghost" style={{ color:'var(--red)' }}
              onClick={() => { setShowCancel(!showCancel); setShowPay(false); setShowRefund(false) }}>
              <XCircle size={13}/> إلغاء
            </button>
          )}
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        {/* بيانات أساسية */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <InfoBox label="رقم الفاتورة" value={inv.invoice_number} mono/>
          <InfoBox label="رقم التذكرة"  value={inv.order_number}   mono/>
          <InfoBox label="العميل"         value={inv.customer_name}/>
          <InfoBox label="الجوال"         value={inv.customer_phone} mono/>
          <InfoBox label="الجهاز"         value={`${inv.brand||''} ${inv.model||''}`}/>
          <InfoBox label="تاريخ الإنشاء"  value={inv.created_at ? new Date(inv.created_at).toLocaleDateString('ar-SA') : '—'}/>
        </div>

        {/* المبالغ */}
        <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'12px 14px' }}>
          {parseFloat(inv.parts_cost||0) > 0 && <SumRow label="قطع الغيار"      val={`${parseFloat(inv.parts_cost).toLocaleString('ar-SA')} ر`}/>}
          {parseFloat(inv.labor_cost||0) > 0 && <SumRow label="أجرة العمالة"    val={`${parseFloat(inv.labor_cost).toLocaleString('ar-SA')} ر`}/>}
          {parseFloat(inv.discount||0)   > 0 && <SumRow label="خصم"              val={`- ${parseFloat(inv.discount).toLocaleString('ar-SA')} ر`} color="var(--green)"/>}
          <SumRow label="قبل الضريبة"    val={`${parseFloat(inv.subtotal||0).toLocaleString('ar-SA')} ر`}/>
          <SumRow label={`ضريبة ${inv.vat_rate||15}%`} val={`${parseFloat(inv.vat_amount||0).toLocaleString('ar-SA')} ر`}/>
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, marginTop:6,
            display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700 }}>
            <span>الإجمالي</span>
            <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>
              {parseFloat(inv.total||0).toLocaleString('ar-SA')} ريال
            </span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:13 }}>
            <span style={{ color:'var(--green)' }}>المدفوع: {parseFloat(inv.paid_amount||0).toLocaleString('ar-SA')} ر</span>
            {parseFloat(inv.balance_due||0) > 0 && (
              <span style={{ color:'var(--amber)', fontWeight:600 }}>
                الرصيد: {parseFloat(inv.balance_due).toLocaleString('ar-SA')} ر
              </span>
            )}
          </div>
        </div>

        {/* سجل الدفعات */}
        {pmts.length > 0 && (
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:8 }}>
              سجل الدفعات ({pmts.length})
            </div>
            <div style={{ display:'grid', gap:6 }}>
              {pmts.map((p,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'7px 10px', background:'var(--ink-3)', borderRadius:6, fontSize:12 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <span style={{
                      color: p.amount < 0 ? 'var(--red)' : 'var(--green)',
                      fontWeight:700, fontFamily:'var(--mono)'
                    }}>
                      {p.amount < 0 ? '' : '+'}{parseFloat(p.amount).toLocaleString('ar-SA')} ر
                    </span>
                    <span className="badge badge-normal" style={{ fontSize:10 }}>
                      {PAY_METHODS.find(m=>m.value===p.method)?.label || p.method}
                    </span>
                    {p.reference_no && <span style={{ color:'var(--muted)', fontSize:10 }}>{p.reference_no}</span>}
                  </div>
                  <div style={{ textAlign:'left' }}>
                    <div style={{ color:'var(--muted)', fontSize:10 }}>
                      {new Date(p.created_at).toLocaleDateString('ar-SA')}
                    </div>
                    {p.received_by_name && <div style={{ color:'var(--muted)', fontSize:10 }}>{p.received_by_name}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* نموذج الدفع */}
        {showPay && (
          <div style={{ padding:14, background:'rgba(16,185,129,.06)', border:'1px solid rgba(16,185,129,.25)', borderRadius:8 }}>
            <div style={{ fontWeight:600, color:'var(--green)', marginBottom:10, fontSize:13 }}>💰 تسجيل دفعة جديدة</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              <div>
                <label className="form-label">المبلغ (ر.س) *</label>
                <input className="form-input" type="number" step="0.01" min="0.01"
                  max={parseFloat(inv.balance_due)}
                  value={payAmount} onChange={e=>setPayAmount(e.target.value)}
                  placeholder={`الرصيد: ${parseFloat(inv.balance_due||0).toLocaleString('ar-SA')}`}/>
                <div style={{ display:'flex', gap:4, marginTop:4 }}>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setPayAmount(parseFloat(inv.balance_due).toFixed(2))}>
                    كامل الرصيد
                  </button>
                </div>
              </div>
              <div>
                <label className="form-label">طريقة الدفع</label>
                <select className="form-select" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>
                  {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {['bank_transfer','card','mada','stc_pay','apple_pay'].includes(payMethod) && (
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">رقم المرجع / الإيصال</label>
                  <input className="form-input" value={payRef} onChange={e=>setPayRef(e.target.value)} dir="ltr"/>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" disabled={!payAmount || payMut.isLoading}
                onClick={() => payMut.mutate()}>
                {payMut.isLoading ? '...' : '✓ تأكيد الدفعة'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPay(false)}>إلغاء</button>
            </div>
          </div>
        )}

        {/* نموذج الاسترداد */}
        {showRefund && (
          <div style={{ padding:14, background:'rgba(245,158,11,.06)', border:'1px solid rgba(245,158,11,.25)', borderRadius:8 }}>
            <div style={{ fontWeight:600, color:'var(--amber)', marginBottom:10, fontSize:13 }}>↩️ استرداد مبلغ</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>
              المدفوع حتى الآن: <strong>{parseFloat(inv.paid_amount||0).toLocaleString('ar-SA')} ريال</strong>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              <div>
                <label className="form-label">مبلغ الاسترداد *</label>
                <input className="form-input" type="number" step="0.01" min="0.01"
                  max={parseFloat(inv.paid_amount)}
                  value={refundAmount} onChange={e=>setRefundAmount(e.target.value)}/>
              </div>
              <div>
                <label className="form-label">سبب الاسترداد *</label>
                <input className="form-input" value={refundReason} onChange={e=>setRefundReason(e.target.value)}
                  placeholder="عيب مصنعي، طلب العميل..."/>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-sm" style={{ background:'var(--amber)', color:'#fff', border:'none' }}
                disabled={!refundAmount || !refundReason || refundMut.isLoading}
                onClick={() => refundMut.mutate()}>
                {refundMut.isLoading ? '...' : '✓ تأكيد الاسترداد'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowRefund(false)}>إلغاء</button>
            </div>
          </div>
        )}

        {/* نموذج الإلغاء */}
        {showCancel && (
          <div style={{ padding:14, background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.2)', borderRadius:8 }}>
            <div style={{ fontWeight:600, color:'var(--red)', marginBottom:8, fontSize:13 }}>✗ إلغاء الفاتورة</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>
              لا يمكن إلغاء فاتورة مدفوعة — استخدم الاسترداد بدلاً من ذلك.
            </div>
            <input className="form-input" style={{ marginBottom:8 }}
              value={cancelReason} onChange={e=>setCancelReason(e.target.value)}
              placeholder="سبب الإلغاء *"/>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-sm" style={{ background:'var(--red)', color:'#fff', border:'none' }}
                disabled={!cancelReason || cancelMut.isLoading}
                onClick={() => cancelMut.mutate()}>
                {cancelMut.isLoading ? '...' : 'تأكيد الإلغاء'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCancel(false)}>إلغاء</button>
            </div>
          </div>
        )}

        {inv.notes && (
          <div style={{ padding:'8px 12px', background:'var(--ink-3)', borderRadius:6, fontSize:12, color:'var(--text)' }}>
            <span style={{ color:'var(--muted)' }}>ملاحظات: </span>{inv.notes}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── دالة الطباعة ─────────────────────────────────────────
async function printInvoice(inv, shop, payments) {
  const trackUrl = buildTrackUrl(shop, inv.order_number)
  const qr = await generateQR(trackUrl, 80)

  const pmtsHtml = payments?.length > 0
    ? `<div class="section" style="margin-top:8px">
        <div class="section-title">سجل الدفعات</div>
        ${payments.map(p => `
          <div class="row2">
            <span class="lbl">${new Date(p.created_at).toLocaleDateString('ar-SA')}</span>
            <span class="val" style="color:${p.amount<0?'#dc2626':'#16a34a'}">${p.amount>0?'+':''}${parseFloat(p.amount).toLocaleString('ar-SA')} ر</span>
          </div>`).join('')}
       </div>`
    : ''

  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
  <meta charset="UTF-8"><title>فاتورة ${inv.invoice_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#000;direction:rtl;padding:10mm 12mm}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1A56DB;padding-bottom:8px;margin-bottom:10px}
    .shop-name{font-size:17px;font-weight:700}
    .inv-badge{background:#1A56DB;color:#fff;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:700}
    .section{margin:8px 0;padding:8px 10px;background:#f8f9fa;border-radius:4px}
    .section-title{font-size:10px;font-weight:700;color:#1A56DB;margin-bottom:5px}
    .row2{display:flex;justify-content:space-between;margin-bottom:3px;font-size:10px}
    .lbl{color:#666}.val{font-weight:500}
    .totals{border:1px solid #ddd;border-radius:4px;padding:10px;margin-top:8px}
    .t-row{display:flex;justify-content:space-between;font-size:11px;padding:3px 0}
    .t-total{font-size:14px;font-weight:700;color:#1A56DB;border-top:2px solid #1A56DB;margin-top:6px;padding-top:6px}
    .paid-stamp{border:3px solid #16a34a;border-radius:8px;padding:4px 16px;color:#16a34a;font-size:16px;font-weight:900;display:inline-block;transform:rotate(-15deg);margin:8px 0}
    .footer{text-align:center;font-size:9px;color:#888;margin-top:10px;border-top:1px dashed #ccc;padding-top:6px}
    @media print{@page{margin:8mm}body{padding:0}}
  </style></head><body>
  <div class="header">
    <div>
      ${shop.logo_url?`<img src="${shop.logo_url}" style="max-height:45px;margin-bottom:4px"/>`:'' }
      <div class="shop-name">${shop.shop_name||'FixPro للصيانة'}</div>
      ${shop.address?`<div style="font-size:9px;color:#666">${shop.city||''} — ${shop.address}</div>`:''}
      ${shop.phone?`<div style="font-size:9px">📞 ${shop.phone}</div>`:''}
      ${shop.tax_number?`<div style="font-size:9px;color:#888">الرقم الضريبي: ${shop.tax_number}</div>`:''}
    </div>
    <div style="text-align:left">
      <div class="inv-badge">فاتورة ضريبية</div>
      <div style="font-size:13px;font-weight:700;margin-top:6px">${inv.invoice_number}</div>
      <div style="font-size:10px;color:#555">التاريخ: ${new Date(inv.created_at).toLocaleDateString('ar-SA')}</div>
      <div style="font-size:10px;color:#555">التذكرة: ${inv.order_number}</div>
      ${inv.status==='paid'?'<div class="paid-stamp">مدفوع</div>':''}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
    <div class="section">
      <div class="section-title">بيانات العميل</div>
      <div class="row2"><span class="lbl">الاسم:</span><span class="val">${inv.customer_name}</span></div>
      <div class="row2"><span class="lbl">الجوال:</span><span class="val" style="direction:ltr">${inv.customer_phone}</span></div>
    </div>
    <div class="section">
      <div class="section-title">الجهاز</div>
      <div class="row2"><span class="lbl">النوع:</span><span class="val">${inv.brand||''} ${inv.model||''}</span></div>
    </div>
  </div>
  <div class="totals">
    ${parseFloat(inv.parts_cost||0)>0?`<div class="t-row"><span>قطع الغيار</span><span>${parseFloat(inv.parts_cost).toLocaleString('ar-SA')} ر</span></div>`:''}
    ${parseFloat(inv.labor_cost||0)>0?`<div class="t-row"><span>أجرة العمالة</span><span>${parseFloat(inv.labor_cost).toLocaleString('ar-SA')} ر</span></div>`:''}
    ${parseFloat(inv.discount||0)>0?`<div class="t-row"><span>خصم</span><span style="color:#16a34a">- ${parseFloat(inv.discount).toLocaleString('ar-SA')} ر</span></div>`:''}
    <div class="t-row"><span>قبل الضريبة</span><span>${parseFloat(inv.subtotal||0).toLocaleString('ar-SA')} ر</span></div>
    <div class="t-row"><span>ضريبة (${inv.vat_rate||15}%)</span><span>${parseFloat(inv.vat_amount||0).toLocaleString('ar-SA')} ر</span></div>
    <div class="t-row t-total"><span>الإجمالي</span><span>${parseFloat(inv.total||0).toLocaleString('ar-SA')} ريال</span></div>
    <div class="t-row"><span>المدفوع</span><span style="color:#16a34a">${parseFloat(inv.paid_amount||0).toLocaleString('ar-SA')} ر</span></div>
    ${parseFloat(inv.balance_due||0)>0?`<div class="t-row"><span>الرصيد المتبقي</span><span style="color:#dc2626">${parseFloat(inv.balance_due).toLocaleString('ar-SA')} ر</span></div>`:''}
  </div>
  ${pmtsHtml}
  ${inv.notes?`<div class="section" style="margin-top:8px"><div class="section-title">ملاحظات</div><div>${inv.notes}</div></div>`:''}
  <div style="text-align:center;margin-top:10px">
    ${qr?`<img src="${qr}" style="width:55px;height:55px;display:block;margin:0 auto 4px"/>`:'' }
    <div style="font-size:8px;color:#888">تتبع طلبك: ${trackUrl}</div>
  </div>
  <div class="footer">
    ${shop.invoice_terms||'الشركة غير مسؤولة عن الأجهزة المتروكة أكثر من 30 يوماً'}
    ${shop.invoice_footer?`<br/>${shop.invoice_footer}`:''}
  </div>
  </body></html>`

  const win = window.open('', '_blank', 'width=750,height=950')
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

// ── دالة واتساب ──────────────────────────────────────────
function sendWhatsApp(inv, shop) {
  const phone = inv.customer_phone?.replace(/[^0-9]/g,'').replace(/^0/,'')
  const trackUrl = buildTrackUrl(shop, inv.order_number)
  const msg = encodeURIComponent(
    `عزيزي ${inv.customer_name}،\n` +
    `🧾 فاتورة الصيانة — ${inv.invoice_number}\n\n` +
    `💰 الإجمالي: ${parseFloat(inv.total||0).toLocaleString('ar-SA')} ريال\n` +
    `✅ المدفوع: ${parseFloat(inv.paid_amount||0).toLocaleString('ar-SA')} ريال\n` +
    (parseFloat(inv.balance_due||0)>0
      ? `⚠️ الرصيد المتبقي: ${parseFloat(inv.balance_due).toLocaleString('ar-SA')} ريال\n` : '') +
    `\n📞 ${shop.phone||''}\n${shop.shop_name||'FixPro للصيانة'}`
  )
  window.open(`https://wa.me/966${phone}?text=${msg}`, '_blank')
}

// ── مساعدات ──────────────────────────────────────────────
function SumRow({ label, val, color }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:5 }}>
      <span style={{ color:'var(--muted)' }}>{label}</span>
      <span style={{ fontFamily:'var(--mono)', color: color||'var(--text-2)' }}>{val}</span>
    </div>
  )
}

function InfoBox({ label, value, mono }) {
  return (
    <div style={{ padding:'8px 10px', background:'var(--ink-3)', borderRadius:6 }}>
      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:12, fontWeight:500, color:'var(--text-2)',
        fontFamily: mono ? 'var(--mono)' : 'inherit' }}>
        {value || '—'}
      </div>
    </div>
  )
}
