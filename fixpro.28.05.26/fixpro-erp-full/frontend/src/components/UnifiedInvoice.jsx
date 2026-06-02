import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import toast from 'react-hot-toast'
import { Printer, Send, DollarSign, CheckCircle, X } from 'lucide-react'

// ── زر يظهر في بطاقة التذكرة ─────────────────────────
export function InvoiceButton({ ticket }) {
  const [open, setOpen] = useState(false)
  const validStatuses = ['ready','delivered','in_repair']
  if (!validStatuses.includes(ticket.status)) return null
  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        <DollarSign size={13}/> فاتورة
      </button>
      {open && <UnifiedInvoiceModal ticket={ticket} onClose={() => setOpen(false)} />}
    </>
  )
}

// ── النافذة الرئيسية ─────────────────────────────────
function UnifiedInvoiceModal({ ticket, onClose }) {
  const qc = useQueryClient()
  const [laborCost, setLaborCost] = useState('')
  const [discount,  setDiscount]  = useState('0')
  const [notes,     setNotes]     = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payRef,    setPayRef]    = useState('')
  const [tab, setTab]             = useState('invoice') // 'invoice' | 'pay'

  // جلب بيانات الفاتورة
  const { data, isLoading } = useQuery({
    queryKey: ['ticket-invoice', ticket.id],
    queryFn: () => api.get(`/invoices/ticket/${ticket.id}`),
  })
  const d      = data?.data || {}
  const order  = d.order  || {}
  const parts  = d.parts  || []
  const shop   = d.shop   || {}
  const inv    = d.invoice || null

  const partsCost  = d.parts_cost || 0
  const laborNum   = parseFloat(laborCost) || (inv ? parseFloat(inv.labor_cost) : 0)
  const discNum    = parseFloat(discount)  || (inv ? parseFloat(inv.discount)   : 0)
  const subtotal   = +(partsCost + laborNum - discNum).toFixed(2)
  const vat        = +(subtotal * 0.15).toFixed(2)
  const total      = +(subtotal + vat).toFixed(2)
  const paidAmount = inv ? parseFloat(inv.paid_amount || 0) : 0
  const balance    = +(total - paidAmount).toFixed(2)

  // حفظ الفاتورة
  const saveInvoice = useMutation({
    mutationFn: () => api.post(`/invoices/ticket/${ticket.id}/finalize`, {
      labor_cost: laborNum, discount: discNum, notes
    }),
    onSuccess: () => {
      toast.success('تم حفظ الفاتورة ✅')
      qc.invalidateQueries({ queryKey: ['ticket-invoice', ticket.id] })
    },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  // تسجيل دفعة
  const recordPay = useMutation({
    mutationFn: () => api.post(`/invoices/${inv?.id}/pay`, {
      amount: parseFloat(payAmount), method: payMethod, reference_no: payRef
    }),
    onSuccess: () => {
      toast.success('تم تسجيل الدفعة ✅')
      qc.invalidateQueries({ queryKey: ['ticket-invoice', ticket.id] })
      setPayAmount('')
      setPayRef('')
    },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  // طباعة الفاتورة
  const printInvoice = () => {
    const METHODS = { cash:'نقد', card:'بطاقة', transfer:'تحويل', stc:'STC Pay', mada:'مدى' }
    const html = buildPrintHTML({ order, parts, shop, inv, laborNum, discNum, subtotal, vat, total, paidAmount, balance })
    const win = window.open('', '_blank', 'width=900,height=1100')
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  // إرسال واتساب
  const sendWhatsApp = () => {
    const phone = (order.customer_phone || '').replace(/[^0-9]/g,'').replace(/^0/,'')
    const msg = `مرحباً ${order.customer_name}،\n\n` +
      `🧾 فاتورة صيانة — ${order.order_number}\n` +
      `📱 ${order.brand} ${order.model}\n` +
      `💰 الإجمالي: ${total.toLocaleString('ar-SA')} ريال (شامل الضريبة)\n` +
      `${balance > 0 ? `⏳ المتبقي: ${balance.toLocaleString('ar-SA')} ريال\n` : '✅ مدفوع بالكامل\n'}` +
      `\n${shop.shop_name || 'FixPro'} | ${shop.phone || ''}`
    window.open(`https://wa.me/966${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (isLoading) return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, justifyContent:'center', alignItems:'center', display:'flex', height:300 }}>
        <div className="loading-spinner" />
      </div>
    </div>
  )

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color:'var(--text-2)' }}>
              🧾 فاتورة — {order.order_number}
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
              {order.customer_name} | {order.brand} {order.model}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={sendWhatsApp}
              style={{ background:'#25D366', color:'#fff', border:'none' }}>
              <Send size={13}/> واتساب
            </button>
            <button className="btn btn-ghost btn-sm" onClick={printInvoice}>
              <Printer size={13}/> طباعة
            </button>
            <button className="btn-icon" onClick={onClose}><X size={18}/></button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          {[
            { id:'invoice', label:'📋 تفاصيل الفاتورة' },
            { id:'pay',     label:'💳 تسجيل دفعة', disabled: !inv },
          ].map(t => (
            <button key={t.id} onClick={() => !t.disabled && setTab(t.id)} style={{
              padding:'10px 20px', border:'none', background:'none', cursor: t.disabled ? 'not-allowed' : 'pointer',
              fontFamily:'var(--font)', fontSize:13,
              color: tab===t.id ? 'var(--blue)' : t.disabled ? 'var(--muted2)' : 'var(--muted-2)',
              borderBottom: tab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
              opacity: t.disabled ? .5 : 1
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
          {/* ── تبويب الفاتورة ── */}
          {tab === 'invoice' && (
            <div>
              {/* القطع */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', marginBottom:8,
                  textTransform:'uppercase', letterSpacing:'.04em' }}>قطع الغيار المستخدمة</div>
                {parts.length === 0 ? (
                  <div style={{ padding:'12px', background:'var(--ink-3)', borderRadius:6,
                    fontSize:12, color:'var(--muted)', textAlign:'center' }}>
                    لا توجد قطع مسجّلة لهذه التذكرة
                  </div>
                ) : parts.map((p, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between',
                    padding:'8px 12px', background:'var(--ink-3)', borderRadius:6, marginBottom:4, fontSize:13 }}>
                    <span style={{ color:'var(--text-2)' }}>{p.part_name} × {p.quantity}</span>
                    <span className="font-mono" style={{ color:'var(--blue)' }}>
                      {(Number(p.unit_price)*Number(p.quantity)).toLocaleString('ar-SA')} ر
                    </span>
                  </div>
                ))}
              </div>

              {/* التكاليف */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                <div className="form-group">
                  <label className="form-label">أجرة العمالة (ريال)</label>
                  <input className="form-input" type="number" min="0"
                    value={laborCost || (inv ? inv.labor_cost : '')}
                    onChange={e => setLaborCost(e.target.value)}
                    placeholder={inv ? inv.labor_cost : '0'} />
                </div>
                <div className="form-group">
                  <label className="form-label">خصم (ريال)</label>
                  <input className="form-input" type="number" min="0"
                    value={discount || (inv ? inv.discount : '0')}
                    onChange={e => setDiscount(e.target.value)} />
                </div>
                <div className="form-group form-full">
                  <label className="form-label">ملاحظات (اختياري)</label>
                  <input className="form-input" value={notes}
                    onChange={e => setNotes(e.target.value)} placeholder="أي ملاحظات..." />
                </div>
              </div>

              {/* الإجماليات */}
              <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'14px 16px', marginBottom:16 }}>
                <TotalRow label="تكلفة القطع"   val={partsCost} />
                {laborNum > 0 && <TotalRow label="أجرة العمالة" val={laborNum} />}
                {discNum > 0  && <TotalRow label="خصم"          val={-discNum} green />}
                <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:8 }} />
                <TotalRow label="المجموع قبل الضريبة" val={subtotal} />
                <TotalRow label="ضريبة القيمة المضافة 15%" val={vat} />
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:8,
                  fontSize:18, fontWeight:800, color:'var(--blue)' }}>
                  <span>الإجمالي</span>
                  <span className="font-mono">{total.toLocaleString('ar-SA')} ريال</span>
                </div>
                {inv && paidAmount > 0 && (
                  <>
                    <div style={{ borderTop:'1px solid var(--border)', marginTop:8, paddingTop:8 }} />
                    <TotalRow label="المدفوع" val={paidAmount} green />
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:14,
                      fontWeight:700, color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>
                      <span>{balance > 0 ? 'المتبقي' : 'مدفوع بالكامل ✅'}</span>
                      {balance > 0 && <span className="font-mono">{balance.toLocaleString('ar-SA')} ريال</span>}
                    </div>
                  </>
                )}
              </div>

              <button className="btn btn-primary w-full" style={{ justifyContent:'center' }}
                onClick={() => saveInvoice.mutate()} disabled={saveInvoice.isPending}>
                {saveInvoice.isPending ? 'جاري الحفظ...' : inv ? '💾 تحديث الفاتورة' : '✅ إنشاء الفاتورة'}
              </button>
            </div>
          )}

          {/* ── تبويب الدفع ── */}
          {tab === 'pay' && inv && (
            <div>
              <div style={{ padding:'14px 16px', background: balance<=0 ? 'rgba(16,185,129,.08)' : 'rgba(59,130,246,.08)',
                border:`1px solid ${balance<=0 ? 'rgba(16,185,129,.3)' : 'rgba(59,130,246,.3)'}`,
                borderRadius:8, marginBottom:16, textAlign:'center' }}>
                {balance <= 0 ? (
                  <div style={{ color:'var(--green)', fontWeight:700, fontSize:16 }}>✅ تم السداد الكامل</div>
                ) : (
                  <>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>المبلغ المتبقي</div>
                    <div style={{ fontSize:24, fontWeight:900, color:'var(--blue)', fontFamily:'var(--mono)' }}>
                      {balance.toLocaleString('ar-SA')} ريال
                    </div>
                  </>
                )}
              </div>

              {balance > 0 && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                    <div className="form-group form-full">
                      <label className="form-label">المبلغ (ريال)</label>
                      <input className="form-input" type="number" min="0.01"
                        value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        placeholder={balance.toString()} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">طريقة الدفع</label>
                      <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                        <option value="cash">💵 نقد</option>
                        <option value="card">💳 بطاقة</option>
                        <option value="transfer">🏦 تحويل</option>
                        <option value="stc">📱 STC Pay</option>
                        <option value="mada">💳 مدى</option>
                      </select>
                    </div>
                    {['card','transfer','stc','mada'].includes(payMethod) && (
                      <div className="form-group">
                        <label className="form-label">رقم المرجع</label>
                        <input className="form-input" value={payRef}
                          onChange={e => setPayRef(e.target.value)} dir="ltr" />
                      </div>
                    )}
                  </div>

                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setPayAmount(balance.toString())}
                      style={{ flexShrink:0 }}>
                      كامل المبلغ
                    </button>
                    <button className="btn btn-primary w-full" style={{ justifyContent:'center' }}
                      onClick={() => recordPay.mutate()}
                      disabled={!payAmount || recordPay.isPending}>
                      {recordPay.isPending ? 'جاري التسجيل...' : '💰 تسجيل الدفعة'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── مساعدات ──────────────────────────────────────────
const overlayStyle = {
  position:'fixed', inset:0, background:'rgba(0,0,0,.6)',
  display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
}
const modalStyle = {
  background:'var(--ink-2)', borderRadius:14,
  width:'min(680px,96vw)', maxHeight:'90vh',
  display:'flex', flexDirection:'column',
  border:'1px solid var(--border)', boxShadow:'0 24px 64px rgba(0,0,0,.5)'
}

function TotalRow({ label, val, green }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
      <span style={{ color:'var(--muted-2)' }}>{label}</span>
      <span className="font-mono" style={{ color: green ? 'var(--green)' : 'var(--text-2)', fontWeight:500 }}>
        {val < 0
          ? `- ${Math.abs(val).toLocaleString('ar-SA')} ر`
          : `${Number(val).toLocaleString('ar-SA')} ر`
        }
      </span>
    </div>
  )
}

// ── HTML للطباعة ──────────────────────────────────────
function buildPrintHTML({ order, parts, shop, inv, laborNum, discNum, subtotal, vat, total, paidAmount, balance }) {
  const partsRows = parts.map(p => `
    <tr>
      <td>${p.part_name || '—'}</td>
      <td style="text-align:center">${p.quantity}</td>
      <td style="text-align:left;direction:ltr">${Number(p.unit_price).toLocaleString('ar-SA')} ر.س</td>
      <td style="text-align:left;direction:ltr;font-weight:700">
        ${(Number(p.unit_price)*Number(p.quantity)).toLocaleString('ar-SA')} ر.س
      </td>
    </tr>`).join('')

  const invNum = inv?.id?.slice(0,8).toUpperCase() || '—'
  const now = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' })

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
  <meta charset="UTF-8"><title>فاتورة ${order.order_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;padding:15mm}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1A56DB;padding-bottom:12px;margin-bottom:14px}
    .shop-name{font-size:22px;font-weight:900;color:#1A56DB}
    .inv-num{font-size:20px;font-weight:900;font-family:monospace;direction:ltr}
    .section{margin-bottom:14px}
    .section-title{font-size:10px;font-weight:900;color:#1A56DB;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding-bottom:3px;border-bottom:1px solid #ddd}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .info-box{background:#f8f9fa;padding:8px;border-radius:4px;border-right:3px solid #1A56DB}
    .info-label{font-size:9px;color:#888;margin-bottom:2px}
    .info-value{font-size:12px;font-weight:600}
    table{width:100%;border-collapse:collapse}
    th{background:#1A56DB;color:#fff;padding:6px 8px;text-align:right;font-size:10px}
    td{padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:10px}
    .totals{margin-top:12px;display:flex;justify-content:flex-end}
    .totals-box{min-width:260px}
    .t-row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px}
    .t-total{font-size:15px;font-weight:900;background:#1A56DB;color:#fff;padding:8px 12px;border-radius:4px;margin-top:6px}
    .paid-full{font-size:13px;color:#16a34a;font-weight:700;text-align:center;margin-top:8px}
    .balance{font-size:13px;color:#dc2626;font-weight:700}
    .footer{margin-top:16px;padding-top:10px;border-top:1px dashed #ccc;font-size:9px;color:#666;text-align:center}
    @media print{@page{margin:8mm}}
  </style>
  </head><body>
  <div class="header">
    <div>
      <div class="shop-name">${shop.shop_name || 'FixPro للصيانة'}</div>
      ${shop.address ? `<div style="font-size:10px;color:#666;margin-top:4px">📍 ${shop.address}</div>` : ''}
      ${shop.phone   ? `<div style="font-size:10px;color:#666">📞 ${shop.phone}</div>` : ''}
      ${shop.tax_number ? `<div style="font-size:10px;color:#666">الرقم الضريبي: ${shop.tax_number}</div>` : ''}
    </div>
    <div style="text-align:left">
      <div style="font-size:11px;color:#555;margin-bottom:4px">فاتورة صيانة</div>
      <div class="inv-num">#${invNum}</div>
      <div style="font-size:10px;color:#555;margin-top:4px">${now}</div>
      <div style="font-size:10px;color:#1A56DB;font-weight:700">${order.order_number}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">بيانات الصيانة</div>
    <div class="info-grid">
      <div class="info-box"><div class="info-label">العميل</div><div class="info-value">${order.customer_name}</div><div style="font-size:10px;color:#666">${order.customer_phone}</div></div>
      <div class="info-box"><div class="info-label">الجهاز</div><div class="info-value">${order.brand} ${order.model}</div>${order.color ? `<div style="font-size:10px;color:#666">اللون: ${order.color}</div>` : ''}</div>
      <div class="info-box"><div class="info-label">المشكلة</div><div class="info-value" style="font-weight:400">${order.problem_desc || '—'}</div></div>
      <div class="info-box"><div class="info-label">الفني</div><div class="info-value">${order.technician_name || '—'}</div></div>
    </div>
  </div>

  ${parts.length ? `
  <div class="section">
    <div class="section-title">القطع والخدمات</div>
    <table><thead><tr><th>البيان</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
    <tbody>${partsRows}
    ${laborNum > 0 ? `<tr><td>أجرة العمالة</td><td style="text-align:center">1</td><td style="text-align:left;direction:ltr">${laborNum.toLocaleString('ar-SA')} ر.س</td><td style="text-align:left;direction:ltr;font-weight:700">${laborNum.toLocaleString('ar-SA')} ر.س</td></tr>` : ''}
    </tbody></table>
  </div>` : laborNum > 0 ? `
  <div class="section">
    <div class="section-title">تفاصيل التكلفة</div>
    <table><thead><tr><th>البيان</th><th>المبلغ</th></tr></thead>
    <tbody><tr><td>أجرة الإصلاح والتقنية</td><td style="text-align:left;direction:ltr;font-weight:700">${laborNum.toLocaleString('ar-SA')} ر.س</td></tr></tbody>
    </table>
  </div>` : ''}

  <div class="totals">
    <div class="totals-box">
      ${parts.length ? `<div class="t-row"><span>قطع الغيار</span><span>${Number(order.parts_cost||parts.reduce((s,p)=>s+Number(p.unit_price)*Number(p.quantity),0)).toLocaleString('ar-SA')} ر.س</span></div>` : ''}
      ${laborNum > 0 ? `<div class="t-row"><span>أجرة العمالة</span><span>${laborNum.toLocaleString('ar-SA')} ر.س</span></div>` : ''}
      ${discNum > 0  ? `<div class="t-row"><span>خصم</span><span style="color:#16a34a">- ${discNum.toLocaleString('ar-SA')} ر.س</span></div>` : ''}
      <div class="t-row" style="border-top:1px solid #ddd;padding-top:6px;margin-top:4px"><span>المجموع قبل الضريبة</span><span>${subtotal.toLocaleString('ar-SA')} ر.س</span></div>
      <div class="t-row"><span>ضريبة القيمة المضافة 15%</span><span>${vat.toLocaleString('ar-SA')} ر.س</span></div>
      <div class="t-row t-total"><span>الإجمالي المستحق</span><span>${total.toLocaleString('ar-SA')} ر.س</span></div>
      ${paidAmount > 0 ? `<div class="t-row" style="margin-top:6px"><span>المدفوع</span><span style="color:#16a34a">${paidAmount.toLocaleString('ar-SA')} ر.س</span></div>` : ''}
      ${balance <= 0 ? `<div class="paid-full">✅ تم السداد الكامل</div>` : `<div class="t-row balance"><span>المتبقي</span><span>${balance.toLocaleString('ar-SA')} ر.س</span></div>`}
    </div>
  </div>

  <div class="footer">
    ${shop.invoice_terms || 'الشركة غير مسؤولة عن الأجهزة المتروكة أكثر من 30 يوماً'}
  </div>
  </body></html>`
}

export default UnifiedInvoiceModal
