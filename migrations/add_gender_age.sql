-- Add Gender and Age columns to profiles table
-- Run this in Supabase SQL Editor

-- Add gender column (male/female/other)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS gender VARCHAR(10);

-- Add date_of_birth column (better than storing age directly)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add age column (calculated from date_of_birth, optional)
-- This can be a computed column or stored separately
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS age INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN profiles.gender IS 'User gender: male, female, other';
COMMENT ON COLUMN profiles.date_of_birth IS 'User date of birth';
COMMENT ON COLUMN profiles.age IS 'User age (can be calculated from date_of_birth)';

-- Optional: Add check constraint for gender values
ALTER TABLE profiles 
ADD CONSTRAINT gender_check CHECK (gender IN ('male', 'female', 'other') OR gender IS NULL);

-- Optional: Add check constraint for reasonable age range
ALTER TABLE profiles 
ADD CONSTRAINT age_check CHECK (age >= 13 AND age <= 120 OR age IS NULL);
