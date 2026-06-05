import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { StatCard, StatusBadge, Loading } from '../components/ui'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, TrendingUp, Wrench, Package, Users, Receipt } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

// ─── صلاحيات كل قسم ───────────────────────────────────────
const CAN = {
  seeRevenue:    ['admin', 'branch_manager', 'accountant'],
  seeAllOrders:  ['admin', 'branch_manager', 'receptionist', 'customer_service'],
  seeTechPerf:   ['admin', 'branch_manager'],
  seeInventory:  ['admin', 'branch_manager', 'warehouse'],
  seeInvoices:   ['admin', 'branch_manager', 'accountant', 'receptionist'],
}

const can = (role, perm) => CAN[perm]?.includes(role)

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'صباح الخير'
  if (h < 17) return 'مساء الخير'
  return 'مساء النور'
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t, isEn } = useT()
  const role = user?.role

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', user?.id],
    queryFn: () => api.get('/dashboard'),
    refetchInterval: 60000
  })

  const { data: revenueData } = useQuery({
    queryKey: ['revenue'],
    queryFn: () => api.get('/reports/revenue?period=monthly'),
    enabled: can(role, 'seeRevenue')
  })

  if (isLoading) return <Loading />

  const d     = data?.data || {}
  const stats = d.stats    || {}

  const chartData = (revenueData?.data || []).map(r => ({
    name:    format(new Date(r.period), 'MMM', { locale: ar }),
    إيرادات: Math.round(r.revenue || 0)
  }))

  return (
    <div className="page fade-in">

      {/* ── رأس الصفحة ── */}
      <div className="page-header">
        <div>
          <div className="page-title">
            {greeting()}، {user?.fullName?.split(' ')[0]} 👋
          </div>
          <div className="page-sub">
            {format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar })}
            <span style={{ marginRight: 8, padding: '2px 8px', borderRadius: 4, fontSize: 11,
              background: 'var(--blue-dim)', color: 'var(--blue)' }}>
              {getRoleLabel(role)}
            </span>
          </div>
        </div>
      </div>

      {/* ── بطاقات الإحصاء — تتغير حسب الدور ── */}
      <div className="stats-grid">
        {/* تذاكر اليوم — يراها الجميع لكن بمحتوى مختلف */}
        <StatCard
          label={role === 'technician' ? (isEn ? 'My Tickets Today' : 'تذاكري اليوم') : t('todayTickets')}
          value={stats.orders_today ?? 0}
          sub={role === 'technician' ? (isEn?'Assigned to you today':'التذاكر المسندة إليك اليوم') : (isEn?'Total tickets received today':'إجمالي التذاكر المستلمة')}
          color="blue"
        />

        {/* قيد العمل — يراها الجميع */}
        <StatCard
          label={role === 'technician' ? (isEn?'My Active Tickets':'تذاكري النشطة') : t('activeOrders')}
          value={stats.active_orders ?? 0}
          sub="لم تُسلَّم بعد"
          color="amber"
        />

        {/* الإيرادات — للمدير والمحاسب فقط */}
        {can(role, 'seeRevenue') ? (
          <StatCard
            label={t('monthRevenue')}
            value={`${(stats.month_revenue || 0).toLocaleString('ar-SA')} ر`}
            sub="من الفواتير المدفوعة"
            color="green"
          />
        ) : (
          /* بدلاً عنها: تذاكر جاهزة للتسليم */
          <StatCard
            label={isEn?'Ready for Pickup':'جاهزة للتسليم'}
            value={(d.status_breakdown || []).find(s => s.status === 'ready')?.count ?? 0}
            sub="تذاكر بانتظار الاستلام"
            color="green"
          />
        )}

        {/* المخزون — لمسؤول المخزن والمدير / للفني: تذاكر مكتملة اليوم */}
        {can(role, 'seeInventory') ? (
          <StatCard
            label={t('lowStockAlerts')}
            value={stats.low_stock_alerts ?? 0}
            sub={stats.low_stock_alerts > 0 ? 'صنف تحت الحد الأدنى' : 'المخزون سليم'}
            subType={stats.low_stock_alerts > 0 ? 'down' : 'up'}
            color="purple"
          />
        ) : (
          <StatCard
            label={isEn?'Completed Today':'مكتملة اليوم'}
            value={(d.technicians || []).find(t => t.id === user?.id)?.completed_today ?? 0}
            sub="تذاكر أنهيتها اليوم"
            subType="up"
            color="purple"
          />
        )}
      </div>

      {/* ── المحتوى الرئيسي — حسب الدور ── */}

      {/* مدير / مشرف / موظف استقبال / خدمة عملاء */}
      {can(role, 'seeAllOrders') && (
        <div className="two-col">
          <div className="card">
            <div className="card-header">
              <span className="card-title">{isEn?'Recent Tickets':t('recentTickets')}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/tickets')}>
                {t('viewAll')}
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>رقم</th><th>العميل</th><th>الجهاز</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {(d.recent_orders || []).map(o => (
                    <tr key={o.order_number} style={{ cursor:'pointer' }}
                      onClick={() => navigate('/tickets')}>
                      <td><span className="font-mono text-xs text-blue">{o.order_number}</span></td>
                      <td style={{ color:'var(--text-2)' }}>{o.customer_name}</td>
                      <td className="text-muted2 text-sm">{o.brand} {o.model}</td>
                      <td><StatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                  {!d.recent_orders?.length && (
                    <tr>
                      <td colSpan={4} style={{ textAlign:'center', color:'var(--muted)', padding:24 }}>
                        لا توجد تذاكر
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* الإيرادات للمدير / أحدث التذاكر لموظف الاستقبال */}
          {can(role, 'seeRevenue') ? (
            <div className="card">
              <div className="card-header">
                <span className="card-title">{isEn?'Monthly Revenue':'الإيرادات الشهرية'}</span>
                <TrendingUp size={15} color="var(--green)" />
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background:'var(--ink-3)', border:'1px solid var(--border-2)', borderRadius:6, fontSize:12 }} labelStyle={{ color:'var(--text-2)' }} />
                    <Area type="monotone" dataKey="إيرادات" stroke="#3B82F6" strokeWidth={2} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)', fontSize:13 }}>
                  لا توجد بيانات إيرادات بعد
                </div>
              )}
            </div>
          ) : (
            /* موظف استقبال / خدمة عملاء — يرى توزيع الحالات */
            <div className="card">
              <div className="card-header">
                <span className="card-title">حالات التذاكر</span>
              </div>
              <StatusBreakdown data={d.status_breakdown || []} />
            </div>
          )}
        </div>
      )}

      {/* مهندس الصيانة — لوحة خاصة */}
      {role === 'technician' && (
        <TechnicianDashboard
          myOrders={d.recent_orders || []}
          techData={(d.technicians || []).find(t => t.id === user?.id)}
          navigate={navigate}
        />
      )}

      {/* مسؤول المخزن — لوحة خاصة */}
      {role === 'warehouse' && (
        <WarehouseDashboard stats={stats} navigate={navigate} />
      )}

      {/* محاسب — لوحة خاصة */}
      {role === 'accountant' && (
        <div className="two-col">
          <div className="card">
            <div className="card-header">
              <span className="card-title">{isEn?'Monthly Revenue':'الإيرادات الشهرية'}</span>
              <TrendingUp size={15} color="var(--green)" />
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="rev2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background:'var(--ink-3)', border:'1px solid var(--border-2)', borderRadius:6, fontSize:12 }} />
                  <Area type="monotone" dataKey="إيرادات" stroke="#10B981" strokeWidth={2} fill="url(#rev2)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign:'center', padding:40, color:'var(--muted)', fontSize:13 }}>لا توجد بيانات</div>
            )}
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">اختصارات</span></div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:4 }}>
              <button className="btn btn-ghost w-full" style={{ justifyContent:'flex-end' }} onClick={() => navigate('/invoices')}>
                <Receipt size={14}/> عرض الفواتير
              </button>
              <button className="btn btn-ghost w-full" style={{ justifyContent:'flex-end' }} onClick={() => navigate('/reports')}>
                <TrendingUp size={14}/> التقارير المالية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* أداء الفنيين — للمدير والمشرف فقط */}
      {can(role, 'seeTechPerf') && (d.technicians || []).length > 0 && (
        <div className="card mt-3">
          <div className="card-header">
            <span className="card-title">{t('techPerformance')}</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:10 }}>
            {d.technicians.map(t => (
              <div key={t.id} style={{ background:'var(--ink-3)', borderRadius:8, padding:'12px 14px', border:'1px solid var(--border)' }}>
                <div style={{ fontWeight:500, color:'var(--text-2)', marginBottom:6, fontSize:13 }}>{t.full_name}</div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                  <span className="text-muted">نشط</span>
                  <span className="text-amber font-mono">{t.active_orders || 0}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginTop:3 }}>
                  <span className="text-muted">مكتمل اليوم</span>
                  <span className="text-green font-mono">{t.completed_today || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* تنبيه المخزون — للمدير ومسؤول المخزن */}
      {can(role, 'seeInventory') && stats.low_stock_alerts > 0 && (
        <div className="card mt-3" style={{ borderColor:'var(--amber-dim)', background:'rgba(245,158,11,0.04)' }}>
          <div className="flex-center gap-2" style={{ color:'var(--amber)' }}>
            <AlertTriangle size={16} />
            <span className="font-medium">
              تحذير: {stats.low_stock_alerts} أصناف تحت الحد الأدنى في المخزون
            </span>
            <button className="btn btn-ghost btn-sm" style={{ marginRight:'auto' }}
              onClick={() => navigate('/inventory')}>
              عرض التنبيهات
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── لوحة الفني ───────────────────────────────────────────
function TechnicianDashboard({ myOrders, techData, navigate }) {
  const { t, isEn } = useT()
  const STATUS_AR = {
    new:'تم الاستلام', quick_check:'فحص سريع', diagnosing:'قيد الفحص',
    waiting_approval:'انتظار موافقة', in_repair:'داخل الورشة',
    waiting_part:'ينتظر قطعة', ready:'جاهز', delivered:'تم التسليم',
    rejected:'مرفوض'
  }
  const STATUS_BADGE = {
    new:'badge-new', quick_check:'badge-diag', diagnosing:'badge-diag',
    in_repair:'badge-repair', waiting_part:'badge-wait', waiting_approval:'badge-wait',
    ready:'badge-ready', delivered:'badge-done', rejected:'badge-cancel'
  }

  return (
    <div>
      {/* ملخص الفني */}
      {techData && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
          <div className="stat-card blue">
            <div className="stat-label">تذاكر نشطة</div>
            <div className="stat-value">{techData.active_orders || 0}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">مكتملة اليوم</div>
            <div className="stat-value">{techData.completed_today || 0}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-label">مجموع إنجازاتي</div>
            <div className="stat-value">{techData.total_completed || 0}</div>
          </div>
        </div>
      )}

      {/* تذاكري */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">تذاكري النشطة</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/tickets?my=true')}>
            {t('viewAll')}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>رقم التذكرة</th><th>العميل</th><th>الجهاز</th><th>الحالة</th><th>الوقت</th></tr>
            </thead>
            <tbody>
              {myOrders.filter(o => !['delivered','cancelled','rejected'].includes(o.status)).map(o => {
                const hrs = Math.round((Date.now() - new Date(o.received_at)) / 3600000)
                return (
                  <tr key={o.order_number} style={{ cursor:'pointer' }} onClick={() => navigate('/tickets')}>
                    <td><span className="font-mono text-xs text-blue">{o.order_number}</span></td>
                    <td style={{ color:'var(--text-2)' }}>{o.customer_name}</td>
                    <td className="text-sm text-muted2">{o.brand} {o.model}</td>
                    <td><span className={`badge ${STATUS_BADGE[o.status] || ''}`}>{STATUS_AR[o.status] || o.status}</span></td>
                    <td className="text-xs text-muted font-mono">
                      {hrs < 24 ? `${hrs}س` : `${Math.floor(hrs/24)}ي`}
                    </td>
                  </tr>
                )
              })}
              {!myOrders.filter(o => !['delivered','cancelled','rejected'].includes(o.status)).length && (
                <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--muted)', padding:24 }}>
                  لا توجد تذاكر نشطة
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── لوحة المخزن ──────────────────────────────────────────
function WarehouseDashboard({ stats, navigate }) {
  const { t, isEn } = useT()
  const { data: partsData } = useQuery({
    queryKey: ['low-stock-dash'],
    queryFn: () => api.get('/inventory/alerts')
  })
  const parts = partsData?.data || []

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
        <div className="stat-card purple">
          <div className="stat-label">تذاكر تنتظر قطعة</div>
          <div className="stat-value">{stats.active_orders ?? 0}</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">أصناف منخفضة</div>
          <div className="stat-value" style={{ color: parts.length > 0 ? 'var(--red)' : undefined }}>
            {stats.low_stock_alerts ?? 0}
          </div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">حالة المخزون</div>
          <div className="stat-value" style={{ fontSize:'1.2rem' }}>
            {stats.low_stock_alerts > 0 ? '⚠️' : '✅'}
          </div>
        </div>
      </div>

      {parts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ color:'var(--red)' }}>
              ⚠️ أصناف تحتاج تعبئة ({parts.length})
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventory')}>
              إدارة المخزون
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>الصنف</th><th>الكمية الحالية</th><th>الحد الأدنى</th><th>المورد</th></tr></thead>
              <tbody>
                {parts.slice(0, 8).map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight:500, color:'var(--text-2)' }}>{p.name}</td>
                    <td className="font-mono text-red font-bold">{p.quantity}</td>
                    <td className="font-mono text-muted">{p.min_quantity}</td>
                    <td className="text-sm text-muted2">{p.supplier_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── توزيع الحالات (لموظف الاستقبال) ─────────────────────
function StatusBreakdown({ data }) {
  const STATUS_CONFIG = {
    new:              { label:'تم الاستلام',      color:'var(--blue)' },
    quick_check:      { label:'فحص سريع',         color:'var(--purple)' },
    diagnosing:       { label:'قيد الفحص',        color:'var(--purple)' },
    in_repair:        { label:'داخل الورشة',      color:'var(--amber)' },
    waiting_part:     { label:'ينتظر قطعة',       color:'#F97316' },
    waiting_approval: { label:'انتظار موافقة',    color:'var(--amber)' },
    awaiting_technician_rejection: { label:'انتظار تأكيد الفني', color:'#EF4444' },
    ready:            { label:'جاهز للتسليم',     color:'var(--green)' },
  }
  const total = data.reduce((s, i) => s + parseInt(i.count || 0), 0)

  if (!data.length) return (
    <div style={{ textAlign:'center', padding:'30px 0', color:'var(--muted)', fontSize:13 }}>
      لا توجد تذاكر نشطة
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, paddingTop:4 }}>
      {data.map(s => {
        const cfg = STATUS_CONFIG[s.status]
        if (!cfg) return null
        const pct = total > 0 ? Math.round((s.count / total) * 100) : 0
        return (
          <div key={s.status}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
              <span style={{ color:'var(--text-2)' }}>{cfg.label}</span>
              <span className="font-mono" style={{ color:cfg.color, fontWeight:600 }}>{s.count}</span>
            </div>
            <div style={{ height:6, borderRadius:3, background:'var(--ink-4)', overflow:'hidden' }}>
              <div style={{ width:`${pct}%`, height:'100%', background:cfg.color, borderRadius:3, transition:'width .4s' }} />
            </div>
          </div>
        )
      })}
      <div style={{ fontSize:11, color:'var(--muted)', textAlign:'left', marginTop:4 }}>
        الإجمالي: {total} تذكرة نشطة
      </div>
    </div>
  )
}

// ─── تسمية الأدوار ─────────────────────────────────────────
function getRoleLabel(role) {
  const map = {
    admin:            'مدير النظام',
    branch_manager:   'مشرف الفرع',
    receptionist:     'موظف استقبال',
    technician:       'مهندس صيانة',
    customer_service: 'خدمة العملاء',
    warehouse:        'مسؤول المخزن',
    accountant:       'محاسب',
  }
  return map[role] || role
}
