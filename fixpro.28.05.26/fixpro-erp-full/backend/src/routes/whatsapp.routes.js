const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const whatsapp = require('../services/whatsapp.service');
const { AppError } = require('../middleware/error.middleware');
const logger = require('../utils/logger');

// GET /api/whatsapp/webhook — التحقق من Webhook
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified ✅');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/whatsapp/webhook — استقبال رسائل العملاء
router.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);
  const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
  if (messages) {
    messages.forEach(async (msg) => {
      const from = msg.from;
      const text = msg.text?.body || '';
      const match = text.match(/ORD[-\s]?\d{4}[-\s]\d{4}/i);
      if (match) {
        const orderNum = match[0].replace(/\s/g,'-').toUpperCase();
        const { rows } = await query(
          `SELECT o.order_number, o.status, d.brand, d.model, c.full_name
           FROM orders o JOIN devices d ON d.id=o.device_id JOIN customers c ON c.id=o.customer_id
           WHERE o.order_number=$1`, [orderNum]
        ).catch(() => ({ rows:[] }));
        if (rows[0]) {
          const STATUS = { new:'تم الاستلام', diagnosing:'قيد الفحص', in_repair:'داخل الورشة',
            waiting_part:'ينتظر قطعة', ready:'جاهز للتسليم ✅', delivered:'تم التسليم' };
          await whatsapp.sendText(from,
            `مرحباً ${rows[0].full_name} 👋\n\n` +
            `📱 ${rows[0].brand} ${rows[0].model}\n` +
            `🔖 ${rows[0].order_number}\n` +
            `📊 الحالة: *${STATUS[rows[0].status] || rows[0].status}*`
          );
        }
      }
    });
  }
  res.sendStatus(200);
});

// GET /api/whatsapp/status
router.get('/status', authenticate, (req, res) => {
  res.json({
    success: true,
    enabled: whatsapp.isEnabled(),
    configured: {
      token:        !!process.env.WHATSAPP_TOKEN,
      phone_id:     !!process.env.WHATSAPP_PHONE_ID,
      verify_token: !!process.env.WHATSAPP_VERIFY_TOKEN,
    },
    webhook_url: `${process.env.BACKEND_URL || 'https://your-domain.com'}/api/whatsapp/webhook`,
  });
});

// POST /api/whatsapp/test
router.post('/test', authenticate, authorize('admin','branch_manager'), async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) throw new AppError('رقم الهاتف مطلوب');
    const result = await whatsapp.sendText(phone,
      `✅ اختبار FixPro ERP\n\nتم تفعيل WhatsApp بنجاح!\n🕐 ${new Date().toLocaleString('ar-SA')}`
    );
    res.json({ success: true, result });
  } catch (err) { next(err); }
});

// POST /api/whatsapp/send
router.post('/send', authenticate, authorize('admin','branch_manager','receptionist','customer_service'), async (req, res, next) => {
  try {
    const { phone, message, ticket_id } = req.body;
    if (!phone || !message) throw new AppError('الهاتف والرسالة مطلوبان');
    const result = await whatsapp.sendText(phone, message);
    res.json({ success: true, result });
  } catch (err) { next(err); }
});

module.exports = router;
