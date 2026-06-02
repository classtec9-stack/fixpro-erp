import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Loading, EmptyState } from '../components/ui'
import { Smartphone, Search, RefreshCw, Clock, AlertTriangle, Filter } from 'lucide-react'

const STATUS_CONFIG = {
  new:              { label:'تم الاستلام',       color:'#3B82F6', bg:'rgba(59,130,246,.1)',  icon:'📥' },
  quick_check:      { label:'فحص سريع',          color:'#8B5CF6', bg:'rgba(139,92,246,.1)',  icon:'🔍' },
  diagnosing:       { label:'قيد الفحص',         color:'#8B5CF6', bg:'rgba(139,92,246,.1)',  icon:'🔬' },
  waiting_approval: { label:'انتظار موافقة',     color:'#F59E0B', bg:'rgba(245,158,11,.1)',  icon:'⏳' },
  in_repair:        { label:'داخل الورشة',       color:'#3B82F6', bg:'rgba(59,130,246,.1)',  icon:'🔧' },
  waiting_part:     { label:'ينتظر قطعة',        color:'#F97316', bg:'rgba(249,115,22,.1)',  icon:'📦' },
  part_transferred: { label:'القطعة في الطريق ⚡', color:'#8B5CF6', bg:'rgba(139,92,246,.1)', icon:'🚀' },
  ready:            { label:'جاهز للتسليم',      color:'#10B981', bg:'rgba(16,185,129,.1)',  icon:'✅' },
  rejected:         { label:'مرفوض',              color:'#EF4444', bg:'rgba(239,68,68,.1)',   icon:'❌' },
}

const PRIORITY_CONFIG = {
  vip:    { label:'VIP',  color:'#8B5CF6' },
  urgent: { label:'عاجل', color:'#EF4444' },
  normal: { label:'عادي', color:'var(--muted)' },
}

const STATUS_ORDER = ['new','quick_check','diagnosing','waiting_approval','in_repair','waiting_part','ready','rejected']

export default function DevicesPage() {
  const qc = useQueryClient()
  const [view,   setView]   = useState('board')  // board | list
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['devices-board', search, statusFilter, priorityFilter],
    queryFn: () => api.get(
      `/tickets/devices-board?search=${search}&status=${statusFilter}&priority=${priorityFilter}`
    ),
    refetchInterval: 60000,
  })

  const board  = data?.board  || {}
  const counts = data?.counts || {}
  const total  = data?.total  || 0
  const devices = data?.data  || []

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Smartphone size={20} color="var(--blue)"/> لوحة الأجهزة
          </div>
          <div className="page-sub">{total} جهاز نشط</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {/* تبديل العرض */}
          <div style={{ display:'flex', border:'1px solid var(--border-2)', borderRadius:'var(--radius)', overflow:'hidden' }}>
            {[{v:'board',label:'كانبان'},{v:'list',label:'قائمة'}].map(b => (
              <button key={b.v} onClick={() => setView(b.v)} style={{
                padding:'6px 14px', border:'none', cursor:'pointer', fontSize:12,
                background: view===b.v ? 'var(--blue)' : 'transparent',
                color: view===b.v ? '#fff' : 'var(--muted-2)',
                fontFamily:'var(--font)'
              }}>{b.label}</button>
            ))}
          </div>
          <button className="btn-icon" onClick={() => refetch()}><RefreshCw size={14}/></button>
        </div>
      </div>

      {/* فلاتر */}
      <div className="filter-bar mb-4">
        <div className="search-wrap" style={{ flex:1, maxWidth:260 }}>
          <Search size={14}/>
          <input className="search-input" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="اسم العميل، رقم التذكرة، الجهاز..." />
        </div>
        <select className="form-select" style={{ width:150 }} value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}>
          <option value="">كل الحالات</option>
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>
              {STATUS_CONFIG[s]?.icon} {STATUS_CONFIG[s]?.label} ({counts[s]||0})
            </option>
          ))}
        </select>
        <select className="form-select" style={{ width:120 }} value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}>
          <option value="">كل الأولويات</option>
          <option value="vip">⭐ VIP</option>
          <option value="urgent">🚨 عاجل</option>
          <option value="normal">عادي</option>
        </select>
      </div>

      {isLoading ? <Loading /> : (
        <>
          {/* ── عرض الكانبان ── */}
          {view === 'board' && (
            <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:16 }}>
              {STATUS_ORDER.filter(s => !statusFilter || s === statusFilter).map(status => {
                const cfg  = STATUS_CONFIG[status]
                const list = board[status] || []
                if (!list.length && statusFilter) return null
                return (
                  <div key={status} style={{
                    minWidth:240, maxWidth:280, flexShrink:0,
                    background:'var(--ink-2)', borderRadius:10,
                    border:`1px solid var(--border)`,
                    display:'flex', flexDirection:'column', maxHeight:'calc(100vh - 200px)'
                  }}>
                    {/* رأس العمود */}
                    <div style={{
                      padding:'10px 14px', borderBottom:'1px solid var(--border)',
                      display:'flex', alignItems:'center', gap:8, flexShrink:0
                    }}>
                      <span style={{ fontSize:15 }}>{cfg.icon}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:cfg.color, flex:1 }}>{cfg.label}</span>
                      <span style={{
                        background:cfg.bg, color:cfg.color,
                        fontSize:12, fontWeight:700,
                        padding:'2px 8px', borderRadius:10
                      }}>{list.length}</span>
                    </div>

                    {/* البطاقات */}
                    <div style={{ overflowY:'auto', padding:8, display:'flex', flexDirection:'column', gap:6 }}>
                      {list.length === 0 ? (
                        <div style={{ textAlign:'center', padding:'20px 0', color:'var(--muted)', fontSize:12 }}>
                          لا توجد أجهزة
                        </div>
                      ) : list.map(d => (
                        <DeviceCard key={d.id} device={d} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── عرض القائمة ── */}
          {view === 'list' && (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              {!devices.length
                ? <EmptyState icon={Smartphone} message="لا توجد أجهزة" sub="كل الأجهزة مسلّمة" />
                : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>رقم التذكرة</th><th>الجهاز</th><th>العميل</th>
                          <th>الحالة</th><th>الفني</th><th>مدة الانتظار</th><th>الأولوية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {devices.map(d => {
                          const cfg = STATUS_CONFIG[d.status]
                          const pc  = PRIORITY_CONFIG[d.priority] || PRIORITY_CONFIG.normal
                          const hrs = Math.round(d.hours_in_shop || 0)
                          const overdue = hrs > 48
                          return (
                            <tr key={d.id} style={{ cursor:'pointer' }}
                              onClick={() => window.location.href = `/tickets`}>
                              <td className="font-mono text-xs text-blue">{d.order_number}</td>
                              <td>
                                <div style={{ fontWeight:500, color:'var(--text-2)' }}>{d.brand} {d.model}</div>
                                {d.color && <div className="text-xs text-muted">{d.color}</div>}
                              </td>
                              <td>
                                <div style={{ color:'var(--text-2)' }}>{d.customer_name}</div>
                                <div className="text-xs text-muted font-mono">{d.customer_phone}</div>
                              </td>
                              <td>
                                <span style={{
                                  padding:'3px 8px', borderRadius:5, fontSize:11, fontWeight:600,
                                  background:cfg?.bg, color:cfg?.color
                                }}>
                                  {cfg?.icon} {cfg?.label}
                                </span>
                              </td>
                              <td className="text-sm text-muted2">{d.technician_name || '—'}</td>
                              <td>
                                <div style={{
                                  display:'flex', alignItems:'center', gap:4,
                                  color: overdue ? 'var(--red)' : 'var(--muted-2)', fontSize:12
                                }}>
                                  {overdue && <AlertTriangle size={12}/>}
                                  <Clock size={11}/>
                                  {hrs < 24 ? `${hrs}س` : `${Math.floor(hrs/24)}ي ${hrs%24}س`}
                                </div>
                              </td>
                              <td>
                                <span style={{ fontSize:11, fontWeight:600, color:pc.color }}>{pc.label}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── بطاقة الجهاز في الكانبان ─────────────────────────
function DeviceCard({ device: d }) {
  const pc  = PRIORITY_CONFIG[d.priority] || PRIORITY_CONFIG.normal
  const hrs = Math.round(d.hours_in_shop || 0)
  const overdue = hrs > 48

  return (
    <div style={{
      background: 'var(--ink-3)', borderRadius:8, padding:'10px 12px',
      border:`1px solid ${overdue ? 'rgba(239,68,68,.3)' : 'var(--border)'}`,
      cursor:'pointer', transition:'all .15s'
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor='var(--blue)'}
    onMouseLeave={e => e.currentTarget.style.borderColor=overdue?'rgba(239,68,68,.3)':'var(--border)'}
    onClick={() => window.location.href='/tickets'}>

      {/* رقم التذكرة + الأولوية */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span className="font-mono" style={{ fontSize:11, color:'var(--blue)', fontWeight:700 }}>
          {d.order_number}
        </span>
        {d.priority !== 'normal' && (
          <span style={{ fontSize:10, fontWeight:700, color:pc.color }}>
            {pc.label}
          </span>
        )}
      </div>

      {/* الجهاز */}
      <div style={{ fontWeight:600, color:'var(--text-2)', fontSize:13, marginBottom:3 }}>
        {d.brand} {d.model}
        {d.color && <span style={{ color:'var(--muted)', fontSize:11, fontWeight:400 }}> • {d.color}</span>}
      </div>

      {/* العميل */}
      <div style={{ fontSize:12, color:'var(--text)', marginBottom:6 }}>{d.customer_name}</div>

      {/* الفني + الوقت */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'var(--muted-2)' }}>
          {d.technician_name || 'غير معيّن'}
        </span>
        <div style={{
          display:'flex', alignItems:'center', gap:3, fontSize:11,
          color: overdue ? 'var(--red)' : 'var(--muted-2)'
        }}>
          {overdue && <AlertTriangle size={10}/>}
          <Clock size={10}/>
          {hrs < 24 ? `${hrs}س` : `${Math.floor(hrs/24)}ي`}
        </div>
      </div>

      {/* تكلفة تقديرية */}
      {d.estimated_cost && (
        <div style={{
          marginTop:6, paddingTop:6, borderTop:'1px solid var(--border)',
          fontSize:11, color:'var(--blue)', fontFamily:'var(--mono)', textAlign:'left'
        }}>
          {Number(d.estimated_cost).toLocaleString('ar-SA')} ر.س
        </div>
      )}
    </div>
  )
}
