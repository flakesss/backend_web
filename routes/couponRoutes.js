// Coupon System API Endpoints
// Add these to your server.js

// ============================================================
// COUPON ENDPOINTS
// ============================================================

// Check/Validate Coupon Code
app.post("/coupons/check", requireAuth, async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user.id;

        if (!code) {
            return res.status(400).json({ error: "Kode kupon harus diisi" });
        }

        // Get coupon details first
        const { data: couponData, error: couponError } = await supabaseAdmin
            .from('coupons')
            .select('*')
            .eq('code', code.toUpperCase())
            .single();

        if (couponError || !couponData) {
            return res.status(400).json({
                success: false,
                message: "Kode kupon tidak valid"
            });
        }

        // Check if it's a PRIVATE voucher
        if (couponData.voucher_type === 'private') {
            // Verify user has access to this private voucher
            const { data: assignment, error: assignError } = await supabaseAdmin
                .from('user_vouchers')
                .select('*')
                .eq('coupon_id', couponData.id)
                .eq('user_id', userId)
                .single();

            if (assignError || !assignment) {
                return res.status(403).json({
                    success: false,
                    message: "Voucher ini tidak tersedia untuk Anda"
                });
            }

            // Check if already claimed
            if (assignment.is_claimed) {
                return res.status(400).json({
                    success: false,
                    message: "Anda sudah menggunakan voucher ini"
                });
            }
        }

        // Call database function to validate coupon
        const { data, error } = await supabaseAdmin.rpc('check_coupon_validity', {
            coupon_code: code.toUpperCase(),
            user_id_input: userId
        });

        if (error) {
            console.error('[Coupon Check] Error:', error);
            return res.status(500).json({ error: "Gagal memeriksa kupon" });
        }

        const result = data[0];

        if (!result.is_valid) {
            return res.status(400).json({
                success: false,
                message: result.message
            });
        }

        res.json({
            success: true,
            discount_amount: result.discount_amount,
            discount_type: result.discount_type,
            message: result.message,
            voucher_type: couponData.voucher_type
        });

    } catch (err) {
        console.error('[Coupon Check] Error:', err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Apply/Use Coupon (called when creating order)
app.post("/coupons/use", requireAuth, async (req, res) => {
    try {
        const { code, order_id, discount_applied } = req.body;
        const userId = req.user.id;

        if (!code || !order_id || discount_applied === undefined) {
            return res.status(400).json({ error: "Data tidak lengkap" });
        }

        // Use coupon via database function
        const { data, error } = await supabaseAdmin.rpc('use_coupon', {
            coupon_code: code.toUpperCase(),
            user_id_input: userId,
            order_id_input: order_id,
            discount_applied_input: discount_applied
        });

        if (error || !data) {
            console.error('[Coupon Use] Error:', error);
            return res.status(400).json({
                error: "Gagal menggunakan kupon. Mungkin kuota habis atau kupon tidak valid."
            });
        }

        // If it's a private voucher, mark as claimed
        const { data: couponInfo } = await supabaseAdmin
            .from('coupons')
            .select('id, voucher_type')
            .eq('code', code.toUpperCase())
            .single();

        if (couponInfo && couponInfo.voucher_type === 'private') {
            await supabaseAdmin
                .from('user_vouchers')
                .update({
                    is_claimed: true,
                    claimed_at: new Date().toISOString()
                })
                .eq('coupon_id', couponInfo.id)
                .eq('user_id', userId);

            console.log(`[Coupon Use] Private voucher ${code} marked as claimed for user ${userId}`);
        }

        res.json({
            success: true,
            message: "Kupon berhasil digunakan"
        });

    } catch (err) {
        console.error('[Coupon Use] Error:', err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get User's Coupon Usage History
app.get("/coupons/my-usage", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabaseAdmin
            .from('coupon_uses')
            .select(`
        id,
        discount_applied,
        used_at,
        coupons (
          code,
          discount_amount,
          discount_type
        ),
        orders (
          order_number,
          total_amount
        )
      `)
            .eq('user_id', userId)
            .order('used_at', { ascending: false });

        if (error) {
            console.error('[Coupon History] Error:', error);
            return res.status(500).json({ error: "Gagal mengambil riwayat kupon" });
        }

        res.json({ coupons: data || [] });

    } catch (err) {
        console.error('[Coupon History] Error:', err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get Available Coupons (Public for logged-in users)
app.get("/coupons/available", requireAuth, async (req, res) => {
    try {
        // Get active coupons that are still valid
        const { data, error } = await supabaseAdmin
            .from('coupon_stats')
            .select('*')
            .eq('is_active', true)
            .gt('quota', 0)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Available Coupons] Error:', error);
            return res.status(500).json({ error: "Gagal mengambil voucher" });
        }

        // Filter out expired coupons
        const now = new Date();
        const validCoupons = (data || []).filter(coupon => {
            // If no valid_until, coupon never expires
            if (!coupon.valid_until) return true;

            const validUntil = new Date(coupon.valid_until);
            return validUntil > now;
        });

        // Filter out coupons that have no remaining quota
        const availableCoupons = validCoupons.filter(coupon => {
            const remainingQuota = coupon.quota - (coupon.times_used || 0);
            return remainingQuota > 0;
        });

        res.json({ coupons: availableCoupons });

    } catch (err) {
        console.error('[Available Coupons] Error:', err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ============================================================
// ADMIN COUPON ENDPOINTS
// ============================================================

// Get All Coupons (Admin Only)
app.get("/admin/coupons", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('coupon_stats')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Admin Coupons] Error:', error);
            return res.status(500).json({ error: "Gagal mengambil data kupon" });
        }

        res.json({ coupons: data || [] });

    } catch (err) {
        console.error('[Admin Coupons] Error:', err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Create New Coupon (Admin Only)
app.post("/admin/coupons", requireAuth, requireAdmin, async (req, res) => {
    try {
        const {
            code,
            discount_amount,
            discount_type = 'fixed',
            quota,
            max_uses_per_user = 1,
            valid_until
        } = req.body;

        if (!code || !discount_amount || !quota) {
            return res.status(400).json({ error: "Kode, jumlah diskon, dan kuota harus diisi" });
        }

        const { data, error } = await supabaseAdmin
            .from('coupons')
            .insert({
                code: code.toUpperCase(),
                discount_amount,
                discount_type,
                quota,
                max_uses_per_user,
                valid_until: valid_until || null,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('[Create Coupon] Error:', error);

            if (error.code === '23505') { // Unique violation
                return res.status(400).json({ error: "Kode kupon sudah digunakan" });
            }

            return res.status(500).json({ error: "Gagal membuat kupon" });
        }

        res.json({
            success: true,
            coupon: data,
            message: "Kupon berhasil dibuat"
        });

    } catch (err) {
        console.error('[Create Coupon] Error:', err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Update Coupon (Admin Only)
app.patch("/admin/coupons/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { quota, is_active, valid_until } = req.body;

        const updates = {};
        if (quota !== undefined) updates.quota = quota;
        if (is_active !== undefined) updates.is_active = is_active;
        if (valid_until !== undefined) updates.valid_until = valid_until;

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('coupons')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[Update Coupon] Error:', error);
            return res.status(500).json({ error: "Gagal mengupdate kupon" });
        }

        res.json({
            success: true,
            coupon: data,
            message: "Kupon berhasil diupdate"
        });

    } catch (err) {
        console.error('[Update Coupon] Error:', err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Delete Coupon (Admin Only)
app.delete("/admin/coupons/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('coupons')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[Delete Coupon] Error:', error);
            return res.status(500).json({ error: "Gagal menghapus kupon" });
        }

        res.json({
            success: true,
            message: "Kupon berhasil dihapus"
        });

    } catch (err) {
        console.error('[Delete Coupon] Error:', err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get Coupon Usage Statistics (Admin Only)
app.get("/admin/coupons/:id/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabaseAdmin
            .from('coupon_uses')
            .select(`
        id,
        discount_applied,
        used_at,
        profiles (
          id,
          full_name,
          email
        ),
        orders (
          order_number,
          total_amount,
          status
        )
      `)
            .eq('coupon_id', id)
            .order('used_at', { ascending: false });

        if (error) {
            console.error('[Coupon Stats] Error:', error);
            return res.status(500).json({ error: "Gagal mengambil statistik kupon" });
        }

        res.json({ usage: data || [] });

    } catch (err) {
        console.error('[Coupon Stats] Error:', err);
        res.status(500).json({ error: "Internal server error" });
    }
});
