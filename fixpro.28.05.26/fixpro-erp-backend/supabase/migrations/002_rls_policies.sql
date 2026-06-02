-- ================================================
-- FixPro ERP - Row Level Security (RLS)
-- Migration: 002_rls_policies.sql
-- ================================================

-- تفعيل RLS على جميع الجداول
ALTER TABLE branches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_images       ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_parts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_ratings ENABLE ROW LEVEL SECURITY;

-- دالة مساعدة: جلب role المستخدم الحالي
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- دالة مساعدة: جلب branch_id المستخدم الحالي
CREATE OR REPLACE FUNCTION auth_user_branch()
RETURNS UUID AS $$
  SELECT branch_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ================================================
-- POLICIES: branches
-- ================================================
CREATE POLICY "branches_read" ON branches
  FOR SELECT USING (true);

CREATE POLICY "branches_write_admin" ON branches
  FOR ALL USING (auth_user_role() = 'admin');

-- ================================================
-- POLICIES: users
-- ================================================
CREATE POLICY "users_read_own_branch" ON users
  FOR SELECT USING (
    auth_user_role() = 'admin'
    OR branch_id = auth_user_branch()
  );

CREATE POLICY "users_write_admin" ON users
  FOR ALL USING (auth_user_role() = 'admin');

-- ================================================
-- POLICIES: customers
-- ================================================
CREATE POLICY "customers_read_branch" ON customers
  FOR SELECT USING (
    auth_user_role() = 'admin'
    OR branch_id = auth_user_branch()
    OR branch_id IS NULL
  );

CREATE POLICY "customers_write_staff" ON customers
  FOR INSERT WITH CHECK (
    auth_user_role() IN ('admin', 'branch_manager', 'receptionist')
  );

CREATE POLICY "customers_update_staff" ON customers
  FOR UPDATE USING (
    auth_user_role() IN ('admin', 'branch_manager', 'receptionist')
  );

-- ================================================
-- POLICIES: orders
-- ================================================
CREATE POLICY "orders_read_branch" ON orders
  FOR SELECT USING (
    auth_user_role() = 'admin'
    OR branch_id = auth_user_branch()
    OR technician_id = auth.uid()
  );

CREATE POLICY "orders_insert_staff" ON orders
  FOR INSERT WITH CHECK (
    auth_user_role() IN ('admin', 'branch_manager', 'receptionist')
  );

CREATE POLICY "orders_update_allowed" ON orders
  FOR UPDATE USING (
    auth_user_role() IN ('admin', 'branch_manager', 'receptionist')
    OR technician_id = auth.uid()
  );

-- ================================================
-- POLICIES: parts / inventory
-- ================================================
CREATE POLICY "parts_read_branch" ON parts
  FOR SELECT USING (
    auth_user_role() = 'admin'
    OR branch_id = auth_user_branch()
  );

CREATE POLICY "parts_write_manager" ON parts
  FOR ALL USING (
    auth_user_role() IN ('admin', 'branch_manager')
  );

-- ================================================
-- POLICIES: invoices
-- ================================================
CREATE POLICY "invoices_read_branch" ON invoices
  FOR SELECT USING (
    auth_user_role() IN ('admin', 'branch_manager', 'accountant')
    OR branch_id = auth_user_branch()
  );

CREATE POLICY "invoices_write_staff" ON invoices
  FOR ALL USING (
    auth_user_role() IN ('admin', 'branch_manager', 'receptionist', 'accountant')
  );
