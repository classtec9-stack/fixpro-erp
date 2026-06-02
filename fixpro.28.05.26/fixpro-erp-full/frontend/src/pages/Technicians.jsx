import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Loading, EmptyState, Modal } from '../components/ui'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { BarChart2, Clock, CheckCircle, XCircle, Plus } from 'lucide-react'

export default function TechniciansPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ full_name:'', email:'', phone:'', password:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data, isLoading } = useQuery({
    queryKey: ['technicians-full'],
    queryFn: () => api.get('/technicians')
  })

  const { data: report } = useQuery({
    queryKey: ['tech-report'],
    queryFn: () => api.get('/reports/technicians')
  })

  const addTech = useMutation({
    mutationFn: () => api.post('/users', { ...form, role: 'technician' }),
    onSuccess: () => {
      toast.success('تم إضافة المهندس')
      setShowAdd(false)
      qc.invalidateQueries(['technicians-full'])
      setForm({ full_name:'', email:'', phone:'', password:'' })
    },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  const techs   = data?.data   || []
  const reports = report?.data || []

  // دمج بيانات الأداء
  const techsWithStats = techs.map(t => {
    const r = reports.find(r => r.id === t.id) || {}
    return { ...t, ...r }
  })

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">مهندسو الصيانة</div>
          <div className="page-sub">{techs.length} مهندس مسجل</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14}/> إضافة مهندس
        </button>
      </div>

      {isLoading ? <Loading /> : !techs.length ? (
        <EmptyState message="لا يوجد مهندسون" sub="أضف مهندساً من الإعدادات أو بالنقر على إضافة مهندس" />
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
          {techsWithStats.map(t => (
            <div key={t.id} className="card" style={{ borderRight:`3px solid ${t.is_active ? 'var(--blue)' : 'var(--muted)'}` }}>
              {/* رأس البطاقة */}
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <div style={{
                  width:44, height:44, borderRadius:'50%',
                  background: t.is_active ? 'var(--blue-dim)' : 'var(--ink-4)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:16, fontWeight:700,
                  color: t.is_active ? 'var(--blue)' : 'var(--muted)',
                  border: `1px solid ${t.is_active ? 'rgba(59,130,246,.3)' : 'var(--border)'}`,
                  flexShrink:0
                }}>
                  {t.full_name?.charAt(0)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, color:'var(--text-2)' }}>{t.full_name}</div>
                  <div style={{ fontSize:11, color:'var(--muted-2)' }}>{t.email}</div>
                  <div style={{ fontSize:11, color:'var(--muted-2)' }}>{t.phone || '—'}</div>
                </div>
                <div>
                  {t.is_active
                    ? <span className="badge badge-ready">نشط</span>
                    : <span className="badge badge-cancel">موقوف</span>
                  }
                </div>
              </div>

              {/* إحصائيات */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div style={{ background:'var(--ink-3)', borderRadius:6, padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--amber)', fontFamily:'var(--mono)' }}>
                    {t.active_orders || 0}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted-2)' }}>تذاكر نشطة</div>
                </div>
                <div style={{ background:'var(--ink-3)', borderRadius:6, padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--green)', fontFamily:'var(--mono)' }}>
                    {t.completed || 0}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted-2)' }}>مكتملة</div>
                </div>
                <div style={{ background:'var(--ink-3)', borderRadius:6, padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--blue)', fontFamily:'var(--mono)' }}>
                    {t.total_orders || 0}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted-2)' }}>إجمالي</div>
                </div>
                <div style={{ background:'var(--ink-3)', borderRadius:6, padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--purple)', fontFamily:'var(--mono)' }}>
                    {t.avg_hours ? `${t.avg_hours}س` : '—'}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted-2)' }}>متوسط الوقت</div>
                </div>
              </div>

              {/* الإيرادات */}
              {t.revenue_generated > 0 && (
                <div style={{ marginTop:10, padding:'6px 10px', background:'var(--green-dim)', borderRadius:6, display:'flex', justifyContent:'space-between', fontSize:12 }}>
                  <span style={{ color:'var(--muted-2)' }}>إيرادات محقّقة</span>
                  <span style={{ color:'var(--green)', fontWeight:600, fontFamily:'var(--mono)' }}>
                    {Number(t.revenue_generated || 0).toLocaleString('ar-SA')} ر
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* إضافة مهندس */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة مهندس صيانة"
        footer={
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
            <button className="btn btn-primary" onClick={() => addTech.mutate()}
              disabled={addTech.isPending || !form.full_name || !form.email || !form.password}>
              {addTech.isPending ? 'جاري الحفظ...' : 'إضافة'}
            </button>
          </div>
        }>
        <div className="form-grid">
          <div className="form-group form-full">
            <label className="form-label">الاسم الكامل *</label>
            <input className="form-input" value={form.full_name} onChange={e=>set('full_name',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">البريد الإلكتروني *</label>
            <input className="form-input" type="email" value={form.email} onChange={e=>set('email',e.target.value)} dir="ltr" />
          </div>
          <div className="form-group">
            <label className="form-label">رقم الجوال</label>
            <input className="form-input" value={form.phone} onChange={e=>set('phone',e.target.value)} dir="ltr" />
          </div>
          <div className="form-group form-full">
            <label className="form-label">كلمة المرور * (8 أحرف على الأقل)</label>
            <input className="form-input" type="password" value={form.password} onChange={e=>set('password',e.target.value)} dir="ltr" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
