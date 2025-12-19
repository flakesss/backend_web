-- Migration: Add username column and update phone constraints
-- Run this in Supabase SQL Editor

-- Step 1: Add username column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Step 2: Add unique constraints
ALTER TABLE profiles ADD CONSTRAINT unique_username UNIQUE (username);
ALTER TABLE profiles ADD CONSTRAINT unique_phone UNIQUE (phone);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);

-- Step 4: Update trigger to handle username and phone from metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, username)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.phone,
    NEW.raw_user_meta_data->>'username'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;
