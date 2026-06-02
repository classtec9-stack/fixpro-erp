/**
 * WhatsApp Business API Service
 * Meta Cloud API — https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * الإعداد:
 * 1. اذهب إلى developers.facebook.com
 * 2. أنشئ تطبيق → Business → WhatsApp
 * 3. احصل على WHATSAPP_TOKEN و WHATSAPP_PHONE_ID
 * 4. أضف في .env:
 *    WHATSAPP_TOKEN=EAAxxxxxxxx
 *    WHATSAPP_PHONE_ID=12345678901234
 *    WHATSAPP_VERIFY_TOKEN=fixpro_webhook_2025
 */

const logger = require('../utils/logger');

const WA_API   = 'https://graph.facebook.com/v18.0';
const TOKEN    = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const ENABLED  = !!(TOKEN && PHONE_ID);

// ── تنسيق رقم الهاتف ──────────────────────────────────
function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('05') && digits.length === 10) return '966' + digits.slice(1);
  if (digits.startsWith('5')  && digits.length === 9)  return '966' + digits;
  if (digits.startsWith('966'))                        return digits;
  if (digits.startsWith('00966'))                      return digits.slice(2);
  return digits.length >= 10 ? digits : null;
}

// ── إرسال رسالة نصية ──────────────────────────────────
async function sendText(to, text) {
  if (!ENABLED) {
    logger.warn(`WhatsApp disabled — would send to ${to}`);
    return { success: false, reason: 'WhatsApp not configured' };
  }
  const phone = formatPhone(to);
  if (!phone) return { success: false, reason: 'رقم هاتف غير صحيح' };

  try {
    const res = await fetch(`${WA_API}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      logger.error(`WhatsApp error: ${JSON.stringify(data)}`);
      return { success: false, error: data };
    }
    logger.info(`WhatsApp ✅ → ${phone}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    logger.error(`WhatsApp fetch error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ── رسائل جاهزة ───────────────────────────────────────
const MESSAGES = {
  ticket_received: (t, shopName, trackUrl) =>
    `مرحباً ${t.customer_name} 👋\n\n` +
    `✅ *تم استلام جهازك للصيانة*\n\n` +
    `📱 الجهاز: ${t.brand} ${t.model}\n` +
    `🔖 رقم التذكرة: *${t.order_number}*\n` +
    `🔧 المشكلة: ${t.problem_desc || 'سيتم التقييم'}\n\n` +
    `📍 تابع حالة جهازك:\n${trackUrl}\n\n${shopName}`,

  device_ready: (t, shopName) =>
    `مرحباً ${t.customer_name} 🎉\n\n` +
    `✅ *جهازك جاهز للاستلام!*\n\n` +
    `📱 ${t.brand} ${t.model}\n` +
    `🔖 التذكرة: *${t.order_number}*\n` +
    `${t.estimated_cost ? `💰 التكلفة: ${Number(t.estimated_cost).toLocaleString('ar-SA')} ريال\n` : ''}` +
    `\nيرجى الحضور في أقرب وقت.\n${shopName}`,

  approval_needed: (t, shopName, message) =>
    `مرحباً ${t.customer_name}\n\n` +
    `📋 *بخصوص جهازك: ${t.brand} ${t.model}*\n` +
    `🔖 التذكرة: *${t.order_number}*\n\n` +
    `${message || 'يحتاج الأمر لمراجعتك.'}\n\n${shopName}`,

  invoice_ready: (inv, shopName, trackUrl) =>
    `مرحباً ${inv.customer_name}\n\n` +
    `🧾 *فاتورة الصيانة*\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🔖 التذكرة: ${inv.order_number}\n` +
    `💰 الإجمالي: *${Number(inv.total||0).toLocaleString('ar-SA')} ريال*\n` +
    `${Number(inv.balance_due)>0 ? `⏳ المتبقي: ${Number(inv.balance_due).toLocaleString('ar-SA')} ريال` : '✅ مدفوع بالكامل'}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🔗 ${trackUrl}\n\n${shopName}`,
};

// ── إرسال حسب الحالة ──────────────────────────────────
async function sendStatusNotification(ticket, status, shopName, trackUrl, extraMsg = '') {
  let text;
  switch (status) {
    case 'ready':            text = MESSAGES.device_ready(ticket, shopName); break;
    case 'waiting_approval': text = MESSAGES.approval_needed(ticket, shopName, extraMsg); break;
    default: return { success: false, reason: 'no message for this status' };
  }
  return sendText(ticket.customer_phone, text);
}

module.exports = {
  sendText,
  sendStatusNotification,
  MESSAGES,
  formatPhone,
  isEnabled: () => ENABLED,
};
