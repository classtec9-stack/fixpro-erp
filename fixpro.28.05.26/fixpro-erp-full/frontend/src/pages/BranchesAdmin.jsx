import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useBranch } from '../context/BranchContext'
import { useNavigate } from 'react-router-dom'
import { Building, Users, Wrench, Package, ArrowLeft, Plus } from 'lucide-react'

export default function BranchesAdmin() {
  const { setSelectedBranch, branches } = useBranch()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['branches-overview'],
    queryFn: () => api.get('/branches/overview'),
  })
  const overview = data?.data || []

  const enterBranch = (branchId) => {
    setSelectedBranch(branchId)
    navigate('/')
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">🏢 إدارة الفروع</div>
          <div className="page-sub">{branches.length} فرع مسجّل</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/branches/new')}>
          <Plus size={14}/> إضافة فرع
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
        {(overview.length ? overview : branches).map(b => (
          <div key={b.id} className="card" style={{ cursor:'pointer', transition:'all .2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--blue)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
            onClick={() => enterBranch(b.id)}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <div style={{ fontWeight:700, color:'var(--text-2)', fontSize:16 }}>{b.name}</div>
                {b.city && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>📍 {b.city}</div>}
                {b.phone && <div style={{ fontSize:12, color:'var(--muted)' }}>📞 {b.phone}</div>}
              </div>
              <div style={{
                width:40, height:40, borderRadius:'50%',
                background: b.is_active !== false ? 'var(--green-dim)' : 'var(--red-dim)',
                display:'flex', alignItems:'center', justifyContent:'center'
              }}>
                <Building size={18} color={b.is_active !== false ? 'var(--green)' : 'var(--red)'}/>
              </div>
            </div>

            {/* إحصائيات الفرع */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
              {[
                { icon:<Wrench size={14}/>, label:'تذاكر نشطة', val: b.active_tickets ?? '—', color:'var(--blue)' },
                { icon:<Users size={14}/>, label:'موظفون',       val: b.staff_count   ?? '—', color:'var(--purple)' },
                { icon:<Package size={14}/>, label:'أصناف',      val: b.parts_count   ?? '—', color:'var(--amber)' },
              ].map((s,i) => (
                <div key={i} style={{ background:'var(--ink-3)', borderRadius:8, padding:'8px', textAlign:'center' }}>
                  <div style={{ color:s.color, marginBottom:3 }}>{s.icon}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:s.color, fontFamily:'var(--mono)' }}>{s.val}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            <button className="btn btn-primary w-full" style={{ justifyContent:'center' }}
              onClick={e => { e.stopPropagation(); enterBranch(b.id) }}>
              <ArrowLeft size={14}/> دخول الفرع
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
