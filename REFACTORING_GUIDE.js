/**
 * SHIPPING ADDRESS REFACTORING - BACKEND SERVER.JS CHANGES
 * 
 * File terlalu besar untuk auto-edit. Apply changes manually:
 */

// ============================================================================
// STEP 1: DELETE SELLER ADDRESS ENDPOINTS (Lines 3438-3529)
// ============================================================================

// DELETE THIS ENTIRE SECTION:
/*
// Get Seller Address
app.get('/seller/address', requireAuth, async (req, res) => {
  ... (DELETE lines 3438-3466)
});

// Update Seller Address  
app.post('/seller/address', requireAuth, async (req, res) => {
  ... (DELETE lines 3468-3529)
});
*/

// ============================================================================
// STEP 2: UPDATE CALCULATE RATES ENDPOINT (Lines 3759-3772)
// ============================================================================

// FIND THIS CODE (around line 3759):
/*
const { data: profile, error: profileError } = await supabaseAdmin
  .from('profiles')
  .select('seller_address')
  .eq('id', req.userId)
  .single();

if (profileError || !profile || !profile.seller_address) {
  return res.status(400).json({
    success: false,
    error: 'Seller address not set. Please set your address first.'
  });
}

const sellerAddress = profile.seller_address;
*/

// REPLACE WITH THIS:
const { data: sellerAddress, error: addressError } = await supabaseAdmin
    .from('shipping_addresses')
    .select('*')
    .eq('user_id', req.userId)
    .eq('is_default', true)
    .single();

if (addressError || !sellerAddress) {
    return res.status(400).json({
        success: false,
        error: 'Seller origin address not set. Please add your address first.'
    });
}

// ============================================================================
// SUMMARY OF CHANGES
// ============================================================================

/**
 * BEFORE: 3 seller address-related systems
 * - GET /seller/address (profiles.seller_address) ❌
 * - POST /seller/address (profiles.seller_address) ❌
 * - Calculate rates fetches from profiles.seller_address ❌
 * 
 * AFTER: 1 unified system 
 * - Seller uses shipping_addresses with is_default = true ✅
 * - Buyer uses shipping_addresses ✅
 * - Calculate rates fetches from shipping_addresses ✅
 */
