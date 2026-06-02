import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { generateQR, buildTrackUrl } from '../utils/printUtils'
import toast from 'react-hot-toast'
import { Modal, Loading } from '../components/ui'
import { FileText, Plus, Printer, Download, Send, CheckCircle } from 'lucide-react'
import jsPDF from 'jspdf'

// ── فاتورة الإنهاء ────────────────────────────────────────
export function CompletionInvoiceButton({ ticket }) {
  const [open, setOpen] = useState(false)
  if (!['ready', 'delivered'].includes(ticket.status)) return null
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <FileText size={13}/> فاتورة الإنهاء
      </button>
      {open && <CompletionInvoiceModal ticket={ticket} onClose={() => setOpen(false)} />}
    </>
  )
}

function CompletionInvoiceModal({ ticket, onClose }) {
  const qc = useQueryClient()
  const [labor, setLabor] = useState('')
  const [discount, setDiscount] = useState('0')
  const [notes, setNotes] = useState('')
  const [warrantyNotes, setWarrantyNotes] = useState('يشمل الضمان نفس العطل فقط ولا يشمل الأضرار الجديدة')

  const { data: shopData } = useQuery({ queryKey: ['shop-settings'], queryFn: () => api.get('/shop-settings') })
  const shop = shopData?.data || {}

  // جلب تفاصيل التذكرة الكاملة
  const { data: ticketData } = useQuery({
    queryKey: ['ticket-full', ticket.id],
    queryFn: () => api.get(`/tickets/${ticket.id}`)
  })
  const t = ticketData?.data || ticket

  const parts = t.parts || []
  const partsCost = parts.reduce((s, p) => s + (p.unit_price * p.quantity), 0)
  const laborNum  = parseFloat(labor) || 0
  const discountNum = parseFloat(discount) || 0
  const subtotal  = laborNum + partsCost - discountNum
  const vat       = +(subtotal * 0.15).toFixed(2)
  const total     = +(subtotal + vat).toFixed(2)

  // إنشاء فاتورة في قاعدة البيانات
  const createInvoice = useMutation({
    mutationFn: () => api.post('/invoices', {
      order_id:      ticket.id,
      labor_cost:    laborNum,
      discount:      discountNum,
      notes,
    }),
    onSuccess: () => {
      toast.success('تم إنشاء الفاتورة ✅')
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: err => toast.error(err?.message || 'خطأ في إنشاء الفاتورة')
  })

  // طباعة الفاتورة
  const printInvoice = async () => {
    const trackUrl = buildTrackUrl(shop, t.order_number)
    const qr = await generateQR(trackUrl, 80)
    const now = new Date()
    const dateStr = now.toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' })

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
    <meta charset="UTF-8"><title>فاتورة إنهاء صيانة</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#000;direction:rtl;padding:10mm 12mm}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px}
      .shop-name{font-size:18px;font-weight:700}
      .invoice-title{font-size:14px;font-weight:700;color:#1A56DB;text-align:left}
      .invoice-num{font-size:11px;color:#555;text-align:left}
      .section{margin:8px 0;padding:8px;background:#f8f8f8;border-radius:4px}
      .section-title{font-size:11px;font-weight:700;color:#1A56DB;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em}
      .row{display:flex;justify-content:space-between;margin-bottom:3px;font-size:10px}
      .lbl{color:#555}.val{font-weight:500}
      table{width:100%;border-collapse:collapse;margin:8px 0;font-size:10px}
      th{background:#1A56DB;color:#fff;padding:5px 8px;text-align:right}
      td{padding:5px 8px;border-bottom:1px solid #eee}
      tr:nth-child(even){background:#f8f8f8}
      .totals{border-top:2px solid #000;padding-top:6px;margin-top:4px}
      .total-row{display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px}
      .grand-total{font-size:14px;font-weight:700;color:#1A56DB;border-top:1px solid #ccc;padding-top:4px;margin-top:4px}
      .warranty-box{border:1px solid #1A56DB;border-radius:4px;padding:8px;margin:8px 0}
      .warranty-title{font-size:11px;font-weight:700;color:#1A56DB;margin-bottom:4px}
      .terms{font-size:9px;color:#666;margin-top:6px;text-align:center;border-top:1px dashed #ccc;padding-top:6px}
      .qr-section{text-align:center;margin-top:8px;padding-top:8px;border-top:1px dashed #ccc}
      @media print{@page{margin:10mm}body{padding:0}}
    </style></head><body>

    <!-- رأس الفاتورة -->
    <div class="header">
      <div>
        ${shop.logo_url ? `<img src="${shop.logo_url}" style="max-height:40px;margin-bottom:4px;display:block;object-fit:contain"/>` : ''}
        <div class="shop-name">${shop.shop_name || 'FixPro للصيانة'}</div>
        ${shop.shop_name_en ? `<div style="font-size:10px;color:#555">${shop.shop_name_en}</div>` : ''}
        ${shop.address ? `<div style="font-size:9px;color:#666">${shop.city||''} — ${shop.address}</div>` : ''}
        ${shop.phone ? `<div style="font-size:9px;color:#666">📞 ${shop.phone}</div>` : ''}
        ${shop.tax_number ? `<div style="font-size:9px;color:#888">الرقم الضريبي: ${shop.tax_number}</div>` : ''}
      </div>
      <div style="text-align:left">
        <div class="invoice-title">فاتورة إنهاء صيانة</div>
        <div class="invoice-num">التذكرة: ${t.order_number}</div>
        <div class="invoice-num">التاريخ: ${dateStr}</div>
        ${t.delivered_at ? `<div class="invoice-num">تاريخ التسليم: ${new Date(t.delivered_at).toLocaleDateString('ar-SA')}</div>` : ''}
      </div>
    </div>

    <!-- بيانات العميل والجهاز -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div class="section">
        <div class="section-title">بيانات العميل</div>
        <div class="row"><span class="lbl">الاسم:</span><span class="val">${t.customer_name}</span></div>
        <div class="row"><span class="lbl">الجوال:</span><span class="val" style="direction:ltr">${t.customer_phone}</span></div>
      </div>
      <div class="section">
        <div class="section-title">بيانات الجهاز</div>
        <div class="row"><span class="lbl">الجهاز:</span><span class="val">${t.brand} ${t.model}</span></div>
        ${t.color ? `<div class="row"><span class="lbl">اللون:</span><span class="val">${t.color}</span></div>` : ''}
        ${t.imei ? `<div class="row"><span class="lbl">IMEI:</span><span class="val" style="direction:ltr;font-family:monospace">${t.imei}</span></div>` : ''}
      </div>
    </div>

    <!-- وصف الإصلاح -->
    <div class="section">
      <div class="section-title">تفاصيل الإصلاح</div>
      <div style="font-size:10px;margin-bottom:4px"><strong>المشكلة:</strong> ${t.problem_desc || '—'}</div>
      ${t.diagnosis_notes ? `<div style="font-size:10px"><strong>التشخيص:</strong> ${t.diagnosis_notes}</div>` : ''}
    </div>

    <!-- القطع المستخدمة -->
    ${parts.length > 0 ? `
    <table>
      <tr><th>القطعة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
      ${parts.map(p => `
        <tr>
          <td>${p.part_name || p.name}</td>
          <td style="text-align:center">${p.quantity}</td>
          <td style="text-align:left;direction:ltr">${Number(p.unit_price).toLocaleString()} ر</td>
          <td style="text-align:left;direction:ltr">${(p.unit_price*p.quantity).toLocaleString()} ر</td>
        </tr>
      `).join('')}
    </table>` : ''}

    <!-- الإجماليات -->
    <div class="totals">
      ${parts.length > 0 ? `<div class="total-row"><span>قطع الغيار:</span><span style="direction:ltr">${partsCost.toLocaleString()} ر</span></div>` : ''}
      ${laborNum > 0 ? `<div class="total-row"><span>أجرة العمالة:</span><span style="direction:ltr">${laborNum.toLocaleString()} ر</span></div>` : ''}
      ${discountNum > 0 ? `<div class="total-row"><span>خصم:</span><span style="direction:ltr;color:#16a34a">- ${discountNum.toLocaleString()} ر</span></div>` : ''}
      <div class="total-row"><span>المجموع قبل الضريبة:</span><span style="direction:ltr">${subtotal.toLocaleString()} ر</span></div>
      <div class="total-row"><span>ضريبة القيمة المضافة (15%):</span><span style="direction:ltr">${vat.toLocaleString()} ر</span></div>
      <div class="total-row grand-total"><span>الإجمالي:</span><span style="direction:ltr">${total.toLocaleString()} ريال</span></div>
    </div>

    <!-- الضمان -->
    <div class="warranty-box">
      <div class="warranty-title">🛡️ شروط الضمان — ${t.warranty_days || 30} يوم</div>
      <div style="font-size:10px;color:#333">${warrantyNotes}</div>
      ${t.completed_at ? `<div style="font-size:9px;color:#666;margin-top:3px">تاريخ انتهاء الضمان: ${new Date(new Date(t.completed_at).getTime() + (t.warranty_days||30)*86400000).toLocaleDateString('ar-SA')}</div>` : ''}
    </div>

    ${notes ? `<div class="section"><div class="section-title">ملاحظات</div><div style="font-size:10px">${notes}</div></div>` : ''}

    <!-- QR Code -->
    <div class="qr-section">
      ${qr ? `<img src="${qr}" style="width:60px;height:60px;display:block;margin:0 auto 4px"/>` : ''}
      <div style="font-size:8px;color:#888">امسح للتتبع: ${trackUrl}</div>
    </div>

    <!-- الشروط -->
    <div class="terms">
      ${shop.invoice_terms || 'الشركة غير مسؤولة عن الأجهزة المتروكة أكثر من 30 يوماً'}
      ${shop.invoice_footer ? `<br/>${shop.invoice_footer}` : ''}
    </div>
    </body></html>`

    const win = window.open('', '_blank', 'width=700,height=900')
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  // إرسال واتساب
  const sendWhatsApp = async () => {
    const trackUrl = buildTrackUrl(shop, t.order_number)
    const phone = t.customer_phone?.replace(/[^0-9]/g, '').replace(/^0/, '')
    const msg = encodeURIComponent(
      `عزيزي ${t.customer_name}،\n` +
      `✅ تم الانتهاء من إصلاح جهازك بنجاح!\n\n` +
      `📱 الجهاز: ${t.brand} ${t.model}\n` +
      `🔧 التذكرة: ${t.order_number}\n` +
      `💰 الإجمالي: ${total.toLocaleString()} ريال\n` +
      `🛡️ الضمان: ${t.warranty_days || 30} يوم\n\n` +
      `يمكنك تتبع طلبك:\n${trackUrl}\n\n` +
      `نرجو حضورك لاستلام جهازك 🙏\n` +
      `${shop.shop_name || 'FixPro للصيانة'}`
    )
    window.open(`https://wa.me/966${phone}?text=${msg}`, '_blank')
  }

  return (
    <Modal open={true} onClose={onClose} title={`📄 فاتورة إنهاء — ${ticket.order_number}`} maxWidth={640}
      footer={
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          <button className="btn btn-ghost" onClick={() => createInvoice.mutate()} disabled={createInvoice.isPending}>
            <Plus size={13}/> {createInvoice.isPending ? 'جاري...' : 'حفظ الفاتورة'}
          </button>
          <button className="btn btn-ghost" style={{ background:'#25D366', color:'#fff', border:'none' }} onClick={sendWhatsApp}>
            <Send size={13}/> واتساب
          </button>
          <button className="btn btn-primary" onClick={printInvoice}>
            <Printer size={13}/> طباعة الفاتورة
          </button>
        </div>
      }>

      <div className="two-col mb-3">
        <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'10px 14px' }}>
          <div className="text-xs text-muted mb-1">العميل</div>
          <div style={{ fontWeight:600, color:'var(--text-2)' }}>{t.customer_name}</div>
          <div className="text-xs text-muted2">{t.customer_phone}</div>
        </div>
        <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'10px 14px' }}>
          <div className="text-xs text-muted mb-1">الجهاز</div>
          <div style={{ fontWeight:600, color:'var(--text-2)' }}>{t.brand} {t.model}</div>
          <div className="text-xs text-muted2">{t.color}</div>
        </div>
      </div>

      {/* بنود الفاتورة */}
      <div className="form-grid mb-3">
        <div className="form-group">
          <label className="form-label">أجرة العمالة (ريال)</label>
          <input className="form-input" type="number" value={labor}
            onChange={e => setLabor(e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">خصم (ريال)</label>
          <input className="form-input" type="number" value={discount}
            onChange={e => setDiscount(e.target.value)} />
        </div>
        <div className="form-group form-full">
          <label className="form-label">شروط الضمان</label>
          <input className="form-input" value={warrantyNotes}
            onChange={e => setWarrantyNotes(e.target.value)} />
        </div>
        <div className="form-group form-full">
          <label className="form-label">ملاحظات</label>
          <textarea className="form-textarea" rows={2} value={notes}
            onChange={e => setNotes(e.target.value)} placeholder="أي ملاحظات على الفاتورة..." />
        </div>
      </div>

      {/* القطع المستخدمة */}
      {parts.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div className="text-xs text-muted mb-2" style={{ fontWeight:600, letterSpacing:'.04em' }}>القطع المستخدمة</div>
          {parts.map((p, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 10px', background:'var(--ink-3)', borderRadius:6, marginBottom:4, fontSize:12 }}>
              <span style={{ color:'var(--text-2)' }}>{p.part_name} × {p.quantity}</span>
              <span className="font-mono text-blue">{(p.unit_price * p.quantity).toLocaleString()} ر</span>
            </div>
          ))}
        </div>
      )}

      {/* الإجمالي */}
      <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'12px 14px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
          <span className="text-muted">قطع الغيار</span>
          <span className="font-mono">{partsCost.toLocaleString()} ر</span>
        </div>
        {laborNum > 0 && (
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
            <span className="text-muted">أجرة العمالة</span>
            <span className="font-mono">{laborNum.toLocaleString()} ر</span>
          </div>
        )}
        {discountNum > 0 && (
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
            <span className="text-muted">خصم</span>
            <span className="font-mono text-green">- {discountNum.toLocaleString()} ر</span>
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
          <span className="text-muted">ضريبة 15%</span>
          <span className="font-mono">{vat.toLocaleString()} ر</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, borderTop:'1px solid var(--border)', paddingTop:8, marginTop:6 }}>
          <span style={{ color:'var(--text-2)' }}>الإجمالي</span>
          <span className="font-mono text-blue">{total.toLocaleString()} ريال</span>
        </div>
      </div>
    </Modal>
  )
}
