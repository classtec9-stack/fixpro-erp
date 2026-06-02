import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Loading, EmptyState, Modal } from '../components/ui'
import toast from 'react-hot-toast'
import { Calendar, CheckCircle, XCircle, Clock, Settings, RefreshCw, ExternalLink, Ticket } from 'lucide-react'

const STATUS = {
  pending:   { label:'انتظار',      badge:'badge-wait',   color:'var(--amber)' },
  confirmed: { label:'مؤكد',        badge:'badge-ready',  color:'var(--green)' },
  cancelled: { label:'ملغي',        badge:'badge-cancel', color:'var(--red)' },
  completed: { label:'مكتمل',       badge:'badge-done',   color:'var(--muted)' },
}

const DAYS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']

export default function AppointmentsPage() {
  const qc = useQueryClient()
  const [tab, setTab]       = useState('list')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['appointments', dateFilter, statusFilter],
    queryFn: () => api.get(`/appointments?date=${dateFilter}&status=${statusFilter}`),
  })

  const { data: whData } = useQuery({
    queryKey: ['working-hours'],
    queryFn: () => api.get('/appointments/working-hours'),
    enabled: tab === 'settings',
  })

  const appts = data?.data || []
  const today = appts.filter(a => a.appointment_date === dateFilter)

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">الحجوزات</div>
          <div className="page-sub">{data?.pagination?.total || 0} حجز</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href="/book" target="_blank" className="btn btn-ghost">
            <ExternalLink size={14}/> صفحة الحجز
          </a>
          <button className="btn-icon" onClick={() => refetch()}><RefreshCw size={14}/></button>
        </div>
      </div>

      {/* تبويبات */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {[
          { id:'list',     label:'قائمة الحجوزات', icon: Calendar },
          { id:'settings', label:'أوقات العمل',     icon: Settings },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display:'flex', alignItems:'center', gap:6, padding:'9px 16px',
            background:'none', border:'none', cursor:'pointer', fontSize:13,
            fontFamily:'var(--font)',
            color: tab===t.id ? 'var(--blue)' : 'var(--muted-2)',
            borderBottom: tab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom:-1
          }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* ── قائمة الحجوزات ── */}
      {tab === 'list' && (
        <div>
          {/* فلاتر */}
          <div className="filter-bar">
            <input type="date" className="form-input" style={{ width:180 }}
              value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
            <select className="form-select" style={{ width:140 }} value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}>
              <option value="">كل الحالات</option>
              {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {isLoading ? <Loading /> : !appts.length
            ? <EmptyState icon={Calendar} message="لا توجد حجوزات" sub="للتاريخ والفلتر المحدد" />
            : (
              <div className="card" style={{ padding:0, overflow:'hidden' }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>العميل</th><th>الجهاز</th><th>التاريخ</th>
                        <th>الوقت</th><th>الفرع</th><th>الحالة</th><th>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appts.map(a => {
                        const st = STATUS[a.status] || STATUS.pending
                        return (
                          <tr key={a.id} style={{ cursor:'pointer' }} onClick={() => setSelected(a)}>
                            <td>
                              <div style={{ fontWeight:500, color:'var(--text-2)' }}>{a.customer_name}</div>
                              <div className="text-xs text-muted font-mono">{a.customer_phone}</div>
                            </td>
                            <td className="text-sm">{a.device_brand} {a.device_type}</td>
                            <td className="font-mono text-sm">
                              {new Date(a.appointment_date).toLocaleDateString('ar-SA', { weekday:'short', day:'numeric', month:'short' })}
                            </td>
                            <td><span className="font-mono text-blue font-bold">{a.appointment_time}</span></td>
                            <td className="text-xs text-muted2">{a.branch_name}</td>
                            <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                            <td onClick={e => e.stopPropagation()}>
                              <AppointmentActions appt={a} onUpdate={() => qc.invalidateQueries({ queryKey:['appointments'] })} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }

          {selected && (
            <AppointmentDetailModal appt={selected} onClose={() => setSelected(null)}
              onUpdate={() => { qc.invalidateQueries({ queryKey:['appointments'] }); setSelected(null) }} />
          )}
        </div>
      )}

      {/* ── أوقات العمل ── */}
      {tab === 'settings' && (
        <WorkingHoursSettings data={whData?.data || []} />
      )}
    </div>
  )
}

// ── أزرار الإجراءات السريعة ──────────────────────────────
function AppointmentActions({ appt, onUpdate }) {
  const qc = useQueryClient()

  const updateStatus = useMutation({
    mutationFn: (status) => api.patch(`/appointments/${appt.id}/status`, { status }),
    onSuccess: () => { toast.success('تم التحديث'); onUpdate() },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const convert = useMutation({
    mutationFn: () => api.post(`/appointments/${appt.id}/convert`),
    onSuccess: (d) => { toast.success(`تم إنشاء تذكرة: ${d.data.order_number}`); onUpdate() },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  if (appt.order_id) return <span className="text-xs text-green">✅ تذكرة</span>

  return (
    <div style={{ display:'flex', gap:4 }}>
      {appt.status === 'pending' && (
        <button className="btn btn-ghost btn-sm" style={{ color:'var(--green)' }}
          onClick={() => updateStatus.mutate('confirmed')} disabled={updateStatus.isPending}>
          <CheckCircle size={12}/> تأكيد
        </button>
      )}
      {['pending','confirmed'].includes(appt.status) && (
        <button className="btn btn-ghost btn-sm" style={{ color:'var(--blue)' }}
          onClick={() => convert.mutate()} disabled={convert.isPending}>
          <Ticket size={12}/> تذكرة
        </button>
      )}
      {appt.status !== 'cancelled' && appt.status !== 'completed' && (
        <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }}
          onClick={() => updateStatus.mutate('cancelled')} disabled={updateStatus.isPending}>
          <XCircle size={12}/> إلغاء
        </button>
      )}
    </div>
  )
}

// ── نافذة تفاصيل الحجز ───────────────────────────────────
function AppointmentDetailModal({ appt, onClose, onUpdate }) {
  const [notes, setNotes] = useState(appt.notes || '')

  const updateStatus = useMutation({
    mutationFn: (status) => api.patch(`/appointments/${appt.id}/status`, { status, notes }),
    onSuccess: () => { toast.success('تم التحديث'); onUpdate() },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const convert = useMutation({
    mutationFn: () => api.post(`/appointments/${appt.id}/convert`),
    onSuccess: (d) => { toast.success(`تم إنشاء تذكرة: ${d.data.order_number}`); onUpdate() },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const st = STATUS[appt.status] || STATUS.pending

  return (
    <Modal open={true} onClose={onClose} title={`حجز #${appt.id.slice(0,8).toUpperCase()}`}
      footer={
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          {appt.status === 'pending' && (
            <button className="btn btn-primary" onClick={() => updateStatus.mutate('confirmed')}>
              <CheckCircle size={13}/> تأكيد الموعد
            </button>
          )}
          {['pending','confirmed'].includes(appt.status) && !appt.order_id && (
            <button className="btn btn-ghost" style={{ color:'var(--blue)' }} onClick={() => convert.mutate()}>
              <Ticket size={13}/> تحويل لتذكرة
            </button>
          )}
          {!['cancelled','completed'].includes(appt.status) && (
            <button className="btn btn-danger" onClick={() => updateStatus.mutate('cancelled')}>
              إلغاء الحجز
            </button>
          )}
        </div>
      }>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        {[
          { label:'العميل',    val: appt.customer_name },
          { label:'الجوال',    val: appt.customer_phone, mono: true },
          { label:'التاريخ',   val: new Date(appt.appointment_date).toLocaleDateString('ar-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' }) },
          { label:'الوقت',     val: appt.appointment_time, mono: true },
          { label:'الجهاز',    val: `${appt.device_brand || ''} ${appt.device_type || ''}`.trim() || '—' },
          { label:'الفرع',     val: appt.branch_name },
          { label:'الحالة',    val: <span className={`badge ${st.badge}`}>{st.label}</span> },
          appt.order_id && { label:'التذكرة', val: <span className="text-green font-mono">✅ تم الإنشاء</span> },
        ].filter(Boolean).map((item, i) => (
          <div key={i} style={{ padding:'8px 10px', background:'var(--ink-3)', borderRadius:6 }}>
            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{item.label}</div>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text-2)', fontFamily: item.mono ? 'var(--mono)' : 'inherit' }}>
              {item.val}
            </div>
          </div>
        ))}
      </div>

      {appt.problem_desc && (
        <div style={{ padding:'10px 12px', background:'var(--ink-3)', borderRadius:6, marginBottom:12 }}>
          <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>وصف المشكلة</div>
          <div style={{ fontSize:13, color:'var(--text)' }}>{appt.problem_desc}</div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">ملاحظة (اختياري)</label>
        <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="سبب الإلغاء أو ملاحظة..." />
      </div>
    </Modal>
  )
}

// ── إعدادات أوقات العمل ──────────────────────────────────
function WorkingHoursSettings({ data }) {
  const qc = useQueryClient()
  const [hours, setHours] = useState(() =>
    DAYS_AR.map((day, i) => {
      const existing = data.find(d => d.day_of_week === i)
      return {
        day_of_week:   i,
        day_name:      day,
        is_open:       existing?.is_open ?? (i !== 5),
        open_time:     existing?.open_time  || '09:00',
        close_time:    existing?.close_time || '18:00',
        slot_duration: existing?.slot_duration || 30,
        max_per_slot:  existing?.max_per_slot  || 3,
      }
    })
  )

  const save = useMutation({
    mutationFn: () => api.put('/appointments/working-hours', { hours }),
    onSuccess: () => { toast.success('تم حفظ أوقات العمل ✅'); qc.invalidateQueries({ queryKey:['working-hours'] }) },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const update = (i, key, val) => {
    setHours(h => h.map((d, idx) => idx === i ? { ...d, [key]: val } : d))
  }

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">أوقات العمل الأسبوعية</span>
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10, paddingTop:8 }}>
          {hours.map((d, i) => (
            <div key={i} style={{
              display:'grid', gridTemplateColumns:'80px 1fr', gap:12, alignItems:'center',
              padding:'10px 14px', background:'var(--ink-3)', borderRadius:8,
              opacity: d.is_open ? 1 : .6
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <label style={{ position:'relative', display:'inline-block', width:36, height:20, flexShrink:0 }}>
                  <input type="checkbox" checked={d.is_open} onChange={e => update(i, 'is_open', e.target.checked)}
                    style={{ opacity:0, width:0, height:0 }} />
                  <span style={{
                    position:'absolute', inset:0, borderRadius:10, cursor:'pointer',
                    background: d.is_open ? 'var(--green)' : 'var(--ink-4)',
                    transition:'.3s'
                  }}>
                    <span style={{
                      position:'absolute', width:14, height:14, borderRadius:'50%',
                      background:'#fff', top:3, left: d.is_open ? 19 : 3, transition:'.3s'
                    }}/>
                  </span>
                </label>
                <span style={{ fontSize:13, fontWeight:500, color:'var(--text-2)' }}>{d.day_name}</span>
              </div>

              {d.is_open ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
                  <div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>فتح</div>
                    <input type="time" className="form-input" value={d.open_time}
                      onChange={e => update(i, 'open_time', e.target.value)} style={{ padding:'5px 8px', fontSize:12 }} />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>إغلاق</div>
                    <input type="time" className="form-input" value={d.close_time}
                      onChange={e => update(i, 'close_time', e.target.value)} style={{ padding:'5px 8px', fontSize:12 }} />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>مدة الموعد (دق)</div>
                    <select className="form-select" value={d.slot_duration}
                      onChange={e => update(i, 'slot_duration', Number(e.target.value))} style={{ padding:'5px 8px', fontSize:12 }}>
                      <option value={15}>15 دقيقة</option>
                      <option value={30}>30 دقيقة</option>
                      <option value={45}>45 دقيقة</option>
                      <option value={60}>ساعة</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>حجز/موعد</div>
                    <input type="number" className="form-input" min={1} max={10} value={d.max_per_slot}
                      onChange={e => update(i, 'max_per_slot', Number(e.target.value))} style={{ padding:'5px 8px', fontSize:12 }} />
                  </div>
                </div>
              ) : (
                <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>عطلة — مغلق</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
