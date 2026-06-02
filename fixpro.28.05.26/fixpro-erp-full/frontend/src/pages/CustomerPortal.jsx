import { useState } from 'react'
import axios from 'axios'
import { Search } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

// Public axios — بدون token
const publicApi = axios.create({ baseURL: API_BASE })

const STATUS_CONFIG = {
  new:              { label:'تم الاستلام',            icon:'📥', color:'#3B82F6', desc:'تم استلام جهازك وسيبدأ الفحص قريباً' },
  quick_check:      { label:'قيد الفحص المبدئي',     icon:'🔍', color:'#8B5CF6', desc:'يقوم الفني بفحص جهازك مبدئياً' },
  diagnosing:       { label:'قيد التشخيص التفصيلي', icon:'🔬', color:'#8B5CF6', desc:'يقوم الفني بتشخيص المشكلة بالتفصيل' },
  waiting_approval: { label:'في انتظار موافقتك',     icon:'⏳', color:'#F59E0B', desc:'يرجى التواصل معنا للموافقة على تكلفة الإصلاح' },
  in_repair:        { label:'داخل الورشة للإصلاح',   icon:'🔧', color:'#F59E0B', desc:'يعمل الفني على إصلاح جهازك الآن' },
  waiting_part:     { label:'في انتظار قطعة غيار',   icon:'📦', color:'#F97316', desc:'تم طلب قطعة الغيار وسيبدأ الإصلاح عند وصولها' },
  ready:            { label:'جاهز للاستلام! 🎉',     icon:'✅', color:'#10B981', desc:'جهازك جاهز يمكنك الحضور لاستلامه' },
  delivered:        { label:'تم التسليم',             icon:'🏠', color:'#6B7280', desc:'تم تسليم الجهاز بنجاح' },
  rejected:         { label:'لم يتم الإصلاح',        icon:'❌', color:'#EF4444', desc:'نأسف، لم نتمكن من إصلاح الجهاز. يمكنك استلامه.' },
  cancelled:        { label:'ملغي',                   icon:'🚫', color:'#EF4444', desc:'تم إلغاء طلب الصيانة' },
}

const HISTORY_LABELS = {
  new:'تم الاستلام', quick_check:'بدء الفحص المبدئي',
  diagnosing:'بدء التشخيص', waiting_approval:'انتظار موافقة العميل',
  in_repair:'بدء الإصلاح', waiting_part:'انتظار قطعة غيار',
  ready:'الجهاز جاهز', delivered:'تم التسليم',
  rejected:'لم يتم الإصلاح', cancelled:'تم الإلغاء'
}

export default function CustomerPortal() {
  const [orderNum, setOrderNum] = useState('')
  const [ticket, setTicket]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!orderNum.trim()) return
    setLoading(true)
    setError('')
    setTicket(null)
    try {
      const res = await publicApi.get(`/tickets/public/${orderNum.trim().toUpperCase()}`)
      setTicket(res.data?.data)
    } catch (err) {
      setError(err.response?.data?.message || 'رقم التذكرة غير موجود')
    } finally {
      setLoading(false)
    }
  }

  const sc = ticket ? STATUS_CONFIG[ticket.status] : null

  return (
    <div style={{
      minHeight:'100vh', background:'#0E1117',
      fontFamily:"'IBM Plex Sans Arabic', sans-serif", direction:'rtl'
    }}>
      {/* Header */}
      <div style={{
        background:'#1A2030', borderBottom:'1px solid #2A3445',
        padding:'14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between'
      }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:'#F0F4F8' }}>
            Fix<span style={{ color:'#3B82F6' }}>Pro</span>
          </div>
          <div style={{ fontSize:11, color:'#5A6A82' }}>بوابة تتبع الصيانة</div>
        </div>
        <a href="/login" style={{ fontSize:12, color:'#3B82F6', textDecoration:'none' }}>
          دخول الموظفين
        </a>
      </div>

      <div style={{ maxWidth:620, margin:'0 auto', padding:'40px 20px' }}>

        {/* عنوان */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:28, fontWeight:700, color:'#F0F4F8', marginBottom:8 }}>
            تتبع حالة جهازك
          </div>
          <div style={{ fontSize:14, color:'#5A6A82' }}>
            أدخل رقم التذكرة الموجود في وصل الاستلام
          </div>
        </div>

        {/* نموذج البحث */}
        <form onSubmit={handleSearch}
          style={{ display:'flex', gap:10, marginBottom:28 }}>
          <input
            value={orderNum}
            onChange={e => setOrderNum(e.target.value)}
            placeholder="مثال: ORD-2025-0001"
            dir="ltr"
            style={{
              flex:1, padding:'12px 16px',
              background:'#1A2030', border:'1px solid #2A3445',
              borderRadius:8, color:'#E8EDF3',
              fontFamily:'monospace', fontSize:14, outline:'none',
              transition:'border-color .2s'
            }}
            onFocus={e => e.target.style.borderColor = '#3B82F6'}
            onBlur={e  => e.target.style.borderColor = '#2A3445'}
          />
          <button type="submit" disabled={loading} style={{
            padding:'12px 20px', background:'#3B82F6', color:'#fff',
            border:'none', borderRadius:8, cursor:'pointer',
            fontFamily:'inherit', fontSize:14, fontWeight:500,
            display:'flex', alignItems:'center', gap:6,
            opacity: loading ? .7 : 1
          }}>
            <Search size={16} />
            {loading ? 'بحث...' : 'بحث'}
          </button>
        </form>

        {/* خطأ */}
        {error && (
          <div style={{
            background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)',
            borderRadius:10, padding:'16px 20px', textAlign:'center', marginBottom:20
          }}>
            <div style={{ fontSize:20, marginBottom:6 }}>❌</div>
            <div style={{ color:'#EF4444', fontWeight:500 }}>{error}</div>
            <div style={{ color:'#7A8BA3', fontSize:12, marginTop:4 }}>
              تحقق من رقم التذكرة في وصل الاستلام
            </div>
          </div>
        )}

        {/* نتيجة البحث */}
        {ticket && sc && (
          <div style={{ animation:'fadeIn .3s ease-out' }}>

            {/* بطاقة الحالة */}
            <div style={{
              background:'#1A2030', border:`2px solid ${sc.color}40`,
              borderRadius:14, padding:24, marginBottom:16,
              boxShadow:`0 0 30px ${sc.color}15`
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
                <div style={{ fontSize:36 }}>{sc.icon}</div>
                <div>
                  <div style={{ fontSize:20, fontWeight:700, color:sc.color }}>{sc.label}</div>
                  <div style={{ fontSize:13, color:'#7A8BA3', marginTop:4 }}>{sc.desc}</div>
                </div>
              </div>

              {ticket.status === 'ready' && (
                <div style={{
                  background:'rgba(16,185,129,.12)', border:'1px solid rgba(16,185,129,.3)',
                  borderRadius:8, padding:'10px 14px', marginBottom:14,
                  fontSize:13, color:'#10B981', fontWeight:500
                }}>
                  🎉 جهازك جاهز! يرجى الحضور لاستلامه في أقرب وقت
                </div>
              )}

              {ticket.status === 'waiting_approval' && (
                <div style={{
                  background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)',
                  borderRadius:8, padding:'10px 14px', marginBottom:14,
                  fontSize:13, color:'#F59E0B'
                }}>
                  📞 يرجى التواصل معنا لاتخاذ قرار بشأن الإصلاح
                </div>
              )}

              {/* بيانات التذكرة */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <InfoBox label="رقم التذكرة" value={ticket.order_number} mono />
                <InfoBox label="اسم العميل"  value={ticket.customer_name} />
                <InfoBox label="الجهاز"      value={`${ticket.brand} ${ticket.model}`} />
                {ticket.color && <InfoBox label="اللون" value={ticket.color} />}
                <InfoBox
                  label="تاريخ الاستلام"
                  value={ticket.received_at
                    ? new Date(ticket.received_at).toLocaleDateString('ar-SA')
                    : '—'
                  }
                />
                {ticket.estimated_cost && (
                  <InfoBox label="تكلفة الإصلاح" value={`${ticket.estimated_cost} ريال`} highlight />
                )}
                {ticket.warranty_days && (
                  <InfoBox label="ضمان الإصلاح" value={`${ticket.warranty_days} يوم`} />
                )}
              </div>
            </div>

            {/* سجل الأحداث */}
            {ticket.history?.length > 0 && (
              <div style={{
                background:'#1A2030', border:'1px solid #2A3445',
                borderRadius:12, padding:20
              }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#E8EDF3', marginBottom:14 }}>
                  تاريخ التذكرة
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                  {ticket.history.map((h, i) => (
                    <div key={i} style={{ display:'flex', gap:12, position:'relative' }}>
                      {i < ticket.history.length - 1 && (
                        <div style={{
                          position:'absolute', right:7, top:16,
                          width:2, height:'100%', background:'#2A3445'
                        }} />
                      )}
                      <div style={{
                        width:16, height:16, borderRadius:'50%',
                        background: i === ticket.history.length - 1 ? '#3B82F6' : '#2A3445',
                        border: `2px solid ${i === ticket.history.length - 1 ? '#3B82F6' : '#394558'}`,
                        flexShrink:0, marginTop:2, zIndex:1
                      }} />
                      <div style={{ paddingBottom:16 }}>
                        <div style={{
                          fontSize:13,
                          color: i === ticket.history.length - 1 ? '#E8EDF3' : '#7A8BA3',
                          fontWeight: i === ticket.history.length - 1 ? 600 : 400
                        }}>
                          {HISTORY_LABELS[h.new_status] || h.new_status}
                        </div>
                        {h.note && (
                          <div style={{ fontSize:11, color:'#5A6A82', marginTop:2 }}>{h.note}</div>
                        )}
                        <div style={{ fontSize:10, color:'#3B4D60', marginTop:2, fontFamily:'monospace' }}>
                          {h.created_at ? new Date(h.created_at).toLocaleString('ar-SA') : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:32, fontSize:11, color:'#3B4D60' }}>
          FixPro ERP © 2025 — للاستفسار تواصل مع المركز
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  )
}

function InfoBox({ label, value, mono, highlight }) {
  return (
    <div style={{ background:'#242D3D', borderRadius:8, padding:'10px 12px' }}>
      <div style={{ fontSize:10, color:'#5A6A82', marginBottom:3 }}>{label}</div>
      <div style={{
        fontSize:13, fontWeight:500,
        color: highlight ? '#10B981' : '#C8D3E0',
        fontFamily: mono ? 'monospace' : 'inherit'
      }}>
        {value}
      </div>
    </div>
  )
}
