import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Loading } from '../components/ui'
import { RefreshCw, AlertTriangle, Clock, User } from 'lucide-react'

const COLUMNS = [
  { key:'new',           label:'تم الاستلام',       color:'var(--blue)',   badge:'badge-new'    },
  { key:'quick_check',   label:'فحص سريع',          color:'var(--purple)', badge:'badge-diag'   },
  { key:'diagnosing',    label:'قيد التشخيص',       color:'var(--purple)', badge:'badge-diag'   },
  { key:'waiting_approval', label:'انتظار موافقة',  color:'var(--amber)',  badge:'badge-wait'   },
  { key:'in_repair',     label:'داخل الورشة',       color:'var(--amber)',  badge:'badge-repair' },
  { key:'waiting_part',  label:'ينتظر قطعة',        color:'#F97316',       badge:'badge-wait'   },
  { key:'part_transferred', label:'القطعة في الطريق', color:'var(--purple)', badge:'badge-diag' },
  { key:'ready',         label:'جاهز للتسليم',      color:'var(--green)',  badge:'badge-ready'  },
]

const PRIORITY_COLOR = { vip:'var(--purple)', urgent:'var(--amber)', normal:'var(--muted)' }

export default function WorkshopBoardPage() {
  const qc = useQueryClient()
  const [view, setView] = useState('kanban') // kanban | workload

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workshop-board'],
    queryFn: () => api.get('/scheduling/board'),
    refetchInterval: 60000, // تحديث كل دقيقة
  })

  const { data: workloadData } = useQuery({
    queryKey: ['technician-workload'],
    queryFn: () => api.get('/scheduling/workload'),
    refetchInterval: 60000,
    enabled: view === 'workload',
  })

  const board = data?.data || {}
  const total = data?.total || 0

  const totalCols = COLUMNS.reduce((s,c) => s + (board[c.key]?.length || 0), 0)

  return (
    <div className="page fade-in" style={{ padding:'16px 20px' }}>
      <div className="page-header" style={{ marginBottom:12 }}>
        <div>
          <div className="page-title">لوحة الورشة</div>
          <div className="page-sub">{total} تذكرة نشطة</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className={`btn ${view==='kanban' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('kanban')}>
            Kanban
          </button>
          <button className={`btn ${view==='workload' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('workload')}>
            الفنيون
          </button>
          <button className="btn btn-ghost" onClick={() => refetch()}><RefreshCw size={13}/></button>
        </div>
      </div>

      {isLoading ? <Loading/> : view === 'kanban' ? (
        /* Kanban View */
        <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:12, minHeight:'calc(100vh - 140px)' }}>
          {COLUMNS.map(col => {
            const tickets = board[col.key] || []
            return (
              <div key={col.key} style={{ minWidth:220, maxWidth:240, flexShrink:0 }}>
                {/* Column Header */}
                <div style={{ background:'var(--ink-2)', borderRadius:'8px 8px 0 0', padding:'8px 12px',
                  borderTop:`3px solid ${col.color}`, display:'flex', justifyContent:'space-between', alignItems:'center',
                  marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text-2)' }}>{col.label}</span>
                  <span style={{ background:col.color+'22', color:col.color, fontSize:11, fontWeight:700,
                    padding:'2px 8px', borderRadius:10 }}>{tickets.length}</span>
                </div>

                {/* Cards */}
                <div style={{ display:'flex', flexDirection:'column', gap:6, minHeight:100 }}>
                  {tickets.map(t => (
                    <TicketCard key={t.id} ticket={t} colColor={col.color}/>
                  ))}
                  {tickets.length === 0 && (
                    <div style={{ padding:16, textAlign:'center', color:'var(--muted)', fontSize:12,
                      border:'1px dashed var(--border)', borderRadius:6 }}>فارغ</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Workload View */
        <WorkloadView data={workloadData?.data || []}/>
      )}
    </div>
  )
}

function TicketCard({ ticket, colColor }) {
  const hoursOpen = Math.round(ticket.hours_open || 0)
  const isBreached = ticket.sla_breached
  const isLate = ticket.promised_at && new Date(ticket.promised_at) < new Date()

  return (
    <div style={{
      background:'var(--ink-2)', border:`1px solid ${isBreached ? 'var(--red)' : 'var(--border)'}`,
      borderRadius:8, padding:'10px 12px', cursor:'pointer',
      transition:'all .15s', fontSize:12,
    }}
    className="hover-card">
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--blue)', fontWeight:600 }}>
          {ticket.order_number}
        </span>
        <div style={{ display:'flex', gap:4 }}>
          {ticket.priority !== 'normal' && (
            <span style={{ fontSize:10, padding:'1px 5px', borderRadius:4,
              background: PRIORITY_COLOR[ticket.priority]+'22', color: PRIORITY_COLOR[ticket.priority] }}>
              {ticket.priority === 'vip' ? 'VIP' : 'عاجل'}
            </span>
          )}
          {isBreached && <AlertTriangle size={12} color="var(--red)"/>}
        </div>
      </div>

      {/* Customer + Device */}
      <div style={{ fontWeight:500, color:'var(--text-2)', marginBottom:2, overflow:'hidden',
        textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {ticket.customer_name}
      </div>
      <div style={{ color:'var(--muted)', marginBottom:6 }}>
        {ticket.brand} {ticket.model}
      </div>

      {/* Technician */}
      {ticket.technician_name && (
        <div style={{ display:'flex', alignItems:'center', gap:4, color:'var(--muted)', fontSize:11 }}>
          <User size={11}/> {ticket.technician_name}
        </div>
      )}

      {/* Footer */}
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, paddingTop:6,
        borderTop:'1px solid var(--border)', color:'var(--muted)', fontSize:11 }}>
        <span style={{ display:'flex', alignItems:'center', gap:3 }}>
          <Clock size={10}/> {hoursOpen < 24 ? `${hoursOpen}س` : `${Math.floor(hoursOpen/24)}ي`}
        </span>
        {ticket.parts_count > 0 && (
          <span style={{ color:'var(--blue)' }}>🔧 {ticket.parts_count} قطعة</span>
        )}
        {isLate && <span style={{ color:'var(--red)' }}>⚠️ متأخر</span>}
      </div>
    </div>
  )
}

function WorkloadView({ data }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
      {data.map(tech => {
        const utilization = tech.max_tickets > 0 ? Math.round((tech.active_tickets / tech.max_tickets) * 100) : 0
        const color = utilization >= 90 ? 'var(--red)' : utilization >= 70 ? 'var(--amber)' : 'var(--green)'

        return (
          <div key={tech.id} className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
              <div>
                <div style={{ fontWeight:600, color:'var(--text-2)' }}>{tech.full_name}</div>
                {tech.specialty && <div style={{ fontSize:11, color:'var(--muted)' }}>{tech.specialty}</div>}
              </div>
              <span style={{ fontSize:12, fontWeight:700, color }}>
                {tech.active_tickets}/{tech.max_tickets}
              </span>
            </div>

            {/* Progress Bar */}
            <div style={{ background:'var(--ink-3)', borderRadius:4, height:6, marginBottom:12, overflow:'hidden' }}>
              <div style={{ width:`${Math.min(utilization,100)}%`, height:'100%', background:color, borderRadius:4,
                transition:'width .3s' }}/>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, fontSize:12, textAlign:'center' }}>
              <div>
                <div style={{ color:'var(--amber)', fontWeight:600 }}>{tech.in_repair || 0}</div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>إصلاح</div>
              </div>
              <div>
                <div style={{ color:'var(--blue)', fontWeight:600 }}>{tech.diagnosing || 0}</div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>تشخيص</div>
              </div>
              <div>
                <div style={{ color:'var(--red)', fontWeight:600 }}>{tech.breached || 0}</div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>تجاوز</div>
              </div>
            </div>

            {tech.vip_tickets > 0 && (
              <div style={{ marginTop:8, padding:'4px 8px', background:'rgba(139,92,246,.1)',
                color:'var(--purple)', borderRadius:4, fontSize:11, fontWeight:600 }}>
                ⭐ {tech.vip_tickets} تذكرة VIP
              </div>
            )}

            {tech.available_slots > 0 && (
              <div style={{ marginTop:6, fontSize:11, color:'var(--green)' }}>
                ✅ {tech.available_slots} خانة متاحة
              </div>
            )}
          </div>
        )
      })}
      {data.length === 0 && (
        <div style={{ gridColumn:'1/-1', textAlign:'center', padding:40, color:'var(--muted)' }}>
          لا يوجد فنيون نشطون
        </div>
      )}
    </div>
  )
}
