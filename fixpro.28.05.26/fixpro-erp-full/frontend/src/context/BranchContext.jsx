import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

const BranchContext = createContext(null)

export function BranchProvider({ children }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [branches, setBranches]             = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)

  useEffect(() => {
    if (!user) return
    if (user.role === 'admin') {
      api.get('/branches').then(d => {
        setBranches(d.data || [])
        const saved = sessionStorage.getItem('selected_branch') || 'all'
        if (!selectedBranch) setSelectedBranch(saved)
      }).catch(() => {})
    } else {
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
    qc.clear() // إلغاء كل الـ cache عند الخروج من الفرع
  }

  const selectBranch = (id) => {
    setSelectedBranch(id)
    sessionStorage.setItem('selected_branch', id)
    qc.clear() // إلغاء كل الـ cache عند تبديل الفرع — يُجبر كل الصفحات على إعادة الجلب
  }

  const currentBranch    = branches.find(b => b.id === selectedBranch) || null
  const isAllBranches    = selectedBranch === 'all'
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
