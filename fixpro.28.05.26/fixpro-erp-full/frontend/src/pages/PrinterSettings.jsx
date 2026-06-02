import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import toast from 'react-hot-toast'
import { Printer, Tag, RefreshCw, CheckCircle, AlertCircle, Save } from 'lucide-react'

export default function PrinterSettings() {
  const qc = useQueryClient()
  const [receiptPrinter, setReceiptPrinter] = useState('')
  const [labelPrinter,   setLabelPrinter]   = useState('')
  const [initialized, setInitialized] = useState(false)

  // جلب الطابعات من الجهاز
  const { data: printersData, isLoading: loadingPrinters, refetch } = useQuery({
    queryKey: ['system-printers'],
    queryFn: () => api.get('/printers'),
    retry: false,
    staleTime: 0
  })

  // جلب الإعدادات المحفوظة
  const { data: settingsData } = useQuery({
    queryKey: ['printer-settings'],
    queryFn: () => api.get('/printers/settings')
  })

  useEffect(() => {
    if (settingsData?.data && !initialized) {
      setReceiptPrinter(settingsData.data.receipt_printer || '')
      setLabelPrinter(settingsData.data.label_printer || '')
      setInitialized(true)
    }
  }, [settingsData])

  const save = useMutation({
    mutationFn: () => api.put('/printers/settings', { receipt_printer: receiptPrinter, label_printer: labelPrinter }),
    onSuccess: () => {
      toast.success('تم حفظ إعدادات الطابعات ✅')
      qc.invalidateQueries(['printer-settings'])
    },
    onError: err => toast.error(err?.message || 'خطأ في الحفظ')
  })

  const printers = printersData?.data || []

  const PrinterCard = ({ title, icon: Icon, color, value, onChange, placeholder }) => (
    <div className="card">
      <div className="card-header">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:36, height:36, borderRadius:8, background:`${color}20`, border:`1px solid ${color}40`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon size={18} color={color}/>
          </div>
          <div>
            <div className="card-title">{title}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>حدد الطابعة المسؤولة</div>
          </div>
        </div>
        {value && (
          <span style={{ background:'var(--green-dim)', color:'var(--green)', fontSize:11, padding:'3px 8px', borderRadius:4, fontWeight:500 }}>
            ✓ محددة
          </span>
        )}
      </div>

      {/* اختيار من القائمة */}
      {printers.length > 0 ? (
        <div style={{ marginBottom:12 }}>
          <label className="form-label mb-1">اختر من الطابعات المتصلة:</label>
          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:200, overflowY:'auto' }}>
            {printers.map((p, i) => (
              <label key={i} style={{
                display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                borderRadius:6, cursor:'pointer',
                background: value === p.name ? `${color}15` : 'var(--ink-3)',
                border:`1px solid ${value === p.name ? color : 'var(--border)'}`,
                transition:'all .15s'
              }}>
                <input type="radio" name={title} value={p.name}
                  checked={value === p.name}
                  onChange={() => onChange(p.name)}
                  style={{ flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:'var(--text-2)' }}>{p.name}</div>
                  {p.status && <div style={{ fontSize:11, color:'var(--muted-2)' }}>{p.status}</div>}
                </div>
                {value === p.name && <CheckCircle size={15} color={color}/>}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding:'12px', background:'var(--amber-dim)', borderRadius:6, marginBottom:12 }}>
          <div style={{ fontSize:12, color:'var(--amber)', display:'flex', alignItems:'center', gap:6 }}>
            <AlertCircle size={14}/> لم يتم جلب الطابعات
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
            اكتب اسم الطابعة يدوياً أو اضغط "تحديث" أعلاه
          </div>
        </div>
      )}

      {/* إدخال يدوي */}
      <div className="form-group">
        <label className="form-label">أو اكتب اسم الطابعة يدوياً:</label>
        <input className="form-input" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} dir="ltr" />
      </div>

      {/* اختبار الطباعة */}
      <button className="btn btn-ghost btn-sm w-full" style={{ justifyContent:'center', marginTop:8 }}
        onClick={() => {
          const win = window.open('', '_blank', 'width=300,height=200')
          win.document.write(`<!DOCTYPE html><html><head><title>اختبار طباعة</title>
            <style>body{font-family:Arial;text-align:center;padding:20mm}
            @media print{@page{size:${title.includes('باركود') ? '50mm 25mm' : '80mm auto'}}}</style>
            </head><body>
            <h3>اختبار طباعة</h3>
            <p>${title}</p>
            <p>FixPro ERP</p>
            </body></html>`)
          win.document.close()
          setTimeout(() => win.print(), 300)
        }}>
        <Printer size={13}/> اختبار الطباعة
      </button>
    </div>
  )

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">إعدادات الطابعات</div>
          <div className="page-sub">تحديد الطابعة المسؤولة عن كل نوع طباعة</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => refetch()} disabled={loadingPrinters}>
            <RefreshCw size={14} style={{ animation: loadingPrinters ? 'spin .7s linear infinite' : 'none' }}/>
            {loadingPrinters ? 'جاري البحث...' : 'تحديث قائمة الطابعات'}
          </button>
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save size={14}/> {save.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </button>
        </div>
      </div>

      {/* معلومات */}
      <div style={{ padding:'12px 16px', background:'var(--blue-dim)', borderRadius:8, marginBottom:20, border:'1px solid rgba(59,130,246,.2)', fontSize:13 }}>
        <div style={{ fontWeight:500, color:'var(--blue)', marginBottom:4 }}>ℹ️ كيف تعمل إعدادات الطابعات</div>
        <div style={{ color:'var(--text-2)', lineHeight:1.7 }}>
          • <strong>طابعة الفواتير والوصولات:</strong> الطابعة الحرارية (80mm) لطباعة وصل الاستلام
          <br/>• <strong>طابعة الباركود والملصقات:</strong> طابعة الملصقات الصغيرة (50×25mm)
          <br/>• عند الضغط على "طباعة" ستُفتح نافذة خاصة — اختر الطابعة المحددة هنا من قائمة Printer
        </div>
      </div>

      {/* حالة الاتصال بالخادم */}
      {printersData?.message && (
        <div style={{ padding:'10px 14px', background:'var(--amber-dim)', borderRadius:8, marginBottom:16, fontSize:12, color:'var(--amber)' }}>
          ⚠️ {printersData.message} — يمكنك إدخال أسماء الطابعات يدوياً
        </div>
      )}

      <div className="two-col">
        <PrinterCard
          title="طابعة الفواتير والوصولات"
          icon={Printer}
          color="var(--blue)"
          value={receiptPrinter}
          onChange={setReceiptPrinter}
          placeholder="مثال: EPSON TM-T20III"
        />
        <PrinterCard
          title="طابعة الباركود والملصقات"
          icon={Tag}
          color="var(--purple)"
          value={labelPrinter}
          onChange={setLabelPrinter}
          placeholder="مثال: Zebra ZD220"
        />
      </div>

      {/* ملخص */}
      <div className="card mt-3">
        <div className="card-title mb-3">الإعدادات الحالية</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ padding:'12px 14px', background:'var(--ink-3)', borderRadius:8 }}>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>طابعة الفواتير</div>
            <div style={{ fontWeight:600, color: receiptPrinter ? 'var(--green)' : 'var(--amber)' }}>
              {receiptPrinter || '⚠️ لم تُحدد'}
            </div>
          </div>
          <div style={{ padding:'12px 14px', background:'var(--ink-3)', borderRadius:8 }}>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>طابعة الباركود</div>
            <div style={{ fontWeight:600, color: labelPrinter ? 'var(--green)' : 'var(--amber)' }}>
              {labelPrinter || '⚠️ لم تُحدد'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
