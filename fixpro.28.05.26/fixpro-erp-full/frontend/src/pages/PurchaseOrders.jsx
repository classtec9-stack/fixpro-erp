import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState, Pagination } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Search, Package, CheckCircle, XCircle, Eye, Truck } from 'lucide-react'

const STATUS = {
  draft:    { label:'مسودة',       badge:'badge-normal' },
  sent:     { label:'مُرسَل',      badge:'badge-wait'   },
  partial:  { label:'استلام جزئي', badge:'badge-repair' },
  received: { label:'مستلم',       badge:'badge-ready'  },
  cancelled:{ label:'ملغي',        badge:'badge-cancel' },
}

export default function PurchaseOrdersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showReceive, setShowReceive] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', page, statusF],
    queryFn: () => api.get(`/purchase-orders?page=${page}&limit=20&status=${statusF}`),
    keepPreviousData: true,
  })

  const { data: poDetail } = useQuery({
    queryKey: ['po-detail', selected?.id],
    queryFn: () => api.get(`/purchase-orders/${selected.id}`),
    enabled: !!selected,
  })

  const orders = data?.data || []
  const pagination = data?.pagination || {}

  const cancelMut = useMutation({
    mutationFn: (id) => api.patch(`/purchase-orders/${id}/cancel`),
    onSuccess: () => { toast.success('تم إلغاء أمر الشراء'); qc.invalidateQueries(['purchase-orders']) },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">أوامر الشراء</div>
          <div className="page-sub">{pagination.total || 0} أمر</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={14}/> أمر شراء جديد
        </button>
      </div>

      {/* فلاتر */}
      <div className="filter-bar">
        <select className="form-select" value={statusF} onChange={e=>setStatusF(e.target.value)}>
          <option value="">كل الحالات</option>
          {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {isLoading ? <Loading/> : !orders.length ? <EmptyState icon={Truck} message="لا توجد أوامر شراء"/> : (
        <div className="card" style={{ padding:0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم الأمر</th>
                  <th>المورد</th>
                  <th>الإجمالي</th>
                  <th>الأصناف</th>
                  <th>الحالة</th>
                  <th>التاريخ المتوقع</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(po => (
                  <tr key={po.id}>
                    <td><span style={{ fontFamily:'var(--mono)', color:'var(--blue)' }}>{po.po_number}</span></td>
                    <td>
                      <div style={{ fontWeight:500 }}>{po.supplier_name}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{po.supplier_phone}</div>
                    </td>
                    <td><strong style={{ color:'var(--green)' }}>{Number(po.total).toLocaleString('ar-SA')} ر.س</strong></td>
                    <td style={{ color:'var(--muted)' }}>{po.items_count} صنف</td>
                    <td><span className={`badge ${STATUS[po.status]?.badge}`}>{STATUS[po.status]?.label}</span></td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>
                      {po.expected_date ? new Date(po.expected_date).toLocaleDateString('ar-SA') : '—'}
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelected(po)}><Eye size={13}/></button>
                        {['draft','sent','partial'].includes(po.status) && (
                          <button className="btn btn-sm" style={{ background:'var(--green-dim)', color:'var(--green)', border:'none' }}
                            onClick={() => setShowReceive(po)}>
                            <CheckCircle size={13}/> استلام
                          </button>
                        )}
                        {po.status === 'draft' && (
                          <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }}
                            onClick={() => cancelMut.mutate(po.id)}>
                            <XCircle size={13}/>
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

      {/* Modal تفاصيل */}
      {selected && poDetail?.data && (
        <Modal open onClose={() => setSelected(null)} title={`أمر الشراء — ${selected.po_number}`} maxWidth={640}>
          <div style={{ display:'grid', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13 }}>
              <div><span style={{ color:'var(--muted)' }}>المورد: </span><strong>{poDetail.data.supplier_name}</strong></div>
              <div><span style={{ color:'var(--muted)' }}>الحالة: </span>
                <span className={`badge ${STATUS[poDetail.data.status]?.badge}`}>{STATUS[poDetail.data.status]?.label}</span>
              </div>
            </div>
            <table style={{ fontSize:13 }}>
              <thead><tr><th>الصنف</th><th>SKU</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>المستلم</th></tr></thead>
              <tbody>
                {poDetail.data.items?.map(item => (
                  <tr key={item.id}>
                    <td>{item.part_name}</td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{item.part_sku || '—'}</td>
                    <td>{item.quantity_ordered}</td>
                    <td>{Number(item.unit_cost).toLocaleString('ar-SA')}</td>
                    <td>{Number(item.total_cost).toLocaleString('ar-SA')}</td>
                    <td style={{ color: item.quantity_received >= item.quantity_ordered ? 'var(--green)' : 'var(--amber)' }}>
                      {item.quantity_received}/{item.quantity_ordered}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:16, fontSize:13, background:'var(--ink-3)', padding:12, borderRadius:6 }}>
              <span style={{ color:'var(--muted)' }}>الإجمالي قبل الضريبة: {Number(poDetail.data.subtotal).toLocaleString('ar-SA')}</span>
              <span style={{ color:'var(--muted)' }}>ضريبة: {Number(poDetail.data.vat_amount).toLocaleString('ar-SA')}</span>
              <strong style={{ color:'var(--green)' }}>الإجمالي: {Number(poDetail.data.total).toLocaleString('ar-SA')} ر.س</strong>
            </div>
          </div>
        </Modal>
      )}

      {showNew && <NewPOModal onClose={() => setShowNew(false)} qc={qc}/>}
      {showReceive && <ReceiveModal po={showReceive} onClose={() => setShowReceive(null)} qc={qc}/>}
    </div>
  )
}

function NewPOModal({ onClose, qc }) {
  const [supplierId, setSupplierId] = useState('')
  const [items, setItems] = useState([{ part_name:'', part_sku:'', quantity_ordered:1, unit_cost:0 }])
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')

  const { data: suppData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=100'),
  })
  const suppliers = suppData?.data || []

  const addItem = () => setItems([...items, { part_name:'', part_sku:'', quantity_ordered:1, unit_cost:0 }])
  const updateItem = (i, field, val) => setItems(items.map((item,idx) => idx===i ? {...item,[field]:val} : item))
  const removeItem = (i) => setItems(items.filter((_,idx) => idx!==i))

  const subtotal = items.reduce((s,i) => s + (Number(i.quantity_ordered)||0) * (Number(i.unit_cost)||0), 0)

  const createMut = useMutation({
    mutationFn: (data) => api.post('/purchase-orders', data),
    onSuccess: () => { toast.success('تم إنشاء أمر الشراء'); qc.invalidateQueries(['purchase-orders']); onClose() },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  return (
    <Modal open onClose={onClose} title="أمر شراء جديد" maxWidth={700}
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary"
            disabled={!supplierId || items.length===0 || createMut.isLoading}
            onClick={() => createMut.mutate({ supplier_id:supplierId, items, expected_date:expectedDate, notes })}>
            {createMut.isLoading ? '...' : 'إنشاء الأمر'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="form-label">المورد *</label>
            <select className="form-select" value={supplierId} onChange={e=>setSupplierId(e.target.value)}>
              <option value="">اختر المورد</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">التاريخ المتوقع للاستلام</label>
            <input className="form-input" type="date" value={expectedDate} onChange={e=>setExpectedDate(e.target.value)}/>
          </div>
        </div>

        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <label className="form-label" style={{ margin:0 }}>الأصناف</label>
            <button className="btn btn-ghost btn-sm" onClick={addItem}><Plus size={12}/> إضافة صنف</button>
          </div>
          <table style={{ fontSize:12, width:'100%' }}>
            <thead><tr><th>اسم الصنف</th><th>SKU</th><th>الكمية</th><th>سعر الوحدة</th><th></th></tr></thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td><input className="form-input" style={{ padding:'4px 8px' }} value={item.part_name} onChange={e=>updateItem(i,'part_name',e.target.value)} placeholder="اسم القطعة"/></td>
                  <td><input className="form-input" style={{ padding:'4px 8px' }} value={item.part_sku} onChange={e=>updateItem(i,'part_sku',e.target.value)} placeholder="SKU"/></td>
                  <td><input className="form-input" style={{ padding:'4px 8px', width:70 }} type="number" min="1" value={item.quantity_ordered} onChange={e=>updateItem(i,'quantity_ordered',e.target.value)}/></td>
                  <td><input className="form-input" style={{ padding:'4px 8px', width:90 }} type="number" min="0" step="0.01" value={item.unit_cost} onChange={e=>updateItem(i,'unit_cost',e.target.value)}/></td>
                  <td><button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={()=>removeItem(i)}><XCircle size={13}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:16, fontSize:13, color:'var(--muted)' }}>
          <span>الإجمالي: <strong style={{ color:'var(--green)' }}>{subtotal.toLocaleString('ar-SA')} ر.س</strong></span>
          <span>+ ضريبة: <strong>{+(subtotal*0.15).toFixed(2)} ر.س</strong></span>
        </div>
        <div>
          <label className="form-label">ملاحظات</label>
          <textarea className="form-input" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/>
        </div>
      </div>
    </Modal>
  )
}

function ReceiveModal({ po, onClose, qc }) {
  const { data } = useQuery({
    queryKey: ['po-receive', po.id],
    queryFn: () => api.get(`/purchase-orders/${po.id}`),
  })
  const [quantities, setQuantities] = useState({})

  const receiveMut = useMutation({
    mutationFn: (items) => api.post(`/purchase-orders/${po.id}/receive`, { items }),
    onSuccess: () => { toast.success('تم تسجيل الاستلام وتحديث المخزون'); qc.invalidateQueries(['purchase-orders']); onClose() },
    onError: (e) => toast.error(e?.message || 'فشل'),
  })

  const items = data?.data?.items || []

  return (
    <Modal open onClose={onClose} title={`استلام — ${po.po_number}`} maxWidth={600}
      footer={
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={receiveMut.isLoading}
            onClick={() => receiveMut.mutate(
              Object.entries(quantities).map(([po_item_id, quantity_received]) => ({ po_item_id, quantity_received: Number(quantity_received) }))
            )}>
            {receiveMut.isLoading ? '...' : 'تأكيد الاستلام'}
          </button>
        </div>
      }>
      <div style={{ display:'grid', gap:12 }}>
        <div style={{ fontSize:12, color:'var(--muted)' }}>أدخل الكميات المستلمة فعلياً:</div>
        <table style={{ fontSize:13 }}>
          <thead><tr><th>الصنف</th><th>المطلوب</th><th>سبق استلامه</th><th>المستلم الآن</th></tr></thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.part_name}</td>
                <td style={{ color:'var(--muted)' }}>{item.quantity_ordered}</td>
                <td style={{ color: item.quantity_received > 0 ? 'var(--green)' : 'var(--muted)' }}>{item.quantity_received}</td>
                <td>
                  <input className="form-input" type="number" min="0"
                    max={item.quantity_ordered - item.quantity_received}
                    style={{ width:80, padding:'4px 8px' }}
                    value={quantities[item.id] || ''}
                    onChange={e => setQuantities({...quantities, [item.id]: e.target.value})}/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
