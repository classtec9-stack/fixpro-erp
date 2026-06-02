import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { Wrench, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const { login, loading } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      toast.error(err?.message || 'خطأ في تسجيل الدخول')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--ink)', padding: 20
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, opacity: .04,
        backgroundImage: 'linear-gradient(var(--border-2) 1px, transparent 1px), linear-gradient(90deg, var(--border-2) 1px, transparent 1px)',
        backgroundSize: '40px 40px', pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: 380, position: 'relative' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12,
            background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px'
          }}>
            <Wrench size={24} color="var(--blue)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '-.02em' }}>
            Fix<span style={{ color: 'var(--blue)' }}>Pro</span> ERP
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            نظام إدارة مراكز الصيانة
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ marginBottom: 20, textAlign: 'center', fontSize: '1rem' }}>تسجيل الدخول</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">البريد الإلكتروني</label>
              <input
                className="form-input"
                type="email"
                placeholder="admin@fixpro.sa"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                dir="ltr"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 22, position: 'relative' }}>
              <label className="form-label">كلمة المرور</label>
              <input
                className="form-input"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ paddingLeft: 38 }}
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute', left: 10, bottom: 9,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', display: 'flex', alignItems: 'center'
                }}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button
              className="btn btn-primary w-full"
              type="submit"
              disabled={loading}
              style={{ justifyContent: 'center', padding: '10px' }}
            >
              {loading ? 'جاري الدخول...' : 'دخول'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
          FixPro ERP v1.0 — جميع الحقوق محفوظة
        </div>
      </div>
    </div>
  )
}
