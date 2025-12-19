-- Migration: Create company_bank_accounts table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Lower number = higher priority
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_company_bank_active ON company_bank_accounts(is_active, priority);

-- Insert default bank accounts (from your current data)
INSERT INTO company_bank_accounts (bank_name, account_number, account_holder_name, priority) VALUES
('BRI', '2141 01 031313501', 'HATTA DWI PUTRANTO', 1),
('Jago', '105417419596', 'HATTA DWI PUTRANTO', 2);

-- Function to auto-update timestamp
CREATE OR REPLACE FUNCTION update_company_bank_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
CREATE TRIGGER company_bank_accounts_updated
BEFORE UPDATE ON company_bank_accounts
FOR EACH ROW
EXECUTE FUNCTION update_company_bank_timestamp();

-- Verify data
SELECT * FROM company_bank_accounts ORDER BY priority;
