import { createContext, useContext, useState } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

// تطبيع بيانات المستخدم للتوافق مع كلا الصيغتين
function normalizeUser(u) {
  if (!u) return null;
  return {
    ...u,
    fullName:   u.fullName   || u.full_name  || '',
    branchId:   u.branchId   || u.branch_id  || null,
    branchName: u.branchName || u.branch_name || '',
    avatarUrl:  u.avatarUrl  || u.avatar_url  || null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return normalizeUser(JSON.parse(localStorage.getItem('user'))) } catch { return null }
  })
  const [loading, setLoading] = useState(false)

  const login = async (email, password) => {
    setLoading(true)
    try {
      const data = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      const normalized = normalizeUser(data.user)
      localStorage.setItem('user', JSON.stringify(normalized))
      setUser(normalized)
      return data
    } finally { setLoading(false) }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
