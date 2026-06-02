import { useBranch } from '../context/BranchContext'
import { useNavigate } from 'react-router-dom'
import { Building, X, ChevronDown } from 'lucide-react'

export default function BranchSelector() {
  const { selectedBranch, currentBranch, isAllBranches, isAdmin, exitBranch, setSelectedBranch, branches } = useBranch()
  const navigate = useNavigate()
  if (!isAdmin) return null

  // عند مشاهدة فرع محدد — شريط واضح مع زر الخروج
  if (!isAllBranches && currentBranch) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8,
        background:'rgba(59,130,246,.12)', border:'1px solid rgba(59,130,246,.3)',
        borderRadius:8, padding:'5px 12px' }}>
        <Building size={13} color="var(--blue)"/>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--blue)' }}>
          {currentBranch.name}
        </span>
        <button onClick={() => { exitBranch(); navigate('/branches') }}
          style={{ background:'none', border:'none', cursor:'pointer',
            color:'var(--muted)', padding:2, display:'flex', alignItems:'center' }}
          title="خروج من الفرع">
          <X size={13}/>
        </button>
      </div>
    )
  }

  // عند عرض كل الفروع — قائمة اختيار
  return (
    <div style={{ position:'relative', display:'inline-flex', alignItems:'center' }}>
      <Building size={13} color="var(--muted)" style={{ position:'absolute', right:10, pointerEvents:'none' }}/>
      <select value="all"
        onChange={e => { if(e.target.value !== 'all') setSelectedBranch(e.target.value) }}
        style={{ padding:'5px 28px 5px 24px', background:'var(--ink-3)',
          border:'1px solid var(--border)', borderRadius:8, color:'var(--muted-2)',
          fontSize:12, fontFamily:'var(--font)', cursor:'pointer', appearance:'none', minWidth:150 }}>
        <option value="all">🏢 اختر فرعاً...</option>
        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <ChevronDown size={12} color="var(--muted)" style={{ position:'absolute', left:8, pointerEvents:'none' }}/>
    </div>
  )
}
