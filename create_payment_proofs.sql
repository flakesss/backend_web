-- ============================================================
-- CREATE PAYMENT_PROOFS TABLE
-- Run this in Supabase SQL Editor if table doesn't exist
-- ============================================================

-- Create payment_proofs table
CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount INTEGER,
  proof_url TEXT,
  note TEXT,
  status TEXT DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_proofs_payment_id ON payment_proofs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order_id ON payment_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON payment_proofs(status);

-- Disable RLS for now (or create proper policies)
ALTER TABLE payment_proofs DISABLE ROW LEVEL SECURITY;

-- Or if you want to enable RLS with permissive policies:
-- ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all operations" ON payment_proofs FOR ALL USING (true) WITH CHECK (true);

-- Verify table was created
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'payment_proofs';
