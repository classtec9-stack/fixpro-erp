import { useEffect, useRef, useState } from 'react'
import { X, Printer, Tag, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { generateQR, buildTrackUrl } from '../utils/printUtils'

// ── إعدادات الطابعات المحفوظة ─────────────────────────────
const getPrinterSettings = () => {
  try { return JSON.parse(localStorage.getItem('printerSettings') || '{}') }
  catch { return {} }
}

export default function ReceiptPrint({ ticket: t, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [showPrinterSettings, setShowPrinterSettings] = useState(false)
  const [printers, setPrinters] = useState(getPrinterSettings())
  const receiptRef = useRef()
  const labelRef   = useRef()

  const { data: shopData } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api.get('/shop-settings')
  })
  const shop = shopData?.data || {}

  const { data: printerData } = useQuery({
    queryKey: ['printer-settings'],
    queryFn: () => api.get('/printers/settings'),
    retry: false
  })
  const savedPrinters = printerData?.data || {}

  // توليد QR
  useEffect(() => {
    if (!t) return
    const url = buildTrackUrl(shop, t.order_number)
    generateQR(url, 100).then(setQrDataUrl)
  }, [t, shop?.track_url])

  const savePrinterSettings = (key, val) => {
    const s = { ...printers, [key]: val }
    setPrinters(s)
    localStorage.setItem('printerSettings', JSON.stringify(s))
  }

  // ── طباعة الوصل فقط ──────────────────────────────────────
  const printReceipt = () => {
    const W = shop?.receipt_width || 80
    const now = new Date()
    const dateStr = now.toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' })
    const timeStr = now.toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit' })

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
      <meta charset="UTF-8">
      <title>وصل - ${t.order_number}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#000;direction:rtl;width:${W}mm;margin:0 auto;padding:4mm}
        .row{display:flex;justify-content:space-between;margin-bottom:3px;font-size:10px}
        .lbl{color:#555}.val{font-weight:500;direction:ltr;text-align:left;font-family:monospace}
        .hr{border:none;border-top:1px dashed #000;margin:4px 0}
        .hr2{border:none;border-top:2px solid #000;margin:5px 0}
        .center{text-align:center}
        @media print{@page{margin:3mm;size:${W}mm auto}body{width:100%}}
      </style></head><body>
      <div class="center" style="border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px">
        ${shop?.logo_url ? `<img src="${shop.logo_url}" style="max-height:40px;display:block;margin:0 auto 4px;object-fit:contain"/>` : ''}
        <div style="font-size:16px;font-weight:700">${shop?.shop_name || 'FixPro للصيانة'}</div>
        ${shop?.shop_name_en ? `<div style="font-size:10px;color:#555">${shop.shop_name_en}</div>` : ''}
        ${shop?.address ? `<div style="font-size:9px;color:#666">${shop.city||''} — ${shop.address}</div>` : ''}
        ${shop?.phone ? `<div style="font-size:9px;color:#666">📞 ${shop.phone}${shop.phone2?' | '+shop.phone2:''}</div>` : ''}
        ${shop?.tax_number ? `<div style="font-size:8px;color:#888">الرقم الضريبي: ${shop.tax_number}</div>` : ''}
        <div style="font-size:18px;font-weight:900;margin:5px 0;letter-spacing:2px">${t.order_number}</div>
        <div style="font-size:9px;color:#666">${dateStr} | ${timeStr}</div>
      </div>
      <div class="row"><span class="lbl">العميل:</span><span class="val">${t.customer_name}</span></div>
      <div class="row"><span class="lbl">الجوال:</span><span class="val">${t.customer_phone}</span></div>
      <hr class="hr"/>
      <div class="row"><span class="lbl">الجهاز:</span><span class="val">${t.brand} ${t.model}</span></div>
      ${t.color ? `<div class="row"><span class="lbl">اللون:</span><span class="val">${t.color}</span></div>` : ''}
      ${t.imei  ? `<div class="row"><span class="lbl">IMEI:</span><span class="val">${t.imei}</span></div>` : ''}
      <hr class="hr"/>
      <div style="font-size:10px;margin-bottom:3px"><span style="color:#555">المشكلة:</span></div>
      <div style="font-size:10px;margin-bottom:4px">${t.problem_desc || ''}</div>
      ${t.physical_condition ? `<div class="row"><span class="lbl">حالة الجهاز:</span><span class="val">${t.physical_condition}</span></div>` : ''}
      ${t.accessories ? `<div class="row"><span class="lbl">الملحقات:</span><span class="val">${t.accessories}</span></div>` : ''}
      <hr class="hr"/>
      <div class="row"><span class="lbl">الفني:</span><span class="val">${t.technician_name||'سيتم التحديد'}</span></div>
      <div class="row"><span class="lbl">التكلفة التقديرية:</span><span class="val">${t.estimated_cost ? t.estimated_cost+' ريال' : 'سيتم التقدير'}</span></div>
      <div class="row"><span class="lbl">ضمان الإصلاح:</span><span class="val">${t.warranty_days||30} يوم</span></div>
      <hr class="hr2"/>
      <div class="center" style="margin:5px 0">
        ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:55px;height:55px;display:block;margin:0 auto 3px"/>` : ''}
        <div style="font-family:monospace;font-size:13px;font-weight:900;letter-spacing:2px">${t.order_number}</div>
        <div style="font-size:8px;color:#888">${buildTrackUrl(shop, t.order_number)}</div>
      </div>
      ${shop?.invoice_terms ? `<hr class="hr"/><div style="font-size:8px;color:#666;text-align:center;line-height:1.5">${shop.invoice_terms}</div>` : ''}
      ${shop?.invoice_footer ? `<div style="font-size:9px;color:#555;text-align:center;margin-top:3px">${shop.invoice_footer}</div>` : ''}
      </body></html>`

    const win = window.open('', '_blank', 'width=450,height=700')
    win.document.write(html)
    win.document.close()
    setTimeout(() => { win.print(); }, 600)
  }

  // ── طباعة الباركود فقط (منفصل) ───────────────────────────
  const printLabel = () => {
    const lw = shop?.label_width  || 50
    const lh = shop?.label_height || 25
    const isLarge = lh >= 30

    const html = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8"><title>باركود - ${t.order_number}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{direction:rtl;font-family:Arial,sans-serif}
        .label{width:${lw}mm;height:${lh}mm;border:0.5px solid #000;padding:1.5mm 2mm;
          display:grid;grid-template-rows:auto auto auto auto ${isLarge?'auto ':''};
          overflow:hidden;gap:0.5mm}
        .shop{font-size:7px;color:#555;text-align:center;font-weight:600}
        .order{font-size:${isLarge?12:10}px;font-weight:900;letter-spacing:1.5px;text-align:center;color:#000}
        .customer{font-size:${isLarge?8:7}px;text-align:center;font-weight:600}
        .phone{font-size:7px;text-align:center;font-family:monospace;color:#333;direction:ltr}
        .problem{font-size:7px;text-align:center;color:#555;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
        .amount{font-size:${isLarge?9:8}px;text-align:center;font-weight:900;color:#000}
        .device{font-size:7px;text-align:center;color:#444}
        .divider{border-top:0.5px solid #ccc;margin:0.3mm 0}
        @media print{@page{margin:1mm;size:${lw}mm ${lh}mm}body{width:${lw}mm}}
      </style></head><body>
      <div class="label">
        <div class="shop">${shop?.shop_name||'FixPro للصيانة'}</div>
        <div class="divider"></div>
        <div class="order">${t.order_number}</div>
        <div class="customer">${t.customer_name}</div>
        <div class="phone">${t.customer_phone}</div>
        ${isLarge ? `<div class="device">${t.brand} ${t.model}${t.color?' | '+t.color:''}</div>` : ''}
        ${t.problem_desc ? `<div class="problem">${(t.problem_desc||'').slice(0,35)}</div>` : ''}
        ${t.estimated_cost ? `<div class="amount">${Number(t.estimated_cost).toLocaleString('ar-SA')} ر.س</div>` : ''}
        <div class="divider"></div>
        <div class="device" style="font-size:6px;color:#888">${new Date(t.received_at||Date.now()).toLocaleDateString('ar-SA')}</div>
      </div>
      </body></html>`

    const win = window.open('', '_blank', 'width:300,height:280')
    win.document.write(html)
    win.document.close()
    setTimeout(() => { win.print(); }, 400)
  }

  if (!t) return null

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:20 }}>
      <div style={{ background:'var(--ink-2)', borderRadius:'var(--radius-lg)', maxWidth:520, width:'100%', border:'1px solid var(--border-2)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontWeight:600, color:'var(--text-2)' }}>
            طباعة تذكرة — {t.order_number}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-icon" onClick={() => setShowPrinterSettings(!showPrinterSettings)} title="إعدادات الطابعات">
              <Settings size={15}/>
            </button>
            <button className="btn-icon" onClick={onClose}><X size={16}/></button>
          </div>
        </div>

        {/* إعدادات الطابعات */}
        {showPrinterSettings && (
          <div style={{ padding:'14px 18px', background:'var(--ink-3)', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontWeight:500, color:'var(--text-2)', marginBottom:12, fontSize:13 }}>
              ⚙️ تعيين الطابعات
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">طابعة الفواتير والوصولات</label>
                <input className="form-input" value={printers.receiptPrinter || ''}
                  onChange={e => savePrinterSettings('receiptPrinter', e.target.value)}
                  placeholder="اسم الطابعة الحرارية (80mm)" />
              </div>
              <div className="form-group">
                <label className="form-label">طابعة الباركود والملصقات</label>
                <input className="form-input" value={printers.labelPrinter || ''}
                  onChange={e => savePrinterSettings('labelPrinter', e.target.value)}
                  placeholder="اسم طابعة الملصقات" />
              </div>
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
              💡 عند الطباعة سيُطلب منك اختيار الطابعة من نافذة الطباعة. أدخل الاسم هنا للتذكير فقط.
            </div>
          </div>
        )}

        {/* معلومات التذكرة */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, fontSize:13 }}>
            <div>
              <div className="text-xs text-muted">العميل</div>
              <div style={{ fontWeight:500, color:'var(--text-2)' }}>{t.customer_name}</div>
              <div className="text-xs text-muted2">{t.customer_phone}</div>
            </div>
            <div>
              <div className="text-xs text-muted">الجهاز</div>
              <div style={{ fontWeight:500, color:'var(--text-2)' }}>{t.brand} {t.model}</div>
              {t.color && <div className="text-xs text-muted2">{t.color}</div>}
            </div>
            <div>
              <div className="text-xs text-muted">الطابعة المحددة للوصل</div>
              <div style={{ fontSize:11, color: printers.receiptPrinter ? 'var(--green)' : 'var(--amber)' }}>
                {printers.receiptPrinter || 'لم تُحدد — ستُطلب عند الطباعة'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">طابعة الباركود</div>
              <div style={{ fontSize:11, color: printers.labelPrinter ? 'var(--green)' : 'var(--amber)' }}>
                {printers.labelPrinter || 'لم تُحدد — ستُطلب عند الطباعة'}
              </div>
            </div>
          </div>
        </div>

        {/* أزرار الطباعة */}
        <div style={{ padding:'18px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {/* طباعة الوصل */}
          <div style={{ border:'1px solid var(--border)', borderRadius:10, padding:'16px', textAlign:'center' }}>
            <Printer size={28} style={{ color:'var(--blue)', margin:'0 auto 8px', display:'block' }}/>
            <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:4, fontSize:13 }}>وصل الاستلام</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>
              {shop?.receipt_width||80}mm — مع QR Code
              {(savedPrinters.receipt_printer || printers.receiptPrinter) && <><br/><span style={{ color:'var(--green)' }}>🖨️ {savedPrinters.receipt_printer || printers.receiptPrinter}</span></>}
            </div>
            <button className="btn btn-primary w-full" style={{ justifyContent:'center' }} onClick={printReceipt}>
              <Printer size={13}/> طباعة الوصل
            </button>
          </div>

          {/* طباعة الباركود */}
          <div style={{ border:'1px solid var(--border)', borderRadius:10, padding:'16px', textAlign:'center' }}>
            <Tag size={28} style={{ color:'var(--purple)', margin:'0 auto 8px', display:'block' }}/>
            <div style={{ fontWeight:600, color:'var(--text-2)', marginBottom:4, fontSize:13 }}>ملصق الباركود</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>
              {shop?.label_width||50}×{shop?.label_height||25}mm — للصق على الجهاز
              {(savedPrinters.label_printer || printers.labelPrinter) && <><br/><span style={{ color:'var(--green)' }}>🖨️ {savedPrinters.label_printer || printers.labelPrinter}</span></>}
            </div>
            <button className="btn w-full" style={{ justifyContent:'center', background:'rgba(139,92,246,.15)', color:'var(--purple)', border:'1px solid rgba(139,92,246,.3)' }} onClick={printLabel}>
              <Tag size={13}/> طباعة الملصق
            </button>
          </div>

          {/* طباعة الاثنين */}
          <div style={{ gridColumn:'1/-1' }}>
            <button className="btn btn-ghost w-full" style={{ justifyContent:'center' }}
              onClick={() => { printReceipt(); setTimeout(printLabel, 1000) }}>
              طباعة الوصل والملصق معاً (نافذتان منفصلتان)
            </button>
          </div>
        </div>

        <div style={{ padding:'0 18px 14px', textAlign:'center', fontSize:11, color:'var(--muted)' }}>
          كل نافذة طباعة ستفتح منفصلة — اختر الطابعة المناسبة من كل نافذة
        </div>
      </div>
    </div>
  )
}
