import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '../services/api'
import { Loading } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Wrench, Package, Users, Receipt,
  AlertTriangle, Clock, CheckCircle, XCircle, DollarSign,
  BarChart2, Truck, ShieldCheck, ArrowUpRight, ArrowDownRight,
  CalendarDays, FileText, ShoppingCart, PackageSearch, Shield, UserPlus
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

const STATUS_CONFIG = {
  new:                      { label:'جديدة',           color:'#6366F1' },
  quick_check:              { label:'فحص سريع',         color:'#8B5CF6' },
  diagnosing:               { label:'قيد الفحص',        color:'#F59E0B' },
  waiting_approval:         { label:'انتظار موافقة',    color:'#EF4444' },
  in_repair:                { label:'داخل الورشة',       color:'#3B82F6' },
  waiting_part:             { label:'انتظار قطعة',       color:'#F97316' },
  part_transferred:         { label:'القطعة في الطريق', color:'#06B6D4' },
  awaiting_technician_rejection:{ label:'انتظار تأكيد', color:'#EC4899' },
  ready:                    { label:'جاهز للتسليم',     color:'#10B981' },
  delivered:                { label:'مُسلَّم',           color:'#6B7280' },
  rejected:                 { label:'مرفوض',             color:'#EF4444' },
}

function KPICard({ label, value, sub, icon: Icon, color, trend, prefix='', suffix='' }) {
  const up = trend > 0
  return (
    <div style={{
      background:'var(--ink-2)', borderRadius:12, padding:'18px 20px',
      border:'1px solid var(--border)', position:'relative', overflow:'hidden'
    }}>
      <div style={{ position:'absolute', top:16, left:16, width:40, height:40, borderRadius:10,
        background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon size={18} color={color}/>
      </div>
      <div style={{ paddingRight:52 }}>
        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{label}</div>
        <div style={{ fontSize:22, fontWeight:800, color:'var(--text-2)', fontFamily:'monospace', lineHeight:1 }}>
          {prefix}{typeof value === 'number' ? value.toLocaleString('ar-SA') : value}{suffix}
        </div>
        {(sub !== undefined || trend !== undefined) && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
            {trend !== undefined && (
              <span style={{ display:'flex', alignItems:'center', gap:2, fontSize:11,
                fontWeight:600, color: up ? 'var(--green)' : 'var(--red)' }}>
                {up ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                {Math.abs(trend)}%
              </span>
            )}
            {sub && <span style={{ fontSize:11, color:'var(--muted)' }}>{sub}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, color='var(--blue)' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
      <div style={{ width:3, height:16, background:color, borderRadius:2 }}/>
      {Icon && <Icon size={15} color={color}/>}
      <span style={{ fontWeight:700, fontSize:13, color:'var(--text-2)' }}>{title}</span>
    </div>
  )
}

function StatusPill({ status, count }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color:'#6B7280' }
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'7px 12px', borderRadius:8, background:`${cfg.color}12`,
      border:`1px solid ${cfg.color}30`, marginBottom:4 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:cfg.color }}/>
        <span style={{ fontSize:12, color:'var(--text-2)' }}>{cfg.label}</span>
      </div>
      <span style={{ fontWeight:700, fontFamily:'monospace', fontSize:13, color:cfg.color }}>{count}</span>
    </div>
  )
}

const greetingByTime = () => {
  const h = new Date().getHours()
  if (h < 12) return 'صباح الخير'
  if (h < 17) return 'مساء الخير'
  return 'مساء النور'
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { selectedBranch } = useBranch()
  const navigate = useNavigate()
  const [chartPeriod, setChartPeriod] = useState('week')
  const role = user?.role

  const CAN = {
    finance:    ['admin','branch_manager','accountant'].includes(role),
    allTickets: ['admin','branch_manager','receptionist','customer_service'].includes(role),
    techPerf:   ['admin','branch_manager'].includes(role),
    inventory:  ['admin','branch_manager','warehouse'].includes(role),
    suppliers:  ['admin','branch_manager','warehouse'].includes(role),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', selectedBranch],
    queryFn: () => api.get('/dashboard'),
    refetchInterval: 60_000,
  })

  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart', chartPeriod, selectedBranch],
    queryFn: () => api.get(`/dashboard/revenue?period=${chartPeriod}`),
    enabled: CAN.finance,
  })

  const d = data?.data || {}
  const chart = chartData?.data || []

  if (isLoading) return <Loading/>

  const ROLE_LABELS = {
    admin:'مدير النظام', branch_manager:'مشرف الفرع',
    receptionist:'موظف استقبال', technician:'مهندس صيانة',
    warehouse:'مسؤول المخزن', accountant:'محاسب', customer_service:'خدمة العملاء'
  }

  return (
    <div className="page fade-in" style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* الترحيب */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--text-2)' }}>
            {greetingByTime()}، {user?.full_name?.split(' ')[0]} 👋
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
            {ROLE_LABELS[role]} · {new Date().toLocaleDateString('ar-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </div>
        </div>
        {d.critical_alerts > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px',
            background:'rgba(239,68,68,.1)', borderRadius:8, border:'1px solid rgba(239,68,68,.3)',
            cursor:'pointer' }} onClick={() => navigate('/notifications')}>
            <AlertTriangle size={14} color="var(--red)"/>
            <span style={{ fontSize:12, color:'var(--red)', fontWeight:600 }}>
              {d.critical_alerts} تنبيه حرج
            </span>
          </div>
        )}
      </div>

      {/* نظرة عامة على العمليات */}
      {d.operations && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
          {[
            { label:'مواعيد اليوم',      val: d.operations.appointments_today,    icon: CalendarDays,  color:'#06B6D4', to:'/appointments' },
            { label:'عروض أسعار معلقة',  val: d.operations.pending_quotations,    icon: FileText,      color:'#8B5CF6', to:'/quotations' },
            { label:'أوامر شراء جارية',  val: d.operations.pending_pos,           icon: ShoppingCart,  color:'#F59E0B', to:'/purchase-orders' },
            { label:'طلبات قطع معلقة',   val: d.operations.pending_part_requests, icon: PackageSearch, color:'#EF4444', to:'/inventory' },
            { label:'ضمانات الشهر',      val: d.operations.warranty_month,        icon: Shield,        color:'#10B981', to:'/warranty' },
            { label:'عملاء جدد',         val: d.operations.new_customers,         icon: UserPlus,      color:'#3B82F6', to:'/customers' },
          ].map(op => (
            <div key={op.label} onClick={() => navigate(op.to)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                background:'var(--ink-2)', borderRadius:10, border:'1px solid var(--border)',
                cursor:'pointer', transition:'border-color .15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = op.color}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              <div style={{ width:34, height:34, borderRadius:8, flexShrink:0,
                background:`${op.color}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <op.icon size={16} color={op.color}/>
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:17, fontWeight:800, color:'var(--text-2)', fontFamily:'monospace', lineHeight:1.1 }}>
                  {op.val || 0}
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', whiteSpace:'nowrap' }}>{op.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs المالية */}
      {CAN.finance && d.financial && (
        <>
          <SectionTitle icon={DollarSign} title="الأداء المالي" color="var(--green)"/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
            <KPICard label="إيرادات اليوم" value={d.financial.today_revenue}
              icon={DollarSign} color="var(--green)" suffix=" ر.س"/>
            <KPICard label="إيرادات الشهر" value={d.financial.month_revenue}
              icon={TrendingUp} color="var(--blue)"
              trend={d.financial.growth_pct} sub="مقارنة بالشهر الماضي" suffix=" ر.س"/>
            <KPICard label="ذمم مستحقة" value={d.financial.pending_balance}
              icon={Receipt} color="var(--amber)" suffix=" ر.س"
              sub={`${d.financial.pending_invoices} فاتورة معلقة`}/>
            <KPICard label="فواتير مدفوعة" value={d.financial.paid_invoices}
              icon={CheckCircle} color="var(--green)" suffix=" هذا الشهر"/>
          </div>

          {/* مخطط الإيرادات */}
          <div style={{ background:'var(--ink-2)', borderRadius:12, padding:20, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <SectionTitle icon={BarChart2} title="مخطط الإيرادات"/>
              <div style={{ display:'flex', gap:4, background:'var(--ink-3)', borderRadius:8, padding:3 }}>
                {[{k:'week',l:'أسبوع'},{k:'month',l:'شهر'}].map(p => (
                  <button key={p.k} onClick={() => setChartPeriod(p.k)}
                    style={{ padding:'4px 12px', borderRadius:6, border:'none', cursor:'pointer',
                      fontFamily:'var(--font)', fontSize:11, fontWeight:500,
                      background: chartPeriod===p.k ? 'var(--blue)' : 'transparent',
                      color: chartPeriod===p.k ? '#fff' : 'var(--muted)' }}>
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chart} margin={{ top:0, right:0, left:-20, bottom:0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="period" tick={{ fontSize:10, fill:'var(--muted)' }}
                  tickFormatter={v => new Date(v).toLocaleDateString('ar-SA',{day:'2-digit',month:'2-digit'})}/>
                <YAxis tick={{ fontSize:10, fill:'var(--muted)' }}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}/>
                <Tooltip
                  formatter={(v) => [`${Number(v).toLocaleString()} ر.س`, 'الإيرادات']}
                  labelFormatter={v => new Date(v).toLocaleDateString('ar-SA')}
                  contentStyle={{ background:'var(--ink-2)', border:'1px solid var(--border)', borderRadius:8, direction:'rtl' }}/>
                <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2}
                  fill="url(#revGrad)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* التذاكر */}
      <div style={{ display:'grid', gridTemplateColumns: CAN.allTickets ? '1fr 280px' : '1fr', gap:16 }}>
        {/* آخر التذاكر */}
        <div style={{ background:'var(--ink-2)', borderRadius:12, padding:20, border:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <SectionTitle icon={Wrench} title="آخر التذاكر"/>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/tickets')}>عرض الكل</button>
          </div>

          {/* KPIs التذاكر */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 }}>
            {[
              { label:'اليوم', val: d.tickets?.today, color:'var(--blue)' },
              { label:'نشطة', val: d.tickets?.active, color:'var(--amber)' },
              { label:'عاجلة', val: d.tickets?.urgent, color:'var(--red)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', padding:'10px 8px',
                background:`${s.color}10`, borderRadius:8, border:`1px solid ${s.color}25` }}>
                <div style={{ fontSize:20, fontWeight:800, color:s.color, fontFamily:'monospace' }}>{s.val || 0}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* جدول التذاكر */}
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {['رقم','العميل','الجهاز','الحالة','الأولوية'].map(h => (
                    <th key={h} style={{ padding:'6px 8px', textAlign:'right', color:'var(--muted)',
                      fontWeight:500, fontSize:11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.recent_tickets || []).map(t => {
                  const cfg = STATUS_CONFIG[t.status] || { label: t.status, color:'#6B7280' }
                  return (
                    <tr key={t.id} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                      onClick={() => navigate('/tickets')}>
                      <td style={{ padding:'7px 8px', color:'var(--blue)', fontFamily:'monospace', fontSize:11 }}>
                        {t.order_number}
                      </td>
                      <td style={{ padding:'7px 8px', color:'var(--text-2)' }}>{t.customer_name}</td>
                      <td style={{ padding:'7px 8px', color:'var(--muted)', fontSize:11 }}>
                        {t.brand} {t.model}
                      </td>
                      <td style={{ padding:'7px 8px' }}>
                        <span style={{ padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:600,
                          background:`${cfg.color}18`, color:cfg.color }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ padding:'7px 8px' }}>
                        {t.priority === 'urgent' && (
                          <span style={{ color:'var(--red)', fontSize:10, fontWeight:600 }}>⚡ عاجل</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!d.recent_tickets?.length && (
              <div style={{ textAlign:'center', padding:'20px', color:'var(--muted)', fontSize:12 }}>
                لا توجد تذاكر
              </div>
            )}
          </div>
        </div>

        {/* توزيع الحالات */}
        {CAN.allTickets && (
          <div style={{ background:'var(--ink-2)', borderRadius:12, padding:20, border:'1px solid var(--border)' }}>
            <SectionTitle icon={BarChart2} title="توزيع الحالات" color="var(--purple)"/>
            {(d.tickets?.by_status || [])
              .filter(s => !['delivered','cancelled','rejected'].includes(s.status))
              .sort((a,b) => b.count - a.count)
              .map(s => (
                <StatusPill key={s.status} status={s.status} count={parseInt(s.count)}/>
              ))}
          </div>
        )}
      </div>

      {/* أداء الفنيين */}
      {CAN.techPerf && d.technicians?.length > 0 && (
        <div style={{ background:'var(--ink-2)', borderRadius:12, padding:20, border:'1px solid var(--border)' }}>
          <SectionTitle icon={Users} title="أداء الفنيين" color="var(--purple)"/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10 }}>
            {d.technicians.map(t => (
              <div key={t.id} style={{ padding:'14px', background:'var(--ink-3)',
                borderRadius:10, border:'1px solid var(--border)' }}>
                <div style={{ fontWeight:700, color:'var(--text-2)', fontSize:13, marginBottom:10 }}>
                  🔧 {t.full_name}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {[
                    { label:'نشط', val: t.active || 0, color:'var(--amber)' },
                    { label:'أنجز اليوم', val: t.done_today || 0, color:'var(--green)' },
                    { label:'الشهر', val: t.done_month || 0, color:'var(--blue)' },
                    { label:'متوسط الوقت', val: t.avg_hours ? `${t.avg_hours}h` : '—', color:'var(--muted)' },
                  ].map(row => (
                    <div key={row.label} style={{ display:'flex', justifyContent:'space-between',
                      fontSize:12, padding:'2px 0' }}>
                      <span style={{ color:'var(--muted)' }}>{row.label}</span>
                      <span style={{ fontWeight:600, color:row.color, fontFamily:'monospace' }}>{row.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* المخزون والموردون */}
      {(CAN.inventory || CAN.suppliers) && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

          {/* المخزون */}
          {CAN.inventory && d.inventory && (
            <div style={{ background:'var(--ink-2)', borderRadius:12, padding:20, border:'1px solid var(--border)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <SectionTitle icon={Package} title="حالة المخزون" color="var(--amber)"/>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventory')}>عرض الكل</button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                <div style={{ textAlign:'center', padding:'10px', background:'rgba(239,68,68,.08)',
                  borderRadius:8, border:'1px solid rgba(239,68,68,.2)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'var(--red)', fontFamily:'monospace' }}>
                    {d.inventory.low_stock?.length || 0}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>منخفض المخزون</div>
                </div>
                <div style={{ textAlign:'center', padding:'10px', background:'rgba(245,158,11,.08)',
                  borderRadius:8, border:'1px solid rgba(245,158,11,.2)' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'var(--amber)', fontFamily:'monospace' }}>
                    {d.inventory.defective_count || 0}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>توالف بانتظار</div>
                </div>
              </div>

              {/* الأكثر استخداماً */}
              {d.inventory.top_used?.length > 0 && (
                <>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6, fontWeight:500 }}>
                    أكثر القطع استخداماً هذا الشهر
                  </div>
                  {d.inventory.top_used.map((p, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between',
                      padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                      <span style={{ color:'var(--text-2)' }}>{p.name}</span>
                      <span style={{ color:'var(--blue)', fontFamily:'monospace', fontWeight:600 }}>
                        {p.total_qty} وحدة
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* تنبيهات المنخفض */}
              {d.inventory.low_stock?.length > 0 && (
                <div style={{ marginTop:12 }}>
                  <div style={{ fontSize:11, color:'var(--red)', marginBottom:6, fontWeight:500 }}>
                    ⚠️ تحتاج تجديداً
                  </div>
                  {d.inventory.low_stock.slice(0,4).map(p => (
                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between',
                      padding:'4px 0', fontSize:11 }}>
                      <span style={{ color:'var(--text)' }}>{p.name}</span>
                      <span style={{ color:'var(--red)', fontFamily:'monospace' }}>
                        {p.quantity} / {p.min_quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* الموردون */}
          {CAN.suppliers && (
            <div style={{ background:'var(--ink-2)', borderRadius:12, padding:20, border:'1px solid var(--border)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <SectionTitle icon={Truck} title="أعلى الموردين" color="var(--blue)"/>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/suppliers')}>عرض الكل</button>
              </div>
              {d.suppliers?.length ? d.suppliers.map((s, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)' }}>{s.name}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{s.purchases_count} فاتورة شراء</div>
                  </div>
                  <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--blue)', fontSize:12 }}>
                    {Number(s.total_spent).toLocaleString()} ر.س
                  </span>
                </div>
              )) : (
                <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'20px 0' }}>
                  لا توجد بيانات موردين
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
