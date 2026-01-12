-- Add social media links to profiles table
-- Run this in Supabase SQL Editor

-- Add social media columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
ADD COLUMN IF NOT EXISTS facebook_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.instagram_url IS 'User Instagram profile URL';
COMMENT ON COLUMN profiles.tiktok_url IS 'User TikTok profile URL';
COMMENT ON COLUMN profiles.facebook_url IS 'User Facebook profile URL';

-- Note: No RLS changes needed - users can update their own social media via existing policies
