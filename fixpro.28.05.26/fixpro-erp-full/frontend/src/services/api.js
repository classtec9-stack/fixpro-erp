import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: { 'Content-Type': 'application/json' }
})

// Request: أضف التوكن + branch_id إذا اختار المدير فرعاً
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const selectedBranch = sessionStorage.getItem('selected_branch')
  if (selectedBranch && selectedBranch !== 'all') {
    config.headers['X-Branch-ID'] = selectedBranch
  }
  return config
})

// Response: معالجة الأخطاء
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err.response?.data || err)
  }
)

export default api
