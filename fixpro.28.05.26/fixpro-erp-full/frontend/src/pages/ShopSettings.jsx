import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import toast from 'react-hot-toast'
import { Upload, Save, Building, Phone, Printer, Receipt } from 'lucide-react'

export default function ShopSettings() {
  const qc = useQueryClient()
  const logoRef = useRef()
  const [form, setForm] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)

  // v5: لا onSuccess — نستخدم useEffect بدلاً
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api.get('/shop-settings'),
    retry: 1,
  })

  useEffect(() => {
    if (data?.data && !form) {
      const s = data.data
      setForm({
        shop_name:      s.shop_name      || '',
        shop_name_en:   s.shop_name_en   || '',
        phone:          s.phone          || '',
        phone2:         s.phone2         || '',
        email:          s.email          || '',
        address:        s.address        || '',
        city:           s.city           || '',
        tax_number:     s.tax_number     || '',
        website:        s.website        || '',
        invoice_footer: s.invoice_footer || '',
        invoice_terms:  s.invoice_terms  || 'الشركة غير مسؤولة عن الأجهزة المتروكة أكثر من 30 يوماً. الضمان يشمل نفس الإصلاح فقط.',
        track_url:      s.track_url      || 'fixpro.sa/track',
        receipt_width:  s.receipt_width  || 80,
        label_width:    s.label_width    || 50,
        label_height:   s.label_height   || 25,
      })
      if (s.logo_url) setLogoPreview(s.logo_url)
    }
  }, [data])

  const f = form || {}
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const save = useMutation({
    mutationFn: () => api.put('/shop-settings', form),
    onSuccess: () => {
      toast.success('تم حفظ إعدادات المحل ✅')
      qc.invalidateQueries({ queryKey: ['shop-settings'] })
    },
    onError: err => toast.error(err?.message || 'خطأ في الحفظ')
  })

  const uploadLogo = useMutation({
    mutationFn: (file) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1]
        api.post('/shop-settings/logo', { logo_base64: base64, mime_type: file.type })
          .then(resolve).catch(reject)
      }
      reader.readAsDataURL(file)
    }),
    onSuccess: (d) => {
      setLogoPreview(d.logo_url)
      qc.invalidateQueries({ queryKey: ['shop-settings'] })
      toast.success('تم رفع الشعار ✅')
    },
    onError: () => toast.error('خطأ في رفع الشعار')
  })

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) { toast.error('الشعار يجب أن يكون أقل من 500KB'); return }
    const reader = new FileReader()
    reader.onload = (e) => setLogoPreview(e.target.result)
    reader.readAsDataURL(file)
    uploadLogo.mutate(file)
  }

  if (isLoading) return (
    <div className="page"><div className="loading-spinner" /></div>
  )

  if (isError) return (
    <div className="page">
      <div className="card" style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
        <div style={{ color:'var(--red)', fontWeight:500, marginBottom:8 }}>
          خطأ في تحميل إعدادات المحل
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
          {error?.message || 'تأكد من تشغيل Migration 003 في Supabase'}
        </div>
        <button className="btn btn-primary" onClick={() => qc.invalidateQueries({ queryKey: ['shop-settings'] })}>
          إعادة المحاولة
        </button>
      </div>
    </div>
  )

  if (!form) return <div className="page"><div className="loading-spinner" /></div>

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">إعدادات المحل</div>
          <div className="page-sub">البيانات التي تظهر على الفواتير والوصولات</div>
        </div>
        <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save size={14} /> {save.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>

      <div className="two-col">
        {/* الشعار */}
        <div className="card">
          <div className="card-title mb-3">شعار المحل</div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div
              style={{
                width:160, height:120, borderRadius:10,
                border:'2px dashed var(--border-2)', background:'var(--ink-3)',
                display:'flex', alignItems:'center', justifyContent:'center',
                overflow:'hidden', cursor:'pointer'
              }}
              onClick={() => logoRef.current?.click()}
            >
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
                : <div style={{ textAlign:'center', color:'var(--muted)' }}>
                    <Upload size={28} style={{ margin:'0 auto 8px', display:'block' }} />
                    <div style={{ fontSize:12 }}>انقر لرفع الشعار</div>
                  </div>
              }
            </div>
            <input ref={logoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogoChange} />
            <button className="btn btn-ghost btn-sm" onClick={() => logoRef.current?.click()} disabled={uploadLogo.isPending}>
              <Upload size={13} /> {uploadLogo.isPending ? 'جاري الرفع...' : 'رفع شعار'}
            </button>
            <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center' }}>
              PNG أو JPG — حد أقصى 500KB
            </div>
          </div>
        </div>

        {/* اسم المحل */}
        <div className="card">
          <div className="card-title mb-3">
            <Building size={14} style={{ display:'inline', marginLeft:6 }} />
            بيانات المحل
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="form-group">
              <label className="form-label">اسم المحل (عربي) *</label>
              <input className="form-input" value={f.shop_name}
                onChange={e => set('shop_name', e.target.value)}
                placeholder="FixPro للصيانة" />
            </div>
            <div className="form-group">
              <label className="form-label">اسم المحل (إنجليزي)</label>
              <input className="form-input" value={f.shop_name_en}
                onChange={e => set('shop_name_en', e.target.value)}
                placeholder="FixPro Maintenance" dir="ltr" />
            </div>
            <div className="form-group">
              <label className="form-label">الرقم الضريبي (VAT)</label>
              <input className="form-input" value={f.tax_number}
                onChange={e => set('tax_number', e.target.value)}
                placeholder="300XXXXXXXXX1003" dir="ltr" />
            </div>
          </div>
        </div>
      </div>

      {/* معلومات التواصل */}
      <div className="card mt-3">
        <div className="card-title mb-3">
          <Phone size={14} style={{ display:'inline', marginLeft:6 }} />
          معلومات التواصل
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          <div className="form-group">
            <label className="form-label">الهاتف الرئيسي</label>
            <input className="form-input" value={f.phone} onChange={e => set('phone', e.target.value)} dir="ltr" />
          </div>
          <div className="form-group">
            <label className="form-label">الهاتف الثانوي</label>
            <input className="form-input" value={f.phone2} onChange={e => set('phone2', e.target.value)} dir="ltr" />
          </div>
          <div className="form-group">
            <label className="form-label">البريد الإلكتروني</label>
            <input className="form-input" value={f.email} onChange={e => set('email', e.target.value)} dir="ltr" />
          </div>
          <div className="form-group">
            <label className="form-label">المدينة</label>
            <input className="form-input" value={f.city} onChange={e => set('city', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn:'2/-1' }}>
            <label className="form-label">العنوان التفصيلي</label>
            <input className="form-input" value={f.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">الموقع الإلكتروني</label>
            <input className="form-input" value={f.website} onChange={e => set('website', e.target.value)} dir="ltr" />
          </div>
          <div className="form-group" style={{ gridColumn:'2/-1' }}>
            <label className="form-label">رابط تتبع الجهاز</label>
            <input className="form-input" value={f.track_url}
              onChange={e => set('track_url', e.target.value)}
              placeholder="fixpro.sa/track" dir="ltr" />
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
              يُستخدم في QR Code على الوصل — العميل يمسحه ليرى حالة جهازه
            </div>
          </div>
        </div>
      </div>

      {/* نصوص الفاتورة */}
      <div className="card mt-3">
        <div className="card-title mb-3">
          <Receipt size={14} style={{ display:'inline', marginLeft:6 }} />
          نصوص الفاتورة والوصل
        </div>
        <div className="form-grid">
          <div className="form-group form-full">
            <label className="form-label">الشروط والأحكام (تظهر أسفل كل وصل)</label>
            <textarea className="form-textarea" rows={3} value={f.invoice_terms}
              onChange={e => set('invoice_terms', e.target.value)} />
          </div>
          <div className="form-group form-full">
            <label className="form-label">ذيل الفاتورة</label>
            <textarea className="form-textarea" rows={2} value={f.invoice_footer}
              onChange={e => set('invoice_footer', e.target.value)}
              placeholder="شكراً لثقتك بنا" />
          </div>
        </div>
      </div>

      {/* إعدادات الطباعة */}
      <div className="card mt-3">
        <div className="card-title mb-3">
          <Printer size={14} style={{ display:'inline', marginLeft:6 }} />
          إعدادات الطباعة
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          <div className="form-group">
            <label className="form-label">عرض الوصل</label>
            <select className="form-select" value={f.receipt_width}
              onChange={e => set('receipt_width', Number(e.target.value))}>
              <option value={58}>58mm (صغير)</option>
              <option value={80}>80mm (قياسي)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">حجم ملصق الباركود</label>
            <select className="form-select"
              value={`${f.label_width}x${f.label_height}`}
              onChange={e => {
                const [w, h] = e.target.value.split('x')
                set('label_width', Number(w))
                set('label_height', Number(h))
              }}>
              <option value="25x15">25×15mm</option>
              <option value="50x25">50×25mm (قياسي)</option>
              <option value="50x30">50×30mm</option>
              <option value="60x40">60×40mm</option>
            </select>
          </div>
        </div>
      </div>

      {/* معاينة رأس الوصل */}
      <div className="card mt-3">
        <div className="card-title mb-3">معاينة رأس الوصل</div>
        <div style={{ background:'#f5f5f5', padding:16, borderRadius:8, maxWidth:320, margin:'0 auto' }}>
          <div style={{
            fontFamily:'Arial', fontSize:11, color:'#000',
            textAlign:'center', borderBottom:'2px solid #000',
            paddingBottom:6, marginBottom:6
          }}>
            {logoPreview && (
              <img src={logoPreview} alt="logo"
                style={{ maxHeight:45, display:'block', margin:'0 auto 5px', objectFit:'contain' }} />
            )}
            <div style={{ fontSize:15, fontWeight:700 }}>{f.shop_name || 'اسم المحل'}</div>
            {f.shop_name_en && <div style={{ fontSize:10, color:'#555' }}>{f.shop_name_en}</div>}
            {(f.city || f.address) && (
              <div style={{ fontSize:9, color:'#666' }}>{f.city} — {f.address}</div>
            )}
            {f.phone && (
              <div style={{ fontSize:9, color:'#666' }}>
                📞 {f.phone}{f.phone2 ? ` | ${f.phone2}` : ''}
              </div>
            )}
            {f.tax_number && (
              <div style={{ fontSize:8, color:'#888' }}>VAT: {f.tax_number}</div>
            )}
          </div>
          <div style={{ fontSize:9, color:'#aaa', textAlign:'center' }}>... محتوى الوصل ...</div>
          {f.invoice_terms && (
            <div style={{ fontSize:8, color:'#666', textAlign:'center', marginTop:6, borderTop:'1px dashed #000', paddingTop:4 }}>
              {f.invoice_terms.substring(0, 80)}{f.invoice_terms.length > 80 ? '...' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
