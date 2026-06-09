
// ── بناء رابط التتبع الصحيح ──────────────────────────────
export function buildTrackUrl(shop, orderNumber) {
  const base = shop?.track_url || ''
  const isDev = window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1'

  if (isDev) {
    // في التطوير: استخدم localhost
    return `${window.location.origin}/track/${orderNumber}`
  }

  // في الإنتاج: استخدم رابط المحل
  if (!base) return `${window.location.origin}/track/${orderNumber}`
  const clean = base.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${clean}/${orderNumber}`
}

import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'

// ── توليد Barcode كـ Data URL (SVG → PNG) ────────────────
export function generateBarcode(value, opts = {}) {
  if (!value) return null
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, String(value), {
      format:      opts.format      || 'CODE128',
      width:       opts.width       || 1.5,
      height:      opts.height      || 35,
      displayValue: opts.displayValue !== false,
      fontSize:    opts.fontSize    || 10,
      margin:      opts.margin      || 4,
      background:  '#ffffff',
      lineColor:   '#000000',
      ...opts
    })
    return canvas.toDataURL('image/png')
  } catch (e) {
    console.warn('Barcode error:', e)
    return null
  }
}
import jsPDF from 'jspdf'

// ── توليد QR Code كـ Data URL ─────────────────────────────
export async function generateQR(text, size = 120) {
  try {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' }
    })
  } catch { return null }
}

// ── رأس الفاتورة HTML ─────────────────────────────────────
export function buildReceiptHeader(shop, orderNum, dateStr, timeStr) {
  return `
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px">
      ${shop.logo_url ? `<img src="${shop.logo_url}" style="max-height:45px;display:block;margin:0 auto 4px;object-fit:contain"/>` : ''}
      <div style="font-size:16px;font-weight:700">${shop.shop_name || 'FixPro للصيانة'}</div>
      ${shop.shop_name_en ? `<div style="font-size:10px;color:#555">${shop.shop_name_en}</div>` : ''}
      ${shop.address ? `<div style="font-size:9px;color:#666">${shop.city || ''} ${shop.address}</div>` : ''}
      ${shop.phone ? `<div style="font-size:9px;color:#666">📞 ${shop.phone}${shop.phone2 ? ' | ' + shop.phone2 : ''}</div>` : ''}
      ${shop.tax_number ? `<div style="font-size:8px;color:#888">الرقم الضريبي: ${shop.tax_number}</div>` : ''}
      <div style="font-size:18px;font-weight:900;margin:5px 0;letter-spacing:2px">${orderNum}</div>
      <div style="font-size:9px;color:#666">${dateStr} | ${timeStr}</div>
    </div>
  `
}

// ── إنشاء PDF للوصل ──────────────────────────────────────
export async function generateReceiptPDF(ticket, shop) {
  const trackUrl = buildTrackUrl(shop, ticket.order_number)
  const qrDataUrl = await generateQR(trackUrl, 100)

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [(shop?.receipt_width || 80), 200]
  })

  const W = shop?.receipt_width || 80
  const margin = 5
  let y = margin

  const text = (str, x, yPos, opts = {}) => {
    if (!str) return
    pdf.setFontSize(opts.size || 10)
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    pdf.text(String(str), x, yPos, { align: opts.align || 'right', ...opts })
  }

  const line = (yPos, dashed = false) => {
    if (dashed) {
      pdf.setLineDashPattern([1, 1], 0)
    } else {
      pdf.setLineDashPattern([], 0)
    }
    pdf.setLineWidth(0.3)
    pdf.line(margin, yPos, W - margin, yPos)
    pdf.setLineDashPattern([], 0)
  }

  // الشعار
  if (shop?.logo_url && shop.logo_url.startsWith('data:image')) {
    try {
      const imgType = shop.logo_url.includes('png') ? 'PNG' : 'JPEG'
      pdf.addImage(shop.logo_url, imgType, W/2 - 15, y, 30, 15)
      y += 17
    } catch {}
  }

  // اسم المحل
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text(shop?.shop_name || 'FixPro للصيانة', W / 2, y, { align: 'center' })
  y += 5

  if (shop?.address) {
    text(shop.address, W / 2, y, { size: 8, align: 'center' }); y += 4
  }
  if (shop?.phone) {
    text(`Tel: ${shop.phone}`, W / 2, y, { size: 8, align: 'center' }); y += 4
  }

  // رقم الأوردر
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text(ticket.order_number, W / 2, y, { align: 'center' })
  y += 5

  const now = new Date()
  text(`${now.toLocaleDateString('en-SA')} ${now.toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' })}`,
    W / 2, y, { size: 8, align: 'center' })
  y += 3

  line(y); y += 3

  // بيانات العميل
  const row = (label, val) => {
    if (!val) return
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.text(label + ':', W - margin, y, { align: 'right' })
    pdf.text(String(val), margin, y, { align: 'left' })
    y += 4
  }

  row('Customer', ticket.customer_name)
  row('Mobile', ticket.customer_phone)
  line(y, true); y += 3
  row('Device', `${ticket.brand} ${ticket.model}`)
  if (ticket.color) row('Color', ticket.color)
  if (ticket.imei)  row('IMEI', ticket.imei)
  line(y, true); y += 3

  // المشكلة
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Problem:', W - margin, y, { align: 'right' })
  y += 4
  pdf.setFont('helvetica', 'normal')
  const problemLines = pdf.splitTextToSize(ticket.problem_desc || '', W - margin * 2)
  pdf.text(problemLines, W - margin, y, { align: 'right' })
  y += problemLines.length * 4

  if (ticket.physical_condition) {
    row('Condition', ticket.physical_condition)
  }
  if (ticket.accessories) {
    row('Accessories', ticket.accessories)
  }

  line(y, true); y += 3
  row('Technician', ticket.technician_name || 'TBD')
  row('Est. Cost', ticket.estimated_cost ? `${ticket.estimated_cost} SAR` : 'TBD')
  row('Warranty', `${ticket.warranty_days || 30} days`)

  line(y); y += 4

  // QR Code
  if (qrDataUrl) {
    const qrSize = 20
    pdf.addImage(qrDataUrl, 'PNG', W / 2 - qrSize / 2, y, qrSize, qrSize)
    y += qrSize + 2
    text(trackUrl, W / 2, y, { size: 6, align: 'center' })
    y += 4
  }

  // الشروط
  if (shop?.invoice_terms) {
    line(y, true); y += 3
    pdf.setFontSize(6)
    pdf.setFont('helvetica', 'normal')
    const termLines = pdf.splitTextToSize(shop.invoice_terms, W - margin * 2)
    pdf.text(termLines, W / 2, y, { align: 'center' })
  }

  return pdf
}

// ── إنشاء HTML للطباعة المباشرة ──────────────────────────
export async function buildReceiptHTML(ticket, shop, qrDataUrl) {
  const W = shop?.receipt_width || 80
  const trackUrl = `${shop?.track_url || 'fixpro.sa/track'}/${ticket.order_number}`
  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })

  const Row = (label, val, mono = false) =>
    val ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:10px">
             <span style="color:#555">${label}:</span>
             <span style="font-weight:500;font-family:${mono ? 'monospace' : 'inherit'};direction:ltr;text-align:left">${val}</span>
           </div>` : ''

  return `
    <!DOCTYPE html><html lang="ar" dir="rtl"><head>
    <meta charset="UTF-8">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#000;direction:rtl;width:${W}mm;margin:0 auto;padding:4mm}
      .divider{border:none;border-top:1px dashed #000;margin:4px 0}
      .divider-solid{border:none;border-top:2px solid #000;margin:5px 0}
      @media print{@page{margin:3mm;size:${W}mm auto}body{width:100%}}
    </style></head><body>
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px">
      ${shop?.logo_url ? `<img src="${shop.logo_url}" style="max-height:45px;display:block;margin:0 auto 5px;object-fit:contain"/>` : ''}
      <div style="font-size:16px;font-weight:700">${shop?.shop_name || 'FixPro للصيانة'}</div>
      ${shop?.shop_name_en ? `<div style="font-size:10px;color:#555">${shop.shop_name_en}</div>` : ''}
      ${shop?.address ? `<div style="font-size:9px;color:#666">${shop.city || ''} — ${shop.address}</div>` : ''}
      ${shop?.phone ? `<div style="font-size:9px;color:#666">📞 ${shop.phone}${shop.phone2 ? ' | ' + shop.phone2 : ''}</div>` : ''}
      ${shop?.tax_number ? `<div style="font-size:8px;color:#888">الرقم الضريبي: ${shop.tax_number}</div>` : ''}
      <div style="font-size:18px;font-weight:900;margin:5px 0;letter-spacing:2px">${ticket.order_number}</div>
      <div style="font-size:9px;color:#666">${dateStr} | ${timeStr}</div>
    </div>

    ${Row('العميل', ticket.customer_name)}
    ${Row('الجوال', ticket.customer_phone, true)}
    <hr class="divider"/>
    ${Row('الجهاز', `${ticket.brand} ${ticket.model}`)}
    ${Row('اللون', ticket.color)}
    ${Row('IMEI', ticket.imei, true)}
    <hr class="divider"/>
    <div style="margin-bottom:3px;font-size:10px">
      <div style="color:#555;margin-bottom:2px">المشكلة:</div>
      <div>${ticket.problem_desc || ''}</div>
    </div>
    ${ticket.physical_condition ? Row('حالة الجهاز', ticket.physical_condition) : ''}
    ${ticket.accessories ? Row('الملحقات', ticket.accessories) : ''}
    <hr class="divider"/>
    ${Row('الفني', ticket.technician_name || 'سيتم التحديد')}
    ${Row('التكلفة التقديرية', ticket.estimated_cost ? `${ticket.estimated_cost} ريال` : 'سيتم التقدير')}
    ${Row('ضمان الإصلاح', `${ticket.warranty_days || 30} يوم`)}
    <hr class="divider-solid"/>

    <div style="text-align:center;margin:5px 0">
      ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:55px;height:55px;display:block;margin:0 auto 3px"/>` : ''}
      <div style="font-family:monospace;font-size:13px;font-weight:900;letter-spacing:2px">${ticket.order_number}</div>
      <div style="font-size:8px;color:#888">${trackUrl}</div>
    </div>

    ${shop?.invoice_terms ? `<hr class="divider"/><div style="font-size:8px;color:#666;text-align:center;line-height:1.5">${shop.invoice_terms}</div>` : ''}
    ${shop?.invoice_footer ? `<div style="font-size:9px;color:#555;text-align:center;margin-top:4px">${shop.invoice_footer}</div>` : ''}
    </body></html>
  `
}
