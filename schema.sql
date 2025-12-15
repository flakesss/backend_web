-- ============================================================
-- FLOCIFY DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES TABLE (extends Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user', -- 'user', 'admin'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. BANK ACCOUNTS TABLE (Seller's bank for receiving funds)
-- ============================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  total_amount INTEGER NOT NULL, -- in smallest currency unit (e.g., Rupiah)
  status TEXT DEFAULT 'awaiting_payment',
  -- Statuses: awaiting_payment, verification, paid, processing, shipped, delivered, completed, cancelled
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster order number lookup
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ============================================================
-- 4. PAYMENTS TABLE (Payment record for each order)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  -- Statuses: pending, awaiting_verification, paid, rejected, refunded
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

-- ============================================================
-- 5. PAYMENT PROOFS TABLE (Buyer uploads proof of transfer)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount INTEGER,
  proof_url TEXT, -- URL to uploaded image in Supabase Storage
  note TEXT,
  status TEXT DEFAULT 'pending',
  -- Statuses: pending, approved, rejected
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_payment_id ON payment_proofs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON payment_proofs(status);

-- ============================================================
-- 6. FUND RELEASES TABLE (Track money transfer to seller)
-- ============================================================
CREATE TABLE IF NOT EXISTS fund_releases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  -- Statuses: pending, completed
  transfer_proof TEXT,
  transfer_note TEXT,
  transferred_at TIMESTAMPTZ,
  transferred_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fund_releases_status ON fund_releases(status);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_releases ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- BANK ACCOUNTS POLICIES
CREATE POLICY "Users can view their own bank accounts"
  ON bank_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bank accounts"
  ON bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bank accounts"
  ON bank_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bank accounts"
  ON bank_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ORDERS POLICIES
CREATE POLICY "Sellers can view their own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can create orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update their own orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id);

-- PAYMENTS POLICIES
CREATE POLICY "Users can view payments for their orders"
  ON payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.seller_id = auth.uid()
    )
  );

CREATE POLICY "Users can create payments for their orders"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders WHERE orders.id = order_id AND orders.seller_id = auth.uid()
    )
  );

CREATE POLICY "Users can update payments for their orders"
  ON payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.seller_id = auth.uid()
    )
  );

-- PAYMENT PROOFS POLICIES
CREATE POLICY "Anyone can insert payment proofs"
  ON payment_proofs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view payment proofs for their orders"
  ON payment_proofs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders WHERE orders.id = payment_proofs.order_id AND orders.seller_id = auth.uid()
    )
    OR submitted_by = auth.uid()
  );

-- FUND RELEASES POLICIES
CREATE POLICY "Sellers can view their fund releases"
  ON fund_releases FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

-- ============================================================
-- Helper Function: Get order by number (for public lookup)
-- ============================================================
DROP FUNCTION IF EXISTS get_order_by_number(TEXT);
CREATE OR REPLACE FUNCTION get_order_by_number(p_order_number TEXT)
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  title TEXT,
  description TEXT,
  total_amount INTEGER,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id AS order_id,
    o.order_number,
    o.title,
    o.description,
    o.total_amount,
    o.status
  FROM orders o
  WHERE o.order_number = p_order_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- CREATE ADMIN USER (Run after first user registers)
-- Replace 'YOUR_ADMIN_USER_ID' with actual UUID from auth.users
-- ============================================================
-- UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_ADMIN_USER_ID';

-- ============================================================
-- STORAGE BUCKET (Run in Storage section of Supabase)
-- ============================================================
-- 1. Create bucket named 'payment-proofs'
-- 2. Set it to public or add policies as needed
