const { query } = require('../config/database');

/**
 * نظام إشعارات موحّد
 * الأولويات: low | normal | high | critical
 * الأنواع:   general | status_change | device_ready | part_request | customer_review | low_stock | sla_breach
 */

async function notifyRole({ branchId, roles = [], type = 'general', message, orderId = null, priority = 'normal' }) {
  try {
    const rolesArr   = Array.isArray(roles) ? roles : [roles];
    const allRoles   = [...new Set([...rolesArr, 'admin', 'branch_manager'])];
    const safeBranch = typeof branchId === 'string' && branchId.length === 36 ? branchId : null;

    const { rows: users } = await query(
      `SELECT DISTINCT id FROM users
       WHERE is_active = true
         AND (
           role::text = 'admin'
           OR (role::text = ANY($1::text[]) AND ($2::text IS NULL OR branch_id::text = $2::text))
         )`,
      [allRoles, safeBranch]
    );

    for (const u of users) {
      await query(
        `INSERT INTO notifications
           (order_id, channel, recipient, message, status, type, is_read, priority)
         VALUES ($1, 'internal', $2, $3, 'sent', $4, false, $5)`,
        [orderId || null, u.id.toString(), message, type, priority]
      ).catch(e => console.warn('[notify] INSERT failed:', e.message));
    }

    if (users.length > 0) {
      console.log(`[notify] ${type}/${priority} → ${users.length} users | ${message.substring(0,60)}`);
    }
  } catch (err) {
    console.error('[notify] notifyRole ERROR:', err.message);
  }
}

async function notifyUser({ userId, type = 'general', message, orderId = null, priority = 'normal' }) {
  try {
    await query(
      `INSERT INTO notifications (order_id, channel, recipient, message, status, type, is_read, priority)
       VALUES ($1, 'internal', $2, $3, 'sent', $4, false, $5)`,
      [orderId || null, userId.toString(), message, type, priority]
    );
  } catch (err) {
    console.error('[notify] notifyUser ERROR:', err.message);
  }
}

// ── أحداث النظام الكاملة ──────────────────────────────────
const events = {

  newTicket: (branchId, orderId, orderNum, customerName, deviceName) =>
    notifyRole({ branchId, orderId,
      roles: ['receptionist'],
      type: 'status_change', priority: 'normal',
      message: `🔖 تذكرة جديدة ${orderNum} | ${customerName} | ${deviceName}` }),

  statusChanged: (branchId, orderId, orderNum, newStatus, techName) => {
    const labels = {
      new: 'تم الاستلام', diagnosing: 'قيد الفحص',
      in_repair: 'داخل الورشة', waiting_part: 'ينتظر قطعة',
      waiting_approval: 'انتظار موافقة العميل',
      part_transferred: 'القطعة في الطريق',
      ready: 'جاهز للتسليم ✅',
      delivered: 'تم التسليم',
      rejected: 'مرفوض', cancelled: 'ملغي',
    };
    const priority = newStatus === 'ready' ? 'high' : 'normal';
    return notifyRole({ branchId, orderId,
      roles: ['receptionist'],
      type: 'status_change', priority,
      message: `📊 ${orderNum}: ${labels[newStatus] || newStatus}${techName ? ` (${techName})` : ''}` });
  },

  customerApprovalNeeded: (branchId, orderId, orderNum, customerName, customerPhone, note = '') =>
    notifyRole({ branchId, orderId,
      roles: ['customer_service', 'receptionist'],
      type: 'customer_review', priority: 'high',
      message: `📞 موافقة عميل: ${customerName} (${customerPhone}) | ${orderNum}${note ? ` | ${note}` : ''}` }),

  partRequested: (branchId, orderId, orderNum, partName, techName) =>
    notifyRole({ branchId, orderId,
      roles: ['warehouse'],
      type: 'part_request', priority: 'high',
      message: `📦 طلب قطعة: ${partName} | التذكرة ${orderNum} | الفني: ${techName}` }),

  partTransferred: (branchId, orderId, orderNum, partName) =>
    notifyRole({ branchId, orderId,
      roles: ['technician'],
      type: 'part_request', priority: 'high',
      message: `📦 وصلت قطعة: ${partName} للتذكرة ${orderNum} — أكّد الاستلام` }),

  deviceReady: (branchId, orderId, orderNum, customerName, customerPhone) =>
    notifyRole({ branchId, orderId,
      roles: ['receptionist', 'customer_service'],
      type: 'device_ready', priority: 'high',
      message: `✅ جهاز جاهز: ${customerName} (${customerPhone}) | ${orderNum}` }),

  newInvoice: (branchId, orderId, amount) =>
    notifyRole({ branchId, orderId,
      roles: ['accountant'],
      type: 'general', priority: 'normal',
      message: `🧾 فاتورة جديدة: ${Number(amount).toLocaleString('ar-SA')} ريال` }),

  paymentReceived: (branchId, orderId, amount, method, customerName) => {
    const methods = {
      cash: 'نقد', card: 'بطاقة', bank_transfer: 'تحويل',
      stc_pay: 'STC Pay', mada: 'مدى', apple_pay: 'Apple Pay',
    };
    return notifyRole({ branchId, orderId,
      roles: ['accountant'],
      type: 'general', priority: 'low',
      message: `💰 دفعة: ${Number(amount).toLocaleString('ar-SA')} ريال (${methods[method] || method}) | ${customerName}` });
  },

  lowStock: (branchId, partName, qty) =>
    notifyRole({ branchId,
      roles: ['warehouse'],
      type: 'low_stock',
      priority: qty === 0 ? 'critical' : 'high',
      message: qty === 0
        ? `🚨 نفد المخزون: ${partName}`
        : `⚠️ مخزون منخفض: ${partName} — متبقي ${qty} فقط` }),

  newAppointment: (branchId, customerName, dateTime, phone) =>
    notifyRole({ branchId,
      roles: ['receptionist'],
      type: 'general', priority: 'low',
      message: `📅 حجز جديد: ${customerName} (${phone}) | ${dateTime}` }),

  ticketOverdue: (branchId, orderId, orderNum, days) =>
    notifyRole({ branchId, orderId,
      roles: [],
      type: 'sla_breach',
      priority: days > 7 ? 'critical' : 'high',
      message: `🕐 تذكرة متأخرة ${days} يوم: ${orderNum}` }),

  transferRequest: (toBranchId, fromBranchName, itemsCount, transferNumber) =>
    notifyRole({ branchId: toBranchId,
      roles: ['warehouse'],
      type: 'part_request', priority: 'normal',
      message: `📦 طلب تحويل مخزون ${transferNumber} — ${itemsCount} صنف من ${fromBranchName}` }),
};

module.exports = { notifyRole, notifyUser, events };
