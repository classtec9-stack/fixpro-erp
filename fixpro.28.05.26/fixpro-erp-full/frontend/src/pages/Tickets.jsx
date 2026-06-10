import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState, Pagination } from '../components/ui'
import WarrantyPartReturn from '../components/WarrantyPartReturn'
import toast from 'react-hot-toast'
import { Plus, Search, Layers, List, RefreshCw, Clock, AlertTriangle, Printer, Trash2, CheckSquare } from 'lucide-react'
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
  const [deliveryTicket, setDeliveryTicket] = useState(null)
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
          onDeliveryPrint={setDeliveryTicket}
        />
      )}

      {printTicket && <ReceiptPrint ticket={printTicket} onClose={() => setPrintTicket(null)} />}
      {deliveryTicket && <DeliveryReceiptModal ticket={deliveryTicket} onClose={() => setDeliveryTicket(null)} />}
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
function TicketDetailModal({ ticketId, onClose, onStatusUpdate, onPrint, onDeliveryPrint }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}`)
  })
  const [statusNote, setStatusNote]     = useState('')
  const [showConvert, setShowConvert]   = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showWarranty, setShowWarranty] = useState(false)
  const [showReturnPart, setShowReturnPart] = useState(false)
  const [warrantyForm, setWarrantyForm] = useState({
    claim_type:'same_defect', notes:'', is_free:true,
    technician_fault:false, supplier_defect:false,
    same_technician:true, new_technician_id:''
  })
  const setWF = (k,v) => setWarrantyForm(f => ({...f,[k]:v}))

  const { data: techsData } = useQuery({
    queryKey: ['techs-warranty'],
    queryFn: () => api.get('/technicians'),
    enabled: showWarranty
  })
  const techsList = techsData?.data || []

  const createWarranty = useMutation({
    mutationFn: () => api.post('/warranty', { original_order_id: ticketId, ...warrantyForm }),
    onSuccess: (res) => {
      toast.success(`✅ ${res.data.message}`)
      setShowWarranty(false)
      qc.invalidateQueries(['ticket', ticketId])
      qc.invalidateQueries(['tickets'])
    },
    onError: e => toast.error(e?.response?.data?.message || 'خطأ')
  })
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
          <button className="btn btn-ghost btn-sm" onClick={() => onPrint(t)}><Printer size={13}/> وصل الاستلام</button>
          {['ready','delivered'].includes(t.status) && (
            <button className="btn btn-sm" style={{ background:'var(--green-dim)', color:'var(--green)', border:'1px solid rgba(16,185,129,.3)' }}
              onClick={() => { onClose(); onDeliveryPrint && onDeliveryPrint(t) }}>
              <CheckSquare size={13}/> وصل التسليم
            </button>
          )}
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
          {t.status === 'delivered' && (
            <button className="btn btn-sm" style={{ background:'rgba(139,92,246,.1)', color:'#8B5CF6', border:'1px solid rgba(139,92,246,.3)' }}
              onClick={() => setShowWarranty(true)}>
              🛡️ طلب ضمان
            </button>
          )}
          {t.ticket_category === 'warranty' && t.parts?.length > 0 && (
            <button className="btn btn-sm" style={{ background:'rgba(245,158,11,.1)', color:'var(--amber)', border:'1px solid rgba(245,158,11,.3)' }}
              onClick={() => setShowReturnPart(true)}>
              🔄 إعادة قطعة للمخزون/التوالف
            </button>
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
      {/* نافذة طلب الضمان */}
      {showReturnPart && (
        <WarrantyPartReturn
          ticket={t}
          onClose={() => setShowReturnPart(false)}
        />
      )}
      {showWarranty && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,.7)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target===e.currentTarget && setShowWarranty(false)}>
          <div style={{ background:'var(--ink-2)', borderRadius:12, padding:24, maxWidth:480, width:'100%',
            border:'1px solid var(--border)', boxShadow:'0 24px 64px rgba(0,0,0,.5)', maxHeight:'90vh', overflowY:'auto' }}>

            <div style={{ fontWeight:700, fontSize:15, color:'var(--text-2)', marginBottom:4 }}>🛡️ طلب ضمان</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
              <span style={{ color:'var(--blue)', fontFamily:'monospace' }}>{t.order_number}</span>
              {' — '}{t.customer_name} — {t.brand} {t.model}
            </div>

            {/* الفني السابق */}
            <div style={{ padding:'10px 14px', background:'var(--ink-3)', borderRadius:8, marginBottom:16 }}>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>الفني الذي أصلح الجهاز سابقاً</div>
              <div style={{ fontWeight:600, color:'var(--text-2)', fontSize:13 }}>
                🔧 {t.technician_name || 'لم يُعيَّن فني'}
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* نوع الضمان: مجاني أم مدفوع */}
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:8 }}>نوع الإصلاح</div>
                <div style={{ display:'flex', gap:8 }}>
                  {[{v:true,label:'🆓 مجاني (ضمان)',color:'var(--green)'},{v:false,label:'💰 مدفوع (تذكرة جديدة)',color:'var(--amber)'}].map(opt => (
                    <button key={String(opt.v)} onClick={() => setWF('is_free', opt.v)}
                      style={{ flex:1, padding:'8px', borderRadius:8, border:`2px solid ${warrantyForm.is_free===opt.v ? opt.color : 'var(--border)'}`,
                        background: warrantyForm.is_free===opt.v ? `${opt.color}18` : 'transparent',
                        color: warrantyForm.is_free===opt.v ? opt.color : 'var(--muted)',
                        fontWeight:600, fontSize:12, cursor:'pointer' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>
                  {warrantyForm.is_free
                    ? '✅ ستُعاد نفس التذكرة الأصلية وتتغير حالتها إلى "تم الاستلام"'
                    : '📋 ستُفتح تذكرة جديدة منفصلة للعميل'}
                </div>
              </div>

              {/* نوع المطالبة */}
              <div className="form-group">
                <label className="form-label">سبب العودة</label>
                <select className="form-select" value={warrantyForm.claim_type} onChange={e => setWF('claim_type', e.target.value)}>
                  <option value="same_defect">نفس المشكلة عادت مرة أخرى</option>
                  <option value="part_replacement">القطعة معيبة — تحتاج استبدال</option>
                  <option value="technician_fault">خطأ في التركيب من الفني</option>
                  <option value="new_issue">عطل جديد (غير مشمول بالضمان)</option>
                </select>
              </div>

              {/* تعيين الفني */}
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:8 }}>تعيين الفني</div>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  {[{v:true,label:`نفس الفني (${t.technician_name||'غير محدد'})`},{v:false,label:'فني آخر'}].map(opt => (
                    <button key={String(opt.v)} onClick={() => setWF('same_technician', opt.v)}
                      style={{ flex:1, padding:'7px', borderRadius:8,
                        border:`2px solid ${warrantyForm.same_technician===opt.v ? 'var(--blue)' : 'var(--border)'}`,
                        background: warrantyForm.same_technician===opt.v ? 'rgba(59,130,246,.1)' : 'transparent',
                        color: warrantyForm.same_technician===opt.v ? 'var(--blue)' : 'var(--muted)',
                        fontSize:12, cursor:'pointer' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {!warrantyForm.same_technician && (
                  <select className="form-select" value={warrantyForm.new_technician_id}
                    onChange={e => setWF('new_technician_id', e.target.value)}>
                    <option value="">— اختر فني —</option>
                    {techsList.map(tech => (
                      <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* ملاحظات */}
              <div className="form-group">
                <label className="form-label">وصف المشكلة التي عاد بها العميل</label>
                <input className="form-input" value={warrantyForm.notes}
                  onChange={e => setWF('notes', e.target.value)}
                  placeholder="مثال: الشاشة بدأت تظهر خطوط بعد أسبوع..."/>
              </div>

              {/* خيارات إضافية */}
              <div style={{ display:'flex', gap:16 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
                  <input type="checkbox" checked={warrantyForm.technician_fault}
                    onChange={e => setWF('technician_fault', e.target.checked)}/>
                  خطأ من الفني
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
                  <input type="checkbox" checked={warrantyForm.supplier_defect}
                    onChange={e => setWF('supplier_defect', e.target.checked)}/>
                  عيب من المورد
                </label>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setShowWarranty(false)}>إلغاء</button>
              <button style={{ flex:2, padding:'10px', borderRadius:8, border:'none', cursor:'pointer',
                background: warrantyForm.is_free ? 'var(--green)' : '#F59E0B',
                color:'#fff', fontWeight:700, fontSize:13,
                opacity: createWarranty.isPending ? .7 : 1 }}
                onClick={() => createWarranty.mutate()}
                disabled={createWarranty.isPending}>
                {createWarranty.isPending ? 'جاري...' :
                  warrantyForm.is_free ? '🔄 إعادة فتح التذكرة (مجاناً)' : '📋 فتح تذكرة جديدة (مدفوع)'}
              </button>
            </div>
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

  const [nameConflict, setNameConflict] = useState(null) // D3

  const submit = useMutation({
    mutationFn: () => api.post('/tickets', {
      ...form,
      ticket_type: ticketType,
      customer_id: customerFound?.id
    }),
    onSuccess: (d) => { setNameConflict(null); onSuccess(d?.data) },
    onError: err => {
      const data = err?.response?.data
      if (data?.code === 'CUSTOMER_NAME_CONFLICT') {
        setNameConflict(data.data)
        return
      }
      toast.error(data?.message || 'خطأ في الإنشاء')
    }
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

  const [checkingPhone, setCheckingPhone] = useState(false)

  // التحقق من تعارض الاسم قبل الانتقال للخطوة الثانية — دائماً من API
  const handleNext = async () => {
    if (!canNext) return
    setCheckingPhone(true)
    try {
      const res = await api.get(`/customers?search=${form.customer_phone}&limit=1`)
      const found = res?.data?.[0]

      if (found) {
        setCustomerFound(found)
        // إذا الاسم مختلف — أوقف وأظهر التحذير
        if (found.full_name.trim() !== form.customer_name.trim()) {
          setNameConflict({
            existing_id: found.id,
            existing_name: found.full_name,
            new_name: form.customer_name
          })
          return
        }
        // نفس الاسم — استخدم العميل الموجود
        set('customer_name', found.full_name)
      }
      setStep(2)
    } catch {
      // إذا فشل الطلب نكمل
      setStep(2)
    } finally {
      setCheckingPhone(false)
    }
  }

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
            ? <button className="btn btn-primary" onClick={handleNext}
                disabled={!canNext || checkingPhone}>
                {checkingPhone ? '...' : 'التالي →'}
              </button>
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

      {/* D3: نافذة تعارض اسم العميل */}
      {nameConflict && (
        <div style={{
          position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,.7)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:16
        }}>
          <div style={{
            background:'var(--ink-2)', borderRadius:12, padding:24, maxWidth:420, width:'100%',
            border:'1px solid var(--border)', boxShadow:'0 24px 64px rgba(0,0,0,.5)'
          }}>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--text-2)', marginBottom:16 }}>
              ⚠️ تعارض في بيانات العميل
            </div>
            <div style={{ fontSize:13, color:'var(--text)', marginBottom:8 }}>
              هذا الرقم مسجل في النظام باسم:
            </div>
            <div style={{ fontWeight:700, color:'var(--blue)', fontSize:15, marginBottom:12 }}>
              {nameConflict.existing_name}
            </div>
            <div style={{ fontSize:13, color:'var(--text)', marginBottom:8 }}>
              الاسم الذي أدخلته:
            </div>
            <div style={{ fontWeight:700, color:'var(--amber)', fontSize:15, marginBottom:20 }}>
              {nameConflict.new_name}
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>
              هل تريد تحديث اسم العميل إلى الاسم الجديد؟
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1 }}
                onClick={() => {
                  // استخدم الاسم الحالي وانتقل للخطوة الثانية
                  setForm(f => ({ ...f, customer_name: nameConflict.existing_name }))
                  setNameConflict(null)
                  setStep(2)
                }}>
                لا — استخدم الاسم الحالي
              </button>
              <button className="btn btn-primary" style={{ flex:1 }}
                onClick={async () => {
                  // حدّث الاسم ثم انتقل للخطوة الثانية
                  try {
                    await api.put(`/customers/${nameConflict.existing_id}`, { full_name: nameConflict.new_name })
                    setCustomerFound(prev => prev ? { ...prev, full_name: nameConflict.new_name } : prev)
                    setNameConflict(null)
                    setStep(2)
                  } catch { toast.error('خطأ في تحديث الاسم') }
                }}>
                نعم — حدّث الاسم
              </button>
            </div>
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

  // إرسال قطعة للتوالف من التذكرة
  const [defectiveTarget, setDefectiveTarget] = useState(null) // القطعة المراد إرسالها
  const [defectiveReason, setDefectiveReason] = useState('')

  const sendToDefective = useMutation({
    mutationFn: () => api.post('/defective', {
      part_id:     defectiveTarget.part_id,
      quantity:    defectiveTarget.quantity,
      source_type: 'warranty_ticket',
      source_id:   ticket.id,
      reason:      defectiveReason || `قطعة مفكوكة من تذكرة ${ticket.order_number}`
    }),
    onSuccess: () => {
      toast.success('✅ تم نقل القطعة لمنطقة التوالف')
      setDefectiveTarget(null)
      setDefectiveReason('')
    },
    onError: e => toast.error(e?.response?.data?.message || 'خطأ')
  })
  const [tab, setTab] = useState(null)  // null | 'edit' | 'parts' | 'lifecycle'

  // جلب سجل الحركات لكل قطعة في هذه التذكرة
  const { data: lifecycleData } = useQuery({
    queryKey: ['ticket-lifecycle', ticket.id],
    queryFn: () => api.get(`/tickets/${ticket.id}/parts`),
    enabled: tab === 'lifecycle'
  })
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
        <button className={`btn btn-sm ${tab==='lifecycle'?'btn-primary':'btn-ghost'}`}
          onClick={() => setTab(tab==='lifecycle'?null:'lifecycle')}>
          🔍 دورة حياة القطع
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
                    {canManageParts && (
                      <button className="btn-icon" onClick={() => setDefectiveTarget(p)}
                        title="نقل للتوالف" style={{ color:'var(--amber)' }}>
                        <AlertTriangle size={13}/>
                      </button>
                    )}
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

      {/* تبويب دورة الحياة */}
      {tab === 'lifecycle' && (
        <div style={{ background:'var(--ink-3)', borderRadius:8, padding:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-2)', marginBottom:12 }}>
            📋 دورة حياة القطع — تذكرة {ticket.order_number}
          </div>

          {ticketParts.length === 0 ? (
            <div style={{ fontSize:12, color:'var(--muted)', padding:'12px', textAlign:'center' }}>
              لا توجد قطع مضافة لهذه التذكرة
            </div>
          ) : ticketParts.map(p => (
            <div key={p.id} style={{ padding:'12px 14px', background:'var(--ink-2)', borderRadius:8, marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ fontWeight:700, color:'var(--text-2)', fontSize:13 }}>📦 {p.part_name}</span>
                <span style={{ fontFamily:'monospace', color:'var(--blue)', fontSize:12 }}>
                  {p.quantity} × {Number(p.unit_price).toLocaleString()} ريال
                </span>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:6, paddingRight:10, borderRight:'2px solid var(--border)' }}>
                {[
                  { n:1, color:'var(--blue)',  icon:'📥', label:'دخلت المخزون',    value:'مخزون الفرع', show: true },
                  { n:2, color:'var(--amber)', icon:'📤', label:'صُرفت لتذكرة',   value: ticket.order_number, mono: true, show: true },
                  { n:3, color:'var(--amber)', icon:'👤', label:'العميل',          value: ticket.customer_name, show: true },
                  { n:4, color:'var(--amber)', icon:'📱', label:'الجهاز',          value: `${ticket.brand} ${ticket.model}${ticket.color?' ('+ticket.color+')':''}`, show: true },
                  { n:5, color:'var(--amber)', icon:'🔧', label:'الفني',           value: ticket.technician_name || 'لم يُعيَّن بعد', show: true },
                  { n:6, color: ticket.status==='delivered'?'var(--green)':ticket.status==='rejected'?'var(--red)':'var(--amber)',
                    icon: ticket.status==='delivered'?'✅':ticket.status==='rejected'?'❌':'⏳',
                    label:'مصير القطعة',
                    value: ticket.status==='delivered' ? 'سُلِّمت مع الجهاز للعميل' :
                           ticket.status==='rejected'  ? 'أُرجعت للمخزون' : 'لا تزال في التذكرة',
                    show: true },
                  { n:7, color:'var(--green)', icon:'📅', label:'تاريخ التسليم',
                    value: ticket.delivered_at ? new Date(ticket.delivered_at).toLocaleDateString('ar-SA') : '—',
                    show: ticket.status==='delivered' },
                ].filter(r => r.show).map(r => (
                  <div key={r.n} style={{ display:'flex', gap:8, alignItems:'center', fontSize:12 }}>
                    <span style={{ width:18, height:18, borderRadius:'50%', background:r.color,
                      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:9, color:'#fff', fontWeight:700 }}>
                      {r.n}
                    </span>
                    <span style={{ color:'var(--muted)', width:90, flexShrink:0 }}>{r.icon} {r.label}:</span>
                    <span style={{ color:'var(--text-2)', fontWeight:500, fontFamily: r.mono?'monospace':'inherit' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {ticketParts.length > 0 && (
            <div style={{ padding:'10px 14px', background:'rgba(16,185,129,.06)', border:'1px solid rgba(16,185,129,.2)', borderRadius:8, fontSize:12, marginTop:8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                <span style={{ color:'var(--muted)' }}>إجمالي القطع:</span>
                <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--blue)' }}>
                  {ticketParts.reduce((s,p)=>s+Number(p.unit_price)*Number(p.quantity),0).toLocaleString()} ريال
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// وصل التسليم — Modal مباشر من التذكرة
// ══════════════════════════════════════════════════════════
function DeliveryReceiptModal({ ticket: t, onClose }) {
  const [laborCost, setLaborCost] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [printing, setPrinting]   = useState(false)

  const { data: shopData } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api.get('/shop-settings'),
  })
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['invoice-for-delivery', t.id],
    queryFn: () => api.get(`/invoices/ticket/${t.id}`),
  })

  const shop = shopData?.data  || {}
  const d    = detailData?.data || {}
  const inv  = d.invoice
  const parts = d.parts || []

  const PAY_LABELS = {
    cash:'نقد', card:'بطاقة', bank_transfer:'تحويل بنكي',
    mada:'مدى', stc_pay:'STC Pay', apple_pay:'Apple Pay',
  }

  const doPrint = async () => {
    setPrinting(true)
    try {
      const { generateQR, buildTrackUrl } = await import('../utils/printUtils')

      const trackUrl = buildTrackUrl(shop, t.order_number)
      const qr = await generateQR(trackUrl, 70)
      const lc   = parseFloat(laborCost) || parseFloat(inv?.labor_cost || 0)
      const pc   = parseFloat(d.parts_cost || 0)
      const disc = parseFloat(inv?.discount || 0)
      const sub  = lc + pc - disc
      const vat  = +(sub * 0.15).toFixed(2)
      const tot  = +(sub + vat).toFixed(2)
      const paid = parseFloat(inv?.paid_amount || 0)
      const bal  = +(tot - paid).toFixed(2)
      const now  = new Date()
      const W    = shop?.receipt_width || 80

      const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><title>وصل تسليم ${t.order_number}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#000;
    direction:rtl;width:${W}mm;padding:4mm;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:6px}
  .badge{display:inline-block;background:#000;color:#fff;padding:2px 10px;border-radius:3px;font-size:9px;font-weight:700;margin:3px 0}
  .r2{display:flex;justify-content:space-between;padding:2px 0;font-size:9px}
  .lb{color:#555}
  .dvd{border:none;border-top:1px dashed #666;margin:4px 0}
  .dvd2{border:none;border-top:2px solid #000;margin:5px 0}
  .tot{display:flex;justify-content:space-between;font-size:12px;font-weight:700;
    border-top:2px solid #000;padding-top:4px;margin-top:3px}
  .stamp{text-align:center;font-size:14px;font-weight:900;
    border:3px solid #000;border-radius:6px;padding:3px 12px;display:inline-block;margin:4px 0}
  .sig{border:1px solid #000;height:12mm;margin-top:3px;width:100%;
    display:flex;align-items:center;justify-content:center;color:#aaa;font-size:8px}
  .ft{font-size:7px;color:#666;text-align:center;margin-top:5px;
    border-top:1px dashed #000;padding-top:4px;line-height:1.5}
  @media print{@page{margin:3mm;size:${W}mm auto}body{width:100%}}
</style></head><body>
<div class="hdr">
  ${shop?.logo_url ? `<img src="${shop.logo_url}" style="max-height:38px;display:block;margin:0 auto 4px;object-fit:contain"/>` : ''}
  <div style="font-size:15px;font-weight:700">${shop?.shop_name || 'FixPro للصيانة'}</div>
  ${shop?.address ? `<div style="font-size:8px;color:#666">${shop.city||''} — ${shop.address}</div>` : ''}
  ${shop?.phone ? `<div style="font-size:8px;color:#666">📞 ${shop.phone}</div>` : ''}
  ${shop?.tax_number ? `<div style="font-size:7px;color:#888">الرقم الضريبي: ${shop.tax_number}</div>` : ''}
  <div class="badge">وصل تسليم</div>
  <div style="font-size:16px;font-weight:900;letter-spacing:2px;margin:3px 0">${t.order_number}</div>
  <div style="font-size:8px;color:#666">
    ${now.toLocaleDateString('ar-SA')} | ${now.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}
  </div>
</div>
<div class="r2"><span class="lb">العميل</span><span style="font-weight:500">${t.customer_name}</span></div>
<div class="r2"><span class="lb">الجوال</span><span style="direction:ltr">${t.customer_phone}</span></div>
<hr class="dvd"/>
<div class="r2"><span class="lb">الجهاز</span><span style="font-weight:500">${t.brand} ${t.model}</span></div>
${t.imei ? `<div class="r2"><span class="lb">IMEI</span><span style="direction:ltr;font-family:monospace">${t.imei}</span></div>` : ''}
${t.color ? `<div class="r2"><span class="lb">اللون</span><span>${t.color}</span></div>` : ''}
<hr class="dvd"/>
${parts.length > 0 ? `
  <div style="font-size:9px;font-weight:700;margin-bottom:3px">القطع المستبدلة:</div>
  ${parts.map(p => `
    <div class="r2">
      <span>${p.part_name}${parseFloat(p.quantity)>1?` ×${p.quantity}`:''}</span>
      <span style="direction:ltr">${(parseFloat(p.unit_price)*parseFloat(p.quantity)).toLocaleString('ar-SA')} ر</span>
    </div>`).join('')}
  <hr class="dvd"/>
` : ''}
<div class="r2"><span class="lb">أجرة الإصلاح</span><span>${lc.toLocaleString('ar-SA')} ر</span></div>
<div class="r2"><span class="lb">قطع الغيار</span><span>${pc.toLocaleString('ar-SA')} ر</span></div>
${disc > 0 ? `<div class="r2"><span class="lb">خصم</span><span style="color:#16a34a">- ${disc.toLocaleString('ar-SA')} ر</span></div>` : ''}
<div class="r2"><span class="lb">قبل الضريبة</span><span>${sub.toLocaleString('ar-SA')} ر</span></div>
<div class="r2"><span class="lb">ضريبة 15%</span><span>${vat.toLocaleString('ar-SA')} ر</span></div>
<div class="tot"><span>الإجمالي</span><span style="direction:ltr">${tot.toLocaleString('ar-SA')} ريال</span></div>
${paid > 0 ? `<div class="r2"><span class="lb" style="color:#16a34a">مدفوع</span><span style="color:#16a34a">${paid.toLocaleString('ar-SA')} ر</span></div>` : ''}
${bal > 0 ? `<div class="r2"><span class="lb" style="color:#dc2626;font-weight:700">المتبقي</span><span style="color:#dc2626">${bal.toLocaleString('ar-SA')} ر</span></div>` : ''}
<div style="text-align:center;margin:5px 0">
  ${bal <= 0 ? '<div class="stamp">✓ مدفوع بالكامل</div>' : '<div class="stamp" style="border-color:#dc2626;color:#dc2626">متبقي</div>'}
</div>
<div class="r2"><span class="lb">طريقة الدفع</span><span>${PAY_LABELS[payMethod] || payMethod}</span></div>
<hr class="dvd2"/>
<div style="font-size:9px;font-weight:700;margin-bottom:3px">✍️ توقيع العميل (استلمت جهازي سليماً):</div>
<div class="sig">_________________________________</div>
${qr ? `
  <div style="text-align:center;margin-top:6px">
    <img src="${qr}" style="width:45px;height:45px;display:block;margin:0 auto 2px"/>
    <div style="font-size:7px;color:#888">${trackUrl}</div>
  </div>` : ''}
${shop?.invoice_terms ? `<div class="ft">${shop.invoice_terms}</div>` : ''}
${shop?.invoice_footer ? `<div style="font-size:8px;color:#555;text-align:center;margin-top:3px">${shop.invoice_footer}</div>` : ''}
</body></html>`

      const win = window.open('', '_blank', 'width=380,height=700')
      win.document.write(html)
      win.document.close()
      setTimeout(() => { win.print(); win.close() }, 600)
    } catch(e) {
      toast.error('خطأ في الطباعة: ' + e.message)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Modal open onClose={onClose}
      title={`وصل التسليم — ${t.order_number}`}
      maxWidth={480}
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          <button className="btn btn-primary" disabled={printing || isLoading} onClick={doPrint}>
            <Printer size={13}/> {printing ? 'جاري الطباعة...' : 'طباعة وصل التسليم'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        {/* ملخص */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13 }}>
          <div style={{ padding:'8px 10px', background:'var(--ink-3)', borderRadius:6 }}>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>العميل</div>
            <div style={{ fontWeight:500 }}>{t.customer_name}</div>
          </div>
          <div style={{ padding:'8px 10px', background:'var(--ink-3)', borderRadius:6 }}>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>الجهاز</div>
            <div style={{ fontWeight:500 }}>{t.brand} {t.model}</div>
          </div>
        </div>

        {/* القطع */}
        {isLoading ? (
          <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center' }}>جاري تحميل الفاتورة...</div>
        ) : parts.length > 0 && (
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:6 }}>
              القطع المستبدلة ({parts.length})
            </div>
            {parts.map((p,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between',
                padding:'5px 8px', background:'var(--ink-3)', borderRadius:5, marginBottom:4, fontSize:12 }}>
                <span>{p.part_name} × {p.quantity}</span>
                <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>
                  {(parseFloat(p.unit_price)*parseFloat(p.quantity)).toLocaleString('ar-SA')} ر
                </span>
              </div>
            ))}
          </div>
        )}

        {/* الإعدادات */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="form-label">أجرة الإصلاح (ر.س)</label>
            <input className="form-input" type="number" min="0" step="0.01"
              value={laborCost} onChange={e => setLaborCost(e.target.value)}
              placeholder={inv?.labor_cost || '0'}/>
          </div>
          <div>
            <label className="form-label">طريقة الدفع</label>
            <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
              <option value="cash">نقد</option>
              <option value="card">بطاقة بنكية</option>
              <option value="bank_transfer">تحويل بنكي</option>
              <option value="mada">مدى</option>
              <option value="stc_pay">STC Pay</option>
              <option value="apple_pay">Apple Pay</option>
            </select>
          </div>
        </div>

        {/* ملخص مالي */}
        {inv && (
          <div style={{ background:'var(--ink-3)', borderRadius:8, padding:'10px 14px', fontSize:13 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
              <span style={{ color:'var(--muted)' }}>الإجمالي</span>
              <strong style={{ fontFamily:'var(--mono)' }}>{parseFloat(inv.total||0).toLocaleString('ar-SA')} ريال</strong>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom: parseFloat(inv.balance_due||0) > 0 ? 5 : 0 }}>
              <span style={{ color:'var(--green)' }}>مدفوع</span>
              <strong style={{ color:'var(--green)', fontFamily:'var(--mono)' }}>{parseFloat(inv.paid_amount||0).toLocaleString('ar-SA')} ريال</strong>
            </div>
            {parseFloat(inv.balance_due||0) > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between',
                borderTop:'1px solid var(--border)', paddingTop:5 }}>
                <span style={{ color:'var(--red)', fontWeight:600 }}>المتبقي</span>
                <strong style={{ color:'var(--red)', fontFamily:'var(--mono)' }}>{parseFloat(inv.balance_due).toLocaleString('ar-SA')} ريال</strong>
              </div>
            )}
          </div>
        )}

        <div style={{ padding:'8px 12px', background:'var(--blue-dim)', borderRadius:6, fontSize:11, color:'var(--blue)' }}>
          📋 الوصل يحتوي: بيانات العميل + القطع + المبالغ + خانة توقيع + QR code
        </div>
      </div>
    </Modal>
  )
}
