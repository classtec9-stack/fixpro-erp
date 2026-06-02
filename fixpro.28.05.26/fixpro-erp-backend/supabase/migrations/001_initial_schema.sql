-- ================================================
-- FixPro ERP - Initial Database Schema
-- Migration: 001_initial_schema.sql
-- ================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- ENUMS
-- ================================================

CREATE TYPE user_role AS ENUM (
  'admin',
  'branch_manager',
  'receptionist',
  'technician',
  'accountant'
);

CREATE TYPE order_status AS ENUM (
  'new',
  'diagnosing',
  'waiting_approval',
  'in_repair',
  'waiting_part',
  'ready',
  'delivered',
  'cancelled'
);

CREATE TYPE order_priority AS ENUM (
  'normal',
  'urgent',
  'vip'
);

CREATE TYPE device_type AS ENUM (
  'smartphone',
  'laptop',
  'tablet',
  'desktop',
  'other'
);

CREATE TYPE payment_method AS ENUM (
  'cash',
  'card',
  'bank_transfer',
  'mada',
  'apple_pay'
);

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'pending',
  'paid',
  'partially_paid',
  'cancelled'
);

CREATE TYPE notification_channel AS ENUM (
  'whatsapp',
  'sms',
  'email',
  'push'
);

CREATE TYPE notification_status AS ENUM (
  'pending',
  'sent',
  'delivered',
  'failed'
);

-- ================================================
-- TABLE: branches
-- ================================================

CREATE TABLE branches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  address       TEXT,
  phone         VARCHAR(20),
  email         VARCHAR(100),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLE: users
-- ================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(100) UNIQUE NOT NULL,
  phone         VARCHAR(20),
  role          user_role NOT NULL DEFAULT 'receptionist',
  specialty     VARCHAR(100),          -- للفنيين: تخصص (هواتف، لابتوب...)
  is_active     BOOLEAN DEFAULT TRUE,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLE: customers
-- ================================================

CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  full_name       VARCHAR(100) NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  email           VARCHAR(100),
  address         TEXT,
  notes           TEXT,
  loyalty_points  INTEGER DEFAULT 0,
  customer_type   VARCHAR(20) DEFAULT 'regular',  -- regular, vip, corporate
  total_spent     DECIMAL(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_branch ON customers(branch_id);

-- ================================================
-- TABLE: devices
-- ================================================

CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  device_type   device_type NOT NULL,
  brand         VARCHAR(50) NOT NULL,
  model         VARCHAR(100) NOT NULL,
  imei          VARCHAR(20),
  serial_number VARCHAR(50),
  color         VARCHAR(30),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_customer ON devices(customer_id);
CREATE INDEX idx_devices_imei ON devices(imei);

-- ================================================
-- TABLE: orders
-- ================================================

CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number      SERIAL UNIQUE,               -- رقم الأوردر المتسلسل
  branch_id         UUID REFERENCES branches(id),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  device_id         UUID NOT NULL REFERENCES devices(id),
  technician_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id),

  status            order_status DEFAULT 'new',
  priority          order_priority DEFAULT 'normal',

  -- وصف المشكلة والتشخيص
  problem_description   TEXT NOT NULL,
  diagnosis             TEXT,
  repair_notes          TEXT,

  -- حالة الجهاز عند الاستلام
  device_condition      TEXT,           -- خدوش، كسر...
  accessories_received  TEXT,           -- شاحن، كيس...

  -- التكلفة التقديرية والفعلية
  estimated_cost    DECIMAL(10,2),
  final_cost        DECIMAL(10,2),
  labor_cost        DECIMAL(10,2) DEFAULT 0,

  -- ضمان
  warranty_days     INTEGER DEFAULT 0,
  warranty_expires  DATE,

  -- تواريخ
  received_at       TIMESTAMPTZ DEFAULT NOW(),
  promised_at       TIMESTAMPTZ,        -- تاريخ التسليم الموعود
  completed_at      TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_technician ON orders(technician_id);
CREATE INDEX idx_orders_branch ON orders(branch_id);
CREATE INDEX idx_orders_number ON orders(order_number);

-- ================================================
-- TABLE: order_status_log  (سجل تغيير الحالة)
-- ================================================

CREATE TABLE order_status_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  changed_by    UUID REFERENCES users(id),
  old_status    order_status,
  new_status    order_status NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_status_log_order ON order_status_log(order_id);

-- ================================================
-- TABLE: order_images  (صور الجهاز)
-- ================================================

CREATE TABLE order_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  caption     VARCHAR(100),
  uploaded_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TABLE: parts  (قطع الغيار)
-- ================================================

CREATE TABLE parts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID REFERENCES branches(id),
  name            VARCHAR(150) NOT NULL,
  name_en         VARCHAR(150),
  category        VARCHAR(50),          -- هواتف، لابتوب، تابلت...
  compatible_with VARCHAR(200),         -- iPhone 14, Samsung S23...
  barcode         VARCHAR(50) UNIQUE,
  sku             VARCHAR(50),

  quantity        INTEGER DEFAULT 0,
  min_quantity    INTEGER DEFAULT 5,    -- حد الطلب الأدنى
  unit            VARCHAR(20) DEFAULT 'piece',

  cost_price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  sell_price      DECIMAL(10,2) NOT NULL DEFAULT 0,

  supplier_id     UUID,                 -- FK يُضاف لاحقاً
  location        VARCHAR(50),          -- مكان التخزين في المستودع
  notes           TEXT,

  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parts_barcode ON parts(barcode);
CREATE INDEX idx_parts_category ON parts(category);
CREATE INDEX idx_parts_low_stock ON parts(quantity) WHERE quantity <= min_quantity;

-- ================================================
-- TABLE: order_parts  (القطع المستخدمة في الأوردر)
-- ================================================

CREATE TABLE order_parts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  part_id     UUID NOT NULL REFERENCES parts(id),
  quantity    INTEGER NOT NULL DEFAULT 1,
  unit_price  DECIMAL(10,2) NOT NULL,   -- السعر وقت الاستخدام
  added_by    UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_parts_order ON order_parts(order_id);

-- ================================================
-- TABLE: inventory_log  (حركات المخزون)
-- ================================================

CREATE TABLE inventory_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  part_id       UUID NOT NULL REFERENCES parts(id),
  user_id       UUID REFERENCES users(id),
  order_id      UUID REFERENCES orders(id),
  movement_type VARCHAR(20) NOT NULL,   -- 'in', 'out', 'adjustment', 'return'
  quantity      INTEGER NOT NULL,       -- موجب = وارد، سالب = صادر
  qty_before    INTEGER,
  qty_after     INTEGER,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_log_part ON inventory_log(part_id);

-- ================================================
-- TABLE: suppliers
-- ================================================

CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  phone           VARCHAR(20),
  email           VARCHAR(100),
  address         TEXT,
  payment_terms   VARCHAR(50),          -- نقدي، 30 يوم...
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- إضافة FK للموردين في parts
ALTER TABLE parts ADD CONSTRAINT fk_parts_supplier
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- ================================================
-- TABLE: invoices
-- ================================================

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  SERIAL UNIQUE,
  order_id        UUID NOT NULL REFERENCES orders(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  branch_id       UUID REFERENCES branches(id),
  created_by      UUID REFERENCES users(id),

  subtotal        DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount        DECIMAL(10,2) DEFAULT 0,
  discount_type   VARCHAR(10) DEFAULT 'fixed',  -- fixed, percent
  vat_rate        DECIMAL(5,2) DEFAULT 15,       -- نسبة ضريبة القيمة المضافة
  vat_amount      DECIMAL(10,2) DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL DEFAULT 0,
  paid_amount     DECIMAL(10,2) DEFAULT 0,
  remaining       DECIMAL(10,2) DEFAULT 0,

  status          invoice_status DEFAULT 'pending',
  notes           TEXT,
  zatca_qr        TEXT,                           -- QR code لـ ZATCA

  due_date        DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- ================================================
-- TABLE: payments
-- ================================================

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  received_by     UUID REFERENCES users(id),
  amount          DECIMAL(10,2) NOT NULL,
  method          payment_method NOT NULL DEFAULT 'cash',
  reference       VARCHAR(100),         -- رقم الحوالة أو المعاملة
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);

-- ================================================
-- TABLE: notifications
-- ================================================

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  sent_by     UUID REFERENCES users(id),
  channel     notification_channel NOT NULL,
  recipient   VARCHAR(100) NOT NULL,    -- رقم الجوال أو البريد
  message     TEXT NOT NULL,
  status      notification_status DEFAULT 'pending',
  provider_id VARCHAR(100),             -- معرف من مزود الخدمة
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_order ON notifications(order_id);
CREATE INDEX idx_notifications_status ON notifications(status);

-- ================================================
-- TABLE: technician_ratings  (تقييمات الفنيين)
-- ================================================

CREATE TABLE technician_ratings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES users(id),
  customer_id   UUID NOT NULL REFERENCES customers(id),
  rating        SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- TRIGGERS: auto update updated_at
-- ================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_branches_updated_at    BEFORE UPDATE ON branches    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated_at   BEFORE UPDATE ON customers   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated_at      BEFORE UPDATE ON orders      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_parts_updated_at       BEFORE UPDATE ON parts       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated_at    BEFORE UPDATE ON invoices    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ================================================
-- TRIGGER: خصم المخزون تلقائياً عند إضافة قطعة للأوردر
-- ================================================

CREATE OR REPLACE FUNCTION deduct_part_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- خصم الكمية من المخزون
  UPDATE parts
  SET quantity = quantity - NEW.quantity
  WHERE id = NEW.part_id;

  -- تسجيل حركة المخزون
  INSERT INTO inventory_log (part_id, order_id, movement_type, quantity, qty_before, qty_after)
  SELECT
    NEW.part_id,
    NEW.order_id,
    'out',
    -NEW.quantity,
    quantity + NEW.quantity,
    quantity
  FROM parts WHERE id = NEW.part_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deduct_inventory
  AFTER INSERT ON order_parts
  FOR EACH ROW EXECUTE FUNCTION deduct_part_inventory();

-- ================================================
-- TRIGGER: تحديث حقل remaining في الفاتورة عند الدفع
-- ================================================

CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET
    paid_amount = paid_amount + NEW.amount,
    remaining   = total - (paid_amount + NEW.amount),
    status = CASE
      WHEN (paid_amount + NEW.amount) >= total THEN 'paid'
      WHEN (paid_amount + NEW.amount) > 0 THEN 'partially_paid'
      ELSE 'pending'
    END,
    updated_at = NOW()
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_invoice_payment
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_on_payment();

-- ================================================
-- TRIGGER: سجل تغيير حالة الأوردر تلقائياً
-- ================================================

CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_log (order_id, old_status, new_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_order_status
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- ================================================
-- TRIGGER: تحديث إجمالي إنفاق العميل
-- ================================================

CREATE OR REPLACE FUNCTION update_customer_total_spent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    UPDATE customers
    SET total_spent = total_spent + NEW.total
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_customer_spent
  AFTER UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_customer_total_spent();

-- ================================================
-- VIEWS: مختصرات مفيدة
-- ================================================

-- عرض الأوردرات مع بيانات العميل والفني
CREATE VIEW orders_full AS
SELECT
  o.*,
  c.full_name   AS customer_name,
  c.phone       AS customer_phone,
  d.brand       AS device_brand,
  d.model       AS device_model,
  d.device_type,
  u.full_name   AS technician_name,
  b.name        AS branch_name
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN devices   d ON o.device_id   = d.id
LEFT JOIN users     u ON o.technician_id = u.id
LEFT JOIN branches  b ON o.branch_id   = b.id;

-- إحصائيات سريعة لكل فرع
CREATE VIEW branch_stats AS
SELECT
  b.id,
  b.name,
  COUNT(DISTINCT o.id)                                      AS total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'new')      AS new_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'in_repair') AS in_repair,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'ready')    AS ready_orders,
  COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid'), 0) AS total_revenue,
  COUNT(DISTINCT c.id)                                       AS total_customers
FROM branches b
LEFT JOIN orders    o ON b.id = o.branch_id
LEFT JOIN invoices  i ON b.id = i.branch_id
LEFT JOIN customers c ON b.id = c.branch_id
GROUP BY b.id, b.name;

-- ================================================
-- SEED DATA: بيانات أولية
-- ================================================

-- فرع رئيسي
INSERT INTO branches (id, name, address, phone, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'الفرع الرئيسي - الرياض', 'طريق الملك فهد، الرياض', '0112345678', 'main@fixpro.sa');

-- مستخدم مدير النظام (كلمة المرور تُضاف عبر Supabase Auth)
INSERT INTO users (id, branch_id, full_name, email, phone, role) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'مدير النظام', 'admin@fixpro.sa', '0500000000', 'admin');

-- فنيين
INSERT INTO users (branch_id, full_name, email, phone, role, specialty) VALUES
  ('00000000-0000-0000-0000-000000000001', 'محمد الشهري',  'mohammed@fixpro.sa', '0501111111', 'technician', 'هواتف ذكية'),
  ('00000000-0000-0000-0000-000000000001', 'خالد العتيبي', 'khaled@fixpro.sa',   '0502222222', 'technician', 'لابتوب وماك'),
  ('00000000-0000-0000-0000-000000000001', 'عبدالله الدوسري', 'abdullah@fixpro.sa', '0503333333', 'technician', 'أجهزة أندرويد');

-- موظف استقبال
INSERT INTO users (branch_id, full_name, email, phone, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'سارة المطيري', 'sara@fixpro.sa', '0504444444', 'receptionist');

-- قطع غيار أولية
INSERT INTO parts (branch_id, name, category, cost_price, sell_price, quantity, min_quantity, compatible_with) VALUES
  ('00000000-0000-0000-0000-000000000001', 'شاشة iPhone 14',        'هواتف', 280, 380, 10, 5, 'iPhone 14'),
  ('00000000-0000-0000-0000-000000000001', 'شاشة iPhone 13',        'هواتف', 220, 310, 8,  5, 'iPhone 13'),
  ('00000000-0000-0000-0000-000000000001', 'بطارية iPhone 14',       'هواتف', 55,  90,  15, 5, 'iPhone 14'),
  ('00000000-0000-0000-0000-000000000001', 'بطارية Samsung S23',     'هواتف', 60,  95,  12, 5, 'Samsung S23'),
  ('00000000-0000-0000-0000-000000000001', 'شاشة Samsung S23',       'هواتف', 300, 420, 6,  3, 'Samsung Galaxy S23'),
  ('00000000-0000-0000-0000-000000000001', 'كيبورد MacBook Air M2',  'لابتوب', 400, 580, 4, 3, 'MacBook Air M2'),
  ('00000000-0000-0000-0000-000000000001', 'شاشة MacBook Pro 14"',   'لابتوب', 900, 1200, 3, 2, 'MacBook Pro 14'),
  ('00000000-0000-0000-0000-000000000001', 'بطارية لابتوب عامة',    'لابتوب', 80,  140, 20, 5, 'عام'),
  ('00000000-0000-0000-0000-000000000001', 'شاحن USB-C عام',         'إكسسوار', 25, 45, 30, 10, 'عام');
