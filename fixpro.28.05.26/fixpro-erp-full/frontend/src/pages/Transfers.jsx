import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Modal, Loading, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { ArrowLeftRight, Plus, Check, PackageCheck, X, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS = {
  pending:     { label: 'في الانتظار',  color: 'var(--amber)',  bg: 'rgba(245,158,11,.1)'  },
  in_transit:  { label: 'في الطريق',    color: 'var(--blue)',   bg: 'rgba(59,130,246,.1)'  },
  received:    { label: 'مستلَم',       color: 'var(--green)',  bg: 'rgba(16,185,129,.1)'  },
  cancelled:   { label: 'ملغي',         color: 'var(--muted)',  bg: 'rgba(107,114,128,.1)' },
}

export default function TransfersPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const canManage = ['admin', 'branch_manager', 'warehouse'].includes(user?.role)

  const [statusF, setStatusF]   = useState('pending')
  const [expanded, setExpanded] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['transfers', statusF],
    queryFn: () => api.get(`/transfers?status=${statusF}`),
  })

  const approve = useMutation({
    mutationFn: id => api.patch(`/transfers/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries(['transfers']); toast.success('تمت الموافقة وخُصم المخزون') },
    onError: e => toast.error(e?.message || 'خطأ'),
  })
  const receive = useMutation({
    mutationFn: id => api.patch(`/transfers/${id}/receive`),
    onSuccess: () => { qc.invalidateQueries(['transfers']); toast.success('تم تأكيد الاستلام وتحديث المخزون') },
    onError: e => toast.error(e?.message || 'خطأ'),
  })
  const cancel = useMutation({
    mutationFn: id => api.patch(`/transfers/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries(['transfers']); toast.success('تم إلغاء الطلب') },
    onError: e => toast.error(e?.message || 'خطأ'),
  })

  const transfers = data?.data || []

  return (
    <div className="page fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">تحويل القطع بين الفروع</div>
          <div className="page-sub">
            {transfers.length} تحويل — {STATUS[statusF]?.label}
          </div>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14}/> طلب تحويل جديد
          </button>
        )}
      </div>

      {/* فلاتر الحالة */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <button key={k}
            onClick={() => { setStatusF(k); setExpanded(null) }}
            style={{
              padding: '5px 14px', border: 'none', borderRadius: 20, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 12, fontWeight: 500,
              background: statusF === k ? v.color : 'var(--ink-3)',
              color: statusF === k ? '#fff' : 'var(--muted)',
            }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* القائمة */}
      {isLoading ? <Loading/> : !transfers.length ? (
        <EmptyState icon={ArrowLeftRight} message={`لا توجد تحويلات ${STATUS[statusF]?.label}`}/>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {transfers.map(t => (
            <div key={t.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* صف الملخص */}
              <div
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px', cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                    color: STATUS[t.status]?.color, background: STATUS[t.status]?.bg,
                  }}>
                    {STATUS[t.status]?.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 13 }}>
                      {t.from_branch_name}
                    </span>
                    <ArrowLeftRight size={14} color="var(--muted)"/>
                    <span style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 13 }}>
                      {t.to_branch_name}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    ({t.items_count} صنف)
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {t.requested_by_name && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.requested_by_name}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {new Date(t.created_at).toLocaleDateString('ar-SA')}
                  </span>
                  {expanded === t.id
                    ? <ChevronUp size={15} color="var(--muted)"/>
                    : <ChevronDown size={15} color="var(--muted)"/>
                  }
                </div>
              </div>

              {/* التفاصيل عند الفتح */}
              {expanded === t.id && (
                <TransferDetail
                  id={t.id}
                  transfer={t}
                  user={user}
                  approve={approve}
                  receive={receive}
                  cancel={cancel}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal الإنشاء */}
      {showCreate && (
        <CreateTransferModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries(['transfers']) }}
        />
      )}
    </div>
  )
}

// ── تفاصيل التحويل ────────────────────────────────────────
function TransferDetail({ id, transfer, user, approve, receive, cancel }) {
  const { data, isLoading } = useQuery({
    queryKey: ['transfer-detail', id],
    queryFn: () => api.get(`/transfers/${id}`),
  })

  const t = data?.data
  const canApprove = ['admin', 'branch_manager', 'warehouse'].includes(user?.role)

  if (isLoading) return (
    <div style={{ padding: 20, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
      <Loading/>
    </div>
  )

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'var(--ink-2)' }}>
      {t?.notes && (
        <div style={{
          padding: '8px 12px', background: 'var(--ink-3)', borderRadius: 6,
          fontSize: 12, color: 'var(--muted)', marginBottom: 12,
        }}>
          📝 {t.notes}
        </div>
      )}

      {/* جدول الأصناف */}
      <div className="table-wrap" style={{ marginBottom: 14 }}>
        <table>
          <thead>
            <tr>
              <th>الصنف</th>
              <th>SKU</th>
              <th style={{ textAlign: 'center' }}>الكمية المرسلة</th>
              <th style={{ textAlign: 'center' }}>الكمية المستلمة</th>
            </tr>
          </thead>
          <tbody>
            {t?.items?.map(item => (
              <tr key={item.id}>
                <td style={{ fontWeight: 500, color: 'var(--text-2)' }}>{item.part_name}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
                  {item.sku || '—'}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                  {item.quantity_sent}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                  {item.quantity_received ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* أزرار الإجراءات */}
      {canApprove && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {transfer.status === 'pending' && (
            <>
              <button className="btn btn-primary"
                disabled={approve.isPending}
                onClick={() => approve.mutate(id)}>
                <Check size={13}/>
                {approve.isPending ? '...' : 'موافقة وشحن'}
              </button>
              <button className="btn btn-ghost"
                style={{ color: 'var(--red)' }}
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(id)}>
                <X size={13}/>
                {cancel.isPending ? '...' : 'إلغاء'}
              </button>
            </>
          )}
          {transfer.status === 'in_transit' && (
            <button className="btn btn-primary"
              style={{ background: 'var(--green)' }}
              disabled={receive.isPending}
              onClick={() => receive.mutate(id)}>
              <PackageCheck size={13}/>
              {receive.isPending ? '...' : 'تأكيد الاستلام'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal إنشاء تحويل ────────────────────────────────────
function CreateTransferModal({ onClose, onSuccess }) {
  const [toBranchId, setToBranchId] = useState('')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState([{ part_id: '', quantity_sent: 1 }])

  const { data: branches } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches'),
  })
  const { data: partsData } = useQuery({
    queryKey: ['inventory-parts'],
    queryFn: () => api.get('/inventory/parts?limit=200'),
  })

  const create = useMutation({
    mutationFn: () => api.post('/transfers', { to_branch_id: toBranchId, items, notes }),
    onSuccess,
    onError: e => toast.error(e?.message || 'فشل إنشاء الطلب'),
  })

  const addItem    = () => setItems(p => [...p, { part_id: '', quantity_sent: 1 }])
  const removeItem = i  => setItems(p => p.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) =>
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  const branchesList = branches?.data || []
  const partsList    = partsData?.data || []
  const isValid      = toBranchId && items.every(it => it.part_id && it.quantity_sent > 0)

  return (
    <Modal
      open
      onClose={onClose}
      title="طلب تحويل قطع جديد"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button
            className="btn btn-primary"
            disabled={!isValid || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? '...' : 'إرسال الطلب'}
          </button>
        </div>
      }>
      <div style={{ display: 'grid', gap: 14 }}>

        {/* الفرع المستقبل */}
        <div>
          <label className="form-label">الفرع المستقبل *</label>
          <select className="form-select" value={toBranchId}
            onChange={e => setToBranchId(e.target.value)}>
            <option value="">اختر فرعاً...</option>
            {branchesList.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* الأصناف */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>الأصناف *</label>
            <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }}
              onClick={addItem}>
              <Plus size={12}/> إضافة صنف
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8, alignItems: 'center' }}>
                <select className="form-select" value={item.part_id}
                  onChange={e => updateItem(i, 'part_id', e.target.value)}>
                  <option value="">اختر صنفاً...</option>
                  {partsList.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.quantity} متاح)
                    </option>
                  ))}
                </select>
                <input type="number" min="1" className="form-input"
                  style={{ textAlign: 'center' }}
                  value={item.quantity_sent}
                  onChange={e => updateItem(i, 'quantity_sent', parseInt(e.target.value) || 1)}/>
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                    <X size={15}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ملاحظات */}
        <div>
          <label className="form-label">ملاحظات (اختياري)</label>
          <textarea className="form-input" rows={2}
            style={{ resize: 'none' }}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="أي ملاحظات للفرع المستقبل..."/>
        </div>

        <div style={{ padding: '8px 12px', background: 'var(--blue-dim)', borderRadius: 6, fontSize: 12, color: 'var(--blue)' }}>
          💡 بعد إرسال الطلب، يجب موافقة الفرع المُرسِل لخصم المخزون وشحن القطع
        </div>
      </div>
    </Modal>
  )
}
