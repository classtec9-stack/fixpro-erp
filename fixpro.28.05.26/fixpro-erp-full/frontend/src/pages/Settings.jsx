import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import api from '../services/api'
import { Modal, Loading } from '../components/ui'
import toast from 'react-hot-toast'
import { Plus, Shield, User, Palette, Globe, Key, Edit2, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'

const ROLES = [
  { value: 'admin',            label: 'مدير النظام',         color: '#EF4444' },
  { value: 'branch_manager',   label: 'مشرف الفرع',          color: '#8B5CF6' },
  { value: 'receptionist',     label: 'موظف استقبال',        color: '#3B82F6' },
  { value: 'technician',       label: 'مهندس صيانة',         color: '#F59E0B' },
  { value: 'customer_service', label: 'خدمة العملاء',        color: '#10B981' },
  { value: 'warehouse',        label: 'مسؤول المخزن',        color: '#F97316' },
  { value: 'accountant',       label: 'محاسب',               color: '#6B7280' },
]

const ROLE_PERMISSIONS = {
  admin:            ['كل الصفحات والصلاحيات'],
  branch_manager:   ['لوحة التحكم','التذاكر','العملاء','الفنيين','المخزون','الفواتير','التقارير'],
  receptionist:     ['التذاكر (إنشاء/عرض)','العملاء','الفواتير'],
  technician:       ['تذاكره فقط','تحديث الحالة','إضافة قطع'],
  customer_service: ['التذاكر (عرض)','العملاء','الإشعارات','الأجهزة المتروكة'],
  warehouse:        ['المخزون','طلبات القطع','تذاكر تحتاج قطع'],
  accountant:       ['الفواتير','التقارير المالية'],
}

export default function SettingsPage() {
  const { user: me, logout } = useAuth()
  const qc = useQueryClient()
  const isAdmin = me?.role === 'admin' || me?.role === 'branch_manager'
  // المدير يبدأ بتبويب المستخدمين، غيره يبدأ بالملف الشخصي
  const [tab, setTab] = useState(isAdmin ? 'users' : 'profile')
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [showPw, setShowPw] = useState(false)
  const [showResetPw, setShowResetPw] = useState(null)

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-title">الإعدادات</div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {[
          { id:'users',   label:'المستخدمون والصلاحيات', icon: Shield,  show: isAdmin },
          { id:'profile', label:'الملف الشخصي',          icon: User,   show: true },
          { id:'appearance', label:'المظهر واللغة',      icon: Palette, show: true },
          { id:'password', label:'كلمة المرور',           icon: Key,    show: true },
        ].filter(t => t.show).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'10px 16px', background:'none', border:'none', cursor:'pointer',
            fontSize:13, fontFamily:'var(--font)',
            color: tab===t.id ? 'var(--blue)' : 'var(--muted-2)',
            borderBottom: tab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: -1, transition:'all .15s'
          }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {tab === 'users'      && <UsersTab onAdd={() => setShowAdd(true)} onEdit={setEditUser} onResetPw={setShowResetPw} />}
      {tab === 'profile'    && <ProfileTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'password'   && <PasswordTab />}

      <AddUserModal open={showAdd} onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); qc.invalidateQueries(['users']) }} />
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSuccess={() => { setEditUser(null); qc.invalidateQueries(['users']) }} />}
      {showResetPw && <ResetPasswordModal userId={showResetPw.id} userName={showResetPw.name} onClose={() => setShowResetPw(null)} />}
    </div>
  )
}

// ── Users Tab ──────────────────────────────────────────────
function UsersTab({ onAdd, onEdit, onResetPw }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey:['users'], queryFn: () => api.get('/users') })
  const users = data?.data || []

  const toggle = useMutation({
    mutationFn: ({ id, is_active, full_name, email, role }) =>
      api.put(`/users/${id}`, { is_active: !is_active, full_name, email, role }),
    onSuccess: () => { qc.invalidateQueries(['users']); toast.success('تم التحديث') }
  })

  const getRoleInfo = r => ROLES.find(x => x.value === r) || { label: r, color: '#6B7280' }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontWeight:600, color:'var(--text-2)' }}>إدارة المستخدمين</div>
          <div className="text-xs text-muted mt-1">{users.length} مستخدم مسجل</div>
        </div>
        <button className="btn btn-primary" onClick={onAdd}><Plus size={14}/> إضافة مستخدم</button>
      </div>

      {/* Role permissions reference */}
      <div className="card mb-3" style={{ padding:14 }}>
        <div className="card-title mb-2" style={{ marginBottom:10 }}>صلاحيات كل دور</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:8 }}>
          {ROLES.map(r => (
            <div key={r.value} style={{ background:'var(--ink-3)', borderRadius:6, padding:'10px 12px', borderRight:`3px solid ${r.color}` }}>
              <div style={{ fontWeight:600, fontSize:12, color:r.color, marginBottom:4 }}>{r.label}</div>
              {ROLE_PERMISSIONS[r.value]?.map(p => (
                <div key={p} style={{ fontSize:11, color:'var(--muted-2)', marginBottom:2 }}>• {p}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المستخدم</th><th>البريد</th><th>الجوال</th>
                  <th>الدور</th><th>آخر دخول</th><th>الحالة</th><th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const role = getRoleInfo(u.role)
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--ink-4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'var(--muted-2)', flexShrink:0 }}>
                            {u.full_name?.charAt(0)}
                          </div>
                          <div style={{ fontWeight:500, color:'var(--text-2)' }}>{u.full_name}</div>
                        </div>
                      </td>
                      <td className="font-mono text-sm">{u.email}</td>
                      <td className="text-sm text-muted2">{u.phone || '—'}</td>
                      <td>
                        <span className="badge" style={{ background:`${role.color}22`, color:role.color }}>
                          {role.label}
                        </span>
                      </td>
                      <td className="text-xs text-muted font-mono">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('ar-SA') : 'لم يدخل'}
                      </td>
                      <td>
                        <button onClick={() => toggle.mutate(u)} style={{ background:'none', border:'none', cursor:'pointer', color: u.is_active ? 'var(--green)' : 'var(--muted)' }}>
                          {u.is_active ? <ToggleRight size={22}/> : <ToggleLeft size={22}/>}
                        </button>
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="btn-icon" onClick={() => onEdit(u)} title="تعديل"><Edit2 size={13}/></button>
                          <button className="btn-icon" onClick={() => onResetPw({ id:u.id, name:u.full_name })} title="تغيير كلمة المرور"><Key size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Profile Tab ────────────────────────────────────────────
function ProfileTab() {
  const { user: me } = useAuth()
  const [form, setForm] = useState({ full_name: me?.fullName || '', phone: '' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const save = useMutation({
    mutationFn: () => api.put('/users/profile', form),
    onSuccess: () => toast.success('تم تحديث الملف الشخصي')
  })

  const roleLabel = ROLES.find(r => r.value === me?.role)?.label || me?.role

  return (
    <div className="card" style={{ maxWidth:500 }}>
      <div className="card-title mb-3">الملف الشخصي</div>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20, padding:'14px 16px', background:'var(--ink-3)', borderRadius:8 }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--blue-dim)', border:'1px solid rgba(59,130,246,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, color:'var(--blue)' }}>
          {me?.fullName?.charAt(0)}
        </div>
        <div>
          <div style={{ fontWeight:600, color:'var(--text-2)' }}>{me?.fullName}</div>
          <div className="text-xs text-muted">{me?.email}</div>
          <div className="text-xs" style={{ color:'var(--blue)', marginTop:2 }}>{roleLabel}</div>
        </div>
      </div>
      <div className="form-grid">
        <div className="form-group form-full">
          <label className="form-label">الاسم الكامل</label>
          <input className="form-input" value={form.full_name} onChange={e=>set('full_name',e.target.value)} />
        </div>
        <div className="form-group form-full">
          <label className="form-label">رقم الجوال</label>
          <input className="form-input" value={form.phone} onChange={e=>set('phone',e.target.value)} dir="ltr" />
        </div>
        <div className="form-group form-full">
          <label className="form-label">البريد الإلكتروني</label>
          <input className="form-input" value={me?.email || ''} disabled style={{ opacity:.5 }} dir="ltr" />
        </div>
      </div>
      <div style={{ marginTop:16 }}>
        <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </div>
    </div>
  )
}

// ── Appearance Tab ─────────────────────────────────────────
function AppearanceTab() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')
  const { lang, setLang } = useLang()

  const applyTheme = (th) => {
    setTheme(th)
    import('../utils/theme.js').then(m => m.applyTheme(th))
    toast.success(th === 'dark' ? 'تم تفعيل الوضع الداكن' : 'تم تفعيل الوضع الفاتح')
  }

  const applyLang = (l) => {
    setLang(l)
    toast.success(l === 'ar' ? 'تم تغيير اللغة إلى العربية ✅' : 'Language changed to English ✅')
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:600 }}>
      <div className="card">
        <div className="card-title mb-3">الثيم</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[
            { id:'dark',  label:'الوضع الداكن',  icon:'🌙', desc:'مريح للعيون في الإضاءة المنخفضة' },
            { id:'light', label:'الوضع الفاتح',  icon:'☀️', desc:'واضح في الإضاءة العالية' },
          ].map(t => (
            <div key={t.id} onClick={() => applyTheme(t.id)} style={{
              padding:'12px 14px', borderRadius:8, cursor:'pointer',
              border:`1px solid ${theme===t.id ? 'var(--blue)' : 'var(--border)'}`,
              background: theme===t.id ? 'var(--blue-dim)' : 'var(--ink-3)',
              transition:'all .15s'
            }}>
              <div style={{ fontWeight:500, color:'var(--text-2)', marginBottom:2 }}>{t.icon} {t.label}</div>
              <div className="text-xs text-muted">{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title mb-3">اللغة</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[
            { id:'ar', label:'العربية', flag:'🇸🇦', desc:'Arabic - RTL' },
            { id:'en', label:'English', flag:'🇺🇸', desc:'English - LTR' },
          ].map(l => (
            <div key={l.id} onClick={() => applyLang(l.id)} style={{
              padding:'12px 14px', borderRadius:8, cursor:'pointer',
              border:`1px solid ${lang===l.id ? 'var(--blue)' : 'var(--border)'}`,
              background: lang===l.id ? 'var(--blue-dim)' : 'var(--ink-3)',
              transition:'all .15s'
            }}>
              <div style={{ fontWeight:500, color:'var(--text-2)', marginBottom:2 }}>{l.flag} {l.label}</div>
              <div className="text-xs text-muted">{l.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


// ── Password Tab ───────────────────────────────────────────
function PasswordTab() {
  const [form, setForm] = useState({ currentPassword:'', newPassword:'', confirmPassword:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const change = useMutation({
    mutationFn: () => {
      if (form.newPassword !== form.confirmPassword) throw new Error('كلمتا المرور غير متطابقتين')
      if (form.newPassword.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword })
    },
    onSuccess: () => { toast.success('تم تغيير كلمة المرور بنجاح'); setForm({ currentPassword:'', newPassword:'', confirmPassword:'' }) },
    onError: err => toast.error(err?.message || err?.response?.data?.message || 'خطأ')
  })

  const strength = (pw) => {
    if (!pw) return { score:0, label:'', color:'' }
    let s = 0
    if (pw.length >= 8) s++
    if (/[A-Z]/.test(pw)) s++
    if (/[0-9]/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    const map = ['','ضعيفة','متوسطة','جيدة','قوية']
    const colors = ['','var(--red)','var(--amber)','var(--blue)','var(--green)']
    return { score:s, label:map[s], color:colors[s] }
  }

  const str = strength(form.newPassword)

  return (
    <div className="card" style={{ maxWidth:420 }}>
      <div className="card-title mb-3">تغيير كلمة المرور</div>
      <div className="form-group" style={{ marginBottom:14 }}>
        <label className="form-label">كلمة المرور الحالية</label>
        <input className="form-input" type="password" value={form.currentPassword} onChange={e=>set('currentPassword',e.target.value)} dir="ltr" />
      </div>
      <div className="form-group" style={{ marginBottom:6 }}>
        <label className="form-label">كلمة المرور الجديدة</label>
        <input className="form-input" type="password" value={form.newPassword} onChange={e=>set('newPassword',e.target.value)} dir="ltr" />
      </div>
      {form.newPassword && (
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', gap:4, marginBottom:4 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ flex:1, height:4, borderRadius:2, background: i<=str.score ? str.color : 'var(--border-2)', transition:'background .3s' }} />
            ))}
          </div>
          <div className="text-xs" style={{ color:str.color }}>{str.label}</div>
        </div>
      )}
      <div className="form-group" style={{ marginBottom:20 }}>
        <label className="form-label">تأكيد كلمة المرور</label>
        <input className="form-input" type="password" value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)} dir="ltr"
          style={{ borderColor: form.confirmPassword && form.confirmPassword !== form.newPassword ? 'var(--red)' : undefined }} />
        {form.confirmPassword && form.confirmPassword !== form.newPassword && (
          <div className="text-xs" style={{ color:'var(--red)', marginTop:4 }}>كلمتا المرور غير متطابقتين</div>
        )}
      </div>
      <button className="btn btn-primary" onClick={() => change.mutate()} disabled={change.isPending || !form.currentPassword || !form.newPassword}>
        {change.isPending ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
      </button>
    </div>
  )
}

// ── Add User Modal ─────────────────────────────────────────
function AddUserModal({ open, onClose, onSuccess }) {
  const [form, setForm] = useState({ full_name:'', email:'', phone:'', role:'receptionist', password:'', branch_id:'' })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const { data: branchesData } = useQuery({
    queryKey: ['branches-select'],
    queryFn: () => api.get('/branches')
  })
  const branches = branchesData?.data || []

  const add = useMutation({
    mutationFn: () => api.post('/users', form),
    onSuccess: () => { toast.success('تم إنشاء الحساب'); onSuccess() },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  return (
    <Modal open={open} onClose={onClose} title="إضافة مستخدم جديد"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
        <button className="btn btn-primary" onClick={() => add.mutate()} disabled={add.isPending || !form.full_name || !form.email || !form.password}>
          {add.isPending ? 'جاري الحفظ...' : 'إنشاء الحساب'}
        </button>
      </>}>
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
        <div className="form-group">
          <label className="form-label">الفرع</label>
          <select className="form-select" value={form.branch_id} onChange={e=>set('branch_id',e.target.value)}>
            <option value="">-- نفس فرع المدير --</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">الدور *</label>
          <select className="form-select" value={form.role} onChange={e=>set('role',e.target.value)}>
            {ROLES.filter(r => r.value !== 'admin').map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">كلمة المرور * (8 أحرف على الأقل)</label>
          <input className="form-input" type="password" value={form.password} onChange={e=>set('password',e.target.value)} dir="ltr" />
        </div>
      </div>
      <div style={{ marginTop:12, padding:'10px 12px', background:'var(--ink-3)', borderRadius:6, fontSize:12, color:'var(--muted-2)' }}>
        <div style={{ fontWeight:500, marginBottom:4, color:'var(--text-2)' }}>صلاحيات هذا الدور:</div>
        {ROLE_PERMISSIONS[form.role]?.map(p => <div key={p}>• {p}</div>)}
      </div>
    </Modal>
  )
}

// ── Edit User Modal ────────────────────────────────────────
function EditUserModal({ user, onClose, onSuccess }) {
  const [form, setForm] = useState({ full_name: user.full_name, email: user.email, phone: user.phone||'', role: user.role, is_active: user.is_active })
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const save = useMutation({
    mutationFn: () => api.put(`/users/${user.id}`, form),
    onSuccess: () => { toast.success('تم التحديث'); onSuccess() },
    onError: err => toast.error(err?.message || 'خطأ')
  })

  return (
    <Modal open={true} onClose={onClose} title={`تعديل: ${user.full_name}`}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
        <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </>}>
      <div className="form-grid">
        <div className="form-group form-full">
          <label className="form-label">الاسم</label>
          <input className="form-input" value={form.full_name} onChange={e=>set('full_name',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">البريد</label>
          <input className="form-input" value={form.email} onChange={e=>set('email',e.target.value)} dir="ltr" />
        </div>
        <div className="form-group">
          <label className="form-label">الجوال</label>
          <input className="form-input" value={form.phone} onChange={e=>set('phone',e.target.value)} dir="ltr" />
        </div>
        <div className="form-group">
          <label className="form-label">الدور</label>
          <select className="form-select" value={form.role} onChange={e=>set('role',e.target.value)}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="form-group form-full">
          <label className="form-label">الحالة</label>
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            {[{v:true,l:'نشط'},{v:false,l:'موقوف'}].map(o => (
              <label key={String(o.v)} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13 }}>
                <input type="radio" name="is_active" checked={form.is_active===o.v} onChange={()=>set('is_active',o.v)} />
                <span style={{ color: o.v ? 'var(--green)' : 'var(--red)' }}>{o.l}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Reset Password Modal ───────────────────────────────────
function ResetPasswordModal({ userId, userName, onClose }) {
  const [pw, setPw] = useState('')
  const reset = useMutation({
    mutationFn: () => api.post(`/users/${userId}/reset-password`, { new_password: pw }),
    onSuccess: () => { toast.success('تم تغيير كلمة المرور'); onClose() },
    onError: err => toast.error(err?.message || 'خطأ')
  })
  return (
    <Modal open={true} onClose={onClose} title={`تغيير كلمة مرور: ${userName}`}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
        <button className="btn btn-primary" onClick={() => reset.mutate()} disabled={reset.isPending || pw.length < 8}>
          {reset.isPending ? 'جاري...' : 'تغيير'}
        </button>
      </>}>
      <div className="form-group">
        <label className="form-label">كلمة المرور الجديدة (8 أحرف على الأقل)</label>
        <input className="form-input" type="password" value={pw} onChange={e=>setPw(e.target.value)} dir="ltr" />
      </div>
    </Modal>
  )
}
