// frontend/src/components/ChecklistModal.jsx
// استخدامه: أضفه في صفحة Tickets.jsx عند إنشاء تذكرة جديدة أو فتح تذكرة موجودة
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { ClipboardCheck, X, Check, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

const CONDITIONS = [
  { value: 'perfect',  label: '✨ ممتاز' },
  { value: 'good',     label: '✅ جيد' },
  { value: 'scratched',label: '🔸 خدوش' },
  { value: 'cracked',  label: '⚠️ متشقق' },
  { value: 'broken',   label: '❌ مكسور' },
]

const BOOL_ITEMS = [
  { key: 'buttons_working',   label: 'الأزرار تعمل' },
  { key: 'charging_port_ok',  label: 'منفذ الشحن سليم' },
  { key: 'speakers_ok',       label: 'السماعات تعمل' },
  { key: 'camera_ok',         label: 'الكاميرا تعمل' },
  { key: 'has_sim_card',      label: 'يحتوي شريحة SIM' },
  { key: 'has_memory_card',   label: 'يحتوي بطاقة ذاكرة' },
]

export default function ChecklistModal({ orderId, onClose }) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['checklist', orderId],
    queryFn: () => api.get(`/checklist/${orderId}`),
  })

  const existing = data?.data

  const [form, setForm] = useState({
    screen_condition: 'good',
    body_condition: 'good',
    buttons_working: true,
    charging_port_ok: true,
    speakers_ok: true,
    camera_ok: true,
    has_sim_card: false,
    has_memory_card: false,
    existing_damages: '',
    accessories_received: '',
    customer_signature: '',
  })

  useEffect(() => {
    if (existing) setForm({ ...form, ...existing })
  }, [existing])

  const save = useMutation({
    mutationFn: () => api.post('/checklist', { ...form, order_id: orderId }),
    onSuccess: () => {
      toast.success('تم حفظ قائمة الفحص')
      qc.invalidateQueries(['checklist', orderId])
      onClose()
    },
    onError: e => toast.error(e?.message || 'فشل الحفظ'),
  })

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-600" />
            قائمة فحص الاستلام
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* حالة الشاشة والهيكل */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">حالة الشاشة</label>
              <select value={form.screen_condition} onChange={e => set('screen_condition', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">حالة الهيكل</label>
              <select value={form.body_condition} onChange={e => set('body_condition', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* العناصر الثنائية */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">حالة المكوّنات</label>
            <div className="grid grid-cols-2 gap-2">
              {BOOL_ITEMS.map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                  <div
                    onClick={() => set(item.key, !form[item.key])}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition ${
                      form[item.key] ? 'bg-green-500 border-green-500' : 'border-gray-300'
                    }`}
                  >
                    {form[item.key] && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-gray-700">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* الأضرار الموجودة */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">الأضرار الموجودة مسبقاً</label>
            <textarea
              value={form.existing_damages}
              onChange={e => set('existing_damages', e.target.value)}
              rows={2}
              placeholder="مثال: خدش في الزاوية اليسرى، كسر في الإطار..."
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* الملحقات */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">الملحقات المستلمة</label>
            <input
              value={form.accessories_received}
              onChange={e => set('accessories_received', e.target.value)}
              placeholder="مثال: شاحن، كفر، سماعة..."
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* توقيع العميل */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <label className="text-sm font-medium text-blue-800 flex items-center gap-1 mb-2">
              <Shield className="w-4 h-4" /> اسم العميل (للتأكيد)
            </label>
            <input
              value={form.customer_signature}
              onChange={e => set('customer_signature', e.target.value)}
              placeholder="اكتب اسم العميل كتوقيع رقمي..."
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white"
            />
            <p className="text-xs text-blue-600 mt-1">بكتابة اسمه يوافق العميل على حالة الجهاز عند الاستلام</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end p-5 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">
            إلغاء
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <ClipboardCheck className="w-4 h-4" />
            {save.isPending ? 'جاري الحفظ...' : 'حفظ قائمة الفحص'}
          </button>
        </div>
      </div>
    </div>
  )
}
