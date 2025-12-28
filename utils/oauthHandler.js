// Google OAuth Handler with Account Linking
// Properly handles OAuth logins and profile syncing

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Handle OAuth user sign in
 * Creates or updates profile based on OAuth data
 */
async function handleOAuthUser(oauthUser) {
    try {
        const email = oauthUser.email;
        const userId = oauthUser.id;
        const provider = oauthUser.app_metadata?.provider || 'google';

        console.log(`[OAuth] Processing ${provider} login for: ${email}`);
        console.log(`[OAuth] User ID: ${userId}`);

        // Check if profile already exists for this OAuth user
        const { data: existingProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError && profileError.code !== 'PGRST116') {
            console.error('[OAuth] Error checking profile:', profileError);
        }

        const profileData = {
            id: userId,
            email: email,
            full_name: oauthUser.user_metadata?.full_name ||
                oauthUser.user_metadata?.name ||
                email.split('@')[0],
            picture: oauthUser.user_metadata?.avatar_url ||
                oauthUser.user_metadata?.picture || null,
            oauth_provider: provider,
            oauth_user_id: userId,
            updated_at: new Date().toISOString()
        };

        if (existingProfile) {
            // Profile exists, update it
            console.log('[OAuth] Updating existing profile');

            const { error: updateError } = await supabase
                .from('profiles')
                .update(profileData)
                .eq('id', userId);

            if (updateError) {
                console.error('[OAuth] Error updating profile:', updateError);
                return { success: false, error: updateError.message };
            }

            console.log('[OAuth] ✅ Profile updated successfully');

            return {
                success: true,
                merged: false,
                profileId: userId,
                isExisting: true
            };

        } else {
            // No profile yet, create new one
            console.log('[OAuth] Creating new profile');

            profileData.created_at = new Date().toISOString();

            const { error: insertError } = await supabase
                .from('profiles')
                .insert(profileData);

            if (insertError) {
                console.error('[OAuth] Error creating profile:', insertError);
                return { success: false, error: insertError.message };
            }

            console.log('[OAuth] ✅ Profile created successfully');

            return {
                success: true,
                merged: false,
                profileId: userId,
                isExisting: false
            };
        }

    } catch (err) {
        console.error('[OAuth] Unexpected error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Check if email is already registered
 */
async function checkEmailExists(email) {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, oauth_provider')
        .eq('email', email)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('[OAuth] Error checking email:', error);
        return { exists: false };
    }

    return {
        exists: !!data,
        profile: data
    };
}

module.exports = {
    handleOAuthUser,
    checkEmailExists
};
