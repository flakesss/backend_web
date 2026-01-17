-- Migration: Add Super Admin Role
-- Purpose: Support 2-level admin system (admin vs super_admin)
-- Date: 2026-01-17
-- 
-- Role Hierarchy:
--   user         → Regular users
--   admin        → Read-only admin dashboard access
--   super_admin  → Full admin access (CRUD operations)

-- ============================================================
-- 1. Add Documentation for Role Values
-- ============================================================

COMMENT ON COLUMN profiles.role IS 'User role: user, admin (read-only), super_admin (full access)';

-- ============================================================
-- 2. Verify Current Admin Users
-- ============================================================

-- List all current admin users
DO $$
BEGIN
  RAISE NOTICE 'Current admin users:';
END $$;

SELECT 
  id,
  email,
  full_name,
  username,
  role,
  created_at
FROM profiles
WHERE role IN ('admin', 'super_admin')
ORDER BY created_at;

-- ============================================================
-- 3. Optional: Upgrade Existing Admins to Super Admin
-- ============================================================

-- UNCOMMENT BELOW to auto-upgrade all existing 'admin' users to 'super_admin'
-- This is recommended if you want existing admins to keep full access

/*
UPDATE profiles 
SET role = 'super_admin',
    updated_at = NOW()
WHERE role = 'admin';

RAISE NOTICE 'Upgraded % admin users to super_admin', (SELECT COUNT(*) FROM profiles WHERE role = 'super_admin');
*/

-- ============================================================
-- 4. Manual Upgrade Template (if needed)
-- ============================================================

-- To manually upgrade specific user to super_admin:
-- UPDATE profiles SET role = 'super_admin', updated_at = NOW() WHERE id = 'USER_UUID_HERE';

-- To create new super_admin user, set role in registration or:
-- UPDATE profiles SET role = 'super_admin', updated_at = NOW() WHERE email = 'admin@flocify.com';

-- ============================================================
-- 5. Verification Queries
-- ============================================================

-- Count users by role
SELECT 
  role,
  COUNT(*) as user_count
FROM profiles
GROUP BY role
ORDER BY 
  CASE role
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'user' THEN 3
    ELSE 4
  END;

-- Show all admin-level users
SELECT 
  id,
  email,
  full_name,
  username,
  role,
  created_at
FROM profiles
WHERE role IN ('admin', 'super_admin')
ORDER BY 
  CASE role
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
  END,
  created_at;

-- ============================================================
-- 6. RLS Policy Notes
-- ============================================================

-- Existing RLS policies will work for both admin and super_admin
-- Backend will handle permission differentiation via role check
-- No RLS policy changes needed at database level

COMMENT ON TABLE profiles IS 'User profiles with role-based access: user, admin (read-only), super_admin (full)';

-- Migration complete
SELECT 'Super Admin Role Migration Complete' as status;
