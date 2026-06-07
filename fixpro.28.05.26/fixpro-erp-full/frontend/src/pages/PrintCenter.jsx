import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { Loading } from '../components/ui'
import { Printer, Tag, Package, FileText, Search, Download, Send } from 'lucide-react'
import { generateQR, generateReceiptPDF, buildReceiptHTML, buildTrackUrl } from '../utils/printUtils'
import toast from 'react-hot-toast'

export default function PrintCenter() {
  const [tab, setTab] = useState('receipt')
  const [ticketSearch, setTicketSearch] = useState('')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const previewRef = useRef()

  const { data: shopData } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api.get('/shop-settings')
  })
  const shop = shopData?.data || {}

  const { data: ticketsData } = useQuery({
    queryKey: ['tickets-search', ticketSearch],
    queryFn: () => api.get(`/tickets?search=${ticketSearch}&limit=10`),
    enabled: ticketSearch.length > 2
  })

  const { data: partsData } = useQuery({
    queryKey: ['parts-all'],
    queryFn: () => api.get('/inventory/parts?limit=200')
  })

  const tickets = ticketsData?.data || []
  const parts   = partsData?.data  || []

  // توليد QR + معاينة عند اختيار تذكرة
  useEffect(() => {
    if (!selectedTicket) return
    const trackUrl = buildTrackUrl(shop, selectedTicket.order_number)
    generateQR(trackUrl, 120).then(qr => {
      setQrUrl(qr)
      buildReceiptHTML(selectedTicket, shop, qr).then(html => setPreviewHtml(html))
    })
  }, [selectedTicket, shop])

  // طباعة الوصل
  const printReceipt = () => {
    if (!previewHtml) return
    const win = window.open('', '_blank', 'width=400,height=700')
    win.document.write(previewHtml)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  // طباعة الملصق
  const printLabel = () => {
    if (!selectedTicket) return
    const t = selectedTicket
    const lw = shop?.label_width  || 50
    const lh = shop?.label_height || 25
    const labelsHtml = `
      <div class="label">
        <div class="order">${t.order_number}</div>
        <div class="device">${t.brand} ${t.model}${t.color ? ' | ' + t.color : ''}</div>
        <div class="cust">${t.customer_name} | ${t.customer_phone}</div>
        <div class="date">${new Date(t.received_at||Date.now()).toLocaleDateString('ar-SA')} | ${shop?.shop_name||'FixPro'}</div>
      </div>`
    const win = window.open('', '_blank', 'width=300,height=400')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ملصق</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{direction:rtl;font-family:Arial,sans-serif}
        .label{width:${lw}mm;height:${lh}mm;border:0.5px solid #000;padding:2mm;
          display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
        .order{font-size:${lh>20?11:9}px;font-weight:900;letter-spacing:1px;text-align:center}
        .device{font-size:${lh>20?8:7}px;text-align:center;overflow:hidden;white-space:nowrap}
        .cust{font-size:${lh>20?8:7}px;text-align:center}
        .date{font-size:7px;text-align:center;color:#666}
        @media print{@page{margin:2mm;size:${lw}mm ${lh}mm}}
      </style></head><body>${labelsHtml}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  // طباعة الوصل والملصق معاً
  const printBoth = () => {
    if (!previewHtml || !selectedTicket) return
    printReceipt()
    setTimeout(() => { printLabel() }, 1200)
  }

  // تحميل PDF
  const downloadPDF = async () => {
    if (!selectedTicket) return
    try {
      const pdf = await generateReceiptPDF(selectedTicket, shop)
      pdf.save(`${selectedTicket.order_number}.pdf`)
      toast.success('تم تحميل PDF')
    } catch(e) {
      toast.error('خطأ في توليد PDF: ' + e.message)
    }
  }

  // فتح واتساب مع الفاتورة
  const sendWhatsApp = async () => {
    if (!selectedTicket) return
    const trackUrl = buildTrackUrl(shop, selectedTicket.order_number)
    const msg = encodeURIComponent(
      `عزيزي ${selectedTicket.customer_name}،\n` +
      `تم استلام جهازك للصيانة.\n` +
      `رقم تذكرتك: *${selectedTicket.order_number}*\n` +
      `يمكنك متابعة حالة جهازك من الرابط:\n${trackUrl}\n\n` +
      `${shop?.shop_name || 'FixPro للصيانة'}`
    )
    const phone = selectedTicket.customer_phone?.replace(/[^0-9]/g, '')
    const waUrl = `https://wa.me/966${phone?.replace(/^0/, '')}?text=${msg}`
    window.open(waUrl, '_blank')
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">مركز الطباعة</div>
          <div className="page-sub">طباعة الوصولات والفواتير والباركود</div>
        </div>
      </div>

      {/* تبويبات */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {[
          { id:'receipt', label:'وصل الاستلام',    icon: Printer },
          { id:'label',   label:'ملصق الباركود',   icon: Tag },
          { id:'parts',   label:'باركود القطع',    icon: Package },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'9px 16px', background:'none', border:'none', cursor:'pointer',
            fontSize:13, fontFamily:'var(--font)',
            color: tab===t.id ? 'var(--blue)' : 'var(--muted-2)',
            borderBottom: tab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom:-1, transition:'all .15s'
          }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* اختيار التذكرة */}
      {(tab === 'receipt' || tab === 'label') && (
        <div className="card mb-4" style={{ padding:16 }}>
          <div className="form-group">
            <label className="form-label">ابحث عن التذكرة</label>
            <div className="search-wrap">
              <Search/>
              <input className="search-input" value={ticketSearch}
                onChange={e => setTicketSearch(e.target.value)}
                placeholder="رقم التذكرة / اسم العميل / IMEI..." />
            </div>
          </div>
          {tickets.length > 0 && (
            <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:4 }}>
              {tickets.map(t => (
                <div key={t.id} onClick={() => { setSelectedTicket(t); setTicketSearch('') }}
                  style={{
                    display:'flex', alignItems:'center', gap:12, padding:'8px 12px',
                    background: selectedTicket?.id===t.id ? 'var(--blue-dim)' : 'var(--ink-3)',
                    borderRadius:6, cursor:'pointer',
                    border:`1px solid ${selectedTicket?.id===t.id ? 'var(--blue)' : 'var(--border)'}`,
                  }}>
                  <span className="font-mono text-xs text-blue">{t.order_number}</span>
                  <span style={{ fontWeight:500, color:'var(--text-2)', fontSize:13 }}>{t.customer_name}</span>
                  <span className="text-sm text-muted2">{t.brand} {t.model}</span>
                  <span className="text-xs text-muted" style={{ marginRight:'auto' }}>{t.customer_phone}</span>
                </div>
              ))}
            </div>
          )}
          {selectedTicket && (
            <div style={{ marginTop:8, padding:'7px 12px', background:'var(--green-dim)', borderRadius:6, fontSize:12, color:'var(--green)' }}>
              ✅ {selectedTicket.order_number} — {selectedTicket.customer_name}
            </div>
          )}
        </div>
      )}

      {/* ── وصل الاستلام ── */}
      {tab === 'receipt' && (
        <div className="two-col">
          {/* معاينة */}
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div className="card-header" style={{ padding:'12px 16px' }}>
              <span className="card-title">معاينة الوصل</span>
            </div>
            <div style={{ background:'#e8e8e8', padding:16, minHeight:300, display:'flex', alignItems:'flex-start', justifyContent:'center' }}>
              {previewHtml
                ? <iframe
                    ref={previewRef}
                    srcDoc={previewHtml}
                    style={{ width: (shop?.receipt_width||80)*3.78, minHeight:400, border:'1px solid #ccc', background:'#fff' }}
                    title="معاينة الوصل"
                  />
                : <div style={{ color:'#999', fontSize:13, paddingTop:60, textAlign:'center' }}>
                    <Printer size={36} style={{ margin:'0 auto 12px', display:'block', opacity:.3 }}/>
                    اختر تذكرة لعرض المعاينة
                  </div>
              }
            </div>
          </div>

          {/* أزرار العمليات */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="card">
              <div className="card-title mb-3">إجراءات الطباعة</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <button className="btn btn-primary w-full" style={{ justifyContent:'center', padding:'10px' }}
                  onClick={printReceipt} disabled={!selectedTicket}>
                  <Printer size={15}/> طباعة الوصل
                </button>
                <button className="btn w-full" style={{ justifyContent:'center', padding:'10px', background:'var(--ink-3)', border:'1px solid var(--border)', color:'var(--text-2)' }}
                  onClick={printBoth} disabled={!selectedTicket}>
                  <Printer size={15}/> طباعة الوصل والملصق معاً
                </button>
                <button className="btn btn-ghost w-full" style={{ justifyContent:'center', padding:'10px' }}
                  onClick={downloadPDF} disabled={!selectedTicket}>
                  <Download size={15}/> تحميل PDF
                </button>
                <button className="btn w-full" style={{ justifyContent:'center', padding:'10px', background:'#25D366', color:'#fff', border:'none' }}
                  onClick={sendWhatsApp} disabled={!selectedTicket}>
                  <Send size={15}/> إرسال واتساب
                </button>
              </div>
            </div>

            {/* QR Code */}
            {qrUrl && (
              <div className="card" style={{ textAlign:'center' }}>
                <div className="card-title mb-2">QR رابط التتبع</div>
                <img src={qrUrl} alt="QR" style={{ width:100, height:100, margin:'0 auto 8px', display:'block' }}/>
                <div style={{ fontSize:11, color:'var(--muted)', wordBreak:'break-all' }}>
                  {selectedTicket ? buildTrackUrl(shop, selectedTicket.order_number) : ''}
                </div>
                <a href={qrUrl} download={`QR-${selectedTicket?.order_number}.png`}
                  className="btn btn-ghost btn-sm" style={{ marginTop:8, display:'inline-flex' }}>
                  <Download size={12}/> تحميل QR
                </a>
              </div>
            )}

            {/* إعدادات */}
            <div className="card" style={{ padding:12 }}>
              <div style={{ fontSize:11, color:'var(--muted-2)', lineHeight:2 }}>
                <div>📄 الوصل: <strong style={{ color:'var(--text-2)' }}>{shop?.receipt_width||80}mm</strong></div>
                <div>🏪 المحل: <strong style={{ color:'var(--text-2)' }}>{shop?.shop_name||'غير محدد'}</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ملصق الباركود ── */}
      {tab === 'label' && (
        <LabelTab ticket={selectedTicket} shop={shop} />
      )}

      {/* ── باركود القطع ── */}
      {tab === 'parts' && (
        <PartsTab parts={parts} shop={shop} />
      )}
    </div>
  )
}

// ── ملصق الباركود للتذاكر ─────────────────────────────────
function LabelTab({ ticket: t, shop }) {
  const [copies, setCopies] = useState(1)
  const lw = shop?.label_width  || 50
  const lh = shop?.label_height || 25

  const doPrint = () => {
    if (!t) { toast.error('اختر تذكرة أولاً'); return }
    const labelsHtml = Array.from({ length: copies }, () => `
      <div class="label">
        <div class="order">${t.order_number}</div>
        <div class="device">${t.brand} ${t.model}${t.color ? ' | ' + t.color : ''}</div>
        <div class="cust">${t.customer_name} | ${t.customer_phone}</div>
        <div class="date">${new Date(t.received_at||Date.now()).toLocaleDateString('ar-SA')} | ${shop?.shop_name||'FixPro'}</div>
      </div>
    `).join('')

    const win = window.open('', '_blank', 'width=300,height=400')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ملصق</title>
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
    <div className="two-col">
      <div className="card">
        <div className="card-header">
          <span className="card-title">معاينة الملصق ({lw}×{lh}mm)</span>
          <button className="btn btn-primary" onClick={doPrint}><Printer size={13}/> طباعة</button>
        </div>
        <div style={{ background:'#e8e8e8', padding:24, display:'flex', justifyContent:'center', borderRadius:8 }}>
          {t ? (
            <div style={{
              width: lw * 3.78, height: lh * 3.78,
              border:'1px solid #333', padding:6,
              display:'flex', flexDirection:'column', justifyContent:'space-between',
              background:'#fff', fontFamily:'Arial', direction:'rtl'
            }}>
              <div style={{ fontWeight:900, fontSize:13, letterSpacing:2, textAlign:'center' }}>{t.order_number}</div>
              <div style={{ fontSize:9, textAlign:'center', overflow:'hidden', whiteSpace:'nowrap' }}>
                {t.brand} {t.model}{t.color ? ` | ${t.color}` : ''}
              </div>
              <div style={{ fontSize:9, textAlign:'center' }}>{t.customer_name} | {t.customer_phone}</div>
              <div style={{ fontSize:8, textAlign:'center', color:'#555' }}>
                {new Date(t.received_at||Date.now()).toLocaleDateString('ar-SA')} | {shop?.shop_name||'FixPro'}
              </div>
            </div>
          ) : (
            <div style={{ color:'#999', fontSize:13, paddingTop:40, textAlign:'center' }}>
              <Tag size={32} style={{ margin:'0 auto 10px', display:'block', opacity:.3 }}/>
              اختر تذكرة لعرض الملصق
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title mb-3">خيارات الملصق</div>
        <div className="form-group mb-3">
          <label className="form-label">عدد النسخ</label>
          <input className="form-input" type="number" min={1} max={20} value={copies} onChange={e => setCopies(Number(e.target.value))}/>
        </div>
        <div style={{ marginBottom:12, padding:'8px 12px', background:'var(--ink-3)', borderRadius:6, fontSize:12, color:'var(--muted-2)' }}>
          حجم الملصق: <strong style={{ color:'var(--text-2)' }}>{lw}×{lh}mm</strong>
          <br/>غيّره من إعدادات المحل
        </div>
        <button className="btn btn-primary w-full" style={{ justifyContent:'center' }} onClick={doPrint} disabled={!t}>
          <Printer size={14}/> طباعة {copies} ملصق
        </button>
      </div>
    </div>
  )
}

// ── باركود قطع الغيار ─────────────────────────────────────
function PartsTab({ parts, shop }) {
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [copies, setCopies] = useState(1)
  const lw = shop?.label_width  || 50
  const lh = shop?.label_height || 25

  const filtered = parts.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku||'').toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id])

  const doPrint = () => {
    if (!selected.length) { toast.error('اختر قطعة على الأقل'); return }
    const selectedParts = parts.filter(p => selected.includes(p.id))
    const labelsHtml = selectedParts.flatMap(p =>
      Array.from({ length: copies }, () => `
        <div class="label">
          <div class="name">${p.name}</div>
          ${p.sku ? `<div class="sku">SKU: ${p.sku}</div>` : ''}
          <div class="price">${p.sell_price ? p.sell_price + ' ر' : ''}</div>
          <div class="shop">${shop?.shop_name||'FixPro'}</div>
        </div>
      `)
    ).join('')

    const win = window.open('', '_blank', 'width=400,height=600')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>باركود القطع</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{direction:rtl;font-family:Arial,sans-serif}
        .label{width:${lw}mm;height:${lh}mm;border:0.5px solid #000;padding:2mm;
          display:flex;flex-direction:column;justify-content:space-between;
          page-break-after:always;overflow:hidden}
        .name{font-size:${lh>20?9:8}px;font-weight:700;text-align:center;line-height:1.2}
        .sku{font-size:8px;text-align:center;color:#555;font-family:monospace}
        .price{font-size:${lh>20?11:9}px;font-weight:900;text-align:center}
        .shop{font-size:7px;text-align:center;color:#888}
        @media print{@page{margin:2mm;size:${lw}mm ${lh}mm}}
      </style></head><body>${labelsHtml}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  return (
    <div className="two-col">
      <div className="card">
        <div className="card-header">
          <span className="card-title">اختر القطع ({selected.length} محدد)</span>
          <div style={{ display:'flex', gap:6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(parts.map(p=>p.id))}>الكل</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>إلغاء</button>
          </div>
        </div>
        <div style={{ marginBottom:10 }}>
          <input className="form-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث..."/>
        </div>
        <div style={{ maxHeight:380, overflowY:'auto', display:'flex', flexDirection:'column', gap:4 }}>
          {filtered.map(p => (
            <label key={p.id} style={{
              display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
              background: selected.includes(p.id) ? 'var(--blue-dim)' : 'var(--ink-3)',
              borderRadius:6, cursor:'pointer',
              border:`1px solid ${selected.includes(p.id) ? 'var(--blue)' : 'var(--border)'}`,
            }}>
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} style={{ flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500, color:'var(--text-2)' }}>{p.name}</div>
                <div style={{ fontSize:11, color:'var(--muted-2)' }}>
                  {p.sku && <span className="font-mono">{p.sku}</span>}
                  {p.sell_price && <span style={{ marginRight:8, color:'var(--blue)' }}>{p.sell_price} ر</span>}
                  <span style={{ marginRight:8, color:'var(--muted)' }}>الكمية: {p.quantity}</span>
                </div>
              </div>
            </label>
          ))}
          {!filtered.length && <div style={{ textAlign:'center', padding:30, color:'var(--muted)', fontSize:13 }}>لا توجد نتائج</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-title mb-3">طباعة ملصقات القطع</div>
        <div style={{ marginBottom:12, padding:'10px 12px', background:'var(--ink-3)', borderRadius:6, fontSize:12, color:'var(--muted-2)' }}>
          حجم الملصق: <strong style={{ color:'var(--text-2)' }}>{lw}×{lh}mm</strong>
        </div>
        <div className="form-group mb-3">
          <label className="form-label">عدد نسخ كل قطعة</label>
          <input className="form-input" type="number" min={1} max={20} value={copies} onChange={e=>setCopies(Number(e.target.value))}/>
        </div>
        {selected.length > 0 && (
          <div style={{ marginBottom:12, padding:'8px 12px', background:'var(--blue-dim)', borderRadius:6, fontSize:12, color:'var(--blue)' }}>
            سيتم طباعة <strong>{selected.length * copies}</strong> ملصق
          </div>
        )}
        <button className="btn btn-primary w-full" style={{ justifyContent:'center' }} onClick={doPrint} disabled={!selected.length}>
          <Printer size={14}/> طباعة الملصقات
        </button>
      </div>
    </div>
  )
}
