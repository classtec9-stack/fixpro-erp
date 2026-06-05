import { X } from 'lucide-react'

// ── Status Badge ─────────────────────────────────
const STATUS_MAP = {
  new:          { label: 'جديد',           cls: 'badge-new' },
  diagnosing:   { label: 'قيد الفحص',     cls: 'badge-diag' },
  in_repair:    { label: 'قيد الإصلاح',   cls: 'badge-repair' },
  waiting_part: { label: 'انتظار قطعة',   cls: 'badge-wait' },
  waiting_approval: { label: 'انتظار موافقة', cls: 'badge-wait' },
  part_transferred: { label: 'القطعة في الطريق', cls: 'badge-diag' },
  awaiting_technician_rejection: { label: 'انتظار الفني', cls: 'badge-cancel' },
  ready:        { label: 'جاهز',           cls: 'badge-ready' },
  delivered:    { label: 'تم التسليم',    cls: 'badge-done' },
  cancelled:    { label: 'ملغي',           cls: 'badge-cancel' },
  rejected:     { label: 'مرفوض',          cls: 'badge-cancel' },
}

const PRIORITY_MAP = {
  normal:  { label: 'عادي',  cls: 'badge-normal' },
  urgent:  { label: 'عاجل',  cls: 'badge-urgent' },
  vip:     { label: 'VIP',   cls: 'badge-vip' },
}

const INVOICE_MAP = {
  draft:     { label: 'مسودة',       cls: 'badge-normal' },
  pending:   { label: 'معلق',        cls: 'badge-pending' },
  paid:      { label: 'مدفوع',       cls: 'badge-paid' },
  partial:   { label: 'دفع جزئي',   cls: 'badge-repair' },
  cancelled: { label: 'ملغي',        cls: 'badge-cancel' },
}

export function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: '' }
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

export function PriorityBadge({ priority }) {
  const p = PRIORITY_MAP[priority] || { label: priority, cls: '' }
  return <span className={`badge ${p.cls}`}>{p.label}</span>
}

export function InvoiceBadge({ status }) {
  const s = INVOICE_MAP[status] || { label: status, cls: '' }
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

// ── Modal ─────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, maxWidth = 560 }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────
export function EmptyState({ icon: Icon, message = 'لا توجد بيانات', sub }) {
  return (
    <div className="empty-state">
      {Icon && <Icon />}
      <p style={{ color: 'var(--text-2)', marginBottom: 4 }}>{message}</p>
      {sub && <p style={{ fontSize: 12 }}>{sub}</p>}
    </div>
  )
}

// ── Loading ───────────────────────────────────────
export function Loading() {
  return <div className="loading-row"><div className="loading-spinner" /></div>
}

// ── Stat Card ─────────────────────────────────────
export function StatCard({ label, value, sub, subType, color = 'blue', icon: Icon }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {sub && <div className={`stat-sub ${subType || ''}`}>{sub}</div>}
    </div>
  )
}

// ── Pagination ────────────────────────────────────
export function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '14px 0' }}>
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>السابق</button>
      <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>صفحة {page} من {pages}</span>
      <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>التالي</button>
    </div>
  )
}
