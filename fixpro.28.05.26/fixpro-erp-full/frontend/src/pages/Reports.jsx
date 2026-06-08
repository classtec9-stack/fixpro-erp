import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { Loading, EmptyState } from '../components/ui'
import { BarChart2, TrendingUp, Package, Users, ArrowUp, ArrowDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

const TABS = [
  { id:'daily',       label:'اليوم',         icon:'📅' },
  { id:'revenue',     label:'الإيرادات',      icon:'💰' },
  { id:'profitability', label:'الربحية',      icon:'📊' },
  { id:'technicians', label:'أداء الفنيين',   icon:'👨‍🔧' },
  { id:'inventory',   label:'تقييم المخزون',  icon:'📦' },
  { id:'customers',   label:'تحليل العملاء',  icon:'👥' },
]

export default function ReportsPage() {
  const [tab, setTab]   = useState('daily')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-title">التقارير والتحليلات</div>
        <div style={{ display:'flex', gap:8 }}>
          <select className="form-select" style={{ width:90 }} value={year} onChange={e=>setYear(Number(e.target.value))}>
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--border)', marginBottom:20, overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'8px 16px', border:'none', background:'none', cursor:'pointer',
              color: tab===t.id ? 'var(--blue)' : 'var(--muted-2)', fontFamily:'var(--font)',
              fontSize:13, fontWeight: tab===t.id ? 600 : 400, whiteSpace:'nowrap',
              borderBottom: tab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom:-1 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily'         && <DailyTab/>}
      {tab === 'revenue'       && <RevenueTab year={year}/>}
      {tab === 'profitability' && <ProfitabilityTab/>}
      {tab === 'technicians'   && <TechniciansTab year={year} month={month}/>}
      {tab === 'inventory'     && <InventoryTab/>}
      {tab === 'customers'     && <CustomersTab/>}
    </div>
  )
}

function DailyTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-daily'],
    queryFn: () => api.get('/reports/daily'),
  })
  const d = data?.data || {}

  if (isLoading) return <Loading/>
  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'تذاكر اليوم',      value: d.today_tickets    || 0, color:'blue' },
          { label:'تم إصلاحها',        value: d.completed_today  || 0, color:'green' },
          { label:'جاهزة للتسليم',    value: d.ready_count      || 0, color:'amber' },
          { label:'مرفوضة اليوم',     value: d.rejected_today   || 0, color:'purple' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {d.tech_performance?.length > 0 && (
        <div className="card">
          <div className="card-header"><div className="card-title">أداء الفنيين اليوم</div></div>
          <table style={{ fontSize:13, width:'100%' }}>
            <thead><tr><th>الفني</th><th>تذاكر نشطة</th><th>أنجز اليوم</th></tr></thead>
            <tbody>
              {d.tech_performance.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight:500 }}>{t.full_name}</td>
                  <td><span className="badge badge-repair">{t.active_orders}</span></td>
                  <td><span className="badge badge-ready">{t.completed_today}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RevenueTab({ year }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-revenue', year],
    queryFn: () => api.get(`/reports/revenue?period=monthly&year=${year}`),
  })

  const rows = (data?.data || []).map(r => ({
    ...r,
    month: new Date(r.period).toLocaleDateString('ar-SA', { month:'short' }),
    revenue: parseFloat(r.revenue || 0),
  }))

  if (isLoading) return <Loading/>
  return (
    <div style={{ display:'grid', gap:16 }}>
      <div className="card">
        <div className="card-header"><div className="card-title">الإيرادات الشهرية — {year}</div></div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
            <XAxis dataKey="month" tick={{ fill:'var(--muted-2)', fontSize:12 }}/>
            <YAxis tick={{ fill:'var(--muted-2)', fontSize:12 }}/>
            <Tooltip contentStyle={{ background:'var(--ink-2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)' }}/>
            <Bar dataKey="revenue" fill="var(--blue)" radius={[4,4,0,0]} name="الإيراد"/>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card" style={{ padding:0 }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}><div className="card-title">التفاصيل</div></div>
        <div className="table-wrap">
          <table style={{ fontSize:13 }}>
            <thead><tr><th>الشهر</th><th>عدد الفواتير</th><th>الإيراد</th><th>ضريبة القيمة المضافة</th></tr></thead>
            <tbody>
              {rows.map((r,i) => (
                <tr key={i}>
                  <td>{r.month}</td>
                  <td>{r.invoice_count}</td>
                  <td style={{ color:'var(--green)', fontWeight:600 }}>{r.revenue.toLocaleString('ar-SA')} ر.س</td>
                  <td style={{ color:'var(--muted)' }}>{parseFloat(r.vat_collected||0).toLocaleString('ar-SA')} ر.س</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ProfitabilityTab() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['report-profit', page],
    queryFn: () => api.get(`/reports/profitability?page=${page}&limit=30`),
    keepPreviousData: true,
  })

  const rows = data?.data || []
  const summary = data?.summary || {}

  if (isLoading) return <Loading/>
  return (
    <div style={{ display:'grid', gap:16 }}>
      {/* ملخص */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <div className="stat-card blue">
          <div className="stat-label">إجمالي الإيرادات</div>
          <div className="stat-value" style={{ fontSize:'1.3rem' }}>{(summary.total_revenue||0).toLocaleString('ar-SA')}</div>
          <div className="stat-sub">ر.س</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">تكلفة القطع</div>
          <div className="stat-value" style={{ fontSize:'1.3rem', color:'var(--red)' }}>{(summary.total_parts_cogs||0).toLocaleString('ar-SA')}</div>
          <div className="stat-sub">ر.س</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">إجمالي الربح</div>
          <div className="stat-value" style={{ fontSize:'1.3rem' }}>{(summary.total_profit||0).toLocaleString('ar-SA')}</div>
          <div className="stat-sub">ر.س</div>
        </div>
        <div className={`stat-card ${summary.margin_pct >= 40 ? 'green' : 'amber'}`}>
          <div className="stat-label">هامش الربح</div>
          <div className="stat-value" style={{ fontSize:'1.3rem' }}>{summary.margin_pct||0}%</div>
        </div>
      </div>

      <div className="card" style={{ padding:0 }}>
        <div className="table-wrap">
          <table style={{ fontSize:12 }}>
            <thead>
              <tr>
                <th>التذكرة</th><th>العميل</th><th>الجهاز</th><th>الفني</th>
                <th>الإيراد</th><th>تكلفة قطع</th><th>الربح</th><th>الهامش</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i) => {
                const margin = r.revenue > 0 ? ((r.gross_profit / r.revenue)*100).toFixed(0) : 0
                return (
                  <tr key={i}>
                    <td style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{r.order_number}</td>
                    <td>{r.customer_name}</td>
                    <td style={{ color:'var(--muted)' }}>{r.brand} {r.model}</td>
                    <td style={{ color:'var(--muted)' }}>{r.technician_name||'—'}</td>
                    <td style={{ color:'var(--green)', fontWeight:600 }}>{parseFloat(r.revenue||0).toLocaleString('ar-SA')}</td>
                    <td style={{ color:'var(--red)' }}>{parseFloat(r.parts_cogs||0).toLocaleString('ar-SA')}</td>
                    <td style={{ color: r.gross_profit >= 0 ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>
                      {parseFloat(r.gross_profit||0).toLocaleString('ar-SA')}
                    </td>
                    <td>
                      <span style={{ color: margin >= 40 ? 'var(--green)' : margin >= 20 ? 'var(--amber)' : 'var(--red)',
                        fontWeight:600 }}>{margin}%</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function TechniciansTab({ year, month }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-techs', year, month],
    queryFn: () => api.get(`/reports/technician-performance?year=${year}${month?`&month=${month}`:''}`),
  })

  const rows = data?.data || []
  if (isLoading) return <Loading/>

  return (
    <div className="card" style={{ padding:0 }}>
      <div className="table-wrap">
        <table style={{ fontSize:13 }}>
          <thead>
            <tr><th>الفني</th><th>تخصص</th><th>مكتملة</th><th>نشطة</th>
            <th>ضمانات</th><th>متوسط وقت الإصلاح</th><th>الإيرادات</th><th>الأرباح</th></tr>
          </thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight:500 }}>{t.full_name}</td>
                <td style={{ color:'var(--muted)', fontSize:11 }}>{t.specialty||'—'}</td>
                <td><span className="badge badge-ready">{t.completed}</span></td>
                <td><span className="badge badge-repair">{t.active}</span></td>
                <td style={{ color: t.warranty_count > 2 ? 'var(--red)' : 'var(--muted)' }}>{t.warranty_count}</td>
                <td style={{ color:'var(--muted)' }}>{t.avg_repair_hours ? `${t.avg_repair_hours}س` : '—'}</td>
                <td style={{ color:'var(--green)', fontWeight:600 }}>{parseFloat(t.revenue_generated||0).toLocaleString('ar-SA')}</td>
                <td style={{ color:'var(--blue)', fontWeight:600 }}>{parseFloat(t.profit_generated||0).toLocaleString('ar-SA')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InventoryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => api.get('/reports/inventory-valuation'),
  })

  const rows = data?.data || []
  const summary = data?.summary || {}

  if (isLoading) return <Loading/>
  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <div className="stat-card blue">
          <div className="stat-label">إجمالي الأصناف</div>
          <div className="stat-value" style={{ fontSize:'1.4rem' }}>{summary.total_items||0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">قيمة المخزون (تكلفة)</div>
          <div className="stat-value" style={{ fontSize:'1.2rem' }}>{(summary.total_cost_value||0).toLocaleString('ar-SA')}</div>
          <div className="stat-sub">ر.س</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">قيمة البيع المتوقعة</div>
          <div className="stat-value" style={{ fontSize:'1.2rem' }}>{(summary.total_sell_value||0).toLocaleString('ar-SA')}</div>
          <div className="stat-sub">ر.س</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">أصناف منخفضة</div>
          <div className="stat-value" style={{ fontSize:'1.4rem', color:'var(--amber)' }}>{summary.low_stock_count||0}</div>
        </div>
      </div>
      <div className="card" style={{ padding:0 }}>
        <div className="table-wrap">
          <table style={{ fontSize:12 }}>
            <thead><tr><th>الصنف</th><th>SKU</th><th>الكمية</th><th>متوسط التكلفة</th><th>سعر البيع</th><th>قيمة المخزون</th><th>الربح المتوقع</th><th>الحالة</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight:500 }}>{r.name}</td>
                  <td style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted)' }}>{r.sku||'—'}</td>
                  <td style={{ color: r.is_low_stock ? 'var(--red)' : 'var(--text)' }}>{r.quantity}</td>
                  <td style={{ color:'var(--muted)' }}>{parseFloat(r.avg_cost||r.cost_price||0).toLocaleString('ar-SA')}</td>
                  <td>{parseFloat(r.sell_price||0).toLocaleString('ar-SA')}</td>
                  <td style={{ color:'var(--blue)', fontWeight:600 }}>{parseFloat(r.stock_value_cost||0).toLocaleString('ar-SA')}</td>
                  <td style={{ color:'var(--green)' }}>{parseFloat(r.potential_profit||0).toLocaleString('ar-SA')}</td>
                  <td>{r.is_low_stock ? <span className="badge badge-cancel">منخفض</span> : <span className="badge badge-ready">طبيعي</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CustomersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-customers'],
    queryFn: () => api.get('/reports/customer-insights'),
  })

  const rows = data?.data || []
  if (isLoading) return <Loading/>

  return (
    <div className="card" style={{ padding:0 }}>
      <div className="table-wrap">
        <table style={{ fontSize:13 }}>
          <thead>
            <tr><th>العميل</th><th>الجوال</th><th>إجمالي الإنفاق</th><th>عدد التذاكر</th>
            <th>طلبات الضمان</th><th>متوسط الفاتورة</th><th>أجهزة</th><th>آخر زيارة</th><th>الشريحة</th></tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight:500 }}>{c.full_name}{c.is_vip && ' ⭐'}</td>
                <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{c.phone}</td>
                <td style={{ color:'var(--green)', fontWeight:600 }}>{parseFloat(c.total_spent||0).toLocaleString('ar-SA')}</td>
                <td>{c.total_orders}</td>
                <td style={{ color: c.warranty_claims > 1 ? 'var(--red)' : 'var(--muted)' }}>{c.warranty_claims}</td>
                <td style={{ color:'var(--muted)' }}>{c.avg_ticket_value ? parseFloat(c.avg_ticket_value).toLocaleString('ar-SA') : '—'}</td>
                <td style={{ color:'var(--muted)' }}>{c.devices_count}</td>
                <td style={{ fontSize:11, color:'var(--muted)' }}>
                  {c.last_visit ? new Date(c.last_visit).toLocaleDateString('ar-SA') : '—'}
                </td>
                <td>
                  <span className={`badge ${c.loyalty_tier==='platinum'?'badge-vip':c.loyalty_tier==='gold'?'badge-wait':c.loyalty_tier==='silver'?'badge-repair':'badge-normal'}`}>
                    {c.loyalty_tier==='platinum'?'💎 بلاتيني':c.loyalty_tier==='gold'?'🥇 ذهبي':c.loyalty_tier==='silver'?'🥈 فضي':'🥉 برونزي'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
