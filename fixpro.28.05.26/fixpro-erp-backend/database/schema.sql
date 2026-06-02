-- ============================================================
-- FixPro ERP - Database Schema
-- PostgreSQL (Supabase)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'admin', 'branch_manager', 'receptionist', 'technician', 'accountant'
);

CREATE TYPE order_status AS ENUM (
  'new', 'diagnosing', 'in_repair', 'waiting_part', 'ready', 'delivered', 'cancelled'
);

CREATE TYPE order_priority AS ENUM ('normal', 'urgent', 'vip');

CREATE TYPE device_type AS ENUM (
  'smartphone', 'laptop', 'tablet', 'desktop', 'other'
);

CREATE TYPE payment_method AS ENUM (
  'cash', 'card', 'bank_transfer', 'mada', 'apple_pay', 'other'
);

CREATE TYPE invoice_status AS ENUM ('draft', 'pending', 'paid', 'partial', 'cancelled');

CREATE TYPE notification_channel AS ENUM ('whatsapp', 'sms', 'email', 'push');

CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed');

-- ============================================================
-- BRANCHES
-- ============================================================

CREATE TABLE branches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  address     TEXT,
  phone       VARCHAR(20),
  city        VARCHAR(50),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS (Staff)
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  phone         VARCHAR(20),
  role          user_role NOT NULL DEFAULT 'receptionist',
  password_hash TEXT NOT NULL,
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  full_name       VARCHAR(100) NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  phone_alt       VARCHAR(20),
  email           VARCHAR(150),
  address         TEXT,
  city            VARCHAR(50),
  notes           TEXT,
  loyalty_points  INT DEFAULT 0,
  is_vip          BOOLEAN DEFAULT false,
  total_spent     NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_branch ON customers(branch_id);

-- ============================================================
-- DEVICES
-- ============================================================

CREATE TABLE devices (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  device_type  device_type NOT NULL DEFAULT 'smartphone',
  brand        VARCHAR(50) NOT NULL,
  model        VARCHAR(100) NOT NULL,
  color        VARCHAR(30),
  imei         VARCHAR(20),
  serial_no    VARCHAR(50),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_customer ON devices(customer_id);
CREATE INDEX idx_devices_imei ON devices(imei);

-- ============================================================
-- SUPPLIERS
-- ============================================================

CREATE TABLE suppliers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(100) NOT NULL,
  contact_name   VARCHAR(100),
  phone          VARCHAR(20),
  email          VARCHAR(150),
  address        TEXT,
  payment_terms  VARCHAR(100),
  notes          TEXT,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PARTS (Inventory)
-- ============================================================

CREATE TABLE parts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID REFERENCES branches(id),
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  name            VARCHAR(150) NOT NULL,
  sku             VARCHAR(50) UNIQUE,
  barcode         VARCHAR(50),
  category        VARCHAR(50),        -- e.g. 'screens', 'batteries', 'keyboards'
  brand_compat    VARCHAR(100),       -- compatible brands e.g. 'Apple, Samsung'
  quantity        INT NOT NULL DEFAULT 0,
  min_quantity    INT NOT NULL DEFAULT 5,
  cost_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  sell_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  location        VARCHAR(50),        -- shelf/bin location
  image_url       TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parts_branch ON parts(branch_id);
CREATE INDEX idx_parts_barcode ON parts(barcode);
CREATE INDEX idx_parts_low_stock ON parts(branch_id) WHERE quantity <= min_quantity;

-- ============================================================
-- ORDERS (Repair Orders)
-- ============================================================

CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number      VARCHAR(20) UNIQUE NOT NULL,   -- e.g. ORD-2025-001
  branch_id         UUID REFERENCES branches(id),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  device_id         UUID NOT NULL REFERENCES devices(id),
  technician_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id),

  status            order_status NOT NULL DEFAULT 'new',
  priority          order_priority NOT NULL DEFAULT 'normal',

  -- Problem description
  problem_desc      TEXT NOT NULL,
  customer_notes    TEXT,           -- What customer said about the problem
  diagnosis_notes   TEXT,           -- Technician's diagnosis

  -- Device condition at intake
  has_password      BOOLEAN DEFAULT false,
  password_hint     VARCHAR(100),
  physical_condition TEXT,          -- scratches, cracks, etc.
  accessories       TEXT,           -- charger, case, etc.

  -- Estimates
  estimated_cost    NUMERIC(10,2),
  estimated_days    INT,

  -- Dates
  received_at       TIMESTAMPTZ DEFAULT NOW(),
  promised_at       TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,

  -- Warranty
  warranty_days     INT DEFAULT 30,
  warranty_expires_at TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_branch ON orders(branch_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_technician ON orders(technician_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);

-- ============================================================
-- ORDER STATUS LOG (History)
-- ============================================================

CREATE TABLE order_status_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  changed_by  UUID REFERENCES users(id),
  old_status  order_status,
  new_status  order_status NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_status_log_order ON order_status_log(order_id);

-- ============================================================
-- ORDER PARTS (Parts used in a repair)
-- ============================================================

CREATE TABLE order_parts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  part_id     UUID NOT NULL REFERENCES parts(id),
  quantity    INT NOT NULL DEFAULT 1,
  unit_price  NUMERIC(10,2) NOT NULL,  -- price at time of use
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_parts_order ON order_parts(order_id);

-- ============================================================
-- ORDER IMAGES
-- ============================================================

CREATE TABLE order_images (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  caption    VARCHAR(100),
  taken_at   VARCHAR(20) DEFAULT 'intake',  -- 'intake' | 'during' | 'complete'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVOICES
-- ============================================================

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  VARCHAR(20) UNIQUE NOT NULL,  -- INV-2025-001
  order_id        UUID NOT NULL REFERENCES orders(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  branch_id       UUID REFERENCES branches(id),
  created_by      UUID REFERENCES users(id),

  -- Line items summary
  labor_cost      NUMERIC(10,2) DEFAULT 0,
  parts_cost      NUMERIC(10,2) DEFAULT 0,
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(10,2) DEFAULT 0,
  discount_reason VARCHAR(100),
  vat_rate        NUMERIC(5,2) DEFAULT 15.00,   -- 15% VAT (Saudi)
  vat_amount      NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(10,2) DEFAULT 0,
  balance_due     NUMERIC(10,2) DEFAULT 0,

  status          invoice_status DEFAULT 'pending',
  notes           TEXT,
  due_date        DATE,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  received_by     UUID REFERENCES users(id),
  amount          NUMERIC(10,2) NOT NULL,
  method          payment_method NOT NULL DEFAULT 'cash',
  reference_no    VARCHAR(100),  -- bank transfer ref, card transaction id, etc.
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  sent_by     UUID REFERENCES users(id),
  channel     notification_channel NOT NULL,
  recipient   VARCHAR(150) NOT NULL,  -- phone or email
  message     TEXT NOT NULL,
  status      notification_status DEFAULT 'pending',
  provider_id VARCHAR(200),           -- external message ID from WhatsApp/SMS provider
  sent_at     TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_order ON notifications(order_id);
CREATE INDEX idx_notifications_customer ON notifications(customer_id);

-- ============================================================
-- PART PURCHASES (Stock In)
-- ============================================================

CREATE TABLE part_purchases (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  part_id      UUID NOT NULL REFERENCES parts(id),
  supplier_id  UUID REFERENCES suppliers(id),
  branch_id    UUID REFERENCES branches(id),
  received_by  UUID REFERENCES users(id),
  quantity     INT NOT NULL,
  unit_cost    NUMERIC(10,2) NOT NULL,
  total_cost   NUMERIC(10,2) NOT NULL,
  invoice_ref  VARCHAR(100),
  notes        TEXT,
  purchased_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEQUENCES for human-readable numbers
-- ============================================================

CREATE SEQUENCE order_seq START 1;
CREATE SEQUENCE invoice_seq START 1;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_branches_updated    BEFORE UPDATE ON branches    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated   BEFORE UPDATE ON customers   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_parts_updated       BEFORE UPDATE ON parts       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated      BEFORE UPDATE ON orders      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated    BEFORE UPDATE ON invoices    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_suppliers_updated   BEFORE UPDATE ON suppliers   FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-generate order_number: ORD-YYYY-XXXXXX
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('order_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION generate_order_number();

-- Auto-generate invoice_number: INV-YYYY-XXXXXX
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('invoice_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_invoice_number();

-- Log order status changes automatically
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_log(order_id, old_status, new_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_status_log
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION log_order_status_change();

-- Deduct part from inventory when added to order
CREATE OR REPLACE FUNCTION deduct_part_inventory()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE parts SET quantity = quantity - NEW.quantity
  WHERE id = NEW.part_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deduct_inventory
  AFTER INSERT ON order_parts
  FOR EACH ROW
  EXECUTE FUNCTION deduct_part_inventory();

-- Restore part inventory if order_part deleted (e.g. cancelled)
CREATE OR REPLACE FUNCTION restore_part_inventory()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE parts SET quantity = quantity + OLD.quantity
  WHERE id = OLD.part_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restore_inventory
  AFTER DELETE ON order_parts
  FOR EACH ROW
  EXECUTE FUNCTION restore_part_inventory();

-- Update invoice paid_amount & balance_due after each payment
CREATE OR REPLACE FUNCTION update_invoice_balance()
RETURNS TRIGGER AS $$
DECLARE v_paid NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM payments WHERE invoice_id = NEW.invoice_id;

  UPDATE invoices SET
    paid_amount = v_paid,
    balance_due = total - v_paid,
    status = CASE
      WHEN v_paid >= total THEN 'paid'
      WHEN v_paid > 0      THEN 'partial'
      ELSE 'pending'
    END
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_balance
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_balance();

-- Update customer total_spent after invoice paid
CREATE OR REPLACE FUNCTION update_customer_spent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    UPDATE customers SET total_spent = total_spent + NEW.total
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_spent
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_spent();

-- ============================================================
-- ROW LEVEL SECURITY (Supabase RLS)
-- ============================================================

ALTER TABLE branches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SEED DATA - Initial setup
-- ============================================================

-- Default branch
INSERT INTO branches (id, name, address, phone, city)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'الفرع الرئيسي',
  'الرياض - حي العليا',
  '0112345678',
  'الرياض'
);

-- Admin user (password: Admin@1234 — change immediately!)
INSERT INTO users (id, branch_id, full_name, email, phone, role, password_hash)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'مدير النظام',
  'admin@fixpro.sa',
  '0500000000',
  'admin',
  '$2b$12$placeholder_change_this_hash_immediately'
);

-- Sample parts categories
INSERT INTO parts (branch_id, name, sku, category, brand_compat, quantity, min_quantity, cost_price, sell_price)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'شاشة iPhone 14', 'SCR-IP14-001', 'screens', 'Apple', 10, 5, 280, 380),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'بطارية iPhone 13', 'BAT-IP13-001', 'batteries', 'Apple', 15, 5, 55, 85),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'بطارية Samsung S22', 'BAT-SS22-001', 'batteries', 'Samsung', 8, 5, 65, 95),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'شاشة Samsung S23', 'SCR-SS23-001', 'screens', 'Samsung', 6, 5, 220, 320),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'شاشة MacBook Pro 14"', 'SCR-MBP14-001', 'screens', 'Apple', 3, 2, 900, 1200),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'كيبورد لابتوب عام', 'KBD-GEN-001', 'keyboards', 'Generic', 12, 4, 75, 120);
