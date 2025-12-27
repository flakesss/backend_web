-- Rollback: Remove Gender and Age columns from profiles table
-- Run this in Supabase SQL Editor to undo the add_gender_age.sql migration

-- Drop constraints first (if they exist)
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS gender_check;

ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS age_check;

-- Drop the columns
ALTER TABLE profiles 
DROP COLUMN IF EXISTS gender;

ALTER TABLE profiles 
DROP COLUMN IF EXISTS date_of_birth;

ALTER TABLE profiles 
DROP COLUMN IF EXISTS age;

-- Verification query (run after dropping columns)
-- This should NOT show gender, date_of_birth, or age columns
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles'
-- ORDER BY ordinal_position;
