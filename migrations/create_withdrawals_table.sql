-- Create withdrawals table for fund withdrawal requests
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- User info
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Withdrawal details
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Menunggu persetujuan admin
    'approved',     -- Disetujui, dalam proses transfer
    'completed',    -- Selesai ditransfer
    'rejected',     -- Ditolak
    'cancelled'     -- Dibatalkan oleh user
  )),
  
  -- Admin notes
  admin_note TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Transfer proof
  transfer_proof_url TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own withdrawals
CREATE POLICY "Users can view own withdrawals"
  ON withdrawals FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own withdrawals
CREATE POLICY "Users can create own withdrawals"
  ON withdrawals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can cancel their pending withdrawals
CREATE POLICY "Users can cancel pending withdrawals"
  ON withdrawals FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (status IN ('pending', 'cancelled'));

-- Policy: Admins can view all withdrawals
CREATE POLICY "Admins can view all withdrawals"
  ON withdrawals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Policy: Admins can update any withdrawal
CREATE POLICY "Admins can update withdrawals"
  ON withdrawals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Add comment
COMMENT ON TABLE withdrawals IS 'Withdrawal requests from sellers';
