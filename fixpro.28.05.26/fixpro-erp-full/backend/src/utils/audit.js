const { query } = require('../config/database');

/**
 * تسجيل إجراء في سجل التدقيق
 * @param {Object} params
 */
async function audit({ entityType, entityId, action, oldValue, newValue, performedBy, req }) {
  try {
    const ip = req?.ip || req?.headers?.['x-forwarded-for'] || null;
    await query(
      `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entityType,
        entityId,
        action,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        performedBy || null,
        ip,
      ]
    );
  } catch (err) {
    // لا نوقف العملية إذا فشل التسجيل
    console.warn('Audit log warning:', err.message);
  }
}

/**
 * جلب سجل التدقيق لكيان معين
 */
async function getAuditLog(entityType, entityId, limit = 50) {
  const { rows } = await query(
    `SELECT a.*, u.full_name as performed_by_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.performed_by
     WHERE a.entity_type = $1 AND a.entity_id = $2
     ORDER BY a.created_at DESC
     LIMIT $3`,
    [entityType, entityId, limit]
  );
  return rows;
}

module.exports = { audit, getAuditLog };
