const { query } = require('../config/database');

/**
 * نظام إشعارات موحّد — المدير ومشرف الفرع يتلقون كل شيء
 * الأولويات: low | normal | high | critical
 */

async function notifyRole({ branchId, roles, type, message, orderId = null, priority = 'normal' }) {
  try {
    const rolesArr = Array.isArray(roles) ? roles : [roles];
    const allRoles = [...new Set([...rolesArr, 'admin', 'branch_manager'])];

    const { rows: users } = await query(
      `SELECT DISTINCT id FROM users
       WHERE is_active = true
         AND (
           -- المدير يتلقى كل الإشعارات بغض النظر عن الفرع
           role = 'admin'
           OR
           -- باقي الأدوار: نفس الفرع فقط
           (role = ANY($1::text[]) AND ($2::uuid IS NULL OR branch_id = $2))
         )`,
      [allRoles, branchId || null]
    );

    for (const u of users) {
      await query(
        `INSERT INTO notifications
           (order_id, channel, recipient, message, status, type, is_read, priority)
         VALUES ($1, 'internal', $2, $3, 'pending', $4, false, $5)`,
        [orderId, u.id.toString(), message, type, priority]
      ).catch(() => {});
    }
  } catch (err) {
    console.warn('[notify] error:', err.message);
  }
}

async function notifyUser({ userId, type, message, orderId = null, priority = 'normal' }) {
  try {
    await query(
      `INSERT INTO notifications (order_id, channel, recipient, message, status, type, is_read, priority)
       VALUES ($1, 'internal', $2, $3, 'pending', $4, false, $5)`,
      [orderId || null, userId.toString(), message, type, priority]
    );
  } catch (err) {
    console.warn('[notify] notifyUser error:', err.message);
  }
}

// ── كل أحداث النظام ─────────────────────────────────────
const events = {

  // تذكرة جديدة
  newTicket: (branchId, orderId, orderNum, customerName, deviceName) =>
    notifyRole({ branchId, orderId,
      roles: ['receptionist'],
      type: 'status_change',
      priority: 'normal',
      message: `🔖 تذكرة جديدة ${orderNum} | ${customerName} | ${deviceName}` }),

  // تغيير حالة
  statusChanged: (branchId, orderId, orderNum, newStatus, techName) => {
    const labels = {
      new:'تم الاستلام', diagnosing:'قيد الفحص', in_repair:'داخل الورشة',
      waiting_part:'ينتظر قطعة', waiting_approval:'انتظار موافقة العميل',
      part_transferred:'القطعة في الطريق', ready:'جاهز للتسليم ✅',
      delivered:'تم التسليم', rejected:'مرفوض', cancelled:'ملغي'
    };
    const priority = newStatus === 'ready' ? 'high' : 'normal';
    return notifyRole({ branchId, orderId,
      roles: ['receptionist'],
      type: 'status_change',
      priority,
      message: `📊 ${orderNum}: ${labels[newStatus] || newStatus}${techName ? ` (${techName})` : ''}` });
  },

  // طلب موافقة عميل
  customerApprovalNeeded: (branchId, orderId, orderNum, customerName, customerPhone) =>
    notifyRole({ branchId, orderId,
      roles: ['customer_service','receptionist'],
      type: 'customer_review',
      priority: 'high',
      message: `📞 طلب موافقة العميل: ${customerName} (${customerPhone}) | ${orderNum}` }),

  // طلب قطعة
  partRequested: (branchId, orderId, orderNum, partName, techName) =>
    notifyRole({ branchId, orderId,
      roles: ['warehouse'],
      type: 'part_request',
      priority: 'high',
      message: `📦 طلب قطعة: ${partName} | التذكرة ${orderNum} | الفني: ${techName}` }),

  // تم تحويل قطعة
  partTransferred: (branchId, orderId, orderNum, partName, warehouseName) =>
    notifyRole({ branchId, orderId,
      roles: ['technician'],
      type: 'part_request',
      priority: 'high',
      message: `📦 وصلت قطعة: ${partName} للتذكرة ${orderNum} — أكّد الاستلام` }),

  // جهاز جاهز
  deviceReady: (branchId, orderId, orderNum, customerName, customerPhone) =>
    notifyRole({ branchId, orderId,
      roles: ['receptionist','customer_service'],
      type: 'status_change',
      priority: 'high',
      message: `✅ جهاز جاهز: ${customerName} (${customerPhone}) | ${orderNum}` }),

  // فاتورة جديدة
  newInvoice: (branchId, orderId, amount) =>
    notifyRole({ branchId, orderId,
      roles: ['accountant'],
      type: 'general',
      priority: 'normal',
      message: `🧾 فاتورة جديدة: ${Number(amount).toLocaleString('ar-SA')} ريال` }),

  // دفعة مستلمة
  paymentReceived: (branchId, orderId, amount, method, customerName) => {
    const methods = { cash:'نقد', card:'بطاقة', transfer:'تحويل', stc:'STC Pay', mada:'مدى' };
    return notifyRole({ branchId, orderId,
      roles: ['accountant'],
      type: 'general',
      priority: 'low',
      message: `💰 دفعة: ${Number(amount).toLocaleString('ar-SA')} ريال (${methods[method]||method}) | ${customerName}` });
  },

  // مخزون منخفض
  lowStock: (branchId, partName, qty) =>
    notifyRole({ branchId,
      roles: ['warehouse'],
      type: 'part_request',
      priority: qty === 0 ? 'critical' : 'high',
      message: qty === 0
        ? `🚨 نفد المخزون: ${partName}`
        : `⚠️ مخزون منخفض: ${partName} — متبقي ${qty} فقط` }),

  // حجز جديد
  newAppointment: (branchId, customerName, dateTime, phone) =>
    notifyRole({ branchId,
      roles: ['receptionist'],
      type: 'general',
      priority: 'low',
      message: `📅 حجز جديد: ${customerName} (${phone}) | ${dateTime}` }),

  // تأخر تذكرة
  ticketOverdue: (branchId, orderId, orderNum, days) =>
    notifyRole({ branchId, orderId,
      roles: [],
      type: 'general',
      priority: days > 7 ? 'critical' : 'high',
      message: `🕐 تذكرة متأخرة ${days} يوم: ${orderNum}` }),
};

module.exports = { notifyRole, notifyUser, events };
