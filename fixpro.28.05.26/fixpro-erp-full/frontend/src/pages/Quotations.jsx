import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState, Pagination } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Search, Send, CheckCircle, XCircle, FileText, Clock, Eye } from 'lucide-react'

const STATUS = {
  draft:    { label:'مسودة',          badge:'badge-normal',  icon:'📝' },
  sent:     { label:'مُرسَل للعميل',  badge:'badge-wait',    icon:'📤' },
  approved: { label:'موافق عليه',     badge:'badge-ready',   icon:'✅' },
  rejected: { label:'مرفوض',          badge:'badge-cancel',  icon:'❌' },
  expired:  { label:'انتهت صلاحيته', badge:'badge-cancel',  icon:'⏰' },
}

export default function QuotationsPage() {
  const qc = useQueryClient()
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showRespond, setShowRespond] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['quotations', page, search, statusF],
    queryFn: () => api.get(`/quotations?page=${page}&limit=20&status=${statusF}&search=${search}`),
    keepPreviousData: true,
  })

  const quotations = data?.data || []
  const pagination = data?.pagination || {}

  const sendMut = useMutation({
    mutationFn: (id) => api.post(`/quotations/${id}/send`),
    onSuccess: () => { toast.success('تم إرسال عرض السعر عبر واتساب'); qc.invalidateQueries(['quotations']) },
    onError: (e) => toast.error(e?.message || 'فشل الإرسال'),
  })

  const respondMut = useMutation({
    mutationFn: ({ id, response, rejection_reason }) =>
      api.patch(`/quotations/${id}/respond`, { response, rejection_reason }),
    onSuccess: (_, v) => {
      toast.success(v.response === 'approved' ? '✅ تمت الموافقة — بدأ الإصلاح' : '❌ تم تسجيل الرفض')
      qc.invalidateQueries(['quotations'])
      setShowRespond(null)
    },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">عروض الأسعار</div>
          <div className="page-sub">{pagination.total || 0} عرض</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={14}/> عرض سعر جديد
        </button>
      </div>

      {/* إحصاء سريع */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        {Object.entries(STATUS).map(([k,v]) => (
          <div key={k} className={`stat-card ${k==='approved'?'green':k==='rejected'?'':k==='sent'?'amber':'blue'}`}
            style={{ cursor:'pointer', opacity: statusF===k?1:0.8 }}
            onClick={() => setStatusF(statusF===k?'':k)}>
            <div className="stat-label">{v.label}</div>
            <div className="stat-value" style={{ fontSize:'1.4rem' }}>
              {quotations.filter(q=>q.status===k).length}
            </div>
          </div>
        ))}
      </div>

      {/* فلاتر */}
      <div className="filter-bar">
        <div className="search-wrap" style={{ flex:1, maxWidth:300 }}>
          <Search size={14}/>
          <input className="search-input" placeholder="بحث برقم العرض أو العميل..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}/>
        </div>
        <select className="form-select" value={statusF} onChange={e=>setStatusF(e.target.value)}>
          <option value="">كل الحالات</option>
          {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* جدول */}
      {isLoading ? <Loading/> : !quotations.length ? <EmptyState icon={FileText} message="لا توجد عروض أسعار"/> : (
        <div className="card" style={{ padding:0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم العرض</th>
                  <th>العميل</th>
                  <th>التذكرة</th>
                  <th>الإجمالي</th>
                  <th>الحالة</th>
                  <th>تاريخ الإنشاء</th>
                  <th>صالح حتى</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map(q => (
                  <tr key={q.id}>
                    <td><span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{q.quotation_number}</span></td>
                    <td>
                      <div style={{ fontWeight:500, color:'var(--text-2)' }}>{q.customer_name}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{q.customer_phone}</div>
                    </td>
                    <td><span style={{ fontFamily:'var(--mono)', fontSize:11 }}>{q.order_number}</span></td>
                    <td><strong style={{ color:'var(--green)' }}>{Number(q.total).toLocaleString('ar-SA')} ر.س</strong></td>
                    <td><span className={`badge ${STATUS[q.status]?.badge}`}>{STATUS[q.status]?.icon} {STATUS[q.status]?.label}</span></td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>{new Date(q.created_at).toLocaleDateString('ar-SA')}</td>
                    <td style={{ fontSize:12, color: new Date(q.valid_until) < new Date() ? 'var(--red)' : 'var(--muted)' }}>
                      {q.valid_until ? new Date(q.valid_until).toLocaleDateString('ar-SA') : '—'}
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm" title="عرض" onClick={() => setSelected(q)}>
                          <Eye size={13}/>
                        </button>
                        {q.status === 'draft' && (
                          <button className="btn btn-sm" style={{ background:'var(--green-dim)', color:'var(--green)', border:'none' }}
                            onClick={() => sendMut.mutate(q.id)} disabled={sendMut.isLoading}>
                            <Send size={13}/> إرسال
                          </button>
                        )}
                        {q.status === 'sent' && (
                          <button className="btn btn-sm" style={{ background:'var(--blue-dim)', color:'var(--blue)', border:'none' }}
                            onClick={() => setShowRespond(q)}>
                            <CheckCircle size={13}/> رد العميل
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} pages={pagination.pages} onPage={setPage}/>

      {/* Modal عرض التفاصيل */}
      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`عرض السعر — ${selected.quotation_number}`}>
          <div style={{ display:'grid', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13 }}>
              <div><span style={{ color:'var(--muted)' }}>العميل: </span>{selected.customer_name}</div>
              <div><span style={{ color:'var(--muted)' }}>الجوال: </span>{selected.customer_phone}</div>
              <div><span style={{ color:'var(--muted)' }}>التذكرة: </span>{selected.order_number}</div>
              <div><span style={{ color:'var(--muted)' }}>الحالة: </span>
                <span className={`badge ${STATUS[selected.status]?.badge}`}>{STATUS[selected.status]?.label}</span>
              </div>
            </div>
            <div style={{ background:'var(--ink-3)', borderRadius:8, padding:16, display:'grid', gap:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--muted)' }}>أجرة العمل</span>
                <span>{Number(selected.labor_cost).toLocaleString('ar-SA')} ر.س</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--muted)' }}>قطع الغيار</span>
                <span>{Number(selected.parts_cost).toLocaleString('ar-SA')} ر.س</span>
              </div>
              {selected.discount > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--muted)' }}>خصم</span>
                  <span style={{ color:'var(--red)' }}>- {Number(selected.discount).toLocaleString('ar-SA')} ر.س</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--muted)' }}>ضريبة 15%</span>
                <span>{Number(selected.vat_amount).toLocaleString('ar-SA')} ر.س</span>
              </div>
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, display:'flex', justifyContent:'space-between', fontWeight:700 }}>
                <span style={{ color:'var(--text-2)' }}>الإجمالي</span>
                <span style={{ color:'var(--green)', fontSize:16 }}>{Number(selected.total).toLocaleString('ar-SA')} ر.س</span>
              </div>
            </div>
            {selected.notes && <div style={{ fontSize:12, color:'var(--muted)', background:'var(--ink-3)', padding:10, borderRadius:6 }}>{selected.notes}</div>}
          </div>
        </Modal>
      )}

      {/* Modal رد العميل */}
      {showRespond && (
        <RespondModal
          quotation={showRespond}
          onClose={() => setShowRespond(null)}
          onSubmit={(data) => respondMut.mutate({ id: showRespond.id, ...data })}
          loading={respondMut.isLoading}
        />
      )}

      {/* Modal عرض سعر جديد */}
      {showNew && <NewQuotationModal onClose={() => setShowNew(false)} qc={qc}/>}
    </div>
  )
}

function RespondModal({ quotation, onClose, onSubmit, loading }) {
  const [response, setResponse] = useState('')
  const [reason, setReason] = useState('')

  return (
    <Modal open onClose={onClose} title="تسجيل رد العميل"
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={!response || loading}
            onClick={() => onSubmit({ response, rejection_reason: reason })}>
            {loading ? '...' : 'تأكيد'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        <div style={{ fontSize:13, color:'var(--muted)' }}>
          عرض السعر: <strong style={{ color:'var(--text-2)' }}>{quotation.quotation_number}</strong> —
          إجمالي: <strong style={{ color:'var(--green)' }}>{Number(quotation.total).toLocaleString('ar-SA')} ر.س</strong>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button className={`btn ${response==='approved' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ justifyContent:'center', padding:14, background: response==='approved' ? 'var(--green)' : '' }}
            onClick={() => setResponse('approved')}>
            <CheckCircle size={16}/> موافقة
          </button>
          <button className={`btn ${response==='rejected' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ justifyContent:'center', padding:14, background: response==='rejected' ? 'var(--red)' : '' }}
            onClick={() => setResponse('rejected')}>
            <XCircle size={16}/> رفض
          </button>
        </div>
        {response === 'rejected' && (
          <textarea className="form-input" rows={3} placeholder="سبب الرفض (اختياري)"
            value={reason} onChange={e => setReason(e.target.value)}/>
        )}
      </div>
    </Modal>
  )
}

function NewQuotationModal({ onClose, qc }) {
  const [orderId, setOrderId] = useState('')
  const [laborCost, setLaborCost] = useState('')
  const [discount, setDiscount] = useState('0')
  const [notes, setNotes] = useState('')
  const [validHours, setValidHours] = useState('48')
  const [orderSearch, setOrderSearch] = useState('')

  const { data: ticketsData } = useQuery({
    queryKey: ['tickets-for-quote', orderSearch],
    queryFn: () => api.get(`/tickets?status=waiting_approval&search=${orderSearch}&limit=10`),
    enabled: orderSearch.length > 1,
  })

  const createMut = useMutation({
    mutationFn: (data) => api.post('/quotations', data),
    onSuccess: () => { toast.success('تم إنشاء عرض السعر'); qc.invalidateQueries(['quotations']); onClose() },
    onError: (e) => toast.error(e?.message || 'فشل الإنشاء'),
  })

  return (
    <Modal open onClose={onClose} title="إنشاء عرض سعر جديد"
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={!orderId || createMut.isLoading}
            onClick={() => createMut.mutate({ order_id:orderId, labor_cost:Number(laborCost)||0,
              discount:Number(discount)||0, notes, valid_hours:Number(validHours)||48 })}>
            {createMut.isLoading ? '...' : 'إنشاء العرض'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        <div>
          <label className="form-label">بحث عن تذكرة</label>
          <input className="form-input" placeholder="ابحث برقم التذكرة أو اسم العميل..."
            value={orderSearch} onChange={e => setOrderSearch(e.target.value)}/>
          {ticketsData?.data?.length > 0 && (
            <div style={{ background:'var(--ink-3)', border:'1px solid var(--border)', borderRadius:6, marginTop:4, maxHeight:180, overflowY:'auto' }}>
              {ticketsData.data.map(t => (
                <div key={t.id} onClick={() => { setOrderId(t.id); setOrderSearch(`${t.order_number} — ${t.customer_name}`) }}
                  style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:13 }}
                  className="hover-row">
                  <span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{t.order_number}</span>
                  {' '}{t.customer_name} — {t.brand} {t.model}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="form-label">أجرة العمل (ر.س)</label>
            <input className="form-input" type="number" min="0" value={laborCost} onChange={e=>setLaborCost(e.target.value)}/>
          </div>
          <div>
            <label className="form-label">خصم (ر.س)</label>
            <input className="form-input" type="number" min="0" value={discount} onChange={e=>setDiscount(e.target.value)}/>
          </div>
        </div>
        <div>
          <label className="form-label">صلاحية العرض</label>
          <select className="form-select" value={validHours} onChange={e=>setValidHours(e.target.value)}>
            <option value="24">24 ساعة</option>
            <option value="48">48 ساعة</option>
            <option value="72">72 ساعة</option>
            <option value="168">أسبوع</option>
          </select>
        </div>
        <div>
          <label className="form-label">ملاحظات</label>
          <textarea className="form-input" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/>
        </div>
      </div>
    </Modal>
  )
}
