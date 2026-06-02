import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, ClipboardList, Users, UserCheck,
  Package, Receipt, BarChart2, Bell, Settings, LogOut, Wrench
} from 'lucide-react'

const NAV = [
  {
    label: 'الرئيسية',
    items: [
      { to: '/',             icon: LayoutDashboard, label: 'لوحة التحكم' },
      { to: '/orders',       icon: ClipboardList,   label: 'الأوردرات' },
    ]
  },
  {
    label: 'الإدارة',
    items: [
      { to: '/customers',    icon: Users,       label: 'العملاء' },
      { to: '/technicians',  icon: UserCheck,   label: 'الفنيين' },
      { to: '/inventory',    icon: Package,     label: 'المخزون' },
    ]
  },
  {
    label: 'المالية',
    items: [
      { to: '/invoices',     icon: Receipt,     label: 'الفواتير' },
      { to: '/reports',      icon: BarChart2,   label: 'التقارير' },
    ]
  },
  {
    label: 'النظام',
    items: [
      { to: '/notifications', icon: Bell,       label: 'الإشعارات' },
      { to: '/settings',      icon: Settings,   label: 'الإعدادات' },
    ]
  }
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  const initials = user?.fullName?.split(' ').slice(0, 2).map(n => n[0]).join('') || 'م'
  const roleLabels = {
    admin: 'مدير النظام', branch_manager: 'مشرف الفرع',
    receptionist: 'موظف استقبال', technician: 'فني',
    accountant: 'محاسب'
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">Fix<span>Pro</span></div>
        <div className="logo-sub">نظام إدارة الصيانة</div>
      </div>

      <nav style={{ flex: 1, padding: '8px' }}>
        {NAV.map(section => (
          <div key={section.label} className="nav-section">
            <span className="nav-label">{section.label}</span>
            {section.items.map(({ to, icon: Icon, label, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon size={15} />
                <span>{label}</span>
                {badge && <span className="nav-badge">{badge}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 4 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: 'var(--blue)', flexShrink: 0
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.fullName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{roleLabels[user?.role]}</div>
          </div>
        </div>
        <button className="nav-item w-full btn" style={{ border: 'none', background: 'none' }} onClick={handleLogout}>
          <LogOut size={14} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  )
}
