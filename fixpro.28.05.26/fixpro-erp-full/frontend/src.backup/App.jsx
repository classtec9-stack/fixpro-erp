import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import LoginPage from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import { CustomersPage, InventoryPage, InvoicesPage, ReportsPage } from './pages/other'
import { useQuery } from '@tanstack/react-query'
import api from './services/api'
import { Loading } from './components/ui'

function TechsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['techs'], queryFn: () => api.get('/technicians') })
  const techs = data?.data || []
  return (
    <div className="page fade-in">
      <div className="page-header"><div className="page-title">الفنيين</div></div>
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {isLoading ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>الاسم</th><th>البريد</th><th>الجوال</th><th>الأوردرات النشطة</th><th>الحالة</th></tr></thead>
              <tbody>
                {techs.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight:500, color:'var(--text-2)' }}>{t.full_name}</td>
                    <td className="font-mono text-sm">{t.email}</td>
                    <td className="font-mono text-sm">{t.phone || '—'}</td>
                    <td className="font-mono text-amber">{t.active_orders || 0}</td>
                    <td>{t.is_active ? <span className="badge badge-ready">نشط</span> : <span className="badge badge-cancel">موقوف</span>}</td>
                  </tr>
                ))}
                {!techs.length && <tr><td colSpan={5} style={{ textAlign:'center', padding:30, color:'var(--muted)' }}>لا يوجد فنيين</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function PlaceholderPage({ title }) {
  return (
    <div className="page fade-in">
      <div className="page-header"><div className="page-title">{title}</div></div>
      <div className="card" style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>🚧</div>
        <div>هذه الصفحة قيد التطوير</div>
      </div>
    </div>
  )
}

function ProtectedLayout() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <div className="topbar">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--muted)' }}>Fix<span style={{ color:'var(--blue)' }}>Pro</span> ERP</span>
            <span style={{ color:'var(--border-2)', fontSize:10 }}>|</span>
            <span style={{ fontSize:12, color:'var(--muted-2)' }}>{user.branchName || 'الفرع الرئيسي'}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', boxShadow:'0 0 6px var(--green)' }} />
            <span style={{ fontSize:11, color:'var(--muted)' }}>متصل</span>
          </div>
        </div>
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/orders"        element={<Orders />} />
          <Route path="/customers"     element={<CustomersPage />} />
          <Route path="/inventory"     element={<InventoryPage />} />
          <Route path="/invoices"      element={<InvoicesPage />} />
          <Route path="/reports"       element={<ReportsPage />} />
          <Route path="/technicians"   element={<TechsPage />} />
          <Route path="/notifications" element={<PlaceholderPage title="الإشعارات" />} />
          <Route path="/settings"      element={<PlaceholderPage title="الإعدادات" />} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*"     element={<ProtectedLayout />} />
      </Routes>
    </AuthProvider>
  )
}
