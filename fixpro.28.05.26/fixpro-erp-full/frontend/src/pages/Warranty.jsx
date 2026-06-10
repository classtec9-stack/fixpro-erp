// frontend/src/pages/Warranty.jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { Loading, EmptyState, Pagination } from '../components/ui'
import { Shield, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

const CLAIM_TYPE_AR = {
  same_defect:      'نفس المشكلة',
  part_replacement: 'قطعة معيبة',
  technician_fault: 'خطأ فني',
  new_issue:        'عطل جديد',
}

export default function WarrantyPage() {
  const [page, setPage]         = useState(1)
  const [typeFilter, setType]   = useState('')
  const [freeFilter, setFree]   = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['warranty-claims', page, typeFilter, freeFilter],
    queryFn: () => api.get(
      `/warranty?page=${page}&limit=20` +
      (typeFilter ? `&claim_type=${typeFilter}` : '') +
      (freeFilter !== '' ? `&is_free=${freeFilter}` : '')
    ),
    keepPreviousData: true,
  })

  const claims     = data?.data       || []
  const pagination = data?.pagination || {}

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">سجل الضمانات</div>
          <div className="page-sub">{pagination.total || 0} مطالبة</div>
        </div>
      </div>

      {/* فلاتر */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <select className="form-select" value={typeFilter}
          onChange={e => { setType(e.target.value); setPage(1) }}>
          <option value="">كل الأنواع</option>
          <option value="same_defect">نفس المشكلة</option>
          <option value="part_replacement">قطعة معيبة</option>
          <option value="technician_fault">خطأ فني</option>
          <option value="new_issue">عطل جديد</option>
        </select>
        <select className="form-select" value={freeFilter}
          onChange={e => { setFree(e.target.value); setPage(1) }}>
          <option value="">مجاني ومدفوع</option>
          <option value="true">مجاني فقط</option>
          <option value="false">مدفوع فقط</option>
        </select>
      </div>

      {/* الجدول */}
      {isLoading ? <Loading/> : !claims.length ? (
        <EmptyState icon={Shield} message="لا توجد مطالبات ضمان"/>
      ) : (
        <div className="card" style={{ padding:0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>التذكرة الأصلية</th>
                  <th>العميل</th>
                  <th>الجهاز</th>
                  <th>نوع المطالبة</th>
                  <th>النوع</th>
                  <th>تذكرة الضمان</th>
                  <th>بواسطة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {claims.map(w => (
                  <tr key={w.id}>
                    <td style={{ fontFamily:'var(--mono)', color:'var(--blue)', fontWeight:600 }}>
                      {w.original_order_number}
                    </td>
                    <td>
                      <div style={{ fontWeight:500 }}>{w.customer_name}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{w.customer_phone}</div>
                    </td>
                    <td style={{ fontSize:13 }}>
                      {w.brand} {w.model}
                    </td>
                    <td>
                      <span style={{
                        padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                        background: w.claim_type === 'technician_fault' ? 'rgba(239,68,68,.1)' :
                                    w.claim_type === 'part_replacement'  ? 'rgba(245,158,11,.1)' :
                                    'rgba(59,130,246,.1)',
                        color: w.claim_type === 'technician_fault' ? 'var(--red)' :
                               w.claim_type === 'part_replacement'  ? 'var(--amber)' :
                               'var(--blue)'
                      }}>
                        {CLAIM_TYPE_AR[w.claim_type] || w.claim_type}
                      </span>
                    </td>
                    <td>
                      {w.is_free
                        ? <span style={{ color:'var(--green)', fontSize:12, fontWeight:600 }}>🆓 مجاني</span>
                        : <span style={{ color:'var(--amber)', fontSize:12, fontWeight:600 }}>💰 مدفوع</span>
                      }
                    </td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--muted)' }}>
                      {w.warranty_order_number || '—'}
                    </td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>
                      {w.created_by_name}
                    </td>
                    <td style={{ fontSize:11, color:'var(--muted)', fontFamily:'var(--mono)' }}>
                      {new Date(w.created_at).toLocaleDateString('ar-SA')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} pages={pagination.pages} onPage={setPage}/>
    </div>
  )
}
