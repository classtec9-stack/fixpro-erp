import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { generateQR, buildTrackUrl } from '../utils/printUtils'
import toast from 'react-hot-toast'
import { Modal, Loading } from '../components/ui'
import { FileText, Plus, Trash2, Printer, Send, DollarSign, Package } from 'lucide-react'

export default function CompletionInvoiceButton({ ticket }) {
  const [open, setOpen] = useState(false)
  if (!['ready','delivered','in_repair'].includes(ticket.status)) return null
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <FileText size={13}/> فاتورة احترافية
      </button>
      {open && <ProfessionalInvoiceModal ticket={ticket} onClose={() => setOpen(false)} />}
    </>
  )
}

function ProfessionalInvoiceModal({ ticket, onClose }) {
  const qc = useQueryClient()
  const [laborCost, setLaborCost]   = useState(ticket.estimated_cost || '')
  const [discount,  setDiscount]    = useState('0')
  const [addPart,   setAddPart]     = useState(false)
  const [partSearch, setPartSearch] = useState('')
  const [diagnosis, setDiagnosis]   = useState('')
  const [warranty,  setWarranty]    = useState('30')

  const { data: ticketData } = useQuery({
    queryKey: ['ticket-full', ticket.id],
    queryFn: () => api.get(`/tickets/${ticket.id}`)
  })
  const { data: shopData } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api.get('/shop-settings')
  })
  const { data: partsData } = useQuery({
    queryKey: ['parts-invoice'],
    queryFn: () => api.get('/inventory/parts?limit=200')
  })

  const t    = ticketData?.data || ticket
  const shop = shopData?.data   || {}
  const allParts = partsData?.data || []

  // القطع المرتبطة بالتذكرة
  const ticketParts = t.parts || []

  // إضافة قطعة للتذكرة وخصمها من المخزون
  const addPartMutation = useMutation({
    mutationFn: (part) => api.post(`/orders/${ticket.id}/parts`, {
      part_id: part.id,
      quantity: 1,
      unit_price: part.sell_price
    }),
    onSuccess: () => {
      toast.success('تم إضافة القطعة وخصمها من المخزون ✅')
      qc.invalidateQueries({ queryKey: ['ticket-full', ticket.id] })
      setAddPart(false)
      setPartSearch('')
    },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  // حساب الإجماليات
  const partsCost  = ticketParts.reduce((s, p) => s + Number(p.unit_price) * Number(p.quantity), 0)
  const laborNum   = parseFloat(laborCost) || 0
  const discNum    = parseFloat(discount)  || 0
  const subtotal   = partsCost + laborNum - discNum
  const vat        = +(subtotal * 0.15).toFixed(2)
  const total      = +(subtotal + vat).toFixed(2)

  // إنشاء الفاتورة وحفظها
  const createInvoice = useMutation({
    mutationFn: () => api.post('/invoices', {
      order_id:   ticket.id,
      labor_cost: laborNum,
      discount:   discNum,
      notes:      diagnosis,
    }),
    onSuccess: () => toast.success('تم حفظ الفاتورة ✅'),
    onError: err => toast.error(err?.message || 'خطأ')
  })

  // طباعة الفاتورة الاحترافية
  const printInvoice = async () => {
    const trackUrl = buildTrackUrl(shop, t.order_number)
    const qr = await generateQR(trackUrl, 90)
    const now = new Date()
    const dateStr = now.toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' })

    const partsRows = ticketParts.map(p => `
      <tr>
        <td>${p.part_name || p.name || '—'}</td>
        <td style="text-align:center">${p.quantity}</td>
        <td style="text-align:left;direction:ltr">${Number(p.unit_price).toLocaleString('ar-SA')} ر.س</td>
        <td style="text-align:left;direction:ltr;font-weight:700">${(Number(p.unit_price)*Number(p.quantity)).toLocaleString('ar-SA')} ر.س</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>فاتورة صيانة — ${t.order_number}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;direction:rtl;padding:15mm 15mm 10mm}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1A56DB;padding-bottom:12px;margin-bottom:14px}
        .logo-area{flex:1}
        .logo-img{max-height:55px;margin-bottom:6px;display:block;object-fit:contain}
        .shop-name{font-size:22px;font-weight:900;color:#1A56DB}
        .shop-sub{font-size:10px;color:#666;margin-top:2px}
        .inv-block{text-align:left;min-width:200px}
        .inv-title{font-size:16px;font-weight:900;color:#1A56DB;margin-bottom:6px}
        .inv-row{font-size:10px;color:#555;margin-bottom:3px;direction:ltr}
        .inv-num{font-size:20px;font-weight:900;color:#111;font-family:monospace;direction:ltr}
        .status-paid{border:2px solid #16a34a;color:#16a34a;padding:3px 12px;border-radius:4px;font-size:11px;font-weight:900;display:inline-block;transform:rotate(-8deg)}
        .section{margin-bottom:14px}
        .section-title{font-size:10px;font-weight:900;color:#1A56DB;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;padding-bottom:3px;border-bottom:1px solid #ddd}
        .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .info-box{background:#f8f9fa;padding:8px 10px;border-radius:4px;border-right:3px solid #1A56DB}
        .info-label{font-size:9px;color:#888;margin-bottom:2px;text-transform:uppercase}
        .info-value{font-size:12px;font-weight:600;color:#222}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th{background:#1A56DB;color:#fff;padding:6px 8px;text-align:right;font-weight:700}
        td{padding:6px 8px;border-bottom:1px solid #f0f0f0}
        tr:nth-child(even) td{background:#fafafa}
        .totals-box{margin-top:12px;display:flex;justify-content:flex-end}
        .totals-inner{min-width:280px}
        .total-row{display:flex;justify-content:space-between;padding:5px 8px;font-size:11px}
        .total-row.grand{font-size:15px;font-weight:900;background:#1A56DB;color:#fff;border-radius:4px;padding:8px 12px;margin-top:6px}
        .paid-amount{font-size:12px;color:#16a34a;font-weight:700}
        .warranty-box{border:1.5px solid #1A56DB;border-radius:6px;padding:10px;margin-top:12px}
        .warranty-title{font-size:10px;font-weight:900;color:#1A56DB;margin-bottom:4px}
        .diagnosis-box{background:#fff9e6;border:1px solid #fbbf24;border-radius:4px;padding:10px;margin-top:10px}
        .diagnosis-title{font-size:10px;font-weight:700;color:#92400e;margin-bottom:4px}
        .qr-section{display:flex;align-items:center;gap:14px;margin-top:14px;padding-top:10px;border-top:1px dashed #ccc}
        .terms{font-size:8.5px;color:#666;margin-top:10px;padding-top:8px;border-top:1px dashed #ccc;line-height:1.6;text-align:center}
        @media print{@page{margin:10mm}body{padding:0}}
      </style>
    </head><body>

    <!-- ── رأس الفاتورة ── -->
    <div class="header">
      <div class="logo-area">
        ${shop.logo_url ? `<img src="${shop.logo_url}" class="logo-img"/>` : ''}
        <div class="shop-name">${shop.shop_name || 'FixPro للصيانة'}</div>
        ${shop.shop_name_en ? `<div class="shop-sub">${shop.shop_name_en}</div>` : ''}
        ${shop.address ? `<div class="shop-sub">📍 ${shop.city||''} — ${shop.address}</div>` : ''}
        ${shop.phone ? `<div class="shop-sub">📞 ${shop.phone}${shop.phone2?' | '+shop.phone2:''}</div>` : ''}
        ${shop.tax_number ? `<div class="shop-sub">الرقم الضريبي: ${shop.tax_number}</div>` : ''}
      </div>
      <div class="inv-block">
        <div class="inv-title">فاتورة إنهاء صيانة</div>
        <div class="inv-num">${t.order_number}</div>
        <div class="inv-row">التاريخ: ${dateStr}</div>
        ${t.delivered_at ? `<div class="inv-row">تاريخ التسليم: ${new Date(t.delivered_at).toLocaleDateString('ar-SA')}</div>` : ''}
      </div>
    </div>

    <!-- ── بيانات العميل والجهاز ── -->
    <div class="section">
      <div class="section-title">بيانات الصيانة</div>
      <div class="info-grid">
        <div>
          <div class="info-box" style="margin-bottom:8px">
            <div class="info-label">العميل</div>
            <div class="info-value">${t.customer_name}</div>
            <div style="font-size:10px;color:#555;margin-top:3px;direction:ltr">${t.customer_phone}</div>
          </div>
        </div>
        <div>
          <div class="info-box" style="margin-bottom:8px">
            <div class="info-label">الجهاز</div>
            <div class="info-value">${t.brand} ${t.model}</div>
            ${t.color ? `<div style="font-size:10px;color:#555;margin-top:2px">اللون: ${t.color}</div>` : ''}
            ${t.imei  ? `<div style="font-size:10px;color:#555;margin-top:2px;direction:ltr;font-family:monospace">IMEI: ${t.imei}</div>` : ''}
          </div>
        </div>
        <div class="info-box">
          <div class="info-label">المشكلة الأصلية</div>
          <div class="info-value" style="font-weight:400">${t.problem_desc || '—'}</div>
        </div>
        <div class="info-box">
          <div class="info-label">رقم التذكرة</div>
          <div class="info-value" style="font-family:monospace;color:#1A56DB">${t.order_number}</div>
        </div>
      </div>
    </div>

    <!-- ── تشخيص الإصلاح ── -->
    ${diagnosis ? `
    <div class="diagnosis-box">
      <div class="diagnosis-title">🔧 تقرير الإصلاح الفني</div>
      <div style="font-size:10px;line-height:1.7">${diagnosis}</div>
    </div>` : ''}

    <!-- ── القطع المستخدمة ── -->
    ${ticketParts.length > 0 ? `
    <div class="section" style="margin-top:12px">
      <div class="section-title">القطع والمواد المستخدمة</div>
      <table>
        <tr>
          <th>اسم القطعة / الخدمة</th>
          <th style="width:60px;text-align:center">الكمية</th>
          <th style="width:100px;text-align:left">سعر الوحدة</th>
          <th style="width:100px;text-align:left">الإجمالي</th>
        </tr>
        ${partsRows}
        ${laborNum > 0 ? `
        <tr style="background:#eef4ff">
          <td><strong>أجرة العمالة والتقنية</strong></td>
          <td style="text-align:center">1</td>
          <td style="text-align:left;direction:ltr">${laborNum.toLocaleString('ar-SA')} ر.س</td>
          <td style="text-align:left;direction:ltr;font-weight:700">${laborNum.toLocaleString('ar-SA')} ر.س</td>
        </tr>` : ''}
      </table>
    </div>` : `
    <div class="section" style="margin-top:12px">
      <div class="section-title">تفاصيل التكلفة</div>
      <table>
        <tr><th>الخدمة</th><th style="text-align:left">التكلفة</th></tr>
        <tr><td>أجرة الإصلاح والتقنية</td><td style="text-align:left;direction:ltr;font-weight:700">${laborNum.toLocaleString('ar-SA')} ر.س</td></tr>
      </table>
    </div>`}

    <!-- ── الإجماليات ── -->
    <div class="totals-box">
      <div class="totals-inner">
        ${partsCost > 0 ? `<div class="total-row"><span>قطع الغيار</span><span style="direction:ltr">${partsCost.toLocaleString('ar-SA')} ر.س</span></div>` : ''}
        ${laborNum > 0 ? `<div class="total-row"><span>أجرة العمالة</span><span style="direction:ltr">${laborNum.toLocaleString('ar-SA')} ر.س</span></div>` : ''}
        ${discNum > 0 ? `<div class="total-row"><span>خصم</span><span style="direction:ltr;color:#16a34a">- ${discNum.toLocaleString('ar-SA')} ر.س</span></div>` : ''}
        <div class="total-row" style="border-top:1px solid #ddd;padding-top:8px">
          <span>المجموع قبل الضريبة</span>
          <span style="direction:ltr">${subtotal.toLocaleString('ar-SA')} ر.س</span>
        </div>
        <div class="total-row">
          <span>ضريبة القيمة المضافة 15%</span>
          <span style="direction:ltr">${vat.toLocaleString('ar-SA')} ر.س</span>
        </div>
        <div class="total-row grand">
          <span>الإجمالي المستحق</span>
          <span style="direction:ltr">${total.toLocaleString('ar-SA')} ر.س</span>
        </div>
      </div>
    </div>

    <!-- ── الضمان ── -->
    <div class="warranty-box">
      <div class="warranty-title">🛡️ شهادة ضمان — ${warranty} يوم</div>
      <div style="font-size:10px;color:#333;line-height:1.7">
        يشمل الضمان نفس العطل المُصلَح فقط ولا يشمل الأعطال الجديدة أو أضرار السقوط والماء.
        ${t.completed_at ? `تاريخ انتهاء الضمان: ${new Date(new Date(t.completed_at).getTime() + parseInt(warranty)*86400000).toLocaleDateString('ar-SA')}` : ''}
      </div>
    </div>

    <!-- ── QR ── -->
    <div class="qr-section">
      ${qr ? `<img src="${qr}" style="width:65px;height:65px;flex-shrink:0"/>` : ''}
      <div>
        <div style="font-size:10px;font-weight:700;color:#1A56DB;margin-bottom:3px">تتبع حالة جهازك</div>
        <div style="font-size:9px;color:#888">${trackUrl}</div>
        <div style="font-size:9px;color:#888;margin-top:3px">امسح الرمز بكاميرا هاتفك</div>
      </div>
    </div>

    <div class="terms">
      ${shop.invoice_terms || 'الشركة غير مسؤولة عن الأجهزة المتروكة أكثر من 30 يوماً من تاريخ الإبلاغ بالانتهاء'}
      ${shop.invoice_footer ? `<br/>${shop.invoice_footer}` : ''}
    </div>
    </body></html>`

    const win = window.open('', '_blank', 'width=800,height=1000')
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  // إرسال واتساب
  const sendWhatsApp = async () => {
    const phone = t.customer_phone?.replace(/[^0-9]/g,'').replace(/^0/,'')
    const trackUrl = buildTrackUrl(shop, t.order_number)
    const msg = encodeURIComponent(
      `عزيزي ${t.customer_name}،\n` +
      `✅ تم الانتهاء من إصلاح جهازك بنجاح!\n\n` +
      `📱 ${t.brand} ${t.model}\n` +
      `🔖 التذكرة: ${t.order_number}\n` +
      `💰 الإجمالي: ${total.toLocaleString('ar-SA')} ريال شاملاً الضريبة\n` +
      `🛡️ الضمان: ${warranty} يوم\n\n` +
      `تتبع جهازك: ${trackUrl}\n\n` +
      `${shop.shop_name || 'FixPro للصيانة'} | ${shop.phone || ''}`
    )
    window.open(`https://wa.me/966${phone}?text=${msg}`, '_blank')
  }

  const filteredParts = allParts.filter(p =>
    !partSearch || p.name?.toLowerCase().includes(partSearch.toLowerCase()) ||
    (p.sku||'').toLowerCase().includes(partSearch.toLowerCase())
  )

  return (
    <Modal open={true} onClose={onClose}
      title={`📄 فاتورة احترافية — ${ticket.order_number}`}
      maxWidth={680}
      footer={
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          <button className="btn btn-ghost" onClick={() => createInvoice.mutate()}>
            <Plus size={13}/> حفظ الفاتورة
          </button>
          <button className="btn btn-ghost"
            style={{ background:'#25D366', color:'#fff', border:'none' }}
            onClick={sendWhatsApp}>
            <Send size={13}/> واتساب
          </button>
          <button className="btn btn-primary" onClick={printInvoice}>
            <Printer size={13}/> طباعة
          </button>
        </div>
      }>

      {/* القطع المرتبطة */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div className="text-xs text-muted" style={{ fontWeight:600, letterSpacing:'.04em' }}>
            القطع المستخدمة ({ticketParts.length})
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setAddPart(!addPart)}>
            <Package size={13}/> إضافة قطعة
          </button>
        </div>

        {/* قائمة بحث إضافة قطعة */}
        {addPart && (
          <div style={{ background:'var(--ink-3)', borderRadius:8, padding:12, marginBottom:10 }}>
            <input className="form-input mb-2" value={partSearch}
              onChange={e => setPartSearch(e.target.value)}
              placeholder="ابحث عن قطعة..." />
            <div style={{ maxHeight:160, overflowY:'auto' }}>
              {filteredParts.slice(0,10).map(p => (
                <div key={p.id} onClick={() => addPartMutation.mutate(p)}
                  style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px',
                    cursor:'pointer', borderRadius:5, fontSize:12,
                    background:'transparent' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--blue-dim)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{ color:'var(--text-2)' }}>{p.name}</span>
                  <div style={{ display:'flex', gap:12 }}>
                    <span style={{ color:'var(--muted)' }}>متوفر: {p.quantity}</span>
                    <span className="font-mono text-blue">{Number(p.sell_price).toLocaleString()} ر</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* القطع الحالية */}
        {ticketParts.length > 0 ? ticketParts.map((p,i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px',
            background:'var(--ink-3)', borderRadius:5, marginBottom:4, fontSize:12 }}>
            <span style={{ color:'var(--text-2)' }}>{p.part_name || p.name} × {p.quantity}</span>
            <span className="font-mono text-blue">{(Number(p.unit_price)*Number(p.quantity)).toLocaleString()} ر</span>
          </div>
        )) : (
          <div style={{ textAlign:'center', padding:'12px 0', color:'var(--muted)', fontSize:12 }}>
            لا توجد قطع — أضف من المخزون أو اكتب التكلفة يدوياً
          </div>
        )}
      </div>

      {/* بنود الفاتورة */}
      <div className="form-grid mb-3">
        <div className="form-group">
          <label className="form-label">أجرة العمالة / الإصلاح (ريال)</label>
          <input className="form-input" type="number" value={laborCost}
            onChange={e => setLaborCost(e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">خصم (ريال)</label>
          <input className="form-input" type="number" value={discount}
            onChange={e => setDiscount(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">مدة الضمان (يوم)</label>
          <input className="form-input" type="number" value={warranty}
            onChange={e => setWarranty(e.target.value)} />
        </div>
        <div className="form-group form-full">
          <label className="form-label">تقرير الإصلاح الفني</label>
          <textarea className="form-textarea" rows={2} value={diagnosis}
            onChange={e => setDiagnosis(e.target.value)}
            placeholder="ما تم فعله بالتفصيل: استبدلنا الشاشة وحدّثنا النظام..." />
        </div>
      </div>

      {/* الإجمالي */}
      <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'12px 14px' }}>
        {partsCost > 0 && <TotalRow label="قطع الغيار" val={`${partsCost.toLocaleString()} ر`} />}
        {laborNum > 0  && <TotalRow label="أجرة العمالة" val={`${laborNum.toLocaleString()} ر`} />}
        {discNum > 0   && <TotalRow label="خصم" val={`- ${discNum.toLocaleString()} ر`} green />}
        <TotalRow label="المجموع قبل الضريبة" val={`${subtotal.toLocaleString()} ر`} />
        <TotalRow label="ضريبة 15%" val={`${vat.toLocaleString()} ر`} />
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:16,
          fontWeight:700, borderTop:'1px solid var(--border)', paddingTop:8, marginTop:6 }}>
          <span style={{ color:'var(--text-2)' }}>الإجمالي</span>
          <span className="font-mono text-blue">{total.toLocaleString()} ريال</span>
        </div>
      </div>
    </Modal>
  )
}

function TotalRow({ label, val, green }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
      <span className="text-muted">{label}</span>
      <span className="font-mono" style={{ color: green ? 'var(--green)' : 'var(--text-2)' }}>{val}</span>
    </div>
  )
}
