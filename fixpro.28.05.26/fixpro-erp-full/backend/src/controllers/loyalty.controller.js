// backend/src/controllers/loyalty.controller.js
// بدون transactions — متوافق مع Supabase pooler
const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

const POINTS_PER_100 = 10;
const calcPoints = (amount) => Math.floor(parseFloat(amount) / 100 * POINTS_PER_100);

const updateTier = async (customerId) => {
  const { rows } = await query('SELECT loyalty_points FROM customers WHERE id=$1', [customerId]);
  if (!rows.length) return;
  const points = parseInt(rows[0].loyalty_points);
  const tier = points >= 5000 ? 'platinum' : points >= 2000 ? 'gold' : points >= 500 ? 'silver' : 'bronze';
  await query('UPDATE customers SET loyalty_tier=$1 WHERE id=$2', [tier, customerId]);
};

// GET /api/loyalty/:customerId
const getCustomerLoyalty = async (req, res, next) => {
  try {
    const { rows: cust } = await query(
      'SELECT id, full_name, loyalty_points, loyalty_tier FROM customers WHERE id=$1',
      [req.params.customerId]
    );
    if (!cust.length) throw new AppError('العميل غير موجود', 404);

    const { rows: history } = await query(
      `SELECT lt.*, o.order_number
       FROM loyalty_transactions lt
       LEFT JOIN orders o ON o.id = lt.order_id
       WHERE lt.customer_id = $1
       ORDER BY lt.created_at DESC LIMIT 20`,
      [req.params.customerId]
    );

    res.json({ success: true, data: { ...cust[0], history } });
  } catch (err) { next(err); }
};

// POST /api/loyalty/earn
const earnPoints = async (req, res, next) => {
  try {
    const { invoice_id } = req.body;

    const { rows: inv } = await query(
      "SELECT * FROM invoices WHERE id=$1 AND status='paid'",
      [invoice_id]
    );
    if (!inv.length) throw new AppError('الفاتورة غير موجودة أو غير مدفوعة');

    const points = calcPoints(inv[0].paid_amount);
    if (points <= 0)
      return res.json({ success: true, message: 'المبلغ لا يكفي لكسب نقاط' });

    // INSERT ذرّي — يمنع منح نقاط مكررة لنفس الفاتورة
    const { rows: lt } = await query(
      `INSERT INTO loyalty_transactions
         (customer_id, branch_id, order_id, invoice_id,
          transaction_type, points, balance_after, description, expires_at)
       SELECT $1,$2,$3,$4,'earn',$5,
              (SELECT loyalty_points FROM customers WHERE id=$1) + $5,
              $6, NOW() + INTERVAL '1 year'
       WHERE NOT EXISTS (
         SELECT 1 FROM loyalty_transactions
         WHERE invoice_id=$4 AND transaction_type='earn'
       )
       RETURNING *`,
      [inv[0].customer_id, inv[0].branch_id, inv[0].order_id, invoice_id,
       points, `نقاط مكتسبة من فاتورة ${inv[0].invoice_number}`]
    );

    if (!lt.length)
      throw new AppError('تم منح نقاط لهذه الفاتورة مسبقاً', 409);

    // تحديث رصيد العميل
    const { rows: cust } = await query(
      'UPDATE customers SET loyalty_points = loyalty_points + $1 WHERE id=$2 RETURNING loyalty_points',
      [points, inv[0].customer_id]
    );

    await updateTier(inv[0].customer_id).catch(() => {});

    res.json({
      success: true,
      message: `تم منح ${points} نقطة للعميل`,
      points_earned: points,
      new_balance: cust[0].loyalty_points
    });
  } catch (err) { next(err); }
};

// POST /api/loyalty/redeem
const redeemPoints = async (req, res, next) => {
  try {
    const { customer_id, points_to_redeem, order_id } = req.body;
    const discount_value = Math.floor(points_to_redeem / 100) * 10;
    if (discount_value <= 0) throw new AppError('النقاط غير كافية للصرف (الحد الأدنى 100 نقطة)');

    // تحديث ذرّي — يمنع صرف أكثر من الرصيد حتى لو ضغط موظفان معاً
    const { rows: updated } = await query(
      `UPDATE customers
       SET loyalty_points = loyalty_points - $1
       WHERE id=$2 AND loyalty_points >= $1
       RETURNING loyalty_points`,
      [points_to_redeem, customer_id]
    );

    if (!updated.length) {
      const { rows: cust } = await query(
        'SELECT loyalty_points FROM customers WHERE id=$1', [customer_id]
      );
      if (!cust.length) throw new AppError('العميل غير موجود', 404);
      throw new AppError(`رصيد النقاط غير كافٍ. المتاح: ${cust[0].loyalty_points}`);
    }

    await query(
      `INSERT INTO loyalty_transactions
         (customer_id, branch_id, order_id, transaction_type, points, balance_after, description)
       VALUES ($1,$2,$3,'redeem',$4,$5,$6)`,
      [customer_id, req.user.branch_id, order_id || null,
       -points_to_redeem, updated[0].loyalty_points,
       `صرف ${points_to_redeem} نقطة = خصم ${discount_value} ريال`]
    );

    await updateTier(customer_id).catch(() => {});

    res.json({
      success: true,
      message: `تم صرف ${points_to_redeem} نقطة بقيمة ${discount_value} ريال خصم`,
      discount_value,
      remaining_points: updated[0].loyalty_points
    });
  } catch (err) { next(err); }
};

module.exports = { getCustomerLoyalty, earnPoints, redeemPoints };
