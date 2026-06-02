import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, Wrench, Users, UserCheck, Package,
  Receipt, BarChart2, Bell, Settings, LogOut,
  Printer, Building, Sliders, Globe, MessageCircle, CalendarDays, Tags, Monitor
} from 'lucide-react'
import { useT } from '../utils/i18n'
import { useLang } from '../context/LangContext'

const NAV = [
  { section_ar:'الرئيسية', section_en:'Main', items:[
    { to:'/',              icon:LayoutDashboard, key:'dashboard',       roles:null },
    { to:'/tickets',       icon:Wrench,          key:'tickets',         roles:null },
    { to:'/devices',       icon:Monitor,         key:'devices',         roles:null },
  ]},
  { section_ar:'الإدارة', section_en:'Management', items:[
    { to:'/customers',     icon:Users,      key:'customers',     roles:['admin','branch_manager','receptionist','customer_service'] },
    { to:'/technicians',   icon:UserCheck,  key:'technicians',   roles:['admin','branch_manager'] },
    { to:'/inventory',     icon:Package,    key:'inventory',     roles:['admin','branch_manager','warehouse'] },
    { to:'/service-prices', icon:Tags,       key:'servicePrices', roles:['admin','branch_manager'] },
  ]},
  { section_ar:'المالية', section_en:'Finance', items:[
    { to:'/invoices',      icon:Receipt,    key:'invoices',      roles:['admin','branch_manager','accountant','receptionist'] },
    { to:'/reports',       icon:BarChart2,  key:'reports',       roles:['admin','branch_manager','accountant'] },
  ]},
  { section_ar:'النظام', section_en:'System', items:[
    { to:'/notifications', icon:Bell,       key:'notifications', roles:null, badge:true },
    { to:'/print',         icon:Printer,    key:'print',         roles:['admin','branch_manager','receptionist'] },
    { to:'/branches',      icon:Globe,      key:'branches',      roles:['admin'] },
    { to:'/appointments',  icon:CalendarDays,  key:'appointments', roles:['admin','branch_manager','receptionist'] },
    { to:'/whatsapp',      icon:MessageCircle, key:'whatsapp',   roles:['admin','branch_manager'] },
    { to:'/shop-settings', icon:Building,   key:'shopSettings',  roles:['admin','branch_manager'] },
    { to:'/printer-settings', icon:Sliders, key:'printerSettings', roles:['admin','branch_manager'] },
    { to:'/settings',      icon:Settings,   key:'settings',      roles:null },
  ]},
]

const ROLES_AR = { admin:'مدير النظام', branch_manager:'مشرف الفرع', receptionist:'موظف استقبال', technician:'مهندس صيانة', customer_service:'خدمة العملاء', warehouse:'مسؤول المخزن', accountant:'محاسب' }
const ROLES_EN = { admin:'System Admin', branch_manager:'Branch Manager', receptionist:'Receptionist', technician:'Technician', customer_service:'Customer Service', warehouse:'Warehouse', accountant:'Accountant' }

export default function Sidebar({ unreadNotifications = 0 }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { lang } = useLang()
  const { t, isEn } = useT()

  const canSee = (roles) => !roles || roles.includes(user?.role)
  const initials = user?.fullName?.split(' ').slice(0,2).map(n=>n[0]).join('') || 'م'
  const roleLabel = isEn ? ROLES_EN[user?.role] : ROLES_AR[user?.role]

  return (
    <aside className="sidebar" key={lang}>
      <div className="sidebar-logo">
        <div className="logo-mark">Fix<span>Pro</span></div>
        <div className="logo-sub">{isEn ? 'Maintenance Management' : 'نظام إدارة الصيانة'}</div>
      </div>

      <nav style={{ flex:1, padding:'8px' }}>
        {NAV.map(section => (
          <div key={section.section_ar} className="nav-section">
            <span className="nav-label">{isEn ? section.section_en : section.section_ar}</span>
            {section.items.filter(i => canSee(i.roles)).map(({ to, icon:Icon, key, badge }) => (
              <NavLink key={to} to={to} end={to==='/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <Icon size={15}/>
                <span>{t(key)}</span>
                {badge && unreadNotifications > 0 && (
                  <span className="nav-badge">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', marginBottom:4 }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--blue-dim)', border:'1px solid rgba(59,130,246,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'var(--blue)', flexShrink:0 }}>
            {initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.fullName}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>{roleLabel}</div>
          </div>
        </div>
        <button className="nav-item w-full" style={{ border:'none', background:'none', cursor:'pointer', color:'var(--muted-2)' }} onClick={() => { logout(); navigate('/login') }}>
          <LogOut size={14}/><span>{t('logout')}</span>
        </button>
      </div>
    </aside>
  )
}
