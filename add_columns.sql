-- ============================================================
-- STEP 1: Add missing columns to profiles table
-- Run this FIRST in Supabase SQL Editor
-- ============================================================

-- Add role column if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Add other columns if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Verify columns
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles';
