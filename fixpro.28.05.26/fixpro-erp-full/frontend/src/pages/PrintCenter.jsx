import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { Loading } from '../components/ui'
import { Printer, Tag, Package, FileText, Search, Download, Send, CheckSquare } from 'lucide-react'
import {
  generateQR, generateReceiptPDF, buildReceiptHTML,
  buildTrackUrl, generateBarcode
} from '../utils/printUtils'
import toast from 'react-hot-toast'

const TABS = [
  { id:'receipt',  label:'وصل الاستلام',   icon: Printer   },
  { id:'delivery', label:'وصل التسليم',    icon: CheckSquare },
  { id:'label',    label:'ملصق التذكرة',   icon: Tag       },
  { id:'parts',    label:'باركود القطع',   icon: Package   },
]

export default function PrintCenter() {
  const [tab, setTab]                   = useState('receipt')
  const [ticketSearch, setTicketSearch] = useState('')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [previewHtml, setPreviewHtml]   = useState('')
  const [qrUrl, setQrUrl]               = useState('')

  const { data: shopData } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api.get('/shop-settings'),
  })
  const { data: ticketsData } = useQuery({
    queryKey: ['tickets-print-search', ticketSearch],
    queryFn: () => api.get(`/tickets?search=${ticketSearch}&limit=10`),
    enabled: ticketSearch.length > 1,
  })
  const { data: partsData } = useQuery({
    queryKey: ['parts-print'],
    queryFn: () => api.get('/inventory/parts?limit=500'),
    enabled: tab === 'parts',
  })

  const shop    = shopData?.data || {}
  const tickets = ticketsData?.data || []
  const parts   = partsData?.data  || []

  // توليد QR + معاينة عند اختيار تذكرة
  useEffect(() => {
    if (!selectedTicket || tab !== 'receipt') return
    const trackUrl = buildTrackUrl(shop, selectedTicket.order_number)
    generateQR(trackUrl, 120).then(qr => {
      setQrUrl(qr)
      buildReceiptHTML(selectedTicket, shop, qr).then(html => setPreviewHtml(html))
    })
  }, [selectedTicket, shop, tab])

  const printWindow = (html, w = 400, h = 700) => {
    const win = window.open('', '_blank', `width=${w},height=${h}`)
    win.document.write(html)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 600)
  }

  const sendWhatsApp = () => {
    if (!selectedTicket) return
    const trackUrl = buildTrackUrl(shop, selectedTicket.order_number)
    const msg = encodeURIComponent(
      `عزيزي ${selectedTicket.customer_name}،\n` +
      `تم استلام جهازك للصيانة.\n` +
      `رقم تذكرتك: *${selectedTicket.order_number}*\n` +
      `تتبع جهازك: ${trackUrl}\n\n` +
      `${shop?.shop_name || 'FixPro للصيانة'}`
    )
    const phone = selectedTicket.customer_phone?.replace(/[^0-9]/g,'').replace(/^0/,'')
    window.open(`https://wa.me/966${phone}?text=${msg}`, '_blank')
  }

  const downloadPDF = async () => {
    if (!selectedTicket) return
    try {
      const pdf = await generateReceiptPDF(selectedTicket, shop)
      pdf.save(`${selectedTicket.order_number}.pdf`)
      toast.success('تم تحميل PDF')
    } catch(e) { toast.error('خطأ: ' + e.message) }
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">مركز الطباعة</div>
          <div className="page-sub">وصولات الاستلام والتسليم وملصقات الباركود</div>
        </div>
      </div>

      {/* تبويبات */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
            padding:'9px 16px', background:'none', border:'none', cursor:'pointer',
            fontSize:13, fontFamily:'var(--font)',
            color: tab===t.id ? 'var(--blue)' : 'var(--muted-2)',
            borderBottom: tab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom:-1,
          }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* اختيار التذكرة */}
      {['receipt','delivery','label'].includes(tab) && (
        <div className="card" style={{ padding:14, marginBottom:16 }}>
          <div className="search-wrap">
            <Search size={14}/>
            <input className="search-input" value={ticketSearch}
              onChange={e => { setTicketSearch(e.target.value); setSelectedTicket(null) }}
              placeholder="ابحث برقم التذكرة أو اسم العميل أو IMEI..."/>
          </div>
          {tickets.length > 0 && !selectedTicket && (
            <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
              {tickets.map(t => (
                <div key={t.id} onClick={() => { setSelectedTicket(t); setTicketSearch('') }}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px',
                    background:'var(--ink-3)', borderRadius:6, cursor:'pointer',
                    border:'1px solid var(--border)' }} className="hover-row">
                  <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--blue)', fontWeight:600 }}>{t.order_number}</span>
                  <span style={{ fontWeight:500, color:'var(--text-2)', fontSize:13 }}>{t.customer_name}</span>
                  <span style={{ fontSize:12, color:'var(--muted)' }}>{t.brand} {t.model}</span>
                  <span style={{ fontSize:11, color:'var(--muted)', marginRight:'auto' }}>{t.customer_phone}</span>
                </div>
              ))}
            </div>
          )}
          {selectedTicket && (
            <div style={{ marginTop:8, display:'flex', justifyContent:'space-between',
              padding:'7px 12px', background:'var(--green-dim)', borderRadius:6, fontSize:12, color:'var(--green)' }}>
              <span>✅ {selectedTicket.order_number} — {selectedTicket.customer_name} — {selectedTicket.brand} {selectedTicket.model}</span>
              <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:11 }}
                onClick={() => setSelectedTicket(null)}>تغيير</button>
            </div>
          )}
        </div>
      )}

      {/* ── وصل الاستلام ── */}
      {tab === 'receipt' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'start' }}>
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontWeight:600, color:'var(--text-2)' }}>معاينة وصل الاستلام</span>
            </div>
            <div style={{ background:'#e8e8e8', padding:16, display:'flex', alignItems:'flex-start', justifyContent:'center', minHeight:300 }}>
              {previewHtml
                ? <iframe srcDoc={previewHtml}
                    style={{ width:(shop?.receipt_width||80)*3.78, minHeight:400, border:'1px solid #ccc', background:'#fff' }}
                    title="معاينة"/>
                : <div style={{ color:'#999', textAlign:'center', paddingTop:60 }}>
                    <Printer size={36} style={{ margin:'0 auto 12px', display:'block', opacity:.3 }}/>
                    اختر تذكرة للمعاينة
                  </div>
              }
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10, minWidth:180 }}>
            <button className="btn btn-primary" style={{ justifyContent:'center' }}
              disabled={!selectedTicket} onClick={() => printWindow(previewHtml)}>
              <Printer size={14}/> طباعة الوصل
            </button>
            <button className="btn btn-ghost" style={{ justifyContent:'center' }}
              disabled={!selectedTicket} onClick={downloadPDF}>
              <Download size={14}/> تحميل PDF
            </button>
            <button style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              padding:'8px', background:'#25D366', color:'#fff', border:'none',
              borderRadius:6, cursor:'pointer', fontFamily:'var(--font)', fontSize:13,
              opacity: selectedTicket ? 1 : 0.5 }}
              disabled={!selectedTicket} onClick={sendWhatsApp}>
              <Send size={14}/> واتساب
            </button>
            {qrUrl && (
              <div style={{ textAlign:'center', padding:12, background:'var(--ink-3)', borderRadius:8 }}>
                <img src={qrUrl} alt="QR" style={{ width:80, height:80, margin:'0 auto 6px', display:'block' }}/>
                <div style={{ fontSize:10, color:'var(--muted)' }}>QR التتبع</div>
                <a href={qrUrl} download={`QR-${selectedTicket?.order_number}.png`}
                  className="btn btn-ghost btn-sm" style={{ marginTop:6, display:'inline-flex' }}>
                  <Download size={11}/> تحميل
                </a>
              </div>
            )}
            <div style={{ padding:'10px 12px', background:'var(--ink-3)', borderRadius:6, fontSize:11, color:'var(--muted-2)', lineHeight:1.8 }}>
              📄 الورق: <strong>{shop?.receipt_width||80}mm</strong><br/>
              🏪 {shop?.shop_name||'غير محدد'}
            </div>
          </div>
        </div>
      )}

      {/* ── وصل التسليم ── */}
      {tab === 'delivery' && (
        <DeliveryTab ticket={selectedTicket} shop={shop} printWindow={printWindow}/>
      )}

      {/* ── ملصق التذكرة ── */}
      {tab === 'label' && (
        <LabelTab ticket={selectedTicket} shop={shop}/>
      )}

      {/* ── باركود القطع ── */}
      {tab === 'parts' && (
        <PartsTab parts={parts} shop={shop}/>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// وصل التسليم
// ══════════════════════════════════════════════════════════
function DeliveryTab({ ticket: t, shop, printWindow }) {
  const [laborCost, setLaborCost] = useState('')
  const [payMethod, setPayMethod] = useState('cash')

  // جلب تفاصيل التذكرة الكاملة مع القطع والفاتورة
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['ticket-delivery-detail', t?.id],
    queryFn: () => api.get(`/invoices/ticket/${t.id}`),
    enabled: !!t?.id,
  })
  const d    = detailData?.data || {}
  const inv  = d.invoice
  const parts = d.parts || []

  const PAY_LABELS = {
    cash:'نقد', card:'بطاقة', bank_transfer:'تحويل بنكي',
    mada:'مدى', stc_pay:'STC Pay', apple_pay:'Apple Pay',
  }

  const buildDeliveryHTML = async () => {
    if (!t) return ''
    const trackUrl = buildTrackUrl(shop, t.order_number)
    const qr = await generateQR(trackUrl, 70)
    const lc   = parseFloat(laborCost) || parseFloat(inv?.labor_cost||0)
    const pc   = parseFloat(d.parts_cost||0)
    const disc = parseFloat(inv?.discount||0)
    const sub  = lc + pc - disc
    const vat  = +(sub * 0.15).toFixed(2)
    const tot  = +(sub + vat).toFixed(2)
    const paid = parseFloat(inv?.paid_amount||0)
    const bal  = +(tot - paid).toFixed(2)
    const now  = new Date()

    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><title>وصل تسليم ${t.order_number}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#000;
    direction:rtl;width:${shop?.receipt_width||80}mm;padding:4mm;margin:0 auto}
  .header{text-align:center;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:6px}
  .shop-name{font-size:15px;font-weight:700}
  .type-badge{display:inline-block;background:#000;color:#fff;padding:2px 10px;
    border-radius:3px;font-size:9px;font-weight:700;margin:4px 0}
  .row2{display:flex;justify-content:space-between;padding:2px 0;font-size:9px}
  .lbl{color:#555}.val{font-weight:500}
  .divider{border:none;border-top:1px dashed #666;margin:4px 0}
  .divider-solid{border:none;border-top:2px solid #000;margin:5px 0}
  .total-row{display:flex;justify-content:space-between;font-size:12px;font-weight:700;
    border-top:2px solid #000;padding-top:4px;margin-top:3px}
  .paid-stamp{text-align:center;font-size:14px;font-weight:900;
    border:3px solid #000;border-radius:6px;padding:3px 12px;
    display:inline-block;margin:4px 0}
  .sig-box{border:1px solid #000;height:12mm;margin-top:3px;width:100%;display:flex;
    align-items:center;justify-content:center;color:#aaa;font-size:8px}
  .footer{font-size:7px;color:#666;text-align:center;margin-top:5px;
    border-top:1px dashed #000;padding-top:4px;line-height:1.5}
  @media print{@page{margin:3mm;size:${shop?.receipt_width||80}mm auto}body{width:100%}}
</style></head><body>

<div class="header">
  ${shop?.logo_url?`<img src="${shop.logo_url}" style="max-height:40px;display:block;margin:0 auto 4px;object-fit:contain"/>`:''}
  <div class="shop-name">${shop?.shop_name||'FixPro للصيانة'}</div>
  ${shop?.address?`<div style="font-size:8px;color:#666">${shop.city||''} — ${shop.address}</div>`:''}
  ${shop?.phone?`<div style="font-size:8px;color:#666">📞 ${shop.phone}</div>`:''}
  ${shop?.tax_number?`<div style="font-size:7px;color:#888">الرقم الضريبي: ${shop.tax_number}</div>`:''}
  <div class="type-badge">وصل تسليم</div>
  <div style="font-size:16px;font-weight:900;letter-spacing:2px;margin:3px 0">${t.order_number}</div>
  <div style="font-size:8px;color:#666">${now.toLocaleDateString('ar-SA')} | ${now.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</div>
</div>

<div class="row2"><span class="lbl">العميل</span><span class="val">${t.customer_name}</span></div>
<div class="row2"><span class="lbl">الجوال</span><span class="val" style="direction:ltr">${t.customer_phone}</span></div>
<hr class="divider"/>
<div class="row2"><span class="lbl">الجهاز</span><span class="val">${t.brand} ${t.model}</span></div>
${t.imei?`<div class="row2"><span class="lbl">IMEI</span><span class="val" style="direction:ltr;font-family:monospace">${t.imei}</span></div>`:''}
${t.color?`<div class="row2"><span class="lbl">اللون</span><span class="val">${t.color}</span></div>`:''}
<hr class="divider"/>

${parts.length > 0 ? `
<div style="font-size:9px;font-weight:700;margin-bottom:3px">القطع المستبدلة:</div>
${parts.map(p=>`
  <div class="row2">
    <span>${p.part_name}${p.quantity>1?` ×${p.quantity}`:''}</span>
    <span style="direction:ltr">${(parseFloat(p.unit_price)*parseFloat(p.quantity)).toLocaleString('ar-SA')} ر</span>
  </div>`).join('')}
<hr class="divider"/>
` : ''}

<div class="row2"><span class="lbl">أجرة الإصلاح</span><span class="val">${lc.toLocaleString('ar-SA')} ر</span></div>
<div class="row2"><span class="lbl">قطع الغيار</span><span class="val">${pc.toLocaleString('ar-SA')} ر</span></div>
${disc>0?`<div class="row2"><span class="lbl">خصم</span><span class="val" style="color:#16a34a">- ${disc.toLocaleString('ar-SA')} ر</span></div>`:''}
<div class="row2"><span class="lbl">قبل الضريبة</span><span class="val">${sub.toLocaleString('ar-SA')} ر</span></div>
<div class="row2"><span class="lbl">ضريبة 15%</span><span class="val">${vat.toLocaleString('ar-SA')} ر</span></div>
<div class="total-row"><span>الإجمالي</span><span style="direction:ltr">${tot.toLocaleString('ar-SA')} ريال</span></div>
${paid>0?`<div class="row2"><span class="lbl" style="color:#16a34a">مدفوع</span><span class="val" style="color:#16a34a">${paid.toLocaleString('ar-SA')} ر</span></div>`:''}
${bal>0?`<div class="row2"><span class="lbl" style="color:#dc2626;font-weight:700">المتبقي</span><span class="val" style="color:#dc2626">${bal.toLocaleString('ar-SA')} ر</span></div>`:''}

<div style="text-align:center;margin:5px 0">
  ${bal<=0?'<div class="paid-stamp">✓ مدفوع بالكامل</div>':'<div class="paid-stamp" style="border-color:#dc2626;color:#dc2626">متبقي</div>'}
</div>

<div class="row2"><span class="lbl">طريقة الدفع</span>
  <span class="val">${PAY_LABELS[payMethod]||payMethod}</span></div>

<hr class="divider-solid"/>

<div style="font-size:9px;font-weight:700;margin-bottom:3px">✍️ توقيع العميل (استلمت جهازي سليماً):</div>
<div class="sig-box">_________________________________</div>

${qr?`<div style="text-align:center;margin-top:6px">
  <img src="${qr}" style="width:45px;height:45px;display:block;margin:0 auto 2px"/>
  <div style="font-size:7px;color:#888">${trackUrl}</div>
</div>`:''}

${shop?.invoice_terms?`<div class="footer">${shop.invoice_terms}</div>`:''}
${shop?.invoice_footer?`<div style="font-size:8px;color:#555;text-align:center;margin-top:3px">${shop.invoice_footer}</div>`:''}
</body></html>`
  }

  const doPrint = async () => {
    const html = await buildDeliveryHTML()
    printWindow(html, 380, 700)
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'start' }}>
      {/* معاينة */}
      <div className="card" style={{ padding:0 }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontWeight:600, color:'var(--text-2)' }}>معاينة وصل التسليم</span>
        </div>
        <div style={{ background:'#e8e8e8', padding:16, display:'flex', justifyContent:'center', minHeight:300 }}>
          {t ? (
            <div style={{ background:'#fff', padding:14, fontFamily:'Arial', fontSize:10,
              width:(shop?.receipt_width||80)*3.78, direction:'rtl', lineHeight:1.7, minHeight:400 }}>
              <div style={{ textAlign:'center', borderBottom:'2px solid #000', paddingBottom:6, marginBottom:8 }}>
                <div style={{ fontSize:16, fontWeight:700 }}>{shop?.shop_name||'FixPro'}</div>
                <div style={{ display:'inline-block', background:'#000', color:'#fff', padding:'2px 10px', borderRadius:3, fontSize:9, margin:'4px 0' }}>وصل تسليم</div>
                <div style={{ fontSize:16, fontWeight:900, letterSpacing:2 }}>{t.order_number}</div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, marginBottom:3 }}>
                <span style={{ color:'#555' }}>العميل</span><span>{t.customer_name}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, marginBottom:3 }}>
                <span style={{ color:'#555' }}>الجهاز</span><span>{t.brand} {t.model}</span></div>
              <hr style={{ border:'none', borderTop:'1px dashed #666', margin:'5px 0' }}/>
              {parts.map((p,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:9, marginBottom:2 }}>
                  <span>{p.part_name}</span>
                  <span>{parseFloat(p.unit_price).toLocaleString('ar-SA')} ر</span>
                </div>
              ))}
              <hr style={{ border:'none', borderTop:'2px solid #000', margin:'5px 0' }}/>
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:11 }}>
                <span>الإجمالي</span>
                <span>{(inv ? parseFloat(inv.total||0) : 0).toLocaleString('ar-SA')} ريال</span>
              </div>
              <div style={{ textAlign:'center', marginTop:10, border:'1px solid #000',
                padding:'5px 0', fontSize:8, color:'#aaa' }}>توقيع العميل</div>
            </div>
          ) : (
            <div style={{ color:'#999', textAlign:'center', paddingTop:60 }}>
              <CheckSquare size={36} style={{ margin:'0 auto 12px', display:'block', opacity:.3 }}/>
              اختر تذكرة للمعاينة
            </div>
          )}
        </div>
      </div>

      {/* أزرار */}
      <div style={{ display:'flex', flexDirection:'column', gap:10, minWidth:200 }}>
        {isLoading && t && <div style={{ fontSize:12, color:'var(--muted)' }}>جاري تحميل البيانات...</div>}

        <div>
          <label className="form-label">أجرة الإصلاح (ر.س)</label>
          <input className="form-input" type="number" min="0" step="0.01"
            value={laborCost} onChange={e=>setLaborCost(e.target.value)}
            placeholder={inv?.labor_cost||'0'}/>
        </div>
        <div>
          <label className="form-label">طريقة الدفع</label>
          <select className="form-select" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>
            <option value="cash">نقد</option>
            <option value="card">بطاقة بنكية</option>
            <option value="bank_transfer">تحويل بنكي</option>
            <option value="mada">مدى</option>
            <option value="stc_pay">STC Pay</option>
            <option value="apple_pay">Apple Pay</option>
          </select>
        </div>

        {inv && (
          <div style={{ padding:10, background:'var(--ink-3)', borderRadius:6, fontSize:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ color:'var(--muted)' }}>الإجمالي</span>
              <strong>{parseFloat(inv.total||0).toLocaleString('ar-SA')} ر</strong>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ color:'var(--green)' }}>مدفوع</span>
              <strong style={{ color:'var(--green)' }}>{parseFloat(inv.paid_amount||0).toLocaleString('ar-SA')} ر</strong>
            </div>
            {parseFloat(inv.balance_due||0) > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--red)' }}>متبقي</span>
                <strong style={{ color:'var(--red)' }}>{parseFloat(inv.balance_due).toLocaleString('ar-SA')} ر</strong>
              </div>
            )}
          </div>
        )}

        <button className="btn btn-primary" style={{ justifyContent:'center' }}
          disabled={!t} onClick={doPrint}>
          <Printer size={14}/> طباعة وصل التسليم
        </button>

        <div style={{ padding:'8px 10px', background:'var(--blue-dim)', borderRadius:6, fontSize:11, color:'var(--blue)' }}>
          💡 يحتوي الوصل على:<br/>
          • تفاصيل الإصلاح والقطع<br/>
          • المبالغ والضريبة<br/>
          • خانة توقيع العميل<br/>
          • QR code التتبع
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// ملصق التذكرة
// ══════════════════════════════════════════════════════════
function LabelTab({ ticket: t, shop }) {
  const [copies, setCopies] = useState(1)
  const lw = shop?.label_width  || 50
  const lh = shop?.label_height || 25

  const doPrint = () => {
    if (!t) { toast.error('اختر تذكرة أولاً'); return }
    const labelsHtml = Array.from({ length: copies }, () => `
      <div class="label">
        <div class="order">${t.order_number}</div>
        <div class="device">${t.brand} ${t.model}${t.color?' | '+t.color:''}</div>
        <div class="cust">${t.customer_name} | ${t.customer_phone}</div>
        <div class="date">${new Date(t.received_at||Date.now()).toLocaleDateString('ar-SA')} | ${shop?.shop_name||'FixPro'}</div>
      </div>`).join('')

    const win = window.open('', '_blank', 'width=300,height=400')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{direction:rtl;font-family:Arial,sans-serif}
  .label{width:${lw}mm;height:${lh}mm;border:0.5px solid #000;padding:2mm;
    display:flex;flex-direction:column;justify-content:space-between;
    page-break-after:always;overflow:hidden}
  .order{font-size:${lh>20?11:9}px;font-weight:900;letter-spacing:1px;text-align:center}
  .device{font-size:${lh>20?8:7}px;text-align:center;overflow:hidden;white-space:nowrap}
  .cust{font-size:${lh>20?8:7}px;text-align:center}
  .date{font-size:7px;text-align:center;color:#666}
  @media print{@page{margin:2mm;size:${lw}mm ${lh}mm}}
</style></head><body>${labelsHtml}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'start' }}>
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <span style={{ fontWeight:600, color:'var(--text-2)' }}>معاينة الملصق ({lw}×{lh}mm)</span>
          <button className="btn btn-primary" onClick={doPrint} disabled={!t}>
            <Printer size={13}/> طباعة
          </button>
        </div>
        <div style={{ background:'#e8e8e8', padding:24, display:'flex', justifyContent:'center', borderRadius:8 }}>
          {t ? (
            <div style={{ width:lw*3.78, height:lh*3.78, border:'1px solid #333', padding:6,
              display:'flex', flexDirection:'column', justifyContent:'space-between',
              background:'#fff', fontFamily:'Arial', direction:'rtl' }}>
              <div style={{ fontWeight:900, fontSize:13, letterSpacing:2, textAlign:'center' }}>{t.order_number}</div>
              <div style={{ fontSize:9, textAlign:'center', overflow:'hidden', whiteSpace:'nowrap' }}>
                {t.brand} {t.model}{t.color?` | ${t.color}`:''}
              </div>
              <div style={{ fontSize:9, textAlign:'center' }}>{t.customer_name} | {t.customer_phone}</div>
              <div style={{ fontSize:8, textAlign:'center', color:'#555' }}>
                {new Date(t.received_at||Date.now()).toLocaleDateString('ar-SA')} | {shop?.shop_name||'FixPro'}
              </div>
            </div>
          ) : (
            <div style={{ color:'#999', textAlign:'center', paddingTop:40 }}>
              <Tag size={32} style={{ margin:'0 auto 10px', display:'block', opacity:.3 }}/>
              اختر تذكرة لعرض الملصق
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ minWidth:180 }}>
        <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:12 }}>خيارات الملصق</div>
        <div style={{ marginBottom:12 }}>
          <label className="form-label">عدد النسخ</label>
          <input className="form-input" type="number" min={1} max={20} value={copies}
            onChange={e=>setCopies(Number(e.target.value))}/>
        </div>
        <div style={{ padding:'8px 10px', background:'var(--ink-3)', borderRadius:6,
          fontSize:11, color:'var(--muted-2)', marginBottom:12 }}>
          الحجم: <strong style={{ color:'var(--text-2)' }}>{lw}×{lh}mm</strong><br/>
          <span style={{ fontSize:10 }}>غيّره من إعدادات المحل</span>
        </div>
        <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}
          onClick={doPrint} disabled={!t}>
          <Printer size={14}/> طباعة {copies > 1 ? copies+' نسخ' : 'الملصق'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// باركود القطع — مع باركود حقيقي
// ══════════════════════════════════════════════════════════
function PartsTab({ parts, shop }) {
  const [selected, setSelected] = useState([])
  const [search, setSearch]     = useState('')
  const [copies, setCopies]     = useState(1)
  const [showPrice, setShowPrice]   = useState(true)
  const [showBarcode, setShowBarcode] = useState(true)
  const lw = shop?.label_width  || 50
  const lh = shop?.label_height || 25

  const filtered = parts.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku||'').toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode||'').includes(search)
  )

  const toggle    = (id) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id])
  const selectAll = () => setSelected(filtered.map(p=>p.id))
  const clearAll  = () => setSelected([])

  const doPrint = () => {
    if (!selected.length) { toast.error('اختر قطعة على الأقل'); return }

    const selectedParts = parts.filter(p => selected.includes(p.id))

    // توليد الباركودات كـ data URLs في الذاكرة
    const barcodeMap = {}
    if (showBarcode) {
      selectedParts.forEach(p => {
        const barcodeValue = p.barcode || p.sku || p.id.slice(0,8).toUpperCase()
        const url = generateBarcode(barcodeValue, {
          width: 1.2, height: Math.min(lh * 1.8, 30),
          displayValue: true, fontSize: 7, margin: 2
        })
        if (url) barcodeMap[p.id] = { url, value: barcodeValue }
      })
    }

    const labelsHtml = selectedParts.flatMap(p =>
      Array.from({ length: copies }, () => {
        const bc = barcodeMap[p.id]
        return `<div class="label">
          <div class="name">${p.name}</div>
          ${bc ? `<img src="${bc.url}" style="max-width:100%;height:${Math.min(lh*1.5,28)}px;display:block;margin:0 auto"/>` : ''}
          ${!bc && (p.sku||p.barcode) ? `<div class="sku">${p.barcode||p.sku}</div>` : ''}
          ${showPrice && p.sell_price ? `<div class="price">${parseFloat(p.sell_price).toLocaleString('ar-SA')} ر.س</div>` : ''}
          <div class="shop">${shop?.shop_name||'FixPro'}</div>
        </div>`
      })
    ).join('')

    const win = window.open('', '_blank', 'width=500,height=700')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ملصقات القطع</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;direction:rtl}
  .label{width:${lw}mm;height:${lh}mm;border:0.5px solid #000;padding:1.5mm;
    display:flex;flex-direction:column;justify-content:space-between;
    page-break-after:always;overflow:hidden;align-items:center}
  .name{font-size:${lh>20?9:8}px;font-weight:700;text-align:center;line-height:1.2;width:100%}
  .sku{font-size:8px;text-align:center;font-family:monospace;color:#444}
  .price{font-size:${lh>20?12:10}px;font-weight:900;text-align:center;color:#000}
  .shop{font-size:7px;text-align:center;color:#888}
  @media print{@page{margin:1mm;size:${lw}mm ${lh}mm}body{padding:0}}
</style></head><body>${labelsHtml}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 600)
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'start' }}>
      {/* قائمة القطع */}
      <div className="card" style={{ padding:0 }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:600, color:'var(--text-2)' }}>
            القطع ({selected.length} محددة من {filtered.length})
          </span>
          <div style={{ display:'flex', gap:6 }}>
            <button className="btn btn-ghost btn-sm" onClick={selectAll}>الكل</button>
            <button className="btn btn-ghost btn-sm" onClick={clearAll}>إلغاء</button>
          </div>
        </div>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)' }}>
          <input className="form-input" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="بحث بالاسم أو SKU أو الباركود..."/>
        </div>
        <div style={{ maxHeight:420, overflowY:'auto' }}>
          {filtered.map(p => (
            <label key={p.id} style={{ display:'flex', alignItems:'center', gap:12,
              padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)',
              background: selected.includes(p.id) ? 'var(--blue-dim)' : 'transparent' }}>
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500, color:'var(--text-2)' }}>{p.name}</div>
                <div style={{ fontSize:11, color:'var(--muted-2)', display:'flex', gap:10, marginTop:2 }}>
                  {p.sku && <span style={{ fontFamily:'var(--mono)' }}>SKU: {p.sku}</span>}
                  {p.barcode && <span style={{ fontFamily:'var(--mono)' }}>📷 {p.barcode}</span>}
                  {p.sell_price && <span style={{ color:'var(--blue)' }}>{parseFloat(p.sell_price).toLocaleString('ar-SA')} ر</span>}
                  <span style={{ color:'var(--muted)' }}>الكمية: {p.quantity}</span>
                </div>
              </div>
            </label>
          ))}
          {!filtered.length && (
            <div style={{ textAlign:'center', padding:30, color:'var(--muted)', fontSize:13 }}>
              لا توجد نتائج
            </div>
          )}
        </div>
      </div>

      {/* خيارات الطباعة */}
      <div className="card" style={{ minWidth:200, display:'grid', gap:12 }}>
        <div style={{ fontWeight:600, color:'var(--text-2)' }}>خيارات الطباعة</div>

        <div style={{ padding:'8px 10px', background:'var(--ink-3)', borderRadius:6, fontSize:11, color:'var(--muted-2)' }}>
          حجم الملصق: <strong style={{ color:'var(--text-2)' }}>{lw}×{lh}mm</strong>
        </div>

        <div>
          <label className="form-label">عدد نسخ كل قطعة</label>
          <input className="form-input" type="number" min={1} max={50} value={copies}
            onChange={e=>setCopies(Number(e.target.value))}/>
        </div>

        {/* خيارات المحتوى */}
        <div style={{ display:'grid', gap:6 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
            <input type="checkbox" checked={showBarcode} onChange={e=>setShowBarcode(e.target.checked)}/>
            إظهار الباركود
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
            <input type="checkbox" checked={showPrice} onChange={e=>setShowPrice(e.target.checked)}/>
            إظهار السعر
          </label>
        </div>

        {selected.length > 0 && (
          <div style={{ padding:'8px 10px', background:'var(--blue-dim)', borderRadius:6,
            fontSize:12, color:'var(--blue)', textAlign:'center' }}>
            إجمالي الملصقات: <strong>{selected.length * copies}</strong>
          </div>
        )}

        <button className="btn btn-primary" style={{ justifyContent:'center' }}
          disabled={!selected.length} onClick={doPrint}>
          <Printer size={14}/> طباعة الملصقات
        </button>

        {/* معاينة ملصق قطعة */}
        {selected.length > 0 && (() => {
          const p = parts.find(x => x.id === selected[0])
          if (!p) return null
          const barcodeUrl = showBarcode ? generateBarcode(
            p.barcode || p.sku || p.id.slice(0,8).toUpperCase(),
            { width:1.2, height:25, displayValue:true, fontSize:7, margin:2 }
          ) : null
          return (
            <div style={{ marginTop:4 }}>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}>معاينة:</div>
              <div style={{ width:lw*3.78, height:lh*3.78, border:'1px solid #333',
                padding:5, display:'flex', flexDirection:'column', justifyContent:'space-between',
                background:'#fff', fontFamily:'Arial', alignItems:'center', overflow:'hidden' }}>
                <div style={{ fontSize:Math.max(8,lh*0.35), fontWeight:700, textAlign:'center', lineHeight:1.2 }}>{p.name}</div>
                {barcodeUrl && <img src={barcodeUrl} style={{ maxWidth:'100%', height:Math.min(lh*1.5,28) }} alt="barcode"/>}
                {showPrice && p.sell_price && <div style={{ fontSize:Math.max(9,lh*0.45), fontWeight:900 }}>{parseFloat(p.sell_price).toLocaleString('ar-SA')} ر.س</div>}
                <div style={{ fontSize:7, color:'#888' }}>{shop?.shop_name||'FixPro'}</div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
