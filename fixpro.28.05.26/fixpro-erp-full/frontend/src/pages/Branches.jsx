import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Building, Users, Wrench, TrendingUp, BarChart2, Edit2, ToggleRight, ToggleLeft, Globe } from 'lucide-react'
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
  const [editBranch, setEditBranch] = useState(null)

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
    onSuccess: () => qc.invalidateQueries({ queryKey:['branches'] }),
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
          { id:'branches', label:'الفروع',          icon: Building },
          { id:'reports',  label:'التقارير الموحدة', icon: BarChart2 },
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
          ? <EmptyState icon={Building} message="لا توجد فروع" sub="أضف الفرع الأول" />
          : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
              {branches.map(b => (
                <BranchCard key={b.id} branch={b}
                  onEdit={() => setEditBranch(b)}
                  onToggle={() => toggle.mutate(b)} />
              ))}
            </div>
          )
      )}

      {/* ── التقارير الموحدة ── */}
      {tab === 'reports' && (
        reportLoading ? <Loading /> : !report
          ? <EmptyState icon={BarChart2} message="لا توجد بيانات" />
          : <UnifiedReport report={report} period={period} />
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
    </div>
  )
}

// ── بطاقة الفرع ───────────────────────────────────────────
function BranchCard({ branch: b, onEdit, onToggle }) {
  return (
    <div className="card" style={{
      borderRight:`3px solid ${b.is_active ? 'var(--blue)' : 'var(--muted)'}`,
      opacity: b.is_active ? 1 : .7
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:16, color:'var(--text-2)' }}>{b.name}</div>
          {b.city && <div className="text-xs text-muted mt-1">📍 {b.city}</div>}
          {b.phone && <div className="text-xs text-muted">📞 {b.phone}</div>}
          {b.address && <div className="text-xs text-muted">{b.address}</div>}
        </div>
        <div style={{ display:'flex', gap:4 }}>
          <button className="btn-icon" onClick={onEdit}><Edit2 size={13}/></button>
          <button className="btn-icon" onClick={onToggle}>
            {b.is_active
              ? <ToggleRight size={20} color="var(--green)"/>
              : <ToggleLeft size={20} color="var(--muted)"/>
            }
          </button>
        </div>
      </div>

      {/* إحصاءات */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        <div style={{ textAlign:'center', padding:'8px 4px', background:'var(--ink-3)', borderRadius:6 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--blue)', fontFamily:'var(--mono)' }}>
            {b.staff_count || 0}
          </div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>موظف</div>
        </div>
        <div style={{ textAlign:'center', padding:'8px 4px', background:'var(--ink-3)', borderRadius:6 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--amber)', fontFamily:'var(--mono)' }}>
            {b.active_orders || 0}
          </div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>تذاكر نشطة</div>
        </div>
        <div style={{ textAlign:'center', padding:'8px 4px', background:'var(--ink-3)', borderRadius:6 }}>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--green)', fontFamily:'var(--mono)' }}>
            {b.today_orders || 0}
          </div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>اليوم</div>
        </div>
      </div>

      {!b.is_active && (
        <div style={{ marginTop:10, padding:'5px 10px', background:'var(--amber-dim)', borderRadius:4, fontSize:11, color:'var(--amber)', textAlign:'center' }}>
          ⚠️ هذا الفرع موقوف
        </div>
      )}
    </div>
  )
}

// ── التقارير الموحدة ──────────────────────────────────────
function UnifiedReport({ report, period }) {
  const PERIOD_LABELS = { today:'اليوم', week:'هذا الأسبوع', month:'هذا الشهر' }

  // تحضير بيانات الرسم البياني
  const revenueByBranch = report.branches.map(b => ({
    name:    b.branch_name.length > 8 ? b.branch_name.slice(0,8)+'...' : b.branch_name,
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
      {/* إجماليات */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:`إجمالي التذاكر — ${PERIOD_LABELS[period]}`, val: report.totals.total_tickets, color:'blue' },
          { label:'مكتملة',                   val: report.totals.completed,     color:'green' },
          { label:'إجمالي الإيرادات',          val: `${Math.round(report.totals.revenue).toLocaleString('ar-SA')} ر`, color:'amber' },
          { label:'ضريبة محصّلة',              val: `${Math.round(report.totals.vat_collected).toLocaleString('ar-SA')} ر`, color:'purple' },
        ].map((s,i) => (
          <div key={i} className={`stat-card ${s.color}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.val}</div>
          </div>
        ))}
      </div>

      <div className="two-col" style={{ marginBottom:16 }}>
        {/* مقارنة الفروع */}
        <div className="card">
          <div className="card-title mb-3">مقارنة الفروع — الإيرادات والتذاكر</div>
          {revenueByBranch.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByBranch} margin={{ top:5, right:10, left:0, bottom:5 }}>
                <XAxis dataKey="name" tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:'var(--ink-3)', border:'1px solid var(--border-2)', borderRadius:6, fontSize:12 }} />
                <Legend wrapperStyle={{ fontSize:12 }} />
                <Bar dataKey="إيرادات" fill="#3B82F6" radius={[4,4,0,0]} />
                <Bar dataKey="تذاكر"   fill="#10B981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)', fontSize:13 }}>
              لا توجد بيانات للفترة المحددة
            </div>
          )}
        </div>

        {/* أفضل الفنيين */}
        <div className="card">
          <div className="card-title mb-3">🏆 أفضل الفنيين</div>
          {report.top_techs.length > 0 ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {report.top_techs.map((t,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{
                    width:28, height:28, borderRadius:'50%', flexShrink:0,
                    background: i===0?'#F59E0B':i===1?'#9CA3AF':i===2?'#CD7C2F':'var(--ink-4)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:12, fontWeight:700, color:'#fff'
                  }}>
                    {i+1}
                  </div>
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
          ) : (
            <div style={{ textAlign:'center', padding:'30px 0', color:'var(--muted)', fontSize:13 }}>
              لا توجد بيانات
            </div>
          )}
        </div>
      </div>

      {/* تطور الإيرادات */}
      {lineData.length > 0 && (
        <div className="card">
          <div className="card-title mb-3">تطور الإيرادات — آخر 6 أشهر</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={lineData} margin={{ top:5, right:10, left:0, bottom:5 }}>
              <defs>
                {branchNames.map((bn, i) => (
                  <linearGradient key={bn} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={COLORS[i%COLORS.length]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS[i%COLORS.length]} stopOpacity={0}   />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="name" tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background:'var(--ink-3)', border:'1px solid var(--border-2)', borderRadius:6, fontSize:12 }} />
              <Legend wrapperStyle={{ fontSize:12 }} />
              {branchNames.map((bn, i) => (
                <Area key={bn} type="monotone" dataKey={bn}
                  stroke={COLORS[i%COLORS.length]} strokeWidth={2}
                  fill={`url(#grad-${i})`} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* جدول تفصيلي */}
      <div className="card mt-3" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
          <div className="card-title">تفاصيل الفروع — {PERIOD_LABELS[period]}</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الفرع</th><th>التذاكر</th><th>مكتملة</th>
                <th>مرفوضة</th><th>نشطة</th><th>الإيرادات</th>
                <th>الضريبة</th><th>نسبة النجاح</th>
              </tr>
            </thead>
            <tbody>
              {report.branches.map(b => {
                const successRate = b.total_tickets > 0
                  ? Math.round(b.completed / b.total_tickets * 100) : 0
                return (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontWeight:600, color:'var(--text-2)' }}>{b.branch_name}</div>
                      {b.city && <div className="text-xs text-muted">{b.city}</div>}
                    </td>
                    <td className="font-mono">{b.total_tickets}</td>
                    <td className="font-mono text-green">{b.completed}</td>
                    <td className="font-mono text-red">{b.rejected}</td>
                    <td className="font-mono text-amber">{b.active}</td>
                    <td className="font-mono text-blue font-bold">
                      {Math.round(parseFloat(b.revenue||0)).toLocaleString('ar-SA')} ر
                    </td>
                    <td className="font-mono text-muted2">
                      {Math.round(parseFloat(b.vat_collected||0)).toLocaleString('ar-SA')} ر
                    </td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ flex:1, height:5, background:'var(--ink-4)', borderRadius:3 }}>
                          <div style={{
                            width:`${successRate}%`, height:'100%', borderRadius:3,
                            background: successRate>75?'var(--green)':successRate>50?'var(--amber)':'var(--red)'
                          }}/>
                        </div>
                        <span className="font-mono text-xs text-muted2">{successRate}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {/* صف الإجماليات */}
              <tr style={{ background:'var(--blue-dim)', fontWeight:700 }}>
                <td style={{ color:'var(--blue)' }}>الإجمالي الكلي</td>
                <td className="font-mono text-blue">{report.totals.total_tickets}</td>
                <td className="font-mono text-blue">{report.totals.completed}</td>
                <td className="font-mono text-blue">{report.totals.rejected}</td>
                <td className="font-mono text-blue">{report.totals.active}</td>
                <td className="font-mono text-blue">
                  {Math.round(report.totals.revenue).toLocaleString('ar-SA')} ر
                </td>
                <td className="font-mono text-blue">
                  {Math.round(report.totals.vat_collected).toLocaleString('ar-SA')} ر
                </td>
                <td className="font-mono text-blue">
                  {report.totals.total_tickets > 0
                    ? Math.round(report.totals.completed / report.totals.total_tickets * 100)
                    : 0}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── نافذة إضافة / تعديل فرع ──────────────────────────────
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
    onError: err => toast.error(err?.message || 'خطأ'),
  })

  return (
    <Modal open={true} onClose={onClose}
      title={branch ? `تعديل: ${branch.name}` : 'إضافة فرع جديد'}
      footer={
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => save.mutate()}
            disabled={save.isPending || !form.name}>
            {save.isPending ? 'جاري الحفظ...' : branch ? 'حفظ التعديلات' : 'إنشاء الفرع'}
          </button>
        </div>
      }>
      <div className="form-grid">
        <div className="form-group form-full">
          <label className="form-label">اسم الفرع *</label>
          <input className="form-input" value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="مثال: الفرع الرئيسي — الرياض" />
        </div>
        <div className="form-group">
          <label className="form-label">المدينة</label>
          <input className="form-input" value={form.city}
            onChange={e => set('city', e.target.value)}
            placeholder="الرياض / جدة / الدمام..." />
        </div>
        <div className="form-group">
          <label className="form-label">رقم الهاتف</label>
          <input className="form-input" value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="0112345678" dir="ltr" />
        </div>
        <div className="form-group form-full">
          <label className="form-label">العنوان التفصيلي</label>
          <input className="form-input" value={form.address}
            onChange={e => set('address', e.target.value)}
            placeholder="حي العليا، شارع التحلية" />
        </div>
      </div>

      {!branch && (
        <div style={{ marginTop:14, padding:'10px 14px', background:'var(--blue-dim)', borderRadius:8, fontSize:12, color:'var(--blue)' }}>
          💡 بعد إنشاء الفرع، اذهب إلى <strong>الإعدادات → المستخدمون</strong> لإضافة موظفين وتعيينهم لهذا الفرع.
        </div>
      )}
    </Modal>
  )
}
