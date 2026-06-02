import { Component } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BranchProvider } from './context/BranchContext'
import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'

// ── ErrorBoundary يمسك الأخطاء ────────────────────────
class ErrorBoundary extends Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(e) { return { hasError: true, error: e } }
  componentDidCatch(e, info) { console.error('Page Error:', e, info) }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding:40, textAlign:'center', direction:'rtl' }}>
        <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
        <div style={{ fontSize:16, fontWeight:700, color:'#E8EDF3', marginBottom:8 }}>
          حدث خطأ في هذه الصفحة
        </div>
        <div style={{ fontSize:12, color:'#7A8BA3', marginBottom:20, fontFamily:'monospace', maxWidth:500, margin:'0 auto 20px' }}>
          {this.state.error?.message}
        </div>
        <button onClick={() => this.setState({ hasError:false, error:null })}
          style={{ padding:'10px 24px', background:'#3B82F6', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:14 }}>
          إعادة المحاولة
        </button>
      </div>
    )
    return this.props.children
  }
}

// ── استيراد الصفحات ───────────────────────────────────
import Dashboard      from './pages/Dashboard'
import TicketsPage    from './pages/Tickets'
import LoginPage      from './pages/Login'
import CustomerPortal from './pages/CustomerPortal'
import BookingPage    from './pages/BookingPage'
import SettingsPage   from './pages/Settings'
import NotificationsPage from './pages/Notifications'
import InvoicesPage   from './pages/Invoices'
import BranchesPage   from './pages/Branches'
import BranchesAdmin  from './pages/BranchesAdmin'
import PrintCenter    from './pages/PrintCenter'
import ShopSettings   from './pages/ShopSettings'
import TechniciansPage from './pages/Technicians'
import PrinterSettings from './pages/PrinterSettings'
import WhatsAppSettings from './pages/WhatsAppSettings'
import AppointmentsPage from './pages/Appointments'
import ServicePricesPage from './pages/ServicePrices'
import DevicesPage    from './pages/Devices'
import BranchSelector from './components/BranchSelector'
import { CustomersPage, InventoryPage, ReportsPage } from './pages/other'

function ProtectedLayout() {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('token')
    if (!token) return
    const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
    const fetch_ = () => {
      fetch(`${API}/notifications/count`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).then(d => setUnreadCount(d.count || 0)).catch(() => {})
    }
    fetch_()
    const t = setInterval(fetch_, 30000)
    return () => clearInterval(t)
  }, [user])

  if (!user) return <Navigate to="/login" replace />

  return (
    <BranchProvider>
    <div className="layout">
      <Sidebar unreadNotifications={unreadCount} />
      <div className="main-content">
        <div className="topbar">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text-2)' }}>
              Fix<span style={{ color:'var(--blue)' }}>Pro</span>
            </span>
            <BranchSelector />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', boxShadow:'0 0 6px var(--green)' }}/>
            <span style={{ fontSize:11, color:'var(--muted)' }}>متصل</span>
          </div>
        </div>
        <ErrorBoundary>
          <Routes>
            <Route path="/"               element={<Dashboard />} />
            <Route path="/tickets"        element={<TicketsPage />} />
            <Route path="/devices"        element={<DevicesPage />} />
            <Route path="/customers"      element={<CustomersPage />} />
            <Route path="/inventory"      element={<InventoryPage />} />
            <Route path="/invoices"       element={<InvoicesPage />} />
            <Route path="/reports"        element={<ReportsPage />} />
            <Route path="/technicians"    element={<TechniciansPage />} />
            <Route path="/notifications"  element={<NotificationsPage />} />
            <Route path="/print"          element={<PrintCenter />} />
            <Route path="/shop-settings"  element={<ShopSettings />} />
            <Route path="/settings"       element={<SettingsPage />} />
            <Route path="/printer-settings" element={<PrinterSettings />} />
            <Route path="/branches"       element={<BranchesAdmin />} />
            <Route path="/whatsapp"       element={<WhatsAppSettings />} />
            <Route path="/appointments"   element={<AppointmentsPage />} />
            <Route path="/service-prices" element={<ServicePricesPage />} />
            <Route path="*"               element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </div>
    </BranchProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"     element={<LoginPage />} />
        <Route path="/track"     element={<CustomerPortal />} />
        <Route path="/track/:id" element={<CustomerPortal />} />
        <Route path="/book"      element={<BookingPage />} />
        <Route path="/*"         element={<ProtectedLayout />} />
      </Routes>
    </AuthProvider>
  )
}
