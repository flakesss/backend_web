// ============================================================
// MIDDLEWARE: Require Super Admin Role
// ============================================================
// This middleware ensures only super_admin can access sensitive
// admin operations (approve, reject, delete, create, update)

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase credentials in requireSuperAdmin middleware');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Middleware: Require Super Admin
 * Only allows users with role = 'super_admin'
 */
const requireSuperAdmin = async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'No valid authentication token provided'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify the JWT token
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired token'
            });
        }

        // Get user profile to check role
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, email, full_name')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'User profile not found'
            });
        }

        // Check if user is super_admin
        if (profile.role !== 'super_admin') {
            console.log(`Super admin access denied for user ${user.id} (role: ${profile.role})`);
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Super admin access required. Only super admins can perform this action.',
                requiredRole: 'super_admin',
                currentRole: profile.role
            });
        }

        // Attach user info to request for use in route handlers
        req.user = user;
        req.userProfile = profile;

        console.log(`Super admin access granted: ${profile.email} (${profile.role})`);
        next();

    } catch (err) {
        console.error('Super admin middleware error:', err);
        return res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to verify super admin access'
        });
    }
};

module.exports = { requireSuperAdmin };
