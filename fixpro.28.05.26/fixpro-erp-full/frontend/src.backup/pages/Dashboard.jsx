import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { StatCard, StatusBadge, PriorityBadge, Loading } from '../components/ui'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
    refetchInterval: 60000
  })

  const { data: revenueData } = useQuery({
    queryKey: ['revenue'],
    queryFn: () => api.get('/reports/revenue?period=monthly'),
  })

  if (isLoading) return <Loading />

  const d = data?.data || {}
  const stats = d.stats || {}

  const chartData = revenueData?.data?.map(r => ({
    name: format(new Date(r.period), 'MMM', { locale: ar }),
    إيرادات: Math.round(r.revenue || 0)
  })) || []

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'صباح الخير'
    if (h < 17) return 'مساء الخير'
    return 'مساء النور'
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">{greeting()}، {user?.fullName?.split(' ')[0]} 👋</div>
          <div className="page-sub">
            {format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar })}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard
          label="أوردرات اليوم"
          value={stats.orders_today ?? 0}
          sub="إجمالي الأوردرات المستلمة اليوم"
          color="blue"
        />
        <StatCard
          label="قيد العمل"
          value={stats.active_orders ?? 0}
          sub="أوردر لم يُسلّم بعد"
          color="amber"
        />
        <StatCard
          label="إيرادات الشهر"
          value={`${(stats.month_revenue || 0).toLocaleString('ar-SA')} ر`}
          sub="من الفواتير المدفوعة"
          color="green"
        />
        <StatCard
          label="تنبيهات المخزون"
          value={stats.low_stock_alerts ?? 0}
          sub={stats.low_stock_alerts > 0 ? "صنف تحت الحد الأدنى" : "المخزون سليم"}
          subType={stats.low_stock_alerts > 0 ? 'down' : 'up'}
          color="purple"
        />
      </div>

      <div className="two-col">
        {/* Recent Orders */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">آخر الأوردرات</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orders')}>عرض الكل</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم</th>
                  <th>العميل</th>
                  <th>الجهاز</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {(d.recent_orders || []).map(o => (
                  <tr key={o.order_number} style={{ cursor: 'pointer' }} onClick={() => navigate('/orders')}>
                    <td><span className="font-mono text-xs text-blue">{o.order_number}</span></td>
                    <td style={{ color: 'var(--text-2)' }}>{o.customer_name}</td>
                    <td className="text-muted2 text-sm">{o.brand} {o.model}</td>
                    <td><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
                {!d.recent_orders?.length && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>لا توجد أوردرات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Revenue Chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">الإيرادات الشهرية</span>
            <TrendingUp size={15} color="var(--green)" />
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--ink-3)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-2)' }}
                />
                <Area type="monotone" dataKey="إيرادات" stroke="#3B82F6" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
              لا توجد بيانات إيرادات بعد
            </div>
          )}
        </div>
      </div>

      {/* Technician Performance */}
      {(d.technicians || []).length > 0 && (
        <div className="card mt-3">
          <div className="card-header">
            <span className="card-title">أداء الفنيين اليوم</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 10 }}>
            {d.technicians.map(t => (
              <div key={t.id} style={{
                background: 'var(--ink-3)', borderRadius: 8, padding: '12px 14px',
                border: '1px solid var(--border)'
              }}>
                <div style={{ fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, fontSize: 13 }}>{t.full_name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span className="text-muted">نشط</span>
                  <span className="text-amber font-mono">{t.active_orders || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 3 }}>
                  <span className="text-muted">مكتمل اليوم</span>
                  <span className="text-green font-mono">{t.completed_today || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low Stock Alert */}
      {stats.low_stock_alerts > 0 && (
        <div className="card mt-3" style={{ borderColor: 'var(--amber-dim)', background: 'rgba(245,158,11,0.04)' }}>
          <div className="flex-center gap-2" style={{ color: 'var(--amber)' }}>
            <AlertTriangle size={16} />
            <span className="font-medium">تحذير: {stats.low_stock_alerts} أصناف تحت الحد الأدنى في المخزون</span>
            <button className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }} onClick={() => navigate('/inventory')}>
              عرض التنبيهات
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
