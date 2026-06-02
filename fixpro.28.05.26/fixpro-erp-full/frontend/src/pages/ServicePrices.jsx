import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Loading, EmptyState, Modal } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, DollarSign, Edit2, ToggleRight, ToggleLeft } from 'lucide-react'

const DEVICE_TYPES = [
  { value:'ALL',        label:'جميع الأجهزة' },
  { value:'smartphone', label:'هاتف ذكي' },
  { value:'laptop',     label:'لابتوب' },
  { value:'tablet',     label:'تابلت' },
  { value:'desktop',    label:'كمبيوتر' },
  { value:'watch',      label:'ساعة ذكية' },
  { value:'other',      label:'أخرى' },
]

const BRANDS = ['ALL','Apple','Samsung','Huawei','Xiaomi','OPPO','OnePlus','LG','Sony','Dell','HP','Lenovo','ASUS','أخرى']

export default function ServicePricesPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deviceFilter, setDeviceFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['service-prices', deviceFilter],
    queryFn: () => api.get(`/service-prices?device_type=${deviceFilter}&active_only=false`)
  })

  const prices = data?.data || []

  const toggle = useMutation({
    mutationFn: (p) => api.put(`/service-prices/${p.id}`, { is_active: !p.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-prices'] })
  })

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">تسعير خدمات الصيانة</div>
          <div className="page-sub">{prices.length} خدمة مسجلة</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14}/> إضافة خدمة
        </button>
      </div>

      {/* فلاتر */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {DEVICE_TYPES.map(dt => (
          <button key={dt.value}
            className={`btn ${deviceFilter === dt.value ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            onClick={() => setDeviceFilter(deviceFilter === dt.value ? '' : dt.value)}>
            {dt.label}
          </button>
        ))}
      </div>

      {isLoading ? <Loading /> : !prices.length
        ? <EmptyState icon={DollarSign} message="لا توجد خدمات" sub="أضف أسعار خدمات الصيانة" />
        : (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>الخدمة</th><th>نوع الجهاز</th><th>الماركة</th><th>السعر</th><th>الضمان</th><th>الحالة</th><th></th></tr>
                </thead>
                <tbody>
                  {prices.map(p => (
                    <tr key={p.id} style={{ opacity: p.is_active ? 1 : .5 }}>
                      <td>
                        <div style={{ fontWeight:500, color:'var(--text-2)' }}>{p.service_name}</div>
                        {p.description && <div className="text-xs text-muted">{p.description}</div>}
                      </td>
                      <td className="text-sm">{DEVICE_TYPES.find(d=>d.value===p.device_type)?.label || p.device_type}</td>
                      <td className="text-sm">{p.device_brand === 'ALL' ? 'الكل' : p.device_brand}</td>
                      <td>
                        <span className="font-mono font-bold text-blue">{Number(p.base_price).toLocaleString('ar-SA')} ر</span>
                        {p.min_price && p.max_price && (
                          <div className="text-xs text-muted">{Number(p.min_price).toLocaleString()} — {Number(p.max_price).toLocaleString()}</div>
                        )}
                      </td>
                      <td className="text-sm">{p.warranty_days} يوم</td>
                      <td>
                        <span className={`badge ${p.is_active ? 'badge-ready' : 'badge-cancel'}`}>
                          {p.is_active ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="btn-icon" onClick={() => setEditItem(p)}><Edit2 size={13}/></button>
                          <button className="btn-icon" onClick={() => toggle.mutate(p)}>
                            {p.is_active
                              ? <ToggleRight size={18} color="var(--green)"/>
                              : <ToggleLeft  size={18} color="var(--muted)"/>
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }

      {(showAdd || editItem) && (
        <ServicePriceModal
          item={editItem}
          onClose={() => { setShowAdd(false); setEditItem(null) }}
          onSuccess={() => { setShowAdd(false); setEditItem(null); qc.invalidateQueries({ queryKey:['service-prices'] }) }}
        />
      )}
    </div>
  )
}

function ServicePriceModal({ item, onClose, onSuccess }) {
  const [form, setForm] = useState({
    service_name:  item?.service_name  || '',
    description:   item?.description   || '',
    device_type:   item?.device_type   || 'smartphone',
    device_brand:  item?.device_brand  || 'ALL',
    base_price:    item?.base_price    || '',
    min_price:     item?.min_price     || '',
    max_price:     item?.max_price     || '',
    warranty_days: item?.warranty_days || 30,
  })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const save = useMutation({
    mutationFn: () => item
      ? api.put(`/service-prices/${item.id}`, form)
      : api.post('/service-prices', form),
    onSuccess: () => { toast.success(item ? 'تم التحديث' : 'تم الإضافة'); onSuccess() },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  return (
    <Modal open={true} onClose={onClose}
      title={item ? `تعديل: ${item.service_name}` : 'إضافة خدمة جديدة'}
      footer={
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => save.mutate()}
            disabled={save.isPending || !form.service_name || !form.base_price}>
            {save.isPending ? 'جاري...' : item ? 'حفظ' : 'إضافة'}
          </button>
        </div>
      }>
      <div className="form-grid">
        <div className="form-group form-full">
          <label className="form-label">اسم الخدمة *</label>
          <input className="form-input" value={form.service_name}
            onChange={e => set('service_name', e.target.value)}
            placeholder="مثال: استبدال شاشة iPhone 14" />
        </div>
        <div className="form-group">
          <label className="form-label">نوع الجهاز</label>
          <select className="form-select" value={form.device_type} onChange={e => set('device_type',e.target.value)}>
            {DEVICE_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">الماركة</label>
          <select className="form-select" value={form.device_brand} onChange={e => set('device_brand',e.target.value)}>
            {BRANDS.map(b => <option key={b} value={b}>{b === 'ALL' ? 'جميع الماركات' : b}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">السعر الأساسي (ريال) *</label>
          <input className="form-input" type="number" value={form.base_price}
            onChange={e => set('base_price', e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">ضمان الإصلاح (يوم)</label>
          <input className="form-input" type="number" value={form.warranty_days}
            onChange={e => set('warranty_days', Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">أقل سعر (اختياري)</label>
          <input className="form-input" type="number" value={form.min_price}
            onChange={e => set('min_price', e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">أعلى سعر (اختياري)</label>
          <input className="form-input" type="number" value={form.max_price}
            onChange={e => set('max_price', e.target.value)} placeholder="0" />
        </div>
        <div className="form-group form-full">
          <label className="form-label">وصف الخدمة</label>
          <textarea className="form-textarea" rows={2} value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="تفاصيل الخدمة..." />
        </div>
      </div>
    </Modal>
  )
}
