import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Printer, CheckCircle } from 'lucide-react'
import api from '../services/api'
import { generateQR, buildTrackUrl } from '../utils/printUtils'

/**
 * وصل تسليم الجهاز للعميل — يظهر قبل تأكيد "تم التسليم"
 * يحتوي على: بيانات المحل، العميل، الجهاز، القطع، السعر، الضمان
 */
export default function DeliveryReceipt({ ticket: t, onConfirm, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [printed, setPrinted] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [invoiceError, setInvoiceError] = useState(null)

  // حفظ الفاتورة — يُرجع true إذا نجح وإلا يحفظ الخطأ
  const saveInvoice = async () => {
    try {
      await api.post(`/invoices/ticket/${t.id}/finalize`, {
        labor_cost: 0, discount: 0,
        notes: `وصل تسليم — ${new Date().toLocaleDateString('ar-SA')}`
      })
      return true
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'فشل حفظ الفاتورة'
      setInvoiceError(msg)
      return false
    }
  }

  // تأكيد التسليم — يُوقف إذا فشلت الفاتورة
  const handleConfirm = async () => {
    setInvoiceError(null)
    setSaving(true)
    const ok = await saveInvoice()
    setSaving(false)
    if (!ok) return   // ❌ لا يُغلق — لا تتحول لـ delivered
    onConfirm()       // ✅ فقط عند نجاح الفاتورة
  }

  // بيانات المحل
  const { data: shopData } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api.get('/shop-settings'),
  })
  const shop = shopData?.data || {}

  // القطع المستخدمة في التذكرة
  const { data: partsData } = useQuery({
    queryKey: ['ticket-parts', t.id],
    queryFn: () => api.get(`/tickets/${t.id}/parts`),
  })
  const parts = partsData?.data || []

  // الفاتورة إن وجدت
  const { data: invoiceData } = useQuery({
    queryKey: ['ticket-invoice', t.id],
    queryFn: () => api.get(`/invoices/ticket/${t.id}`),
    retry: false,
  })
  const inv = invoiceData?.data?.invoice || null

  // توليد QR
  useEffect(() => {
    if (!t || !shop) return
    const url = buildTrackUrl(shop, t.order_number)
    generateQR(url, 80).then(setQrDataUrl)
  }, [t, shop])

  const partsCost = parts.reduce((s, p) => s + Number(p.unit_price) * Number(p.quantity), 0)
  // الحساب الصحيح: القطع + 15% ضريبة فوقها
  const base     = partsCost || Number(t.estimated_cost) || 0
  const vat      = +(base * 0.15).toFixed(2)
  const finalCost = +(base + vat).toFixed(2)
  const warrantyDays = t.warranty_days || shop.default_warranty_days || 30

  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
  const warrantyEnd = new Date(now.getTime() + warrantyDays * 24 * 60 * 60 * 1000)
  const warrantyEndStr = warrantyEnd.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })

  // ── بناء HTML الوصل للطباعة ──────────────────────────────
  const buildHTML = () => {
    const partsRows = parts.map(p => `
      <tr>
        <td>${p.part_name || '—'}</td>
        <td style="text-align:center">${p.quantity}</td>
        <td style="text-align:left;direction:ltr">${Number(p.unit_price).toLocaleString('ar-SA')} ر.س</td>
        <td style="text-align:left;direction:ltr;font-weight:700">${(Number(p.unit_price) * Number(p.quantity)).toLocaleString('ar-SA')} ر.س</td>
      </tr>`).join('')

    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
    <meta charset="UTF-8">
    <title>وصل تسليم — ${t.order_number}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;padding:12mm;direction:rtl}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111;padding-bottom:10px;margin-bottom:12px}
      .shop-name{font-size:20px;font-weight:900}
      .badge{background:#111;color:#fff;padding:4px 12px;border-radius:4px;font-size:13px;font-weight:700}
      .section{margin-bottom:12px}
      .section-title{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#555;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:8px}
      .row{display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px}
      .lbl{color:#666}.val{font-weight:600}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      th{background:#111;color:#fff;padding:5px 8px;text-align:right;font-size:10px;font-weight:600}
      td{padding:5px 8px;border-bottom:1px solid #eee;font-size:10px}
      .total-box{border:2px solid #111;padding:10px 14px;margin-top:10px;border-radius:4px}
      .total-row{display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px}
      .grand-total{font-size:16px;font-weight:900;border-top:2px solid #111;padding-top:6px;margin-top:6px}
      .warranty-box{background:#f0fdf4;border:1.5px solid #16a34a;border-radius:6px;padding:10px 14px;margin-top:12px}
      .warranty-title{color:#16a34a;font-weight:900;font-size:13px;margin-bottom:6px}
      .warranty-row{font-size:10px;color:#166534;margin-bottom:3px}
      .sign-box{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}
      .sign-line{border-top:1px solid #999;padding-top:4px;text-align:center;font-size:9px;color:#666;margin-top:24px}
      .footer{text-align:center;font-size:9px;color:#666;border-top:1px dashed #ccc;padding-top:8px;margin-top:12px;line-height:1.6}
      .qr-section{display:flex;align-items:center;gap:12px;margin-top:10px}
      @media print{@page{margin:8mm}body{padding:0}}
    </style>
    </head><body>

    <!-- الرأس -->
    <div class="header">
      <div>
        ${shop.logo_url ? `<img src="${shop.logo_url}" style="max-height:45px;margin-bottom:4px;display:block"/>` : ''}
        <div class="shop-name">${shop.shop_name || 'FixPro للصيانة'}</div>
        ${shop.address ? `<div style="font-size:10px;color:#666;margin-top:2px">📍 ${shop.city || ''} — ${shop.address}</div>` : ''}
        ${shop.phone ? `<div style="font-size:10px;color:#666">📞 ${shop.phone}</div>` : ''}
        ${shop.tax_number ? `<div style="font-size:10px;color:#888">الرقم الضريبي: ${shop.tax_number}</div>` : ''}
      </div>
      <div style="text-align:left">
        <div class="badge">وصل تسليم جهاز</div>
        <div style="margin-top:8px;font-family:monospace;font-size:16px;font-weight:900">${t.order_number}</div>
        <div style="font-size:10px;color:#666;margin-top:3px">${dateStr}</div>
      </div>
    </div>

    <!-- بيانات العميل والجهاز -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px">
      <div class="section">
        <div class="section-title">بيانات العميل</div>
        <div class="row"><span class="lbl">الاسم:</span><span class="val">${t.customer_name}</span></div>
        <div class="row"><span class="lbl">الجوال:</span><span class="val" style="direction:ltr">${t.customer_phone}</span></div>
        ${t.customer_email ? `<div class="row"><span class="lbl">البريد:</span><span class="val">${t.customer_email}</span></div>` : ''}
      </div>
      <div class="section">
        <div class="section-title">بيانات الجهاز</div>
        <div class="row"><span class="lbl">الجهاز:</span><span class="val">${t.brand} ${t.model}</span></div>
        ${t.color ? `<div class="row"><span class="lbl">اللون:</span><span class="val">${t.color}</span></div>` : ''}
        ${t.imei ? `<div class="row"><span class="lbl">IMEI/S/N:</span><span class="val" style="direction:ltr;font-family:monospace">${t.imei}</span></div>` : ''}
      </div>
    </div>

    <!-- تفاصيل الصيانة -->
    <div class="section">
      <div class="section-title">تفاصيل الصيانة</div>
      <div class="row"><span class="lbl">المشكلة المُبلَّغة:</span><span class="val">${t.problem_desc || '—'}</span></div>

      <div class="row"><span class="lbl">تاريخ الاستلام:</span><span class="val">${new Date(t.received_at || Date.now()).toLocaleDateString('ar-SA')}</span></div>
      <div class="row"><span class="lbl">تاريخ التسليم:</span><span class="val">${dateStr}</span></div>
    </div>

    <!-- القطع المستخدمة -->
    ${parts.length > 0 ? `
    <div class="section">
      <div class="section-title">القطع والمواد المستخدمة</div>
      <table>
        <thead><tr><th>البيان</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>${partsRows}</tbody>
      </table>
    </div>` : ''}

    <!-- الإجمالي -->
    <div class="total-box">
      ${parts.length > 0 ? `<div class="total-row"><span>إجمالي القطع:</span><span>${partsCost.toLocaleString('ar-SA')} ر.س</span></div>` : ''}
      <div class="total-row"><span>ضريبة القيمة المضافة (15%):</span><span>${vat.toLocaleString('ar-SA')} ر.س</span></div>
      <div class="total-row grand-total">
        <span>المبلغ الإجمالي:</span>
        <span>${finalCost.toLocaleString('ar-SA')} ر.س</span>
      </div>
    </div>

    <!-- الضمان -->
    <div class="warranty-box">
      <div class="warranty-title">✅ شهادة ضمان الصيانة</div>
      <div class="warranty-row">📅 مدة الضمان: <strong>${warrantyDays} يوماً</strong> من تاريخ التسليم</div>
      <div class="warranty-row">📅 تاريخ انتهاء الضمان: <strong>${warrantyEndStr}</strong></div>
      <div class="warranty-row" style="margin-top:6px;font-size:9px;color:#166534">
        ${shop.warranty_terms || `يشمل الضمان عيوب التركيب والقطع المستبدلة فقط. لا يشمل الكسر أو الأضرار الخارجية أو دخول السوائل.`}
      </div>
    </div>

    <!-- التوقيعات -->
    <div class="sign-box">
      <div>
        <div class="sign-line">توقيع المحل</div>
      </div>
      <div>
        <div class="sign-line">توقيع العميل — استلمت جهازي بحالة جيدة</div>
      </div>
    </div>

    <!-- QR والتذييل -->
    <div class="qr-section">
      ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:60px;height:60px"/>` : ''}
      <div>
        <div style="font-size:9px;color:#888">تتبع حالة جهازك</div>
        <div style="font-size:9px;font-family:monospace;color:#555">${buildTrackUrl(shop, t.order_number)}</div>
      </div>
    </div>

    <div class="footer">
      ${shop.invoice_terms || 'شكراً لثقتكم — نسعد بخدمتكم دائماً'}
      ${shop.invoice_footer ? `<br/>${shop.invoice_footer}` : ''}
    </div>

    </body></html>`
  }

  // ── الطباعة ───────────────────────────────────────────────
  const print = () => {
    const html = buildHTML()
    const win = window.open('', '_blank', 'width=900,height=1100')
    win.document.write(html)
    win.document.close()
    setTimeout(() => { win.print(); }, 600)
    setPrinted(true)
  }

  if (!t) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 500, padding: 20
    }}>
      <div style={{
        background: 'var(--ink-2)', borderRadius: 14, width: 'min(620px,96vw)',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,.5)'
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-2)' }}>
              📋 وصل تسليم الجهاز — {t.order_number}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              يجب طباعة الوصل أو تأكيد التسليم قبل إغلاق التذكرة
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* المحتوى */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ملخص التذكرة */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'العميل', val: t.customer_name },
              { label: 'الجوال', val: t.customer_phone },
              { label: 'الجهاز', val: `${t.brand} ${t.model}` },
              { label: 'المشكلة', val: t.problem_desc || '—' },
            ].map((r, i) => (
              <div key={i} style={{ background: 'var(--ink-3)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{r.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{r.val}</div>
              </div>
            ))}
          </div>

          {/* القطع */}
          {parts.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                القطع المستخدمة
              </div>
              {parts.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--ink-3)', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-2)' }}>{p.part_name} × {p.quantity}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
                    {(Number(p.unit_price) * Number(p.quantity)).toLocaleString('ar-SA')} ر
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* الإجمالي */}
          <div style={{ background: 'var(--ink-3)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 900, color: 'var(--blue)' }}>
              <span>المبلغ الإجمالي</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{finalCost.toLocaleString('ar-SA')} ريال</span>
            </div>
          </div>

          {/* الضمان */}
          <div style={{ background: 'rgba(16,185,129,.06)', border: '1.5px solid rgba(16,185,129,.3)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 6, fontSize: 13 }}>
              ✅ ضمان الصيانة
            </div>
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
              مدة الضمان: <strong>{warrantyDays} يوماً</strong> — حتى {warrantyEndStr}
            </div>
          </div>

        </div>

        {/* أزرار */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={print}>
            <Printer size={14} /> طباعة وصل التسليم
          </button>
          <button
            className="btn"
            style={{
              flex: 1, justifyContent: 'center',
              background: printed ? 'var(--green)' : 'var(--ink-3)',
              color: printed ? '#fff' : 'var(--text-2)',
              border: `1px solid ${printed ? 'var(--green)' : 'var(--border)'}`,
            }}
            onClick={handleConfirm}
            disabled={saving}
          >
            <CheckCircle size={14} />
            {saving ? 'جاري الحفظ...' : printed ? 'تأكيد التسليم ✅' : 'تأكيد بدون طباعة'}
          </button>
        </div>

        {/* رسالة خطأ الفاتورة */}
        {invoiceError && (
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: 'rgba(239,68,68,.08)',
            border: '1px solid rgba(239,68,68,.3)',
            borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start'
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, color: '#EF4444', fontSize: 12, marginBottom: 2 }}>
                فشل حفظ الفاتورة — لم يتم التسليم
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                {invoiceError}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                يرجى التواصل مع المدير أو المحاسب لحل المشكلة قبل التسليم.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
