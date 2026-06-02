import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState, Pagination } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Search, Printer, Send, DollarSign, Eye, RefreshCw, FileText } from 'lucide-react'
import { generateQR, buildTrackUrl } from '../utils/printUtils'

// ── حالات الفاتورة ────────────────────────────────────────
const STATUS = {
  draft:    { label: 'مسودة',       badge: 'badge-normal', color: 'var(--muted)' },
  pending:  { label: 'معلقة',       badge: 'badge-wait',   color: 'var(--amber)' },
  partial:  { label: 'دفع جزئي',   badge: 'badge-repair', color: 'var(--blue)' },
  paid:     { label: 'مدفوعة',      badge: 'badge-ready',  color: 'var(--green)' },
  cancelled:{ label: 'ملغية',       badge: 'badge-cancel', color: 'var(--red)' },
}

const PAY_METHODS = [
  { value:'cash',     label:'نقد' },
  { value:'card',     label:'بطاقة بنكية' },
  { value:'transfer', label:'تحويل بنكي' },
  { value:'stc',      label:'STC Pay' },
  { value:'other',    label:'أخرى' },
]

export default function InvoicesPage() {
  const qc = useQueryClient()
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showNew, setShowNew]   = useState(false)
  const [selected, setSelected] = useState(null)   // للعرض / الدفع / الطباعة

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, statusFilter],
    queryFn: () => api.get(`/invoices?page=${page}&limit=20&status=${statusFilter}&search=${search}`),
    keepPreviousData: true,
  })

  const invoices   = data?.data       || []
  const pagination = data?.pagination || {}

  // إجماليات سريعة
  const totalPaid    = invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+Number(i.total||0),0)
  const totalPending = invoices.filter(i=>['pending','partial'].includes(i.status)).reduce((s,i)=>s+Number(i.balance_due||0),0)

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">الفواتير</div>
          <div className="page-sub">{pagination.total || 0} فاتورة</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={14}/> فاتورة جديدة
        </button>
      </div>

      {/* بطاقات إحصاء */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
        <div className="stat-card green">
          <div className="stat-label">مدفوع هذا الشهر</div>
          <div className="stat-value">{totalPaid.toLocaleString('ar-SA')} ر</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">رصيد معلق</div>
          <div className="stat-value">{totalPending.toLocaleString('ar-SA')} ر</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">عدد الفواتير</div>
          <div className="stat-value">{pagination.total || 0}</div>
        </div>
      </div>

      {/* فلاتر */}
      <div className="filter-bar">
        <div className="search-wrap" style={{ flex:1, maxWidth:300 }}>
          <Search/>
          <input className="search-input" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="بحث برقم الفاتورة أو العميل..." />
        </div>
        <select className="form-select" style={{ width:160 }} value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">كل الفواتير</option>
          {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-icon" onClick={() => qc.invalidateQueries({ queryKey:['invoices'] })}>
          <RefreshCw size={14}/>
        </button>
      </div>

      {/* الجدول */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : !invoices.length
          ? <EmptyState icon={FileText} message="لا توجد فواتير" sub="أنشئ فاتورة من تذكرة منجزة" />
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>رقم الفاتورة</th><th>التذكرة</th><th>العميل</th>
                    <th>المجموع</th><th>المدفوع</th><th>الرصيد</th>
                    <th>الحالة</th><th>التاريخ</th><th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const st = STATUS[inv.status] || STATUS.pending
                    const balance = Number(inv.balance_due || 0)
                    return (
                      <tr key={inv.id} style={{ cursor:'pointer' }} onClick={() => setSelected(inv)}>
                        <td><span className="font-mono text-xs text-blue">{inv.invoice_number}</span></td>
                        <td><span className="font-mono text-xs text-muted2">{inv.order_number}</span></td>
                        <td>
                          <div style={{ fontWeight:500, color:'var(--text-2)' }}>{inv.customer_name}</div>
                          <div className="text-xs text-muted">{inv.customer_phone}</div>
                        </td>
                        <td className="font-mono text-sm">{Number(inv.total||0).toLocaleString('ar-SA')} ر</td>
                        <td className="font-mono text-sm text-green">{Number(inv.paid_amount||0).toLocaleString('ar-SA')} ر</td>
                        <td>
                          <span className="font-mono text-sm" style={{ color: balance>0 ? 'var(--amber)' : 'var(--green)', fontWeight:600 }}>
                            {balance.toLocaleString('ar-SA')} ر
                          </span>
                        </td>
                        <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                        <td className="text-xs text-muted font-mono">
                          {inv.created_at ? new Date(inv.created_at).toLocaleDateString('ar-SA') : '—'}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex', gap:4 }}>
                            <button className="btn-icon" title="عرض" onClick={() => setSelected(inv)}>
                              <Eye size={13}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
        <Pagination page={page} pages={pagination.pages} onPage={setPage} />
      </div>

      {/* نوافذ */}
      {showNew && (
        <NewInvoiceModal
          onClose={() => setShowNew(false)}
          onSuccess={() => { setShowNew(false); qc.invalidateQueries({ queryKey:['invoices'] }) }}
        />
      )}

      {selected && (
        <InvoiceDetailModal
          invoice={selected}
          onClose={() => setSelected(null)}
          onUpdate={() => { qc.invalidateQueries({ queryKey:['invoices'] }) }}
        />
      )}
    </div>
  )
}

// ── إنشاء فاتورة جديدة ────────────────────────────────────
function NewInvoiceModal({ onClose, onSuccess }) {
  const [ticketSearch, setTicketSearch] = useState('')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [laborCost, setLaborCost]   = useState('')
  const [discount, setDiscount]     = useState('0')
  const [notes, setNotes]           = useState('')

  const { data: ticketsData } = useQuery({
    queryKey: ['tickets-for-invoice', ticketSearch],
    queryFn: () => api.get(`/tickets?status=ready&status=delivered&search=${ticketSearch}&limit=10`),
    enabled: true,
  })
  const tickets = ticketsData?.data || []

  // جلب تفاصيل التذكرة (مع القطع)
  const { data: ticketDetail } = useQuery({
    queryKey: ['ticket-invoice', selectedTicket?.id],
    queryFn: () => api.get(`/tickets/${selectedTicket.id}`),
    enabled: !!selectedTicket?.id,
  })
  const td = ticketDetail?.data

  const parts     = td?.parts || []
  const partsCost = parts.reduce((s,p) => s + Number(p.unit_price||0)*Number(p.quantity||1), 0)
  const laborNum  = parseFloat(laborCost) || 0
  const discNum   = parseFloat(discount)  || 0
  const subtotal  = laborNum + partsCost - discNum
  const vat       = +(subtotal * 0.15).toFixed(2)
  const total     = +(subtotal + vat).toFixed(2)

  const create = useMutation({
    mutationFn: () => api.post('/invoices', {
      order_id:   selectedTicket.id,
      labor_cost: laborNum,
      discount:   discNum,
      notes,
    }),
    onSuccess: () => { toast.success('تم إنشاء الفاتورة ✅'); onSuccess() },
    onError: err => toast.error(err?.message || 'خطأ في الإنشاء'),
  })

  return (
    <Modal open={true} onClose={onClose} title="إنشاء فاتورة جديدة" maxWidth={620}
      footer={
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => create.mutate()}
            disabled={create.isPending || !selectedTicket}>
            {create.isPending ? 'جاري الإنشاء...' : '✓ إنشاء الفاتورة'}
          </button>
        </div>
      }>

      {/* اختيار التذكرة */}
      <div className="form-group mb-3">
        <label className="form-label">ابحث عن التذكرة المنجزة</label>
        <div className="search-wrap">
          <Search/>
          <input className="search-input" value={ticketSearch}
            onChange={e => setTicketSearch(e.target.value)}
            placeholder="رقم التذكرة أو اسم العميل..." />
        </div>
        {tickets.length > 0 && !selectedTicket && (
          <div style={{ marginTop:6, border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
            {tickets.map(t => (
              <div key={t.id} onClick={() => { setSelectedTicket(t); setTicketSearch('') }}
                style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--ink-3)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div>
                  <span className="font-mono text-xs text-blue">{t.order_number}</span>
                  <span style={{ marginRight:8, fontSize:13, color:'var(--text-2)' }}>{t.customer_name}</span>
                </div>
                <span className="text-xs text-muted">{t.brand} {t.model}</span>
              </div>
            ))}
          </div>
        )}
        {selectedTicket && (
          <div style={{ marginTop:6, display:'flex', justifyContent:'space-between', padding:'8px 12px', background:'var(--green-dim)', borderRadius:6, fontSize:13 }}>
            <span style={{ color:'var(--green)' }}>✅ {selectedTicket.order_number} — {selectedTicket.customer_name}</span>
            <button style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--muted)' }}
              onClick={() => setSelectedTicket(null)}>تغيير</button>
          </div>
        )}
      </div>

      {/* القطع المستخدمة */}
      {td && parts.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div className="text-xs text-muted mb-2" style={{ fontWeight:600 }}>القطع المستخدمة</div>
          {parts.map((p,i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 10px', background:'var(--ink-3)', borderRadius:5, marginBottom:4, fontSize:12 }}>
              <span style={{ color:'var(--text-2)' }}>{p.part_name} × {p.quantity}</span>
              <span className="font-mono text-blue">{(p.unit_price*p.quantity).toLocaleString()} ر</span>
            </div>
          ))}
        </div>
      )}

      {/* بنود الفاتورة */}
      <div className="form-grid mb-3">
        <div className="form-group">
          <label className="form-label">أجرة العمالة (ريال)</label>
          <input className="form-input" type="number" value={laborCost}
            onChange={e => setLaborCost(e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">خصم (ريال)</label>
          <input className="form-input" type="number" value={discount}
            onChange={e => setDiscount(e.target.value)} />
        </div>
        <div className="form-group form-full">
          <label className="form-label">ملاحظات</label>
          <textarea className="form-textarea" rows={2} value={notes}
            onChange={e => setNotes(e.target.value)} placeholder="أي ملاحظات..." />
        </div>
      </div>

      {/* ملخص المبالغ */}
      <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'12px 14px' }}>
        <Row label="قطع الغيار"         val={`${partsCost.toLocaleString()} ر`} />
        {laborNum > 0 && <Row label="أجرة العمالة" val={`${laborNum.toLocaleString()} ر`} />}
        {discNum  > 0 && <Row label="خصم"          val={`- ${discNum.toLocaleString()} ر`} color="var(--green)" />}
        <Row label="المجموع قبل الضريبة" val={`${subtotal.toLocaleString()} ر`} />
        <Row label="ضريبة 15%"           val={`${vat.toLocaleString()} ر`} />
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, marginTop:6, display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700 }}>
          <span style={{ color:'var(--text-2)' }}>الإجمالي</span>
          <span className="font-mono text-blue">{total.toLocaleString()} ريال</span>
        </div>
      </div>
    </Modal>
  )
}

// ── تفاصيل الفاتورة — عرض + دفع + طباعة ─────────────────
function InvoiceDetailModal({ invoice: inv, onClose, onUpdate }) {
  const qc = useQueryClient()
  const [showPay, setShowPay] = useState(false)
  const [payAmount, setPayAmount]     = useState('')
  const [payMethod, setPayMethod]     = useState('cash')
  const [payRef, setPayRef]           = useState('')

  const { data: shopData } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api.get('/shop-settings'),
  })
  const shop = shopData?.data || {}

  const pay = useMutation({
    mutationFn: () => api.post(`/invoices/${inv.id}/pay`, {
      amount: parseFloat(payAmount),
      method: payMethod,
      reference_no: payRef,
    }),
    onSuccess: () => {
      toast.success('تم تسجيل الدفعة ✅')
      setShowPay(false)
      onUpdate()
      qc.invalidateQueries({ queryKey:['invoices'] })
    },
    onError: err => toast.error(err?.message || 'خطأ'),
  })

  const printInvoice = async () => {
    const trackUrl = buildTrackUrl(shop, inv.order_number)
    const qr = await generateQR(trackUrl, 80)
    const now = new Date()
    const dateStr = now.toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' })

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
    <meta charset="UTF-8"><title>فاتورة ${inv.invoice_number}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#000;direction:rtl;padding:10mm 12mm}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1A56DB;padding-bottom:8px;margin-bottom:10px}
      .logo{max-height:45px;display:block;margin-bottom:4px;object-fit:contain}
      .shop-name{font-size:17px;font-weight:700}
      .inv-badge{background:#1A56DB;color:#fff;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:700}
      .section{margin:8px 0;padding:8px 10px;background:#f8f9fa;border-radius:4px}
      .section-title{font-size:10px;font-weight:700;color:#1A56DB;margin-bottom:5px;text-transform:uppercase}
      .row2{display:flex;justify-content:space-between;margin-bottom:3px;font-size:10px}
      .lbl{color:#666}.val{font-weight:500}
      table{width:100%;border-collapse:collapse;margin:8px 0;font-size:10px}
      th{background:#1A56DB;color:#fff;padding:5px 8px;text-align:right}
      td{padding:5px 8px;border-bottom:1px solid #eee}
      tr:nth-child(even) td{background:#f8f9fa}
      .totals{border:1px solid #ddd;border-radius:4px;padding:10px;margin-top:8px}
      .t-row{display:flex;justify-content:space-between;font-size:11px;padding:3px 0}
      .t-total{font-size:14px;font-weight:700;color:#1A56DB;border-top:2px solid #1A56DB;margin-top:6px;padding-top:6px}
      .paid-stamp{border:3px solid #16a34a;border-radius:8px;padding:4px 16px;color:#16a34a;font-size:16px;font-weight:900;display:inline-block;transform:rotate(-15deg);margin:8px 0}
      .footer{text-align:center;font-size:9px;color:#888;margin-top:10px;border-top:1px dashed #ccc;padding-top:6px}
      @media print{@page{margin:8mm}body{padding:0}}
    </style></head><body>

    <div class="header">
      <div>
        ${shop.logo_url ? `<img src="${shop.logo_url}" class="logo"/>` : ''}
        <div class="shop-name">${shop.shop_name || 'FixPro للصيانة'}</div>
        ${shop.shop_name_en ? `<div style="font-size:10px;color:#555">${shop.shop_name_en}</div>` : ''}
        ${shop.address ? `<div style="font-size:9px;color:#666">${shop.city||''} — ${shop.address}</div>` : ''}
        ${shop.phone ? `<div style="font-size:9px;color:#666">📞 ${shop.phone}</div>` : ''}
        ${shop.tax_number ? `<div style="font-size:9px;color:#888">الرقم الضريبي: ${shop.tax_number}</div>` : ''}
      </div>
      <div style="text-align:left">
        <div class="inv-badge">فاتورة ضريبية</div>
        <div style="font-size:13px;font-weight:700;margin-top:6px">${inv.invoice_number}</div>
        <div style="font-size:10px;color:#555">التاريخ: ${new Date(inv.created_at).toLocaleDateString('ar-SA')}</div>
        <div style="font-size:10px;color:#555">التذكرة: ${inv.order_number}</div>
        ${inv.status === 'paid' ? '<div class="paid-stamp">مدفوع</div>' : ''}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div class="section">
        <div class="section-title">بيانات العميل</div>
        <div class="row2"><span class="lbl">الاسم:</span><span class="val">${inv.customer_name}</span></div>
        <div class="row2"><span class="lbl">الجوال:</span><span class="val" style="direction:ltr">${inv.customer_phone}</span></div>
      </div>
      <div class="section">
        <div class="section-title">تفاصيل الدفع</div>
        <div class="row2"><span class="lbl">المجموع:</span><span class="val">${Number(inv.total||0).toLocaleString()} ر</span></div>
        <div class="row2"><span class="lbl">المدفوع:</span><span class="val" style="color:#16a34a">${Number(inv.paid_amount||0).toLocaleString()} ر</span></div>
        <div class="row2"><span class="lbl">الرصيد:</span><span class="val" style="color:${Number(inv.balance_due)>0?'#dc2626':'#16a34a'}">${Number(inv.balance_due||0).toLocaleString()} ر</span></div>
      </div>
    </div>

    <div class="totals">
      ${Number(inv.parts_cost||0) > 0 ? `<div class="t-row"><span>قطع الغيار</span><span style="direction:ltr">${Number(inv.parts_cost).toLocaleString()} ر</span></div>` : ''}
      ${Number(inv.labor_cost||0) > 0 ? `<div class="t-row"><span>أجرة العمالة</span><span style="direction:ltr">${Number(inv.labor_cost).toLocaleString()} ر</span></div>` : ''}
      ${Number(inv.discount||0) > 0 ? `<div class="t-row"><span>خصم</span><span style="direction:ltr;color:#16a34a">- ${Number(inv.discount).toLocaleString()} ر</span></div>` : ''}
      <div class="t-row"><span>المجموع قبل الضريبة</span><span style="direction:ltr">${Number(inv.subtotal||0).toLocaleString()} ر</span></div>
      <div class="t-row"><span>ضريبة القيمة المضافة (${inv.vat_rate||15}%)</span><span style="direction:ltr">${Number(inv.vat_amount||0).toLocaleString()} ر</span></div>
      <div class="t-row t-total"><span>الإجمالي</span><span style="direction:ltr">${Number(inv.total||0).toLocaleString()} ريال</span></div>
    </div>

    ${inv.notes ? `<div class="section" style="margin-top:8px"><div class="section-title">ملاحظات</div><div style="font-size:10px">${inv.notes}</div></div>` : ''}

    <div style="text-align:center;margin-top:10px">
      ${qr ? `<img src="${qr}" style="width:55px;height:55px;display:block;margin:0 auto 4px"/>` : ''}
      <div style="font-size:8px;color:#888">تتبع طلبك: ${trackUrl}</div>
    </div>

    <div class="footer">
      ${shop.invoice_terms || 'الشركة غير مسؤولة عن الأجهزة المتروكة أكثر من 30 يوماً'}
      ${shop.invoice_footer ? `<br/>${shop.invoice_footer}` : ''}
    </div>
    </body></html>`

    const win = window.open('', '_blank', 'width=750,height=950')
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  const sendWhatsApp = () => {
    const phone = inv.customer_phone?.replace(/[^0-9]/g,'').replace(/^0/,'')
    const trackUrl = buildTrackUrl(shop, inv.order_number)
    const msg = encodeURIComponent(
      `عزيزي ${inv.customer_name}،\n` +
      `🧾 فاتورة الصيانة — ${inv.invoice_number}\n\n` +
      `💰 المجموع: ${Number(inv.total||0).toLocaleString()} ريال\n` +
      `✅ المدفوع: ${Number(inv.paid_amount||0).toLocaleString()} ريال\n` +
      (Number(inv.balance_due)>0 ? `⚠️ الرصيد المتبقي: ${Number(inv.balance_due).toLocaleString()} ريال\n` : '') +
      `\nللاستفسار: ${shop.phone||''}\n${shop.shop_name||'FixPro للصيانة'}`
    )
    window.open(`https://wa.me/966${phone}?text=${msg}`, '_blank')
  }

  const st = STATUS[inv.status] || STATUS.pending
  const canPay = !['paid','cancelled'].includes(inv.status) && Number(inv.balance_due) > 0

  return (
    <Modal open={true} onClose={onClose}
      title={
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span>فاتورة: {inv.invoice_number}</span>
          <span className={`badge ${st.badge}`}>{st.label}</span>
        </div>
      }
      maxWidth={620}
      footer={
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          <button className="btn btn-ghost" onClick={sendWhatsApp}>
            <Send size={13}/> واتساب
          </button>
          <button className="btn btn-ghost" onClick={printInvoice}>
            <Printer size={13}/> طباعة
          </button>
          {canPay && (
            <button className="btn btn-primary" onClick={() => setShowPay(!showPay)}>
              <DollarSign size={13}/> تسجيل دفعة
            </button>
          )}
        </div>
      }>

      {/* بيانات */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
        <IRow label="رقم الفاتورة" val={inv.invoice_number} mono />
        <IRow label="رقم التذكرة"  val={inv.order_number}   mono />
        <IRow label="العميل"        val={inv.customer_name} />
        <IRow label="الجوال"        val={inv.customer_phone} mono />
        <IRow label="تاريخ الإنشاء" val={inv.created_at ? new Date(inv.created_at).toLocaleDateString('ar-SA') : '—'} />
        <IRow label="الحالة"        val={<span className={`badge ${st.badge}`}>{st.label}</span>} />
      </div>

      {/* المبالغ */}
      <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
        {Number(inv.parts_cost||0) > 0 && <Row label="قطع الغيار"           val={`${Number(inv.parts_cost).toLocaleString()} ر`} />}
        {Number(inv.labor_cost||0) > 0 && <Row label="أجرة العمالة"         val={`${Number(inv.labor_cost).toLocaleString()} ر`} />}
        {Number(inv.discount||0)   > 0 && <Row label="خصم"                  val={`- ${Number(inv.discount).toLocaleString()} ر`} color="var(--green)" />}
        <Row label="المجموع قبل الضريبة" val={`${Number(inv.subtotal||0).toLocaleString()} ر`} />
        <Row label={`ضريبة ${inv.vat_rate||15}%`} val={`${Number(inv.vat_amount||0).toLocaleString()} ر`} />
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, marginTop:6, display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700 }}>
          <span style={{ color:'var(--text-2)' }}>الإجمالي</span>
          <span className="font-mono text-blue">{Number(inv.total||0).toLocaleString()} ريال</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginTop:6 }}>
          <span style={{ color:'var(--green)' }}>المدفوع: {Number(inv.paid_amount||0).toLocaleString()} ر</span>
          {Number(inv.balance_due) > 0 && (
            <span style={{ color:'var(--amber)', fontWeight:600 }}>
              الرصيد: {Number(inv.balance_due).toLocaleString()} ر
            </span>
          )}
        </div>
      </div>

      {/* نموذج الدفع */}
      {showPay && (
        <div style={{ background:'rgba(16,185,129,.06)', border:'1px solid rgba(16,185,129,.3)', borderRadius:8, padding:14 }}>
          <div style={{ fontWeight:600, color:'var(--green)', marginBottom:12, fontSize:13 }}>
            💰 تسجيل دفعة جديدة
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">المبلغ (ريال) *</label>
              <input className="form-input" type="number" value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder={`الرصيد: ${Number(inv.balance_due).toLocaleString()}`} />
              <div style={{ display:'flex', gap:6, marginTop:4 }}>
                {[Number(inv.balance_due), Number(inv.balance_due)/2].filter(v=>v>0).map((v,i) => (
                  <button key={i} className="btn btn-ghost btn-sm" onClick={() => setPayAmount(v.toFixed(2))}>
                    {v.toLocaleString()} ر
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">طريقة الدفع</label>
              <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            {['transfer','card'].includes(payMethod) && (
              <div className="form-group form-full">
                <label className="form-label">رقم المرجع / الإيصال</label>
                <input className="form-input" value={payRef} onChange={e => setPayRef(e.target.value)} dir="ltr" />
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button className="btn btn-primary" onClick={() => pay.mutate()} disabled={pay.isPending || !payAmount}>
              {pay.isPending ? 'جاري...' : '✓ تأكيد الدفعة'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPay(false)}>إلغاء</button>
          </div>
        </div>
      )}

      {inv.notes && (
        <div style={{ marginTop:10, padding:'8px 12px', background:'var(--ink-3)', borderRadius:6, fontSize:12, color:'var(--text)' }}>
          <span style={{ color:'var(--muted)' }}>ملاحظات: </span>{inv.notes}
        </div>
      )}
    </Modal>
  )
}

// ── مساعدات ────────────────────────────────────────────────
function Row({ label, val, color }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
      <span style={{ color:'var(--muted)' }}>{label}</span>
      <span className="font-mono" style={{ color: color||'var(--text-2)' }}>{val}</span>
    </div>
  )
}

function IRow({ label, val, mono }) {
  return (
    <div style={{ padding:'8px 10px', background:'var(--ink-3)', borderRadius:6 }}>
      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', fontFamily: mono?'var(--mono)':'inherit' }}>
        {val}
      </div>
    </div>
  )
}
