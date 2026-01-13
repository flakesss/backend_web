-- Add admin_fee column to withdrawals table
ALTER TABLE withdrawals 
ADD COLUMN IF NOT EXISTS admin_fee DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15, 2);

-- Update existing withdrawals (set fee to 2.5% and calculate net amount)
UPDATE withdrawals
SET 
  admin_fee = ROUND(amount * 0.025, 2),
  net_amount = amount - ROUND(amount * 0.025, 2)
WHERE admin_fee IS NULL OR admin_fee = 0;

-- Add comment
COMMENT ON COLUMN withdrawals.admin_fee IS 'Admin fee (2.5% of withdrawal amount)';
COMMENT ON COLUMN withdrawals.net_amount IS 'Amount user receives after admin fee deduction';
