import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState, Pagination } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Search, Layers, List, RefreshCw, Clock, AlertTriangle, Printer, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'
import ReceiptPrint from '../components/ReceiptPrint'
import { StatusChangeButton } from '../components/StatusChange'
import { CompletionInvoiceButton } from '../components/CompletionInvoice'
import DeviceSelector from '../components/DeviceSelector'
import ProfessionalInvoiceButton from '../components/ProfessionalInvoice'

// ── Status config ──────────────────────────────────────────
const STATUS_CONFIG = {
  new:              { label:'تم الاستلام',          badge:'badge-new',    next:'diagnosing',    nextLabel:'بدء الفحص' },
  quick_check:      { label:'فحص سريع',             badge:'badge-diag',   next:null,            nextLabel:null },
  diagnosing:       { label:'قيد الفحص',            badge:'badge-diag',   next:'in_repair',     nextLabel:'بدء الإصلاح' },
  waiting_approval: { label:'انتظار موافقة العميل', badge:'badge-wait',   next:'in_repair',     nextLabel:'موافقة العميل' },
  in_repair:        { label:'داخل الورشة',          badge:'badge-repair', next:'ready',         nextLabel:'جاهز للتسليم' },
  waiting_part:     { label:'ينتظر قطعة غيار',     badge:'badge-wait',   next:'in_repair',     nextLabel:'وصلت القطعة' },
  ready:            { label:'جاهز للتسليم',         badge:'badge-ready',  next:'delivered',     nextLabel:'تم التسليم' },
  delivered:        { label:'تم التسليم',           badge:'badge-done',   next:null,            nextLabel:null },
  rejected:         { label:'مرفوض',                badge:'badge-cancel', next:null,            nextLabel:null },
  cancelled:        { label:'ملغي',                 badge:'badge-cancel', next:null,            nextLabel:null },
}

const PRIORITY_CONFIG = {
  normal:  { label:'عادي',  color:'var(--muted)' },
  urgent:  { label:'عاجل',  color:'#F97316' },
  vip:     { label:'VIP',   color:'var(--purple)' },
}

export default function TicketsPage() {
  const { user } = useAuth()
  const { t, isEn } = useT()
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState('list')  // list | board
  const [showNew, setShowNew] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [printTicket, setPrintTicket] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', page, search, statusFilter],
    queryFn: () => api.get(`/tickets?page=${page}&limit=20&search=${search}&status=${statusFilter}`),
    keepPreviousData: true
  })

  const { data: boardData, isLoading: boardLoading } = useQuery({
    queryKey: ['tickets-board'],
    queryFn: () => api.get('/tickets/status-board'),
    enabled: viewMode === 'board',
    refetchInterval: 30000
  })

  const { data: abandoned } = useQuery({
    queryKey: ['abandoned'],
    queryFn: () => api.get('/tickets/abandoned'),
    enabled: ['admin','branch_manager','customer_service'].includes(user?.role)
  })

  const tickets = data?.data || []
  const pagination = data?.pagination || {}

  const updateStatus = useMutation({
    mutationFn: ({ id, status, note }) => api.patch(`/tickets/${id}/status`, { status, note }),
    onSuccess: () => {
      qc.invalidateQueries(['tickets'])
      qc.invalidateQueries(['tickets-board'])
      qc.invalidateQueries(['dashboard'])
      toast.success('تم تحديث الحالة')
    },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const canCreate = ['admin','branch_manager','receptionist'].includes(user?.role)

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">{t('tickets')}</div>
          <div className="page-sub">{pagination.total || 0} تذكرة</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* View toggle */}
          <div style={{ display:'flex', border:'1px solid var(--border-2)', borderRadius:'var(--radius)', overflow:'hidden' }}>
            {[{id:'list',icon:List},{id:'board',icon:Layers}].map(v => (
              <button key={v.id} onClick={() => setViewMode(v.id)}
                style={{ padding:'6px 10px', background: viewMode===v.id ? 'var(--blue)' : 'transparent',
                  border:'none', cursor:'pointer', color: viewMode===v.id ? '#fff' : 'var(--muted-2)', display:'flex', alignItems:'center' }}>
                <v.icon size={15}/>
              </button>
            ))}
          </div>
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={14}/> تذكرة جديدة
            </button>
          )}
        </div>
      </div>

      {/* Abandoned devices alert */}
      {abandoned?.count > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.3)', borderRadius:'var(--radius-lg)', marginBottom:16, fontSize:13 }}>
          <AlertTriangle size={15} color="var(--amber)"/>
          <span style={{ color:'var(--amber)', fontWeight:500 }}>{abandoned.count} جهاز متروك أكثر من 5 أيام</span>
          <span className="text-muted">— يجب التواصل مع أصحابها</span>
        </div>
      )}

      {viewMode === 'list' ? (
        <>
          <div className="filter-bar">
            <div className="search-wrap" style={{ flex:1, maxWidth:320 }}>
              <Search/>
              <input className="search-input" placeholder="بحث برقم التذكرة أو اسم العميل أو IMEI..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
            </div>
            <select className="form-select" style={{ width:180 }} value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="btn-icon" onClick={() => qc.invalidateQueries(['tickets'])}><RefreshCw size={14}/></button>
          </div>

          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            {isLoading ? <Loading /> : !tickets.length
              ? <EmptyState message="لا توجد تذاكر" sub="أنشئ تذكرة جديدة للبدء" />
              : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>رقم التذكرة</th><th>العميل</th><th>الجهاز</th>
                        <th>المشكلة</th><th>الفني</th><th>الأولوية</th>
                        <th>الحالة</th><th>الوقت</th><th>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map(t => {
                        const sc = STATUS_CONFIG[t.status] || {}
                        const pc = PRIORITY_CONFIG[t.priority] || {}
                        const hours = Math.round((Date.now() - new Date(t.received_at)) / 3600000)
                        const isLate = hours > 48 && !['delivered','cancelled','rejected'].includes(t.status)
                        return (
                          <tr key={t.id} style={{ cursor:'pointer' }} onClick={() => setSelectedTicket(t)}>
                            <td>
                              <span className="font-mono text-xs text-blue">{t.order_number}</span>
                              {isLate && <span style={{ marginRight:4, fontSize:10, color:'var(--amber)' }}>⚠</span>}
                            </td>
                            <td>
                              <div style={{ fontWeight:500, color:'var(--text-2)' }}>{t.customer_name}</div>
                              <div className="text-xs text-muted">{t.customer_phone}</div>
                            </td>
                            <td>
                              <div className="text-sm">{t.brand} {t.model}</div>
                              {t.imei && <div className="text-xs text-muted font-mono">{t.imei}</div>}
                            </td>
                            <td style={{ maxWidth:140 }}>
                              <div className="text-sm" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {t.problem_desc}
                              </div>
                            </td>
                            <td className="text-sm text-muted2">{t.technician_name || <span className="text-muted">—</span>}</td>
                            <td><span className="badge" style={{ background:`${pc.color}22`, color:pc.color, fontSize:10 }}>{pc.label}</span></td>
                            <td><span className={`badge ${sc.badge}`}>{sc.label}</span></td>
                            <td>
                              <div className="text-xs text-muted font-mono">
                                {hours < 24 ? `${hours}س` : `${Math.floor(hours/24)}ي`}
                              </div>
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <div style={{ display:'flex', gap:4 }}>
                                <button className="btn-icon" title="طباعة" onClick={() => setPrintTicket(t)}><Printer size={13}/></button>
                                <StatusChangeButton
                                  ticket={t}
                                  onSuccess={() => { qc.invalidateQueries(['tickets']); qc.invalidateQueries(['dashboard']) }}
                                />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            }
            <Pagination page={page} pages={pagination.pages} onPage={setPage} />
          </div>
        </>
      ) : (
        <StatusBoard data={boardData?.data} loading={boardLoading} onUpdateStatus={updateStatus} />
      )}

      {showNew && (
        <NewTicketModal onClose={() => setShowNew(false)}
          onSuccess={(ticket) => { setShowNew(false); qc.invalidateQueries(['tickets']); qc.invalidateQueries(['dashboard']); toast.success('تم إنشاء التذكرة'); if(ticket) setPrintTicket(ticket) }} />
      )}

      {selectedTicket && (
        <TicketDetailModal
          ticketId={selectedTicket.id}
          onClose={() => setSelectedTicket(null)}
          onStatusUpdate={updateStatus}
          onPrint={setPrintTicket}
        />
      )}

      {printTicket && <ReceiptPrint ticket={printTicket} onClose={() => setPrintTicket(null)} />}
    </div>
  )
}

// ── Status Board (Kanban) ──────────────────────────────────
function StatusBoard({ data, loading, onUpdateStatus }) {
  if (loading) return <Loading />
  if (!data) return null

  const BOARD_STATUSES = ['new','quick_check','diagnosing','in_repair','waiting_part','waiting_approval','ready']

  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${BOARD_STATUSES.length}, minmax(160px,1fr))`, gap:10, overflowX:'auto' }}>
      {BOARD_STATUSES.map(status => {
        const sc = STATUS_CONFIG[status]
        const items = data[status] || []
        return (
          <div key={status} style={{ background:'var(--ink-2)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
            <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)' }}>{sc.label}</div>
              <span style={{ background:'var(--ink-3)', color:'var(--muted-2)', borderRadius:10, fontSize:11, padding:'1px 7px', fontFamily:'var(--mono)', fontWeight:600 }}>
                {items.length}
              </span>
            </div>
            <div style={{ padding:8, display:'flex', flexDirection:'column', gap:6, minHeight:100, maxHeight:500, overflowY:'auto' }}>
              {items.map(t => {
                const hrs = Math.round((Date.now() - new Date(t.received_at))/3600000)
                return (
                  <div key={t.id} style={{ background:'var(--ink-3)', borderRadius:6, padding:'10px 10px', border:'1px solid var(--border)', borderRight:`3px solid ${PRIORITY_CONFIG[t.priority]?.color || 'var(--border)'}` }}>
                    <div className="font-mono text-xs text-blue" style={{ marginBottom:4 }}>{t.order_number}</div>
                    <div style={{ fontWeight:500, fontSize:12, color:'var(--text-2)', marginBottom:2 }}>{t.customer_name}</div>
                    <div className="text-xs text-muted">{t.brand} {t.model}</div>
                    <div className="text-xs text-muted" style={{ marginTop:4 }}>
                      <Clock size={10} style={{ display:'inline', marginLeft:3 }}/>
                      {hrs < 24 ? `${hrs} ساعة` : `${Math.floor(hrs/24)} يوم`}
                      {t.technician_name && ` • ${t.technician_name}`}
                    </div>
                    {sc.next && (
                      <button className="btn btn-ghost btn-sm w-full" style={{ marginTop:6, justifyContent:'center' }}
                        onClick={() => onUpdateStatus.mutate({ id:t.id, status:sc.next })}>
                        ← {sc.nextLabel}
                      </button>
                    )}
                  </div>
                )
              })}
              {!items.length && <div style={{ textAlign:'center', padding:'20px 0', fontSize:12, color:'var(--muted)' }}>فارغ</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Ticket Detail Modal ────────────────────────────────────
function TicketDetailModal({ ticketId, onClose, onStatusUpdate, onPrint }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}`)
  })
  const [statusNote, setStatusNote]     = useState('')
  const [showConvert, setShowConvert]   = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject]     = useState(false)

  if (isLoading) return <Modal open={true} onClose={onClose} title="تحميل..."><Loading /></Modal>
  const t = data?.data
  if (!t) return null

  const sc = STATUS_CONFIG[t.status] || {}
  const STATUS_LABELS_AR = {
    new:'تم الاستلام', quick_check:'فحص سريع', diagnosing:'قيد الفحص',
    waiting_approval:'انتظار موافقة', in_repair:'داخل الورشة',
    waiting_part:'ينتظر قطعة', part_transferred:'القطعة في الطريق',
    awaiting_technician_rejection:'⚠️ انتظار تأكيد الفني',
    ready:'جاهز', delivered:'تم التسليم',
    rejected:'مرفوض', cancelled:'ملغي'
  }

  // إذا فُتح نموذج التحويل — يظهر بدلاً عن التفاصيل
  if (showConvert) {
    return (
      <ConvertToRepairModal
        ticket={t}
        onClose={() => setShowConvert(false)}
        onSuccess={() => {
          setShowConvert(false)
          qc.invalidateQueries(['ticket', ticketId])
          qc.invalidateQueries(['tickets'])
          toast.success('تم التحويل إلى تذكرة صيانة')
        }}
      />
    )
  }

  return (
    <Modal open={true} onClose={onClose} title={`تذكرة: ${t.order_number}`} maxWidth={700}
      footer={
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onPrint(t)}><Printer size={13}/> وصل</button>
          {t.status === 'quick_check' && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => setShowConvert(true)}>
                🔧 تحويل لتذكرة صيانة
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setShowReject(!showReject)}>
                ✗ رفض
              </button>
            </>
          )}
          {t.status !== 'quick_check' && (
            <StatusChangeButton
              ticket={t}
              onSuccess={() => { onClose(); }}
            />
          )}
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
        </div>
      }>

      {/* بيانات التذكرة */}
      <div className="two-col mb-3">
        <div>
          <div className="text-xs text-muted mb-1">العميل</div>
          <div style={{ fontWeight:600, color:'var(--text-2)' }}>{t.customer_name}</div>
          <div className="text-sm text-muted2">{t.customer_phone}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">الجهاز</div>
          <div style={{ fontWeight:600, color:'var(--text-2)' }}>{t.brand} {t.model}</div>
          {t.imei && <div className="text-xs font-mono text-muted2">IMEI: {t.imei}</div>}
        </div>
        <div>
          <div className="text-xs text-muted mb-1">الحالة</div>
          <span className={`badge ${sc.badge}`}>{sc.label}</span>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">الفني</div>
          <div className="text-sm">{t.technician_name || <span className="text-muted">غير محدد</span>}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">تاريخ الاستلام</div>
          <div className="text-sm font-mono">{t.received_at ? new Date(t.received_at).toLocaleDateString('ar-SA') : '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">التكلفة التقديرية</div>
          <div className="text-sm font-mono text-blue">{t.estimated_cost ? `${t.estimated_cost} ريال` : '—'}</div>
        </div>
      </div>

      <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
        <div className="text-xs text-muted mb-1">وصف المشكلة</div>
        <div className="text-sm">{t.problem_desc}</div>
        {t.physical_condition && (
          <><div className="text-xs text-muted mt-2 mb-1">حالة الجهاز عند الاستلام</div>
          <div className="text-sm">{t.physical_condition}</div></>
        )}
      </div>



      {/* سجل التغييرات */}
      <div>
        <div className="text-xs text-muted mb-2" style={{ fontWeight:600, letterSpacing:'.04em', textTransform:'uppercase' }}>سجل التغييرات</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:160, overflowY:'auto' }}>
          {(t.history || []).map((h, i) => {
            const isAuto = !h.changed_by_name
            return (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <div style={{
                width:8, height:8, borderRadius:'50%', marginTop:4, flexShrink:0,
                background: isAuto ? 'var(--muted)' : 'var(--blue)'
              }}/>
              <div>
                <div style={{ fontSize:12, color:'var(--text-2)' }}>
                  {isAuto ? (
                    <span style={{ color:'var(--muted)', fontStyle:'italic', fontSize:11 }}>⚙ إجراء تلقائي</span>
                  ) : (
                    <span style={{ fontWeight:500 }}>{h.changed_by_name}</span>
                  )}
                  {' → '}
                  <span className="text-blue">{STATUS_LABELS_AR[h.new_status] || h.new_status}</span>
                </div>
                {h.note && <div className="text-xs text-muted">{h.note}</div>}
                <div className="text-xs text-muted font-mono">{h.created_at ? new Date(h.created_at).toLocaleString('ar-SA') : ''}</div>
              </div>
            </div>
          )})}
        </div>
      </div>

      {/* ملاحظة تغيير الحالة */}
      {sc.next && t.status !== 'quick_check' && (
        <div style={{ marginTop:14 }}>
          <label className="form-label">ملاحظة (اختياري)</label>
          <input className="form-input" value={statusNote}
            onChange={e=>setStatusNote(e.target.value)}
            placeholder="مثال: تم الانتهاء من الإصلاح..." />
        </div>
      )}

      {/* نموذج الرفض */}
      {showReject && t.status === 'quick_check' && (
        <div style={{ marginTop:14, padding:14, background:'rgba(239,68,68,.06)', borderRadius:8, border:'1px solid var(--red-dim)' }}>
          <div style={{ fontWeight:500, color:'var(--red)', marginBottom:10 }}>✗ رفض التذكرة</div>
          <div className="form-group mb-2">
            <label className="form-label">سبب الرفض *</label>
            <textarea className="form-textarea" rows={2} value={rejectReason}
              onChange={e=>setRejectReason(e.target.value)}
              placeholder="مثال: العميل رفض التكلفة / الجهاز غير قابل للإصلاح..." />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-danger btn-sm"
              disabled={!rejectReason.trim()}
              onClick={() => {
                onStatusUpdate.mutate({ id:t.id, status:'rejected', note:rejectReason })
                setShowReject(false)
              }}>
              تأكيد الرفض
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowReject(false)}>إلغاء</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── نموذج تحويل الفحص السريع — نموذج استلام كامل ──────────
function ConvertToRepairModal({ ticket, onClose, onSuccess }) {
  const [form, setForm] = useState({
    device_brand:      ticket.brand !== 'غير محدد' ? ticket.brand : '',
    device_model:      ticket.model !== 'غير محدد' ? ticket.model : '',
    device_type:       ticket.device_type || 'smartphone',
    device_color:      ticket.color || '',
    device_imei:       ticket.imei || '',
    problem_desc:      ticket.problem_desc === 'فحص' ? '' : (ticket.problem_desc || ''),
    priority:          'normal',
    estimated_cost:    '',
    warranty_days:     30,
    physical_condition:'',
    accessories:       '',
    technician_id:     ticket.technician_id || '',
    note:              'موافقة العميل على الإصلاح'
  })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data: techs } = useQuery({ queryKey:['techs-list'], queryFn:()=>api.get('/technicians') })

  const convert = useMutation({
    mutationFn: async () => {
      // تحديث بيانات الجهاز أولاً إذا تغيرت
      if (form.device_brand && form.device_brand !== 'غير محدد') {
        await api.patch(`/tickets/${ticket.id}/device`, {
          brand: form.device_brand,
          model: form.device_model,
          device_type: form.device_type,
          color: form.device_color,
          imei: form.device_imei,
        }).catch(() => {}) // تجاهل الخطأ إذا لم يكن endpoint موجوداً
      }
      // تحويل الحالة
      return api.post(`/tickets/${ticket.id}/convert`, {
        technician_id:     form.technician_id || undefined,
        estimated_cost:    form.estimated_cost || undefined,
        problem_desc:      form.problem_desc,
        physical_condition: form.physical_condition,
        accessories:       form.accessories,
        warranty_days:     form.warranty_days,
        note:              form.note
      })
    },
    onSuccess,
    onError: err => toast.error(err?.message || 'خطأ في التحويل')
  })

  return (
    <Modal open={true} onClose={onClose} title={`🔧 تحويل ${ticket.order_number} لتذكرة صيانة`} maxWidth={620}
      footer={
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => convert.mutate()}
            disabled={convert.isPending || !form.problem_desc}>
            {convert.isPending ? 'جاري التحويل...' : '✓ تحويل لتذكرة صيانة'}
          </button>
        </div>
      }>

      {/* معلومات العميل — قراءة فقط */}
      <div style={{ background:'var(--blue-dim)', borderRadius:8, padding:'10px 14px', marginBottom:16, border:'1px solid rgba(59,130,246,.2)' }}>
        <div className="text-xs text-muted mb-1">بيانات العميل</div>
        <div style={{ fontWeight:600, color:'var(--text-2)' }}>{ticket.customer_name}</div>
        <div className="text-sm text-muted2">{ticket.customer_phone}</div>
      </div>

      <div className="form-grid">
        {/* بيانات الجهاز */}
        <div className="form-group">
          <label className="form-label">الماركة *</label>
          <input className="form-input" value={form.device_brand}
            onChange={e=>set('device_brand',e.target.value)} placeholder="Apple / Samsung..." />
        </div>
        <div className="form-group">
          <label className="form-label">الموديل *</label>
          <input className="form-input" value={form.device_model}
            onChange={e=>set('device_model',e.target.value)} placeholder="iPhone 14..." />
        </div>
        <div className="form-group">
          <label className="form-label">نوع الجهاز</label>
          <select className="form-select" value={form.device_type} onChange={e=>set('device_type',e.target.value)}>
            <option value="smartphone">هاتف ذكي</option>
            <option value="laptop">لابتوب</option>
            <option value="tablet">تابلت</option>
            <option value="desktop">كمبيوتر</option>
            <option value="other">أخرى</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">اللون</label>
          <input className="form-input" value={form.device_color}
            onChange={e=>set('device_color',e.target.value)} placeholder="أسود / أبيض..." />
        </div>
        <div className="form-group form-full">
          <label className="form-label">IMEI / السيريال</label>
          <input className="form-input" value={form.device_imei}
            onChange={e=>set('device_imei',e.target.value)} dir="ltr" placeholder="رقم IMEI أو S/N" />
        </div>

        <div className="divider form-full" />

        {/* تفاصيل الصيانة */}
        <div className="form-group form-full">
          <label className="form-label">وصف المشكلة بالتفصيل *</label>
          <textarea className="form-textarea" rows={3} value={form.problem_desc}
            onChange={e=>set('problem_desc',e.target.value)}
            placeholder="اشرح المشكلة بالتفصيل بعد الفحص..." />
        </div>
        <div className="form-group">
          <label className="form-label">الأولوية</label>
          <select className="form-select" value={form.priority} onChange={e=>set('priority',e.target.value)}>
            <option value="normal">عادي</option>
            <option value="urgent">عاجل</option>
            <option value="vip">VIP</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">الفني المسؤول</label>
          <select className="form-select" value={form.technician_id} onChange={e=>set('technician_id',e.target.value)}>
            <option value="">-- اختر فني --</option>
            {(techs?.data || []).map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">التكلفة التقديرية (ريال)</label>
          <input className="form-input" type="number" value={form.estimated_cost}
            onChange={e=>set('estimated_cost',e.target.value)} placeholder="0" />
        </div>
        <div className="form-group form-full">
          <label className="form-label">حالة الجهاز عند الاستلام</label>
          <input className="form-input" value={form.physical_condition}
            onChange={e=>set('physical_condition',e.target.value)}
            placeholder="خدوش، كسر، ملاحظات..." />
        </div>
        <div className="form-group form-full">
          <label className="form-label">الملحقات المرافقة</label>
          <input className="form-input" value={form.accessories}
            onChange={e=>set('accessories',e.target.value)}
            placeholder="شاحن، حافظة، سماعة..." />
        </div>
        <div className="form-group">
          <label className="form-label">مدة الضمان (أيام)</label>
          <input className="form-input" type="number" value={form.warranty_days}
            onChange={e=>set('warranty_days',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">ملاحظة التحويل</label>
          <input className="form-input" value={form.note}
            onChange={e=>set('note',e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
// ── New Ticket Modal ───────────────────────────────────────
// نوعان: repair (كاملة) أو quick_check (سريعة — اسم + جوال فقط)
function NewTicketModal({ onClose, onSuccess }) {
  const [ticketType, setTicketType] = useState('repair') // مباشرة لتذكرة صيانة
  const [form, setForm] = useState({
    customer_phone:'', customer_name:'',
    device_type:'smartphone', device_brand:'', device_model:'',
    device_color:'', device_imei:'',
    problem_desc:'', priority:'normal',
    physical_condition:'', accessories:'',
    estimated_cost:'', warranty_days:30,
    technician_id:''
  })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))
  const [step, setStep] = useState(1)
  const [customerFound, setCustomerFound] = useState(null)

  const { data: techs } = useQuery({
    queryKey:['techs-list'],
    queryFn: () => api.get('/technicians')
  })

  const searchCustomer = useMutation({
    mutationFn: (phone) => api.get(`/customers?search=${phone}&limit=1`),
    onSuccess: (d) => {
      const c = d?.data?.[0]
      if (c) { setCustomerFound(c); set('customer_name', c.full_name); toast.success('تم العثور على العميل') }
      else { setCustomerFound(null); toast('عميل جديد', { icon:'ℹ️' }) }
    }
  })

  const submit = useMutation({
    mutationFn: () => api.post('/tickets', {
      ...form,
      ticket_type: ticketType,
      customer_id: customerFound?.id
    }),
    onSuccess: (d) => onSuccess(d?.data),
    onError: err => toast.error(err?.message || 'خطأ في الإنشاء')
  })

  // ─── تذكرة فحص سريع — محذوفة، لكن نبقي الكود للتذاكر القديمة ──────
  if (ticketType === 'quick_check') {
    const canSubmit = form.customer_phone && form.customer_name
    return (
      <Modal open={true} onClose={onClose} title="🔍 فحص سريع"
        footer={
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setTicketType(null)}>← رجوع</button>
            <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
            <button className="btn btn-primary" onClick={() => submit.mutate()} disabled={submit.isPending || !canSubmit}>
              {submit.isPending ? 'جاري الحفظ...' : '✓ فتح تذكرة الفحص'}
            </button>
          </div>
        }>
        <div style={{ marginBottom:16, padding:'10px 14px', background:'rgba(139,92,246,.08)', border:'1px solid rgba(139,92,246,.25)', borderRadius:8, fontSize:12, color:'var(--purple)' }}>
          📌 تذكرة فحص مبدئي — بعد الفحص يمكن تحويلها لتذكرة صيانة أو إغلاقها مع ذكر السبب
        </div>
        <div className="form-grid">
          <div className="form-group form-full">
            <label className="form-label">رقم جوال العميل *</label>
            <div style={{ display:'flex', gap:8 }}>
              <input className="form-input" value={form.customer_phone}
                onChange={e=>set('customer_phone',e.target.value)}
                placeholder="05xxxxxxxx" dir="ltr" style={{ flex:1 }} />
              <button className="btn btn-ghost"
                onClick={() => searchCustomer.mutate(form.customer_phone)}
                disabled={!form.customer_phone || searchCustomer.isPending}>
                {searchCustomer.isPending ? '...' : 'بحث'}
              </button>
            </div>
          </div>
          <div className="form-group form-full">
            <label className="form-label">اسم العميل *</label>
            <input className="form-input" value={form.customer_name}
              onChange={e=>set('customer_name',e.target.value)}
              placeholder="اسم العميل الكامل" />
          </div>
          <div className="form-group">
            <label className="form-label">نوع الجهاز (اختياري)</label>
            <select className="form-select" value={form.device_type} onChange={e=>set('device_type',e.target.value)}>
              <option value="smartphone">هاتف ذكي</option>
              <option value="laptop">لابتوب</option>
              <option value="tablet">تابلت</option>
              <option value="desktop">كمبيوتر</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">الفني المسؤول عن الفحص</label>
            <select className="form-select" value={form.technician_id} onChange={e=>set('technician_id',e.target.value)}>
              <option value="">-- اختر فني --</option>
              {(techs?.data || []).map(t => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group form-full">
            <label className="form-label">ملاحظة مبدئية (اختياري)</label>
            <input className="form-input" value={form.problem_desc}
              onChange={e=>set('problem_desc',e.target.value)}
              placeholder="مثال: شاشة مكسورة، لا يشتغل..." />
          </div>
        </div>
      </Modal>
    )
  }

  // ─── تذكرة صيانة كاملة (خطوتان) ─────────────────────
  const steps = [
    { n:1, label:'العميل والجهاز' },
    { n:2, label:'تفاصيل الصيانة' },
  ]

  const canNext = form.customer_phone && form.customer_name && form.device_brand && form.device_model && form.device_model !== ''
  const canSave = form.problem_desc

  return (
    <Modal open={true} onClose={onClose} title="🔧 تذكرة صيانة جديدة" maxWidth={600}
      footer={
        <div style={{ display:'flex', gap:8 }}>
          {step === 1
            ? <button className="btn btn-ghost btn-sm" onClick={() => setTicketType(null)}>← رجوع</button>
            : <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>← رجوع</button>
          }
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          {step < 2
            ? <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!canNext}>التالي →</button>
            : <button className="btn btn-primary" onClick={() => submit.mutate()} disabled={submit.isPending || !canSave}>
                {submit.isPending ? 'جاري الحفظ...' : '✓ إنشاء التذكرة'}
              </button>
          }
        </div>
      }>

      {/* مؤشر الخطوات */}
      <div style={{ display:'flex', gap:0, marginBottom:20 }}>
        {steps.map((s,i) => (
          <div key={s.n} style={{ display:'flex', alignItems:'center', flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700,
                background: step >= s.n ? 'var(--blue)' : 'var(--ink-4)',
                color: step >= s.n ? '#fff' : 'var(--muted)' }}>{s.n}</div>
              <div style={{ fontSize:12, color: step >= s.n ? 'var(--text-2)' : 'var(--muted)' }}>{s.label}</div>
            </div>
            {i < steps.length-1 && <div style={{ flex:1, height:1, background:'var(--border)', margin:'0 8px' }}/>}
          </div>
        ))}
      </div>

      {/* الخطوة 1 — العميل والجهاز */}
      {step === 1 && (
        <div className="form-grid">
          <div className="form-group form-full">
            <label className="form-label">رقم جوال العميل *</label>
            <div style={{ display:'flex', gap:8 }}>
              <input className="form-input" value={form.customer_phone}
                onChange={e=>set('customer_phone',e.target.value)}
                placeholder="05xxxxxxxx" dir="ltr" style={{ flex:1 }} />
              <button className="btn btn-ghost"
                onClick={() => searchCustomer.mutate(form.customer_phone)}
                disabled={!form.customer_phone || searchCustomer.isPending}>
                {searchCustomer.isPending ? '...' : 'بحث'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">اسم العميل *</label>
            <input className="form-input" value={form.customer_name}
              onChange={e=>set('customer_name',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">البريد الإلكتروني</label>
            <input className="form-input" value={form.customer_email||''}
              onChange={e=>set('customer_email',e.target.value)} dir="ltr" />
          </div>
          <div className="divider form-full" />
          <div className="form-full">
            <DeviceSelector
              brand={form.device_brand}
              type={form.device_type_cat || ''}
              model={form.device_model}
              onChange={({ brand, type, model, dbType }) => {
                set('device_brand', brand)
                set('device_type_cat', type)
                set('device_model', model)
                set('device_type', dbType)
              }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">اللون</label>
            <input className="form-input" value={form.device_color}
              onChange={e=>set('device_color',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">رقم IMEI / السيريال</label>
            <input className="form-input" value={form.device_imei}
              onChange={e=>set('device_imei',e.target.value)} dir="ltr" placeholder="رقم IMEI أو S/N" />
          </div>
        </div>
      )}

      {/* الخطوة 2 — تفاصيل الصيانة */}
      {step === 2 && (
        <div className="form-grid">
          <div className="form-group form-full">
            <label className="form-label">وصف المشكلة *</label>
            <textarea className="form-textarea" rows={3} value={form.problem_desc}
              onChange={e=>set('problem_desc',e.target.value)}
              placeholder="اشرح المشكلة بالتفصيل..." />
          </div>
          <div className="form-group">
            <label className="form-label">الأولوية</label>
            <select className="form-select" value={form.priority} onChange={e=>set('priority',e.target.value)}>
              <option value="normal">عادي</option>
              <option value="urgent">عاجل</option>
              <option value="vip">VIP</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">الفني المسؤول</label>
            <select className="form-select" value={form.technician_id} onChange={e=>set('technician_id',e.target.value)}>
              <option value="">-- اختر فني --</option>
              {(techs?.data || []).map(t => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">التكلفة التقديرية (ريال)</label>
            <input className="form-input" type="number" value={form.estimated_cost}
              onChange={e=>set('estimated_cost',e.target.value)} />
          </div>
          <div className="form-group form-full">
            <label className="form-label">حالة الجهاز عند الاستلام</label>
            <input className="form-input" value={form.physical_condition}
              onChange={e=>set('physical_condition',e.target.value)}
              placeholder="خدوش، كسر، ملاحظات..." />
          </div>
          <div className="form-group form-full">
            <label className="form-label">الملحقات المرافقة</label>
            <input className="form-input" value={form.accessories}
              onChange={e=>set('accessories',e.target.value)}
              placeholder="شاحن، حافظة، سماعة..." />
          </div>
          <div className="form-group">
            <label className="form-label">مدة الضمان (أيام)</label>
            <input className="form-input" type="number" value={form.warranty_days}
              onChange={e=>set('warranty_days',e.target.value)} />
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── لوحة تعديل التذكرة + إدارة القطع ─────────────────────
function TicketEditPanel({ ticket, onUpdate }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const canManageParts = ['admin','branch_manager','warehouse'].includes(user?.role)
  const [tab, setTab] = useState(null)  // null | 'edit' | 'parts'
  const [problem, setProblem] = useState(ticket.problem_desc || '')
  const [deviceType, setDeviceType] = useState(ticket.device_type || 'smartphone')
  const [editBrand, setEditBrand] = useState(ticket.brand !== 'غير محدد' ? ticket.brand : '')
  const [editTypeCat, setEditTypeCat] = useState('')
  const [editModel, setEditModel] = useState(ticket.model !== 'غير محدد' ? ticket.model : '')
  const [cost, setCost] = useState(ticket.estimated_cost || '')
  const [partSearch, setPartSearch] = useState('')

  // قطع التذكرة الحالية
  const { data: partsData } = useQuery({
    queryKey: ['ticket-parts', ticket.id],
    queryFn: () => api.get(`/tickets/${ticket.id}/parts`),
  })
  const ticketParts = partsData?.data || []

  // المخزون المتاح
  const { data: stockData } = useQuery({
    queryKey: ['stock-parts'],
    queryFn: () => api.get('/inventory/parts?limit=200'),
    enabled: tab === 'parts',
  })
  const stock = (stockData?.data || []).filter(p =>
    !partSearch || p.name?.toLowerCase().includes(partSearch.toLowerCase())
  )

  const saveEdit = useMutation({
    mutationFn: () => api.patch(`/tickets/${ticket.id}`, {
      problem_desc: problem, device_type: deviceType,
      device_brand: editBrand || undefined, device_model: editModel || undefined,
      estimated_cost: cost || null
    }),
    onSuccess: () => { toast.success('تم تحديث التذكرة'); onUpdate(); setTab(null) },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  const addPart = useMutation({
    mutationFn: (p) => api.post(`/part-requests`, {
      order_id: ticket.id, part_id: p.id, quantity: 1
    }),
    onSuccess: () => {
      toast.success('تم إرسال طلب القطعة للمخزن — سيتم الخصم بعد موافقة المخزن')
      qc.invalidateQueries({ queryKey: ['ticket-parts', ticket.id] })
      setPartSearch('')
    },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  const removePart = useMutation({
    mutationFn: (partRowId) => api.delete(`/tickets/${ticket.id}/parts/${partRowId}`),
    onSuccess: () => {
      toast.success('تم حذف القطعة وإرجاعها للمخزون')
      qc.invalidateQueries({ queryKey: ['ticket-parts', ticket.id] })
      qc.invalidateQueries({ queryKey: ['stock-parts'] })
    },
    onError: e => toast.error(e?.message || 'خطأ')
  })

  const partsCost = ticketParts.reduce((s,p) => s + Number(p.unit_price)*Number(p.quantity), 0)

  return (
    <div style={{ marginBottom:14 }}>
      {/* أزرار التبويب */}
      <div style={{ display:'flex', gap:8, marginBottom:tab?12:0 }}>
        <button className={`btn btn-sm ${tab==='edit'?'btn-primary':'btn-ghost'}`}
          onClick={() => setTab(tab==='edit'?null:'edit')}>
          ✏️ تعديل العطل والجهاز
        </button>
        <button className={`btn btn-sm ${tab==='parts'?'btn-primary':'btn-ghost'}`}
          onClick={() => setTab(tab==='parts'?null:'parts')}>
          📦 القطع المستخدمة ({ticketParts.length})
        </button>
      </div>

      {/* تبويب التعديل */}
      {tab === 'edit' && (
        <div style={{ background:'var(--ink-3)', borderRadius:8, padding:14 }}>
          <div className="form-full mb-2">
            <DeviceSelector
              brand={editBrand}
              type={editTypeCat}
              model={editModel}
              onChange={({ brand, type, model, dbType }) => {
                setEditBrand(brand); setEditTypeCat(type); setEditModel(model); setDeviceType(dbType)
              }}
            />
          </div>
          <div className="form-group mb-2">
            <label className="form-label">وصف العطل</label>
            <textarea className="form-textarea" rows={2} value={problem}
              onChange={e => setProblem(e.target.value)} />
          </div>
          <div className="form-group mb-2">
            <label className="form-label">التكلفة التقديرية</label>
            <input className="form-input" type="number" value={cost}
              onChange={e => setCost(e.target.value)} placeholder="0" />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => saveEdit.mutate()}
            disabled={saveEdit.isPending}>
            {saveEdit.isPending ? 'جاري الحفظ...' : '💾 حفظ التعديلات'}
          </button>
        </div>
      )}

      {/* تبويب القطع */}
      {tab === 'parts' && (
        <div style={{ background:'var(--ink-3)', borderRadius:8, padding:14 }}>
          {/* القطع المضافة */}
          {ticketParts.length > 0 && (
            <div style={{ marginBottom:12 }}>
              {ticketParts.map(p => (
                <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'6px 10px', background:'var(--ink-2)', borderRadius:6, marginBottom:4 }}>
                  <span style={{ fontSize:13, color:'var(--text-2)' }}>
                    {p.part_name} × {p.quantity}
                  </span>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span className="font-mono text-blue" style={{ fontSize:12 }}>
                      {(Number(p.unit_price)*Number(p.quantity)).toLocaleString()} ر
                    </span>
                    <button className="btn-icon" onClick={() => removePart.mutate(p.id)}
                      title="حذف وإرجاع للمخزون" style={{ color:'var(--red)', display: canManageParts ? 'flex' : 'none' }}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </div>
              ))}
              <div style={{ textAlign:'left', fontSize:13, fontWeight:700, color:'var(--text-2)', marginTop:6 }}>
                إجمالي القطع: <span className="font-mono text-blue">{partsCost.toLocaleString()} ريال</span>
              </div>
            </div>
          )}

          {/* بحث وطلب */}
          <div style={{ padding:'8px 10px', background:'rgba(59,130,246,.08)', borderRadius:6, marginBottom:8, fontSize:11, color:'var(--blue)' }}>
            ℹ️ طلب القطعة يُرسل للمخزن — لا تُخصم إلا بعد موافقة مسؤول المخزن (تتبع محكم)
          </div>
          <input className="form-input mb-2" value={partSearch}
            onChange={e => setPartSearch(e.target.value)} placeholder="ابحث عن قطعة لطلبها..." />
          <div style={{ maxHeight:180, overflowY:'auto' }}>
            {stock.slice(0,15).map(p => (
              <div key={p.id} onClick={() => addPart.mutate(p)}
                style={{ display:'flex', justifyContent:'space-between', padding:'7px 10px',
                  cursor:'pointer', borderRadius:5, fontSize:12 }}
                onMouseEnter={e => e.currentTarget.style.background='var(--blue-dim)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <span style={{ color:'var(--text-2)' }}>{p.name}</span>
                <div style={{ display:'flex', gap:12 }}>
                  <span style={{ color: p.quantity>0?'var(--green)':'var(--red)' }}>متوفر: {p.quantity}</span>
                  <span className="font-mono text-blue">{Number(p.sell_price).toLocaleString()} ر</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
