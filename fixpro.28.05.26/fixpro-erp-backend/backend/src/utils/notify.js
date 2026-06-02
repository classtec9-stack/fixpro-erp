const { query } = require('../config/database');

/**
 * نظام إشعارات موحّد — المدير ومشرف الفرع يتلقون كل شيء
 */

async function notifyRole({ branchId, roles, type, message, orderId = null }) {
  try {
    const rolesArr = Array.isArray(roles) ? roles : [roles];
    // دائماً أضف admin و branch_manager
    const allRoles = [...new Set([...rolesArr, 'admin', 'branch_manager'])];

    const { rows: users } = await query(
      `SELECT DISTINCT id FROM users
       WHERE role = ANY($1::text[])
         AND is_active = true
         AND ($2::uuid IS NULL OR branch_id = $2 OR role = 'admin')`,
      [allRoles, branchId || null]
    );

    for (const u of users) {
      await query(
        `INSERT INTO notifications
           (order_id, channel, recipient, message, status, type, is_read)
         VALUES ($1, 'internal', $2, $3, 'pending', $4, false)`,
        [orderId, u.id.toString(), message, type]
      ).catch(() => {});
    }
  } catch (err) {
    console.warn('[notify] error:', err.message);
  }
}

async function notifyUser({ userId, type, message, orderId = null }) {
  try {
    await query(
      `INSERT INTO notifications (order_id, channel, recipient, message, status, type, is_read)
       VALUES ($1, 'internal', $2, $3, 'pending', $4, false)`,
      [orderId || null, userId.toString(), message, type]
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
      message: `🔖 تذكرة جديدة ${orderNum} | ${customerName} | ${deviceName}` }),

  // تغيير حالة
  statusChanged: (branchId, orderId, orderNum, newStatus, techName) => {
    const labels = {
      new:'تم الاستلام', diagnosing:'قيد الفحص', in_repair:'داخل الورشة',
      waiting_part:'ينتظر قطعة', waiting_approval:'انتظار موافقة العميل',
      part_transferred:'القطعة في الطريق', ready:'جاهز للتسليم ✅',
      delivered:'تم التسليم', rejected:'مرفوض', cancelled:'ملغي'
    };
    return notifyRole({ branchId, orderId,
      roles: ['receptionist'],
      type: 'status_change',
      message: `📊 ${orderNum}: ${labels[newStatus] || newStatus}${techName ? ` (${techName})` : ''}` });
  },

  // طلب موافقة عميل
  customerApprovalNeeded: (branchId, orderId, orderNum, customerName, customerPhone) =>
    notifyRole({ branchId, orderId,
      roles: ['customer_service','receptionist'],
      type: 'customer_review',
      message: `📞 طلب موافقة العميل: ${customerName} (${customerPhone}) | ${orderNum}` }),

  // طلب قطعة
  partRequested: (branchId, orderId, orderNum, partName, techName) =>
    notifyRole({ branchId, orderId,
      roles: ['warehouse'],
      type: 'part_request',
      message: `📦 طلب قطعة: ${partName} | التذكرة ${orderNum} | الفني: ${techName}` }),

  // تم تحويل قطعة
  partTransferred: (branchId, orderId, orderNum, partName, warehouseName) =>
    notifyRole({ branchId, orderId,
      roles: ['technician'],
      type: 'part_request',
      message: `📦 وصلت قطعة: ${partName} للتذكرة ${orderNum} — أكّد الاستلام` }),

  // جهاز جاهز
  deviceReady: (branchId, orderId, orderNum, customerName, customerPhone) =>
    notifyRole({ branchId, orderId,
      roles: ['receptionist','customer_service'],
      type: 'status_change',
      message: `✅ جهاز جاهز: ${customerName} (${customerPhone}) | ${orderNum}` }),

  // فاتورة جديدة
  newInvoice: (branchId, orderId, amount) =>
    notifyRole({ branchId, orderId,
      roles: ['accountant'],
      type: 'general',
      message: `🧾 فاتورة جديدة: ${Number(amount).toLocaleString('ar-SA')} ريال` }),

  // دفعة مستلمة
  paymentReceived: (branchId, orderId, amount, method, customerName) => {
    const methods = { cash:'نقد', card:'بطاقة', transfer:'تحويل', stc:'STC Pay', mada:'مدى' };
    return notifyRole({ branchId, orderId,
      roles: ['accountant'],
      type: 'general',
      message: `💰 دفعة: ${Number(amount).toLocaleString('ar-SA')} ريال (${methods[method]||method}) | ${customerName}` });
  },

  // مخزون منخفض
  lowStock: (branchId, partName, qty) =>
    notifyRole({ branchId,
      roles: ['warehouse'],
      type: 'part_request',
      message: `⚠️ مخزون منخفض: ${partName} — متبقي ${qty} فقط` }),

  // حجز جديد
  newAppointment: (branchId, customerName, dateTime, phone) =>
    notifyRole({ branchId,
      roles: ['receptionist'],
      type: 'general',
      message: `📅 حجز جديد: ${customerName} (${phone}) | ${dateTime}` }),

  // تأخر تذكرة
  ticketOverdue: (branchId, orderId, orderNum, days) =>
    notifyRole({ branchId, orderId,
      roles: [],  // admin و branch_manager فقط
      type: 'general',
      message: `🕐 تذكرة متأخرة ${days} يوم: ${orderNum}` }),
};

module.exports = { notifyRole, notifyUser, events };
