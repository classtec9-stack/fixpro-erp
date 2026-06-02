import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { StatusBadge, PriorityBadge, Modal, Loading, EmptyState, Pagination } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Search, Filter, RefreshCw, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

const STATUS_OPTIONS = [
  { value: '', label: 'كل الحالات' },
  { value: 'new', label: 'جديد' },
  { value: 'diagnosing', label: 'قيد الفحص' },
  { value: 'in_repair', label: 'قيد الإصلاح' },
  { value: 'waiting_part', label: 'انتظار قطعة' },
  { value: 'ready', label: 'جاهز' },
  { value: 'delivered', label: 'تم التسليم' },
]

const STATUS_NEXT = {
  new: 'diagnosing', diagnosing: 'in_repair',
  in_repair: 'ready', waiting_part: 'ready', ready: 'delivered'
}

export default function Orders() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, search, statusFilter],
    queryFn: () => api.get(`/orders?page=${page}&limit=15&search=${search}&status=${statusFilter}`),
    keepPreviousData: true
  })

  const { data: customers } = useQuery({ queryKey: ['customers-list'], queryFn: () => api.get('/customers?limit=100') })
  const { data: techs } = useQuery({ queryKey: ['techs-list'], queryFn: () => api.get('/technicians') })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries(['orders']); qc.invalidateQueries(['dashboard']); toast.success('تم تحديث الحالة') },
    onError: err => toast.error(err?.message || 'خطأ في التحديث')
  })

  const orders = data?.data || []
  const pagination = data?.pagination || {}

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">أوردرات الصيانة</div>
          <div className="page-sub">{pagination.total || 0} أوردر إجمالاً</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={15} /> أوردر جديد
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-wrap" style={{ flex: 1, maxWidth: 320 }}>
          <Search />
          <input
            className="search-input"
            placeholder="بحث بالاسم أو رقم الأوردر..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 150 }}
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="btn-icon" onClick={() => qc.invalidateQueries(['orders'])}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? <Loading /> : !orders.length ? (
          <EmptyState icon={ClipboardList} message="لا توجد أوردرات" sub="أضف أوردر جديد للبدء" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم الأوردر</th>
                  <th>العميل</th>
                  <th>الجهاز</th>
                  <th>المشكلة</th>
                  <th>الفني</th>
                  <th>الأولوية</th>
                  <th>الحالة</th>
                  <th>تاريخ الاستلام</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td><span className="font-mono text-xs text-blue">{o.order_number}</span></td>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-2)' }}>{o.customer_name}</div>
                      <div className="text-xs text-muted">{o.customer_phone}</div>
                    </td>
                    <td>
                      <div className="text-sm">{o.brand} {o.model}</div>
                      <div className="text-xs text-muted">{o.device_type}</div>
                    </td>
                    <td style={{ maxWidth: 160 }}>
                      <div className="text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.problem_desc}
                      </div>
                    </td>
                    <td className="text-sm text-muted2">{o.technician_name || <span className="text-muted">غير محدد</span>}</td>
                    <td><PriorityBadge priority={o.priority} /></td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-xs text-muted font-mono">
                      {format(new Date(o.received_at), 'dd/MM/yyyy')}
                    </td>
                    <td>
                      {STATUS_NEXT[o.status] && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => updateStatus.mutate({ id: o.id, status: STATUS_NEXT[o.status] })}
                          disabled={updateStatus.isPending}
                        >
                          تحديث
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pagination.pages} onPage={setPage} />
      </div>

      <NewOrderModal
        open={showNew}
        onClose={() => setShowNew(false)}
        customers={customers?.data || []}
        techs={techs?.data || []}
        onSuccess={() => { setShowNew(false); qc.invalidateQueries(['orders']); qc.invalidateQueries(['dashboard']) }}
      />
    </div>
  )
}

function NewOrderModal({ open, onClose, customers, techs, onSuccess }) {
  const [form, setForm] = useState({
    customer_id: '', device_brand: '', device_model: '', device_type: 'smartphone',
    imei: '', problem_desc: '', priority: 'normal', technician_id: '',
    physical_condition: '', accessories: '', estimated_cost: ''
  })
  const [step, setStep] = useState(1)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = useMutation({
    mutationFn: async () => {
      // First create or get device
      const devRes = await api.post('/customers/' + form.customer_id + '/devices', {
        device_type: form.device_type,
        brand: form.device_brand,
        model: form.device_model,
        imei: form.imei
      }).catch(() => null)

      // Get customer devices to find device_id
      const devList = await api.get(`/customers/${form.customer_id}`)
      const devices = devList?.data?.devices || []
      const device = devices.find(d => d.model === form.device_model) || devices[0]

      if (!device) throw new Error('الرجاء إضافة الجهاز أولاً')

      return api.post('/orders', {
        customer_id: form.customer_id,
        device_id: device.id,
        problem_desc: form.problem_desc,
        priority: form.priority,
        technician_id: form.technician_id || undefined,
        physical_condition: form.physical_condition,
        accessories: form.accessories,
        estimated_cost: form.estimated_cost || undefined
      })
    },
    onSuccess: () => { toast.success('تم إنشاء الأوردر بنجاح'); onSuccess(); setStep(1); setForm({ customer_id:'',device_brand:'',device_model:'',device_type:'smartphone',imei:'',problem_desc:'',priority:'normal',technician_id:'',physical_condition:'',accessories:'',estimated_cost:'' }) },
    onError: err => toast.error(err?.message || 'خطأ في الإنشاء')
  })

  return (
    <Modal
      open={open} onClose={onClose}
      title={`أوردر جديد — الخطوة ${step} من 2`}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          {step === 2 && <button className="btn btn-ghost" onClick={() => setStep(1)}>رجوع</button>}
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          {step === 1
            ? <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!form.customer_id || !form.device_brand}>التالي</button>
            : <button className="btn btn-primary" onClick={() => submit.mutate()} disabled={submit.isPending || !form.problem_desc}>
                {submit.isPending ? 'جاري الحفظ...' : 'حفظ وإنشاء الأوردر'}
              </button>
          }
        </div>
      }
    >
      {step === 1 ? (
        <div className="form-grid">
          <div className="form-group form-full">
            <label className="form-label">العميل *</label>
            <select className="form-select" value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">-- اختر العميل --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">نوع الجهاز *</label>
            <select className="form-select" value={form.device_type} onChange={e => set('device_type', e.target.value)}>
              <option value="smartphone">هاتف ذكي</option>
              <option value="laptop">لابتوب</option>
              <option value="tablet">تابلت</option>
              <option value="desktop">كمبيوتر مكتبي</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">الماركة *</label>
            <input className="form-input" placeholder="مثال: Apple" value={form.device_brand} onChange={e => set('device_brand', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">الموديل *</label>
            <input className="form-input" placeholder="مثال: iPhone 14 Pro" value={form.device_model} onChange={e => set('device_model', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">IMEI / السيريال</label>
            <input className="form-input" placeholder="رقم IMEI" value={form.imei} onChange={e => set('imei', e.target.value)} dir="ltr" />
          </div>
        </div>
      ) : (
        <div className="form-grid">
          <div className="form-group form-full">
            <label className="form-label">وصف المشكلة *</label>
            <textarea className="form-textarea" rows={3} placeholder="اشرح المشكلة بالتفصيل..." value={form.problem_desc} onChange={e => set('problem_desc', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">الأولوية</label>
            <select className="form-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="normal">عادي</option>
              <option value="urgent">عاجل</option>
              <option value="vip">VIP</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">الفني المسؤول</label>
            <select className="form-select" value={form.technician_id} onChange={e => set('technician_id', e.target.value)}>
              <option value="">-- اختر فني --</option>
              {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">التكلفة التقديرية (ريال)</label>
            <input className="form-input" type="number" placeholder="0" value={form.estimated_cost} onChange={e => set('estimated_cost', e.target.value)} dir="ltr" />
          </div>
          <div className="form-group form-full">
            <label className="form-label">حالة الجهاز عند الاستلام</label>
            <input className="form-input" placeholder="خدوش، كسر، ملاحظات..." value={form.physical_condition} onChange={e => set('physical_condition', e.target.value)} />
          </div>
          <div className="form-group form-full">
            <label className="form-label">الملحقات المرافقة</label>
            <input className="form-input" placeholder="شاحن، علبة، غطاء..." value={form.accessories} onChange={e => set('accessories', e.target.value)} />
          </div>
        </div>
      )}
    </Modal>
  )
}
