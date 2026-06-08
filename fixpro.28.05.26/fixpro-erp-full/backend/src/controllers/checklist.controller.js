const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// GET /api/checklist/:orderId
const getChecklist = async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM device_checklists WHERE order_id=$1',
      [req.params.orderId]
    );
    res.json({ success: true, data: rows[0] || null });
  } catch (err) { next(err); }
};

// POST /api/checklist — إنشاء/تحديث قائمة فحص
const saveChecklist = async (req, res, next) => {
  try {
    const {
      order_id, screen_condition, body_condition,
      buttons_working, charging_port_ok, speakers_ok, camera_ok,
      has_sim_card, has_memory_card,
      existing_damages, accessories_received,
      customer_signature
    } = req.body;
    if (!order_id) throw new AppError('رقم التذكرة مطلوب');

    const { rows } = await query(
      `INSERT INTO device_checklists
         (order_id, checked_by, screen_condition, body_condition,
          buttons_working, charging_port_ok, speakers_ok, camera_ok,
          has_sim_card, has_memory_card, existing_damages, accessories_received,
          customer_signature, customer_agreed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         CASE WHEN $13 IS NOT NULL THEN NOW() ELSE NULL END)
       ON CONFLICT (order_id) DO UPDATE SET
         screen_condition     = EXCLUDED.screen_condition,
         body_condition       = EXCLUDED.body_condition,
         buttons_working      = EXCLUDED.buttons_working,
         charging_port_ok     = EXCLUDED.charging_port_ok,
         speakers_ok          = EXCLUDED.speakers_ok,
         camera_ok            = EXCLUDED.camera_ok,
         has_sim_card         = EXCLUDED.has_sim_card,
         has_memory_card      = EXCLUDED.has_memory_card,
         existing_damages     = EXCLUDED.existing_damages,
         accessories_received = EXCLUDED.accessories_received,
         customer_signature   = COALESCE(EXCLUDED.customer_signature, device_checklists.customer_signature),
         customer_agreed_at   = CASE WHEN EXCLUDED.customer_signature IS NOT NULL THEN NOW()
                                     ELSE device_checklists.customer_agreed_at END
       RETURNING *`,
      [order_id, req.user.id, screen_condition || 'good', body_condition || 'good',
       buttons_working ?? true, charging_port_ok ?? true,
       speakers_ok ?? true, camera_ok ?? true,
       has_sim_card ?? false, has_memory_card ?? false,
       existing_damages || null, accessories_received || null,
       customer_signature || null]
    );

    res.json({ success: true, message: 'تم حفظ قائمة الفحص', data: rows[0] });
  } catch (err) { next(err); }
};

module.exports = { getChecklist, saveChecklist };
