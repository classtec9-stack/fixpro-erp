import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../services/api'
import toast from 'react-hot-toast'
import { MessageCircle, CheckCircle, XCircle, Send, Copy, ExternalLink } from 'lucide-react'

export default function WhatsAppSettings() {
  const [testPhone, setTestPhone] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: statusData, refetch } = useQuery({
    queryKey: ['wa-status'],
    queryFn: () => api.get('/whatsapp/status'),
    retry: false,
  })
  const s   = statusData || {}
  const cfg = s.configured || {}

  const sendTest = useMutation({
    mutationFn: () => api.post('/whatsapp/test', { phone: testPhone }),
    onSuccess: (d) => {
      if (d.result?.success) toast.success('✅ تم الإرسال بنجاح!')
      else toast.error('فشل: ' + (d.result?.error?.message || d.result?.reason || 'خطأ'))
    },
    onError: err => toast.error(err?.message || 'خطأ'),
  })

  const copyWebhook = () => {
    navigator.clipboard.writeText(s.webhook_url || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <MessageCircle size={22} color="#25D366"/> WhatsApp Business API
          </div>
          <div className="page-sub">إشعارات تلقائية للعملاء عبر واتساب</div>
        </div>
        <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="btn btn-ghost">
          <ExternalLink size={14}/> Meta Developers
        </a>
      </div>

      {/* حالة الاتصال */}
      <div className="card mb-4" style={{
        borderRight:`3px solid ${s.enabled?'var(--green)':'var(--amber)'}`,
        background: s.enabled?'rgba(16,185,129,.04)':'rgba(245,158,11,.04)'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:44,height:44,borderRadius:'50%',
            background:s.enabled?'var(--green-dim)':'var(--amber-dim)',
            display:'flex',alignItems:'center',justifyContent:'center' }}>
            {s.enabled ? <CheckCircle size={22} color="var(--green)"/> : <XCircle size={22} color="var(--amber)"/>}
          </div>
          <div>
            <div style={{ fontWeight:700, color:'var(--text-2)', fontSize:15 }}>
              {s.enabled ? '✅ WhatsApp متصل ويعمل' : '⚠️ WhatsApp غير مفعّل'}
            </div>
            <div style={{ fontSize:12, color:'var(--muted-2)', marginTop:2 }}>
              {s.enabled ? 'الإرسال التلقائي مفعّل' : 'أكمل إعداد متغيرات البيئة'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginRight:'auto' }} onClick={() => refetch()}>
            تحديث
          </button>
        </div>
        <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[
            { label:'WHATSAPP_TOKEN',        ok: cfg.token },
            { label:'WHATSAPP_PHONE_ID',     ok: cfg.phone_id },
            { label:'WHATSAPP_VERIFY_TOKEN', ok: cfg.verify_token },
          ].map((r,i) => (
            <div key={i} style={{ display:'flex',justifyContent:'space-between',
              padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:12 }}>
              <span style={{ color:'var(--text)' }}>{r.label}</span>
              {r.ok
                ? <span style={{ color:'var(--green)',display:'flex',alignItems:'center',gap:4 }}><CheckCircle size={13}/> محدد</span>
                : <span style={{ color:'var(--red)',display:'flex',alignItems:'center',gap:4 }}><XCircle size={13}/> مفقود</span>
              }
            </div>
          ))}
        </div>
      </div>

      <div className="two-col">
        {/* دليل الإعداد */}
        <div className="card">
          <div className="card-title mb-4">📋 خطوات الإعداد</div>
          {[
            { n:1, title:'إنشاء تطبيق Meta',
              desc:<>اذهب إلى <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{color:'var(--blue)'}}>developers.facebook.com</a> ← Create App ← Business ← WhatsApp</> },
            { n:2, title:'احصل على بيانات الاتصال',
              code:`WHATSAPP_TOKEN=EAAxxxxxxxx\nWHATSAPP_PHONE_ID=12345678901234\nWHATSAPP_VERIFY_TOKEN=fixpro_webhook_2025` },
            { n:3, title:'إعداد الـ Webhook',
              webhook: true },
            { n:4, title:'رقم اختبار مجاني للتطوير',
              desc:'Meta يوفر رقم اختبار مجاني لـ 5 أرقام جوال — مناسب قبل الإطلاق' },
          ].map(s => (
            <div key={s.n} style={{ display:'flex',gap:14,marginBottom:20 }}>
              <div style={{ width:30,height:30,borderRadius:'50%',flexShrink:0,
                background:'var(--blue-dim)',border:'1px solid rgba(59,130,246,.4)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:13,fontWeight:700,color:'var(--blue)' }}>{s.n}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600,color:'var(--text-2)',marginBottom:6,fontSize:14 }}>{s.title}</div>
                {s.desc && <p style={{ fontSize:12,color:'var(--text)',lineHeight:1.7 }}>{s.desc}</p>}
                {s.code && (
                  <div style={{ background:'var(--ink-3)',borderRadius:6,padding:'8px 12px' }}>
                    <div style={{ fontSize:10,color:'var(--muted)',marginBottom:4 }}>أضف في ملف .env:</div>
                    <code style={{ color:'var(--green)',display:'block',lineHeight:2,fontSize:12 }}>
                      {s.code.split('\n').map((l,i) => <div key={i}>{l}</div>)}
                    </code>
                  </div>
                )}
                {s.webhook && (
                  <div style={{ background:'var(--ink-3)',borderRadius:6,padding:'8px 12px' }}>
                    <div style={{ fontSize:11,color:'var(--muted)',marginBottom:4 }}>Webhook URL:</div>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <code style={{ flex:1,fontSize:11,color:'var(--blue)',wordBreak:'break-all' }}>
                        {statusData?.webhook_url || 'https://your-domain.com/api/whatsapp/webhook'}
                      </code>
                      <button className="btn-icon" onClick={copyWebhook}>
                        {copied ? <CheckCircle size={14} color="var(--green)"/> : <Copy size={14}/>}
                      </button>
                    </div>
                    <div style={{ fontSize:11,color:'var(--muted)',marginTop:6 }}>
                      Verify Token: <code style={{ color:'var(--amber)' }}>fixpro_webhook_2025</code>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* اختبار + رسائل تلقائية */}
        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
          <div className="card">
            <div className="card-title mb-3">🧪 اختبار الإرسال</div>
            <div className="form-group mb-3">
              <label className="form-label">رقم جوال</label>
              <input className="form-input" value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="05XXXXXXXX" dir="ltr"/>
            </div>
            <button className="btn w-full"
              style={{ justifyContent:'center',background:'#25D366',color:'#fff',border:'none' }}
              onClick={() => sendTest.mutate()}
              disabled={sendTest.isPending || !testPhone || !s.enabled}>
              <Send size={14}/> {sendTest.isPending ? 'جاري...' : 'إرسال رسالة اختبار'}
            </button>
            {!s.enabled && (
              <div style={{ fontSize:11,color:'var(--amber)',textAlign:'center',marginTop:6 }}>
                أكمل الإعداد أولاً
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title mb-3">📨 الرسائل التلقائية</div>
            {[
              { icon:'📥', label:'استلام جهاز',       auto:true  },
              { icon:'✅', label:'جهاز جاهز',         auto:true  },
              { icon:'📞', label:'طلب موافقة العميل', auto:true  },
              { icon:'🧾', label:'إرسال الفاتورة',    auto:false },
              { icon:'⚠️', label:'تذكير جهاز متروك', auto:false },
            ].map((r,i) => (
              <div key={i} style={{ display:'flex',alignItems:'center',gap:10,padding:'7px 10px',
                background:'var(--ink-3)',borderRadius:6,marginBottom:6 }}>
                <span style={{ fontSize:16 }}>{r.icon}</span>
                <span style={{ flex:1,fontSize:12,color:'var(--text-2)' }}>{r.label}</span>
                <span style={{ fontSize:10,padding:'2px 8px',borderRadius:4,fontWeight:600,
                  background:r.auto?'var(--green-dim)':'var(--blue-dim)',
                  color:r.auto?'var(--green)':'var(--blue)' }}>
                  {r.auto?'تلقائي':'يدوي'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
