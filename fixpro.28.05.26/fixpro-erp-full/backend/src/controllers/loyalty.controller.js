const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// نقاط لكل 100 ريال مدفوع
const POINTS_PER_100 = 10;

// حساب نقاط الولاء من مبلغ
const calcPoints = (amount) => Math.floor(parseFloat(amount) / 100 * POINTS_PER_100);

// تحديث tier العميل
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

// POST /api/loyalty/earn — منح نقاط عند دفع فاتورة
const earnPoints = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { invoice_id } = req.body;

    const { rows: inv } = await client.query(
      'SELECT * FROM invoices WHERE id=$1 AND status=\'paid\'',
      [invoice_id]
    );
    if (!inv.length) throw new AppError('الفاتورة غير موجودة أو غير مدفوعة');

    // تحقق: هل منحت نقاط لهذه الفاتورة مسبقاً؟
    const { rows: existing } = await client.query(
      'SELECT id FROM loyalty_transactions WHERE invoice_id=$1 AND transaction_type=\'earn\'',
      [invoice_id]
    );
    if (existing.length) throw new AppError('تم منح نقاط لهذه الفاتورة مسبقاً');

    const points = calcPoints(inv[0].paid_amount);
    if (points <= 0) {
      await client.query('ROLLBACK');
      return res.json({ success: true, message: 'المبلغ لا يكفي لكسب نقاط' });
    }

    // تحديث رصيد العميل
    const { rows: cust } = await client.query(
      'UPDATE customers SET loyalty_points = loyalty_points + $1 WHERE id=$2 RETURNING loyalty_points',
      [points, inv[0].customer_id]
    );

    // تسجيل الحركة
    await client.query(
      `INSERT INTO loyalty_transactions
         (customer_id, branch_id, order_id, invoice_id, transaction_type, points, balance_after, description, expires_at)
       VALUES ($1,$2,$3,$4,'earn',$5,$6,$7, NOW() + INTERVAL '1 year')`,
      [inv[0].customer_id, inv[0].branch_id, inv[0].order_id, invoice_id,
       points, cust[0].loyalty_points,
       `نقاط مكتسبة من فاتورة ${inv[0].invoice_number}`]
    );

    await updateTier(inv[0].customer_id);
    await client.query('COMMIT');

    res.json({ success: true, message: `تم منح ${points} نقطة للعميل`, points_earned: points });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// POST /api/loyalty/redeem — صرف نقاط كخصم
const redeemPoints = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { customer_id, points_to_redeem, order_id } = req.body;
    // 100 نقطة = 10 ريال خصم
    const discount_value = Math.floor(points_to_redeem / 100) * 10;
    if (discount_value <= 0) throw new AppError('النقاط غير كافية للصرف (الحد الأدنى 100 نقطة)');

    const { rows: cust } = await client.query(
      'SELECT loyalty_points FROM customers WHERE id=$1 FOR UPDATE',
      [customer_id]
    );
    if (!cust.length) throw new AppError('العميل غير موجود');
    if (cust[0].loyalty_points < points_to_redeem)
      throw new AppError(`رصيد النقاط غير كافٍ. المتاح: ${cust[0].loyalty_points}`);

    const { rows: updated } = await client.query(
      'UPDATE customers SET loyalty_points = loyalty_points - $1 WHERE id=$2 RETURNING loyalty_points',
      [points_to_redeem, customer_id]
    );

    await client.query(
      `INSERT INTO loyalty_transactions
         (customer_id, branch_id, order_id, transaction_type, points, balance_after, description)
       VALUES ($1,$2,$3,'redeem',$4,$5,$6)`,
      [customer_id, req.user.branch_id, order_id || null,
       -points_to_redeem, updated[0].loyalty_points,
       `صرف ${points_to_redeem} نقطة = خصم ${discount_value} ريال`]
    );

    await updateTier(customer_id);
    await client.query('COMMIT');

    res.json({
      success: true,
      message: `تم صرف ${points_to_redeem} نقطة بقيمة ${discount_value} ريال خصم`,
      discount_value,
      remaining_points: updated[0].loyalty_points
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

module.exports = { getCustomerLoyalty, earnPoints, redeemPoints };
