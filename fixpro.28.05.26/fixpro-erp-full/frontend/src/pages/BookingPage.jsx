import { useState } from 'react'
import axios from 'axios'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Calendar, Clock, MapPin, Smartphone, CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const pub = axios.create({ baseURL: API })

const DAYS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
const DEVICE_TYPES = ['هاتف ذكي','لابتوب','تابلت','كمبيوتر مكتبي','ساعة ذكية','أخرى']

// توليد 14 يوم قادم
function getAvailableDates() {
  const dates = []
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    dates.push(d)
  }
  return dates
}

export default function BookingPage() {
  const [step, setStep]         = useState(1)   // 1:branch, 2:date, 3:time, 4:info, 5:done
  const [branch, setBranch]     = useState(null)
  const [date, setDate]         = useState(null)
  const [time, setTime]         = useState(null)
  const [form, setForm]         = useState({ name:'', phone:'', device_type:'هاتف ذكي', device_brand:'', problem_desc:'' })
  const [ref, setRef]           = useState(null)
  const dates = getAvailableDates()

  const { data: branchesData } = useQuery({
    queryKey: ['public-branches'],
    queryFn: () => pub.get('/appointments/public/branches').then(r => r.data)
  })

  const { data: availData } = useQuery({
    queryKey: ['availability', branch?.id, date],
    queryFn: () => pub.get(`/appointments/public/availability?branch_id=${branch.id}&date=${date}`).then(r => r.data),
    enabled: !!(branch && date)
  })

  const book = useMutation({
    mutationFn: () => pub.post('/appointments/public', {
      branch_id: branch.id,
      customer_name: form.name,
      customer_phone: form.phone,
      device_type: form.device_type,
      device_brand: form.device_brand,
      problem_desc: form.problem_desc,
      appointment_date: date,
      appointment_time: time,
    }).then(r => r.data),
    onSuccess: (d) => { setRef(d.data.ref); setStep(5) },
    onError: (err) => alert(err.response?.data?.message || 'حدث خطأ، حاول مرة أخرى'),
  })

  const slots = availData?.data || []
  const branches = branchesData?.data || []

  return (
    <div style={{ minHeight:'100vh', background:'#0E1117', fontFamily:"'Segoe UI',Arial,sans-serif", direction:'rtl' }}>

      {/* Header */}
      <div style={{ background:'#1A2030', borderBottom:'1px solid #2A3445', padding:'14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:'#F0F4F8' }}>
            Fix<span style={{ color:'#3B82F6' }}>Pro</span>
          </div>
          <div style={{ fontSize:11, color:'#5A6A82' }}>حجز موعد صيانة</div>
        </div>
        <a href="/track" style={{ fontSize:12, color:'#3B82F6', textDecoration:'none' }}>تتبع طلب ←</a>
      </div>

      <div style={{ maxWidth:640, margin:'0 auto', padding:'32px 20px' }}>

        {/* Progress */}
        {step < 5 && (
          <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:32 }}>
            {['الفرع','التاريخ','الوقت','البيانات'].map((s, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', flex:1 }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1 }}>
                  <div style={{
                    width:32, height:32, borderRadius:'50%',
                    background: step > i+1 ? '#3B82F6' : step === i+1 ? '#3B82F6' : '#2A3445',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:13, fontWeight:700,
                    color: step >= i+1 ? '#fff' : '#5A6A82',
                    border: step === i+1 ? '2px solid #60A5FA' : 'none',
                    boxShadow: step === i+1 ? '0 0 12px rgba(59,130,246,.4)' : 'none',
                    transition:'all .3s'
                  }}>
                    {step > i+1 ? '✓' : i+1}
                  </div>
                  <div style={{ fontSize:11, color: step >= i+1 ? '#C8D3E0' : '#5A6A82', marginTop:4 }}>{s}</div>
                </div>
                {i < 3 && <div style={{ height:2, flex:.5, background: step > i+1 ? '#3B82F6' : '#2A3445', margin:'0 4px', marginBottom:20, borderRadius:2 }}/>}
              </div>
            ))}
          </div>
        )}

        {/* ── Step 1: اختيار الفرع ── */}
        {step === 1 && (
          <div>
            <Title icon={<MapPin size={20} color="#3B82F6"/>} text="اختر الفرع" />
            {!branches.length
              ? <LoadingCards />
              : branches.map(b => (
                <BranchCard key={b.id} branch={b}
                  selected={branch?.id === b.id}
                  onClick={() => { setBranch(b); setStep(2) }} />
              ))
            }
          </div>
        )}

        {/* ── Step 2: اختيار التاريخ ── */}
        {step === 2 && (
          <div>
            <Title icon={<Calendar size={20} color="#3B82F6"/>} text="اختر التاريخ" />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6, marginBottom:16 }}>
              {DAYS_AR.map(d => (
                <div key={d} style={{ textAlign:'center', fontSize:10, color:'#5A6A82', padding:'4px 0' }}>{d.slice(0,3)}</div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
              {dates.map(d => {
                const iso = d.toISOString().split('T')[0]
                const isSelected = date === iso
                const dayName = DAYS_AR[d.getDay()]
                const isFri = d.getDay() === 5
                return (
                  <div key={iso} onClick={() => { if(!isFri){ setDate(iso); setTime(null); setStep(3) } }}
                    style={{
                      textAlign:'center', padding:'10px 4px', borderRadius:8,
                      background: isSelected ? '#3B82F6' : isFri ? '#1A2030' : '#1A2030',
                      border: `1px solid ${isSelected ? '#3B82F6' : '#2A3445'}`,
                      cursor: isFri ? 'not-allowed' : 'pointer',
                      opacity: isFri ? .4 : 1,
                      transition:'all .15s'
                    }}>
                    <div style={{ fontSize:9, color: isSelected ? '#fff' : '#5A6A82', marginBottom:2 }}>{dayName.slice(0,3)}</div>
                    <div style={{ fontSize:15, fontWeight:700, color: isSelected ? '#fff' : '#E8EDF3' }}>{d.getDate()}</div>
                    <div style={{ fontSize:9, color: isSelected ? 'rgba(255,255,255,.7)' : '#5A6A82' }}>
                      {d.toLocaleDateString('ar-SA', { month:'short' })}
                    </div>
                  </div>
                )
              })}
            </div>
            <BackBtn onClick={() => setStep(1)} />
          </div>
        )}

        {/* ── Step 3: اختيار الوقت ── */}
        {step === 3 && (
          <div>
            <Title icon={<Clock size={20} color="#3B82F6"/>} text={`اختر الوقت — ${new Date(date).toLocaleDateString('ar-SA', { weekday:'long', day:'numeric', month:'long' })}`} />
            {!slots.length
              ? <div style={{ textAlign:'center', padding:'40px 0', color:'#5A6A82' }}>لا توجد مواعيد متاحة لهذا اليوم</div>
              : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                  {slots.map(s => (
                    <div key={s.time} onClick={() => { if(!s.disabled){ setTime(s.time); setStep(4) } }}
                      style={{
                        textAlign:'center', padding:'12px 8px', borderRadius:8,
                        background: time === s.time ? '#3B82F6' : '#1A2030',
                        border: `1px solid ${time===s.time ? '#3B82F6' : s.available>0 ? '#2A3445' : '#1A2030'}`,
                        cursor: s.disabled ? 'not-allowed' : 'pointer',
                        opacity: s.disabled ? .4 : 1,
                        transition:'all .15s'
                      }}>
                      <div style={{ fontSize:15, fontWeight:700, color: time===s.time ? '#fff' : '#E8EDF3' }}>{s.time}</div>
                      <div style={{ fontSize:10, marginTop:2, color: time===s.time ? 'rgba(255,255,255,.7)' : s.available>1 ? '#10B981' : '#F59E0B' }}>
                        {s.available} متاح
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
            <BackBtn onClick={() => setStep(2)} />
          </div>
        )}

        {/* ── Step 4: بيانات العميل ── */}
        {step === 4 && (
          <div>
            <Title icon={<Smartphone size={20} color="#3B82F6"/>} text="بيانات الجهاز والتواصل" />

            {/* ملخص */}
            <div style={{ background:'#1A2030', border:'1px solid #2A3445', borderRadius:10, padding:'12px 16px', marginBottom:20 }}>
              <div style={{ display:'flex', gap:16, fontSize:13 }}>
                <span style={{ color:'#5A6A82' }}>📍 {branch?.name}</span>
                <span style={{ color:'#5A6A82' }}>📅 {new Date(date).toLocaleDateString('ar-SA', { day:'numeric', month:'long' })}</span>
                <span style={{ color:'#3B82F6', fontWeight:600 }}>🕐 {time}</span>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { key:'name',    label:'الاسم الكامل *',       ph:'أحمد محمد',          dir:'rtl' },
                { key:'phone',   label:'رقم الجوال *',          ph:'05XXXXXXXX',          dir:'ltr' },
                { key:'device_brand', label:'ماركة الجهاز',    ph:'Apple / Samsung...', dir:'rtl' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:12, color:'#7A8BA3', display:'block', marginBottom:5 }}>{f.label}</label>
                  <input dir={f.dir} value={form[f.key]}
                    onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))}
                    placeholder={f.ph}
                    style={{
                      width:'100%', padding:'10px 14px', borderRadius:8,
                      background:'#1A2030', border:'1px solid #2A3445', color:'#E8EDF3',
                      fontFamily:'inherit', fontSize:14, outline:'none',
                      boxSizing:'border-box', transition:'border-color .2s'
                    }}
                    onFocus={e => e.target.style.borderColor='#3B82F6'}
                    onBlur={e  => e.target.style.borderColor='#2A3445'}
                  />
                </div>
              ))}

              <div>
                <label style={{ fontSize:12, color:'#7A8BA3', display:'block', marginBottom:5 }}>نوع الجهاز</label>
                <select value={form.device_type} onChange={e => setForm(p=>({...p, device_type:e.target.value}))}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:8, background:'#1A2030', border:'1px solid #2A3445', color:'#E8EDF3', fontFamily:'inherit', fontSize:14, outline:'none', boxSizing:'border-box' }}>
                  {DEVICE_TYPES.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize:12, color:'#7A8BA3', display:'block', marginBottom:5 }}>وصف المشكلة</label>
                <textarea value={form.problem_desc}
                  onChange={e => setForm(p=>({...p, problem_desc:e.target.value}))}
                  placeholder="اشرح المشكلة باختصار..."
                  rows={3}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:8, background:'#1A2030', border:'1px solid #2A3445', color:'#E8EDF3', fontFamily:'inherit', fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box' }}
                />
              </div>
            </div>

            <button onClick={() => book.mutate()}
              disabled={book.isPending || !form.name || !form.phone}
              style={{
                width:'100%', marginTop:20, padding:'14px',
                background: (!form.name || !form.phone) ? '#2A3445' : '#3B82F6',
                color:'#fff', border:'none', borderRadius:10,
                fontFamily:'inherit', fontSize:15, fontWeight:600,
                cursor: (!form.name || !form.phone) ? 'not-allowed' : 'pointer',
                transition:'all .2s'
              }}>
              {book.isPending ? '⏳ جاري الحجز...' : 'تأكيد الحجز ←'}
            </button>

            <BackBtn onClick={() => setStep(3)} />
          </div>
        )}

        {/* ── Step 5: تأكيد ── */}
        {step === 5 && (
          <div style={{ textAlign:'center', padding:'40px 20px' }}>
            <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(16,185,129,.15)', border:'2px solid #10B981', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
              <CheckCircle size={40} color="#10B981"/>
            </div>
            <div style={{ fontSize:24, fontWeight:700, color:'#F0F4F8', marginBottom:8 }}>تم الحجز بنجاح! 🎉</div>
            <div style={{ fontSize:14, color:'#7A8BA3', marginBottom:20 }}>
              سنتواصل معك لتأكيد الموعد عبر واتساب
            </div>
            <div style={{ background:'#1A2030', border:'1px solid #2A3445', borderRadius:10, padding:'16px', marginBottom:24 }}>
              <div style={{ fontSize:12, color:'#5A6A82', marginBottom:6 }}>رقم الحجز</div>
              <div style={{ fontSize:22, fontWeight:900, color:'#3B82F6', letterSpacing:3, fontFamily:'monospace' }}>#{ref}</div>
              <div style={{ fontSize:12, color:'#7A8BA3', marginTop:10 }}>
                📅 {new Date(date).toLocaleDateString('ar-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })} — 🕐 {time}
              </div>
              <div style={{ fontSize:12, color:'#7A8BA3', marginTop:4 }}>📍 {branch?.name}</div>
            </div>
            <a href="/" style={{ color:'#3B82F6', fontSize:14, textDecoration:'none' }}>العودة للرئيسية</a>
          </div>
        )}
      </div>
    </div>
  )
}

// ── مساعدات ───────────────────────────────────────────────
function Title({ icon, text }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
      {icon}
      <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:'#E8EDF3' }}>{text}</h2>
    </div>
  )
}

function BranchCard({ branch: b, selected, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding:'14px 18px', borderRadius:10, marginBottom:10, cursor:'pointer',
      background: selected ? 'rgba(59,130,246,.1)' : '#1A2030',
      border: `1px solid ${selected ? '#3B82F6' : '#2A3445'}`,
      transition:'all .15s'
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:600, color:'#E8EDF3' }}>{b.shop_name || b.name}</div>
          {b.city && <div style={{ fontSize:12, color:'#5A6A82', marginTop:3 }}>📍 {b.city}</div>}
          {(b.shop_phone || b.phone) && <div style={{ fontSize:12, color:'#5A6A82' }}>📞 {b.shop_phone || b.phone}</div>}
        </div>
        <ChevronLeft size={18} color="#5A6A82"/>
      </div>
    </div>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ background:'none', border:'none', color:'#5A6A82', fontSize:13, cursor:'pointer', marginTop:16, display:'flex', alignItems:'center', gap:4 }}>
      <ChevronRight size={14}/> رجوع
    </button>
  )
}

function LoadingCards() {
  return [1,2].map(i => (
    <div key={i} style={{ height:70, borderRadius:10, background:'#1A2030', marginBottom:10, animation:'pulse 1.5s infinite' }}/>
  ))
}
