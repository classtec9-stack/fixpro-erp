import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState } from '../components/ui'
import toast from 'react-hot-toast'
import {
  Plus, Building, Users, Wrench, BarChart2, Edit2,
  ToggleRight, ToggleLeft, Save, Upload, Phone,
  Receipt, Printer, Settings
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

const PERIODS = [
  { value:'today', label:'اليوم' },
  { value:'week',  label:'هذا الأسبوع' },
  { value:'month', label:'هذا الشهر' },
]

export default function BranchesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab]           = useState('branches')
  const [period, setPeriod]     = useState('month')
  const [showAdd, setShowAdd]   = useState(false)
  const [editBranch, setEditBranch]   = useState(null)
  const [settingsBranch, setSettingsBranch] = useState(null)

  const { data: branchesData, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches'),
  })

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ['unified-report', period],
    queryFn: () => api.get(`/branches/unified-report?period=${period}`),
    enabled: tab === 'reports',
  })

  const branches = branchesData?.data || []
  const report   = reportData?.data

  const toggle = useMutation({
    mutationFn: (b) => api.put(`/branches/${b.id}`, { ...b, is_active: !b.is_active }),
    onSuccess: () => { toast.success('تم تحديث حالة الفرع'); qc.invalidateQueries({ queryKey:['branches'] }) },
    onError: e => toast.error(e?.message || 'خطأ'),
  })

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">إدارة الفروع</div>
          <div className="page-sub">{branches.length} فرع مسجل</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {tab === 'reports' && (
            <div style={{ display:'flex', border:'1px solid var(--border-2)', borderRadius:'var(--radius)', overflow:'hidden' }}>
              {PERIODS.map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)} style={{
                  padding:'6px 12px', border:'none', cursor:'pointer', fontSize:12,
                  background: period===p.value ? 'var(--blue)' : 'transparent',
                  color: period===p.value ? '#fff' : 'var(--muted-2)',
                  fontFamily:'var(--font)'
                }}>{p.label}</button>
              ))}
            </div>
          )}
          {tab === 'branches' && (
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <Plus size={14}/> فرع جديد
            </button>
          )}
        </div>
      </div>

      {/* تبويبات */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {[
          { id:'branches', label:'الفروع',           icon: Building },
          { id:'reports',  label:'التقارير الموحدة',  icon: BarChart2 },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'9px 16px', background:'none', border:'none', cursor:'pointer',
            fontSize:13, fontFamily:'var(--font)',
            color: tab===t.id ? 'var(--blue)' : 'var(--muted-2)',
            borderBottom: tab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom:-1
          }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* ── قائمة الفروع ── */}
      {tab === 'branches' && (
        isLoading ? <Loading /> : !branches.length
          ? <EmptyState icon={Building} message="لا توجد فروع" sub="أضف الفرع الأول"/>
          : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
              {branches.map(b => (
                <BranchCard key={b.id} branch={b}
                  onEdit={() => setEditBranch(b)}
                  onToggle={() => toggle.mutate(b)}
                  onSettings={() => setSettingsBranch(b)}
                />
              ))}
            </div>
          )
      )}

      {/* ── التقارير الموحدة ── */}
      {tab === 'reports' && (
        reportLoading ? <Loading /> : !report
          ? <EmptyState icon={BarChart2} message="لا توجد بيانات"/>
          : <UnifiedReport report={report} period={period}/>
      )}

      {/* نوافذ */}
      {showAdd && (
        <BranchModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); qc.invalidateQueries({ queryKey:['branches'] }) }}
        />
      )}
      {editBranch && (
        <BranchModal
          branch={editBranch}
          onClose={() => setEditBranch(null)}
          onSuccess={() => { setEditBranch(null); qc.invalidateQueries({ queryKey:['branches'] }) }}
        />
      )}
      {settingsBranch && (
        <BranchSettingsModal
          branch={settingsBranch}
          onClose={() => setSettingsBranch(null)}
        />
      )}
    </div>
  )
}

// ── بطاقة الفرع ───────────────────────────────────────────
function BranchCard({ branch: b, onEdit, onToggle, onSettings }) {
  return (
    <div className="card" style={{
      borderRight:`3px solid ${b.is_active ? 'var(--blue)' : 'var(--muted)'}`,
      opacity: b.is_active ? 1 : .7
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:16, color:'var(--text-2)' }}>{b.name}</div>
          {b.city    && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>📍 {b.city}</div>}
          {b.phone   && <div style={{ fontSize:12, color:'var(--muted)' }}>📞 {b.phone}</div>}
          {b.address && <div style={{ fontSize:11, color:'var(--muted)' }}>{b.address}</div>}
        </div>
        <div style={{ display:'flex', gap:4, flexDirection:'column', alignItems:'flex-end' }}>
          <div style={{ display:'flex', gap:4 }}>
            <button className="btn-icon" title="تعديل بيانات الفرع" onClick={onEdit}>
              <Edit2 size={13}/>
            </button>
            <button className="btn-icon" title="تفعيل / تعطيل" onClick={onToggle}>
              {b.is_active
                ? <ToggleRight size={20} color="var(--green)"/>
                : <ToggleLeft  size={20} color="var(--muted)"/>}
            </button>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize:11, gap:4 }}
            title="إعدادات المحل والفاتورة"
            onClick={onSettings}>
            <Settings size={12}/> إعدادات المحل
          </button>
        </div>
      </div>

      {/* إحصاءات */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        {[
          { label:'موظف',        val: b.staff_count    || 0, color:'var(--purple)' },
          { label:'تذاكر نشطة',  val: b.active_orders  || 0, color:'var(--amber)'  },
          { label:'تذاكر اليوم', val: b.today_orders   || 0, color:'var(--blue)'   },
        ].map(s => (
          <div key={s.label} style={{ textAlign:'center', padding:'8px 4px', background:'var(--ink-3)', borderRadius:6 }}>
            <div style={{ fontSize:18, fontWeight:700, color:s.color, fontFamily:'var(--mono)' }}>{s.val}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {!b.is_active && (
        <div style={{ marginTop:10, padding:'5px 10px', background:'var(--amber-dim)',
          borderRadius:4, fontSize:11, color:'var(--amber)', textAlign:'center' }}>
          ⚠️ هذا الفرع موقوف
        </div>
      )}
    </div>
  )
}

// ── نافذة إضافة / تعديل الفرع (بيانات أساسية فقط) ────────
function BranchModal({ branch, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name:    branch?.name    || '',
    city:    branch?.city    || '',
    phone:   branch?.phone   || '',
    address: branch?.address || '',
  })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const save = useMutation({
    mutationFn: () => branch
      ? api.put(`/branches/${branch.id}`, { ...form, is_active: branch.is_active })
      : api.post('/branches', form),
    onSuccess: () => {
      toast.success(branch ? 'تم تحديث الفرع ✅' : 'تم إنشاء الفرع ✅')
      onSuccess()
    },
    onError: e => toast.error(e?.message || 'خطأ'),
  })

  return (
    <Modal open onClose={onClose}
      title={branch ? `تعديل: ${branch.name}` : 'إضافة فرع جديد'}
      footer={
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={!form.name || save.isLoading}
            onClick={() => save.mutate()}>
            {save.isLoading ? 'جاري الحفظ...' : branch ? 'حفظ التعديلات' : 'إنشاء الفرع'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:12 }}>
        <div>
          <label className="form-label">اسم الفرع *</label>
          <input className="form-input" value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="مثال: الفرع الرئيسي — الرياض"/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="form-label">المدينة</label>
            <input className="form-input" value={form.city}
              onChange={e => set('city', e.target.value)}
              placeholder="الرياض / جدة / الدمام"/>
          </div>
          <div>
            <label className="form-label">رقم الهاتف</label>
            <input className="form-input" value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="0112345678" dir="ltr"/>
          </div>
        </div>
        <div>
          <label className="form-label">العنوان التفصيلي</label>
          <input className="form-input" value={form.address}
            onChange={e => set('address', e.target.value)}
            placeholder="حي العليا، شارع التحلية"/>
        </div>
        {!branch && (
          <div style={{ padding:'10px 14px', background:'var(--blue-dim)', borderRadius:8, fontSize:12, color:'var(--blue)' }}>
            💡 بعد الإنشاء اضغط <strong>"إعدادات المحل"</strong> على بطاقة الفرع لإضافة الشعار والبيانات الضريبية.
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── نافذة إعدادات المحل (مدمجة مع الفرع) ────────────────
function BranchSettingsModal({ branch, onClose }) {
  const qc = useQueryClient()
  const logoRef = useRef()
  const [form, setForm] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [activeTab, setActiveTab] = useState('info')
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data, isLoading } = useQuery({
    queryKey: ['shop-settings', branch.id],
    queryFn: () => api.get('/shop-settings'),
  })

  useEffect(() => {
    if (data?.data && !form) {
      const s = data.data
      setForm({
        shop_name:      s.shop_name      || branch.name || '',
        shop_name_en:   s.shop_name_en   || '',
        phone:          s.phone          || branch.phone || '',
        phone2:         s.phone2         || '',
        email:          s.email          || '',
        address:        s.address        || branch.address || '',
        city:           s.city           || branch.city || '',
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

  const saveMut = useMutation({
    mutationFn: () => api.put('/shop-settings', form),
    onSuccess: () => {
      toast.success('تم حفظ إعدادات المحل ✅')
      qc.invalidateQueries({ queryKey: ['shop-settings'] })
    },
    onError: e => toast.error(e?.message || 'خطأ في الحفظ'),
  })

  const uploadLogoMut = useMutation({
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
    onError: () => toast.error('خطأ في رفع الشعار'),
  })

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) { toast.error('الشعار يجب أن يكون أقل من 500KB'); return }
    const reader = new FileReader()
    reader.onload = (e) => setLogoPreview(e.target.result)
    reader.readAsDataURL(file)
    uploadLogoMut.mutate(file)
  }

  const TABS = [
    { id:'info',    label:'بيانات المحل',     icon: Building },
    { id:'contact', label:'التواصل والعنوان',  icon: Phone    },
    { id:'invoice', label:'الفاتورة والطباعة', icon: Receipt  },
  ]

  return (
    <Modal open onClose={onClose}
      title={`إعدادات المحل — ${branch.name}`}
      maxWidth={680}
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          <button className="btn btn-primary" disabled={!form || saveMut.isLoading}
            onClick={() => saveMut.mutate()}>
            <Save size={13}/> {saveMut.isLoading ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </button>
        </div>
      }>

      {/* تبويبات داخل الـ modal */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', marginBottom:16 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            display:'flex', alignItems:'center', gap:5,
            padding:'7px 14px', background:'none', border:'none', cursor:'pointer',
            fontSize:12, fontFamily:'var(--font)',
            color: activeTab===t.id ? 'var(--blue)' : 'var(--muted-2)',
            borderBottom: activeTab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom:-1
          }}>
            <t.icon size={13}/> {t.label}
          </button>
        ))}
      </div>

      {isLoading || !form ? <Loading/> : (
        <>
          {/* ── تبويب بيانات المحل ── */}
          {activeTab === 'info' && (
            <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:20, alignItems:'start' }}>
              {/* الشعار */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <div
                  style={{ width:120, height:90, borderRadius:8, border:'2px dashed var(--border-2)',
                    background:'var(--ink-3)', display:'flex', alignItems:'center', justifyContent:'center',
                    overflow:'hidden', cursor:'pointer' }}
                  onClick={() => logoRef.current?.click()}>
                  {logoPreview
                    ? <img src={logoPreview} alt="logo" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }}/>
                    : <div style={{ textAlign:'center', color:'var(--muted)' }}>
                        <Upload size={22} style={{ margin:'0 auto 4px', display:'block' }}/>
                        <div style={{ fontSize:11 }}>الشعار</div>
                      </div>
                  }
                </div>
                <input ref={logoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogoChange}/>
                <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }}
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadLogoMut.isLoading}>
                  <Upload size={11}/> {uploadLogoMut.isLoading ? '...' : 'رفع شعار'}
                </button>
                <div style={{ fontSize:10, color:'var(--muted)', textAlign:'center' }}>
                  PNG/JPG<br/>حد أقصى 500KB
                </div>
              </div>

              {/* بيانات المحل */}
              <div style={{ display:'grid', gap:10 }}>
                <div>
                  <label className="form-label">اسم المحل (عربي) *</label>
                  <input className="form-input" value={form.shop_name}
                    onChange={e => set('shop_name', e.target.value)}
                    placeholder="FixPro للصيانة"/>
                </div>
                <div>
                  <label className="form-label">اسم المحل (إنجليزي)</label>
                  <input className="form-input" value={form.shop_name_en}
                    onChange={e => set('shop_name_en', e.target.value)}
                    placeholder="FixPro Maintenance" dir="ltr"/>
                </div>
                <div>
                  <label className="form-label">الرقم الضريبي (VAT)</label>
                  <input className="form-input" value={form.tax_number}
                    onChange={e => set('tax_number', e.target.value.replace(/[^0-9A-Za-z\-]/g, ''))}
                    placeholder="300XXXXXXXXX1003" dir="ltr" maxLength={20}/>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                    أرقام فقط — مثال: 310122393500003
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── تبويب التواصل والعنوان ── */}
          {activeTab === 'contact' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label className="form-label">الهاتف الرئيسي</label>
                <input className="form-input" value={form.phone}
                  onChange={e => set('phone', e.target.value)} dir="ltr" placeholder="0112345678"/>
              </div>
              <div>
                <label className="form-label">الهاتف الثانوي</label>
                <input className="form-input" value={form.phone2}
                  onChange={e => set('phone2', e.target.value)} dir="ltr"/>
              </div>
              <div>
                <label className="form-label">البريد الإلكتروني</label>
                <input className="form-input" value={form.email}
                  onChange={e => set('email', e.target.value.trim())} dir="ltr"
                  placeholder="info@fixpro.sa" type="email"/>
              </div>
              <div>
                <label className="form-label">الموقع الإلكتروني</label>
                <input className="form-input" value={form.website}
                  onChange={e => set('website', e.target.value)} dir="ltr"
                  placeholder="www.fixpro.sa"/>
              </div>
              <div>
                <label className="form-label">المدينة</label>
                <input className="form-input" value={form.city}
                  onChange={e => set('city', e.target.value)} placeholder="الرياض"/>
              </div>
              <div>
                <label className="form-label">العنوان التفصيلي</label>
                <input className="form-input" value={form.address}
                  onChange={e => set('address', e.target.value)} placeholder="حي العليا، شارع التحلية"/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="form-label">رابط تتبع الجهاز</label>
                <input className="form-input" value={form.track_url}
                  onChange={e => set('track_url', e.target.value)}
                  placeholder="fixpro.sa/track" dir="ltr"/>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                  يُستخدم في QR Code على الوصل — العميل يمسحه ليرى حالة جهازه
                </div>
              </div>
            </div>
          )}

          {/* ── تبويب الفاتورة والطباعة ── */}
          {activeTab === 'invoice' && (
            <div style={{ display:'grid', gap:14 }}>
              <div>
                <label className="form-label">الشروط والأحكام (تظهر أسفل كل وصل)</label>
                <textarea className="form-input" rows={3} value={form.invoice_terms}
                  onChange={e => set('invoice_terms', e.target.value)}/>
              </div>
              <div>
                <label className="form-label">ذيل الفاتورة</label>
                <textarea className="form-input" rows={2} value={form.invoice_footer}
                  onChange={e => set('invoice_footer', e.target.value)}
                  placeholder="شكراً لثقتك بنا"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="form-label">عرض الوصل</label>
                  <select className="form-select" value={form.receipt_width}
                    onChange={e => set('receipt_width', Number(e.target.value))}>
                    <option value={58}>58mm (صغير)</option>
                    <option value={80}>80mm (قياسي)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">حجم ملصق الباركود</label>
                  <select className="form-select"
                    value={`${form.label_width}x${form.label_height}`}
                    onChange={e => {
                      const [w,h] = e.target.value.split('x')
                      set('label_width', Number(w)); set('label_height', Number(h))
                    }}>
                    <option value="25x15">25×15mm</option>
                    <option value="50x25">50×25mm (قياسي)</option>
                    <option value="50x30">50×30mm</option>
                    <option value="60x40">60×40mm</option>
                  </select>
                </div>
              </div>

              {/* معاينة */}
              <div style={{ background:'#f5f5f5', padding:14, borderRadius:8, maxWidth:280, margin:'0 auto' }}>
                <div style={{ fontFamily:'Arial', fontSize:10, color:'#000', textAlign:'center',
                  borderBottom:'2px solid #000', paddingBottom:5, marginBottom:5 }}>
                  {logoPreview && <img src={logoPreview} alt="logo"
                    style={{ maxHeight:36, display:'block', margin:'0 auto 4px', objectFit:'contain' }}/>}
                  <div style={{ fontSize:13, fontWeight:700 }}>{form.shop_name || 'اسم المحل'}</div>
                  {form.phone && <div style={{ fontSize:9, color:'#666' }}>📞 {form.phone}</div>}
                  {form.tax_number && <div style={{ fontSize:8, color:'#888' }}>VAT: {form.tax_number}</div>}
                </div>
                <div style={{ fontSize:8, color:'#aaa', textAlign:'center' }}>... محتوى الوصل ...</div>
                {form.invoice_terms && (
                  <div style={{ fontSize:8, color:'#666', textAlign:'center', marginTop:5,
                    borderTop:'1px dashed #000', paddingTop:4 }}>
                    {form.invoice_terms.substring(0,80)}{form.invoice_terms.length>80?'...':''}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

// ── التقارير الموحدة ──────────────────────────────────────
function UnifiedReport({ report, period }) {
  const PERIOD_LABELS = { today:'اليوم', week:'هذا الأسبوع', month:'هذا الشهر' }
  const revenueByBranch = report.branches.map(b => ({
    name: b.branch_name.length > 8 ? b.branch_name.slice(0,8)+'...' : b.branch_name,
    إيرادات: Math.round(parseFloat(b.revenue || 0)),
    تذاكر:   parseInt(b.total_tickets || 0),
  }))
  const months = [...new Set(report.revenue_chart.map(r => r.month))]
  const branchNames = [...new Set(report.revenue_chart.map(r => r.branch_name))]
  const lineData = months.map(m => {
    const obj = { name: format(new Date(m), 'MMM', { locale: ar }) }
    branchNames.forEach(bn => {
      const item = report.revenue_chart.find(r => r.month === m && r.branch_name === bn)
      obj[bn] = item ? Math.round(parseFloat(item.revenue)) : 0
    })
    return obj
  })
  const COLORS = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#F97316']

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:`إجمالي التذاكر — ${PERIOD_LABELS[period]}`, val: report.totals.total_tickets, color:'blue' },
          { label:'مكتملة',            val: report.totals.completed, color:'green' },
          { label:'إجمالي الإيرادات',  val: `${Math.round(report.totals.revenue).toLocaleString('ar-SA')} ر`, color:'amber' },
          { label:'ضريبة محصّلة',      val: `${Math.round(report.totals.vat_collected).toLocaleString('ar-SA')} ر`, color:'purple' },
        ].map((s,i) => (
          <div key={i} className={`stat-card ${s.color}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom:12 }}>مقارنة الفروع</div>
          {revenueByBranch.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueByBranch}>
                <XAxis dataKey="name" tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ background:'var(--ink-3)', border:'1px solid var(--border-2)', borderRadius:6, fontSize:12 }}/>
                <Legend wrapperStyle={{ fontSize:12 }}/>
                <Bar dataKey="إيرادات" fill="#3B82F6" radius={[4,4,0,0]}/>
                <Bar dataKey="تذاكر"   fill="#10B981" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ textAlign:'center', padding:40, color:'var(--muted)', fontSize:13 }}>لا توجد بيانات</div>}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom:12 }}>🏆 أفضل الفنيين</div>
          {report.top_techs.length > 0 ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {report.top_techs.map((t,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
                    background: i===0?'#F59E0B':i===1?'#9CA3AF':i===2?'#CD7C2F':'var(--ink-4)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:12, fontWeight:700, color:'#fff' }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'var(--text-2)' }}>{t.full_name}</div>
                    <div style={{ fontSize:11, color:'var(--muted-2)' }}>{t.branch_name}</div>
                  </div>
                  <div style={{ textAlign:'left' }}>
                    <div style={{ fontFamily:'var(--mono)', fontWeight:700, color:'var(--green)', fontSize:14 }}>
                      {t.completed || 0}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>مكتمل</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div style={{ textAlign:'center', padding:30, color:'var(--muted)', fontSize:13 }}>لا توجد بيانات</div>}
        </div>
      </div>

      <div className="card" style={{ padding:0 }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
          <div className="card-title">تفاصيل الفروع — {PERIOD_LABELS[period]}</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>الفرع</th><th>التذاكر</th><th>مكتملة</th><th>مرفوضة</th><th>نشطة</th><th>الإيرادات</th><th>نسبة النجاح</th></tr>
            </thead>
            <tbody>
              {report.branches.map(b => {
                const rate = b.total_tickets > 0 ? Math.round(b.completed / b.total_tickets * 100) : 0
                return (
                  <tr key={b.id}>
                    <td><div style={{ fontWeight:600 }}>{b.branch_name}</div>{b.city&&<div style={{ fontSize:11, color:'var(--muted)' }}>{b.city}</div>}</td>
                    <td style={{ fontFamily:'var(--mono)' }}>{b.total_tickets}</td>
                    <td style={{ fontFamily:'var(--mono)', color:'var(--green)' }}>{b.completed}</td>
                    <td style={{ fontFamily:'var(--mono)', color:'var(--red)' }}>{b.rejected}</td>
                    <td style={{ fontFamily:'var(--mono)', color:'var(--amber)' }}>{b.active}</td>
                    <td style={{ fontFamily:'var(--mono)', color:'var(--blue)', fontWeight:600 }}>
                      {Math.round(parseFloat(b.revenue||0)).toLocaleString('ar-SA')} ر
                    </td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ flex:1, height:5, background:'var(--ink-4)', borderRadius:3 }}>
                          <div style={{ width:`${rate}%`, height:'100%', borderRadius:3,
                            background: rate>75?'var(--green)':rate>50?'var(--amber)':'var(--red)' }}/>
                        </div>
                        <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted-2)' }}>{rate}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              <tr style={{ background:'var(--blue-dim)', fontWeight:700 }}>
                <td style={{ color:'var(--blue)' }}>الإجمالي الكلي</td>
                <td style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{report.totals.total_tickets}</td>
                <td style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{report.totals.completed}</td>
                <td style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{report.totals.rejected}</td>
                <td style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{report.totals.active}</td>
                <td style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>
                  {Math.round(report.totals.revenue).toLocaleString('ar-SA')} ر
                </td>
                <td style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>
                  {report.totals.total_tickets>0 ? Math.round(report.totals.completed/report.totals.total_tickets*100) : 0}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
