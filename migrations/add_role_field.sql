-- Add role field to profiles table
-- Default users are 'user', admins are 'admin'

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- Set default role for existing users
UPDATE profiles 
SET role = 'user'
WHERE role IS NULL;

-- Add index for faster role checks
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Make specific users admin (replace with actual admin emails)
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@flocify.id';

COMMENT ON COLUMN profiles.role IS 'User role: user, admin';

-- Example: Check admin users
-- SELECT id, email, full_name, role FROM profiles WHERE role = 'admin';
