// ============================================================================
// SHIPPING & BITESHIP API INTEGRATION
// ============================================================================

const BITESHIP_API_KEY = process.env.BITESHIP_API_KEY;
const BITESHIP_BASE_URL = process.env.BITESHIP_BASE_URL || 'https://api.biteship.com/v1';

// Helper: Call Biteship API
async function callBiteshipAPI(endpoint, method = 'GET', body = null) {
    const url = `${BITESHIP_BASE_URL}${endpoint}`;

    const options = {
        method,
        headers: {
            'Authorization': BITESHIP_API_KEY,
            'Content-Type': 'application/json'
        }
    };

    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || `Biteship API error: ${response.status}`);
    }

    return data;
}

// ============================================================================
// SELLER ADDRESS MANAGEMENT
// ============================================================================

// Get Seller Address (from profile)
app.get('/seller/address', authenticateUser, async (req, res) => {
    try {
        const userId = req.userId;

        const { data: profile, error } = await supabaseAdmin
            .from('profiles')
            .select('seller_address, full_name, username')
            .eq('id', userId)
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
        }

        res.json({
            success: true,
            data: {
                seller_address: profile.seller_address,
                full_name: profile.full_name,
                username: profile.username
            }
        });

    } catch (err) {
        console.error('Get seller address error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update/Create Seller Address
app.post('/seller/address', authenticateUser, async (req, res) => {
    try {
        const userId = req.userId;
        const {
            sender_name,
            phone_number,
            full_address,
            city,
            province,
            postal_code,
            latitude,
            longitude
        } = req.body;

        // Validation
        if (!sender_name || !phone_number || !full_address || !city || !province || !postal_code) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: sender_name, phone_number, full_address, city, province, postal_code'
            });
        }

        // Validate postal code (5 digits)
        if (!/^\d{5}$/.test(postal_code)) {
            return res.status(400).json({
                success: false,
                error: 'Postal code must be 5 digits'
            });
        }

        // Build seller address 0bject
        const sellerAddress = {
            sender_name,
            phone_number,
            full_address,
            city,
            province,
            postal_code,
            coordinates: (latitude && longitude) ? { lat: latitude, lng: longitude } : null
        };

        // Update profile
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update({ seller_address: sellerAddress })
            .eq('id', userId)
            .select('seller_address')
            .single();

        if (error) {
            console.error('Update seller address error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update address' });
        }

        res.json({
            success: true,
            message: 'Seller address updated successfully',
            data: data.seller_address
        });

    } catch (err) {
        console.error('Update seller address error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// CALCULATE SHIPPING RATES (BITESHIP)
// ============================================================================

app.post('/shipping/calculate-rates', authenticateUser, async (req, res) => {
    try {
        const {
            destination_postal_code,
            destination_latitude,
            destination_longitude,
            destination_city,
            destination_province,
            item_weight, // in grams
            item_value,
            item_length,
            item_width,
            item_height,
            couriers // e.g., "jne,jnt,sicepat"
        } = req.body;

        // Get seller address from profile
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

        // Validation
        if (!destination_postal_code && (!destination_latitude || !destination_longitude)) {
            return res.status(400).json({
                success: false,
                error: 'Either destination_postal_code OR destination coordinates required'
            });
        }

        if (!item_weight) {
            return res.status(400).json({
                success: false,
                error: 'item_weight is required (in grams)'
            });
        }

        // Build Biteship API request
        const biteshipRequest = {
            // Origin (seller)
            origin_postal_code: sellerAddress.postal_code,

            // Destination (buyer)
            destination_postal_code: destination_postal_code || undefined,
            destination_latitude: destination_latitude || undefined,
            destination_longitude: destination_longitude || undefined,

            // Couriers (default to popular Indonesian couriers)
            couriers: couriers || 'jne,jnt,sicepat,pos,anteraja',

            // Items
            items: [{
                name: 'Product',
                value: item_value || 100000,
                weight: parseInt(item_weight),
                length: item_length || undefined,
                width: item_width || undefined,
                height: item_height || undefined,
                quantity: 1
            }]
        };

        // Add origin coordinates if available
        if (sellerAddress.coordinates) {
            biteshipRequest.origin_latitude = sellerAddress.coordinates.lat;
            biteshipRequest.origin_longitude = sellerAddress.coordinates.lng;
        }

        // Call Biteship API
        const biteshipResponse = await callBiteshipAPI('/rates/couriers', 'POST', biteshipRequest);

        // Format response
        const formattedRates = biteshipResponse.pricing.map(rate => ({
            courier_code: rate.courier_code,
            courier_name: rate.courier_name,
            courier_service_code: rate.courier_service_code,
            courier_service_name: rate.courier_service_name,
            description: rate.description,
            shipping_cost: rate.price,
            estimated_days: rate.duration,
            company: rate.company,
            type: rate.type
        }));

        res.json({
            success: true,
            origin: {
                city: sellerAddress.city,
                province: sellerAddress.province,
                postal_code: sellerAddress.postal_code
            },
            destination: {
                city: destination_city,
                province: destination_province,
                postal_code: destination_postal_code
            },
            rates: formattedRates
        });

    } catch (err) {
        console.error('Calculate shipping rates error:', err);

        // Handle Biteship API errors
        if (err.message.includes('Biteship')) {
            return res.status(502).json({
                success: false,
                error: 'Shipping service error: ' + err.message
            });
        }

        res.status(500).json({
            success: false,
            error: err.message || 'Failed to calculate shipping rates'
        });
    }
});

// ============================================================================
// END SHIPPING ENDPOINTS
// ============================================================================
