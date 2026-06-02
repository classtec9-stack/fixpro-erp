import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import api from '../services/api'

const BranchContext = createContext(null)

export function BranchProvider({ children }) {
  const { user } = useAuth()
  const [branches, setBranches]         = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)

  useEffect(() => {
    if (!user) return
    if (user.role === 'admin') {
      // المدير يجلب كل الفروع
      api.get('/branches').then(d => {
        setBranches(d.data || [])
        // إذا لم يختر فرعاً بعد، اختر "كل الفروع"
        const saved = sessionStorage.getItem('selected_branch') || 'all'
        if (!selectedBranch) setSelectedBranch(saved)
      }).catch(() => {})
    } else {
      // باقي الأدوار — فرعهم فقط
      const bid = user.branch_id || user.branchId
      if (bid) {
        const bname = user.branch_name || user.branchName || 'الفرع'
        setBranches([{ id: bid, name: bname }])
        setSelectedBranch(bid)
      }
    }
  }, [user])

  const exitBranch = () => {
    setSelectedBranch('all')
    sessionStorage.setItem('selected_branch', 'all')
  }

  const selectBranch = (id) => {
    setSelectedBranch(id)
    sessionStorage.setItem('selected_branch', id)
  }

  const currentBranch = branches.find(b => b.id === selectedBranch) || null
  const isAllBranches = selectedBranch === 'all'
  const branchIdForQuery = isAllBranches ? null : selectedBranch

  return (
    <BranchContext.Provider value={{
      branches,
      selectedBranch,
      setSelectedBranch: selectBranch,
      currentBranch,
      isAllBranches,
      branchIdForQuery,
      exitBranch,
      isAdmin: user?.role === 'admin',
    }}>
      {children}
    </BranchContext.Provider>
  )
}

export const useBranch = () => useContext(BranchContext)
