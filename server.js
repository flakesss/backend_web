const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

// Load environment variables from .env file
require('dotenv').config();

const app = express();
const port = process.env.PORT || 1234;

// ============================================================
// CORS CONFIGURATION
// ============================================================
// For production: Set FRONTEND_URL in your .env file
// Example: FRONTEND_URL=https://yourdomain.com
const allowedOrigins = [
  process.env.FRONTEND_URL,           // Production domain
  'http://localhost:5173',             // Vite dev server
  'http://localhost:3000',             // Alternative dev port
  'http://127.0.0.1:5173',
].filter(Boolean); // Remove undefined values

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV !== 'production') {
      // In development, allow all origins
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ ERROR: Missing Supabase credentials!");
  console.error("Please ensure your .env file contains:");
  console.error("  SUPABASE_URL=https://your-project.supabase.co");
  console.error("  SUPABASE_ANON_KEY=your-anon-key");
  console.error("  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key");
  process.exit(1);
}

// Public client (respects RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client (bypasses RLS - use carefully!)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================
// HELPER: Generate Order Number
// ============================================================
function generateOrderNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `ORD-${dateStr}-${random}`;
}

// ============================================================
// HELPER: Create Notification
// ============================================================
async function createNotification(userId, type, title, message, orderId = null, orderNumber = null, metadata = {}) {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: userId,
        type,
        title,
        message,
        order_id: orderId,
        order_number: orderNumber,
        metadata,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("Failed to create notification:", error);
    }
    return !error;
  } catch (err) {
    console.error("Create notification error:", err);
    return false;
  }
}

// ============================================================
// MIDDLEWARE: Authentication
// ============================================================
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    req.user = user;
    // Create authenticated client for this user
    req.authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
};

// Optional auth - attach user if token exists, but don't block
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user) {
        req.user = user;
        req.authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
      }
    } catch (e) {
      // Ignore errors, just proceed without auth
    }
  }
  next();
};

// Admin check middleware
const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Check if user has admin role in profiles table
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", req.user.id)
    .single();

  if (error || !profile || profile.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  next();
};

// ============================================================
// ROUTES: Authentication
// ============================================================

// Register new user with phone, email, username
app.post("/auth/register", async (req, res) => {
  const { phone, email, username, password, full_name, captchaToken } = req.body;

  // Validate required fields
  if (!phone || !email || !username || !password) {
    return res.status(400).json({ error: "Phone, email, username, and password are required" });
  }

  // Captcha token wajib untuk mencegah spam
  if (!captchaToken) {
    return res.status(400).json({ error: "Captcha verification required" });
  }

  try {
    // Step 1: Check if username is already taken
    const { data: existingUsername } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // Step 2: Check if phone is already registered
    const { data: existingPhone } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .single();

    if (existingPhone) {
      return res.status(400).json({ error: "Phone number already registered" });
    }

    // Step 3: Check if email exists (for merging existing users)
    const { data: existingEmailUser, error: emailCheckError } = await supabaseAdmin.auth.admin.listUsers();
    const userWithEmail = existingEmailUser?.users?.find(u => u.email === email);

    if (userWithEmail) {
      // Existing user - merge by updating their profile with phone and username
      console.log("Merging existing user:", email);

      // Update profile with phone and username
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          phone: phone,
          username: username,
          updated_at: new Date().toISOString()
        })
        .eq("id", userWithEmail.id);

      if (updateError) {
        console.error("Profile update error:", updateError);
        return res.status(500).json({ error: "Failed to update profile" });
      }

      // Update auth user metadata
      const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
        userWithEmail.id,
        {
          phone: phone,
          user_metadata: {
            ...userWithEmail.user_metadata,
            username: username,
            full_name: full_name || userWithEmail.user_metadata?.full_name
          }
        }
      );

      if (metaError) {
        console.error("Metadata update error:", metaError);
      }

      return res.status(200).json({
        message: "Account updated successfully. Please verify your phone number.",
        user: userWithEmail,
        merged: true,
        requires_phone_verification: true
      });
    }

    // Step 4: New user - Register with Supabase Phone Auth
    // First, create the user account with email
    // NOTE: Don't send captchaToken to phone auth - it blocks OTP delivery
    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      phone: phone,
      email_confirm: false, // We'll verify via phone OTP instead
      phone_confirm: false, // Will be confirmed via OTP
      user_metadata: {
        email: email,
        username: username,
        full_name: full_name || "",
      }
      // ❌ DO NOT include captchaToken here - it blocks Supabase phone auth
    });

    if (signUpError) {
      console.error("Supabase createUser error:", signUpError);
      return res.status(400).json({ error: signUpError.message });
    }

    // Update profile with phone, email and username
    if (signUpData.user) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          phone: phone,
          email: email,
          username: username
        })
        .eq("id", signUpData.user.id);

      if (profileError) {
        console.error("Profile update error:", profileError);
      }
    }

    // Now send OTP to the phone number
    // NOTE: Don't include captchaToken - it's already validated in our backend
    const { data: otpData, error: otpError } = await supabase.auth.signInWithOtp({
      phone: phone,
      // ❌ DO NOT include captchaToken here - causes OTP delivery to fail
    });

    if (otpError) {
      console.error("OTP send error:", otpError);
      // User is created but OTP failed - still return success but warn
      return res.status(201).json({
        message: "Registration successful but failed to send OTP. Please try resend OTP.",
        user: signUpData.user,
        requires_phone_verification: true,
        otp_error: otpError.message
      });
    }

    console.log("OTP sent successfully to:", phone);

    res.status(201).json({
      message: "Registration successful. Please verify the OTP sent to your phone.",
      user: signUpData.user,
      requires_phone_verification: true
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Login with phone, email, or username
app.post("/auth/login", async (req, res) => {
  const { identifier, password, captchaToken } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: "Identifier and password are required" });
  }

  // Captcha token wajib untuk keamanan
  if (!captchaToken) {
    return res.status(400).json({ error: "Captcha verification required" });
  }

  try {
    let loginData, loginError;

    // Smart identifier detection
    if (identifier.includes('@')) {
      // Email login
      console.log("Login attempt with email:", identifier);
      const result = await supabase.auth.signInWithPassword({
        email: identifier,
        password,
        options: {
          captchaToken: captchaToken,
        },
      });
      loginData = result.data;
      loginError = result.error;
    } else if (/^[0-9+]/.test(identifier)) {
      // Phone login
      console.log("Login attempt with phone:", identifier);
      const result = await supabase.auth.signInWithPassword({
        phone: identifier,
        password,
        options: {
          captchaToken: captchaToken,
        },
      });
      loginData = result.data;
      loginError = result.error;
    } else {
      // Username login - need to find user first
      console.log("Login attempt with username:", identifier);

      // Find user by username
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("username", identifier)
        .single();

      if (profileError || !profile) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Login with their phone or email
      if (profile.phone) {
        const result = await supabase.auth.signInWithPassword({
          phone: profile.phone,
          password,
          options: {
            captchaToken: captchaToken,
          },
        });
        loginData = result.data;
        loginError = result.error;
      } else if (profile.email) {
        const result = await supabase.auth.signInWithPassword({
          email: profile.email,
          password,
          options: {
            captchaToken: captchaToken,
          },
        });
        loginData = result.data;
        loginError = result.error;
      } else {
        return res.status(401).json({ error: "User account is incomplete" });
      }
    }

    if (loginError) {
      return res.status(401).json({ error: loginError.message });
    }

    // Check if phone is verified (for phone-based auth)
    if (loginData.user?.phone && !loginData.user?.phone_confirmed_at) {
      return res.status(401).json({
        error: "Phone number not verified. Please verify your phone number.",
        code: "PHONE_NOT_VERIFIED",
        phone: loginData.user.phone
      });
    }

    // Get full profile data
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", loginData.user.id)
      .single();

    res.json({
      token: loginData.session.access_token,
      user: {
        ...loginData.user,
        ...profile
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Verify phone OTP 
app.post("/auth/verify-otp", async (req, res) => {
  const { phone, token } = req.body;

  if (!phone || !token) {
    return res.status(400).json({ error: "Phone and OTP token are required" });
  }

  try {
    // Verify OTP via Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms'
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: "Phone verified successfully",
      session: data.session,
      user: data.user
    });
  } catch (err) {
    console.error("OTP verification error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Resend OTP
app.post("/auth/resend-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phone,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: "OTP sent successfully"
    });
  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Check availability (for real-time validation)
app.post("/auth/check-availability", async (req, res) => {
  const { type, value } = req.body;

  if (!type || !value) {
    return res.status(400).json({ error: "Type and value are required" });
  }

  try {
    let exists = false;

    if (type === 'username') {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", value)
        .single();
      exists = !!data;
    } else if (type === 'phone') {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", value)
        .single();
      exists = !!data;
    } else if (type === 'email') {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      exists = users.users.some(u => u.email === value);
    }

    res.json({
      available: !exists
    });
  } catch (err) {
    console.error("Check availability error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user profile
app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await req.authClient
      .from("profiles")
      .select("*")
      .eq("id", req.user.id)
      .single();

    if (error) {
      // Profile might not exist yet
      return res.json({
        id: req.user.id,
        email: req.user.email,
        full_name: req.user.user_metadata?.full_name || "",
      });
    }

    res.json(profile);
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================
// ROUTES: Bank Accounts (Seller's receiving bank)
// ============================================================

// Get user's bank accounts
app.get("/bank-accounts", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("bank_accounts")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Map 'bank' column to 'bank_name' for frontend compatibility
    const mappedData = (data || []).map(acc => ({
      ...acc,
      bank_name: acc.bank  // Add bank_name field
    }));

    res.json(mappedData);
  } catch (err) {
    console.error("Get bank accounts error:", err);
    res.status(500).json({ error: "Failed to fetch bank accounts" });
  }
});

// Add bank account
app.post("/bank-accounts", requireAuth, async (req, res) => {
  // Frontend sends bank_name, but database column is 'bank'
  const { bank_name, account_number, account_name } = req.body;

  if (!bank_name || !account_number || !account_name) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // Use admin client to bypass RLS
    // Note: database column is 'bank', not 'bank_name'
    const { data, error } = await supabaseAdmin.from("bank_accounts").insert({
      user_id: req.user.id,
      bank: bank_name,  // Map bank_name to 'bank' column
      account_number,
      account_name,
    }).select().single();

    if (error) {
      console.error("Bank account insert error:", error);
      throw error;
    }

    // Return with bank_name for frontend compatibility
    res.status(201).json({
      ...data,
      bank_name: data.bank  // Add bank_name for frontend
    });
  } catch (err) {
    console.error("Add bank account error:", err);
    res.status(500).json({ error: err.message || "Failed to add bank account" });
  }
});

// ============================================================
// ROUTES: Company Bank Accounts (for transfer display)
// ============================================================

// Get active company bank accounts (public - no auth required)
app.get("/company-bank-accounts", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("company_bank_accounts")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("Fetch company bank accounts error:", err);
    res.status(500).json({ error: "Failed to fetch company bank accounts" });
  }
});

// ============================================================
// ROUTES: Orders (Seller creates, Buyer pays)
// ============================================================

// Create new order (Seller)
app.post("/orders", requireAuth, async (req, res) => {
  const { title, description, product_price, platform_fee, total_amount, bank_account_id } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  // Validate amount - accept either new format (product_price + platform_fee) or old format (total_amount)
  let finalProductPrice, finalPlatformFee, finalTotalAmount;

  if (product_price !== undefined && platform_fee !== undefined && total_amount !== undefined) {
    // New format with fee breakdown
    finalProductPrice = parseInt(product_price);
    finalPlatformFee = parseInt(platform_fee);
    finalTotalAmount = parseInt(total_amount);
  } else if (total_amount !== undefined) {
    // Old format - backward compatibility
    finalTotalAmount = parseInt(total_amount);
    // Calculate fee (2.5%) for old orders
    finalPlatformFee = Math.ceil(finalTotalAmount * 0.025);
    finalProductPrice = finalTotalAmount - finalPlatformFee;
  } else {
    return res.status(400).json({ error: "Amount information is required" });
  }

  try {
    const orderNumber = generateOrderNumber();

    // Create order with fee breakdown
    const { data: order, error: orderError } = await req.authClient
      .from("orders")
      .insert({
        seller_id: req.user.id,
        order_number: orderNumber,
        title,
        description: description || "",
        product_price: finalProductPrice,
        platform_fee: finalPlatformFee,
        total_amount: finalTotalAmount,
        status: "awaiting_payment",
        bank_account_id: bank_account_id || null,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Order creation error:", orderError);
      throw orderError;
    }

    // Create associated payment record
    const { data: payment, error: paymentError } = await req.authClient
      .from("payments")
      .insert({
        order_id: order.id,
        bank_account_id: bank_account_id || null,
        amount: finalTotalAmount,
        status: "pending",
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Payment creation error:", paymentError);
      // Order created but payment failed - return order anyway
    }

    // Send notification to seller that order was created
    await createNotification(
      req.user.id,
      "order_created",
      "Pesanan Berhasil Dibuat 📋",
      `Pesanan ${orderNumber} telah dibuat. Bagikan link pembayaran ke pembeli.`,
      order.id,
      orderNumber,
      { amount: finalTotalAmount, product_price: finalProductPrice, platform_fee: finalPlatformFee }
    );

    res.status(201).json({
      ...order,
      payment: payment || null,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Get order by ID (with payments) - requires auth
app.get("/orders/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await req.authClient
      .from("orders")
      .select(`
        *,
        payments (*),
        seller:profiles!orders_seller_id_fkey (id, full_name, email)
      `)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Order not found" });
      }
      throw error;
    }

    res.json(data);
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Get order by order number (PUBLIC - for buyer payment page)
app.get("/orders/number/:orderNumber", async (req, res) => {
  const { orderNumber } = req.params;

  try {
    // Use admin client to bypass RLS for public order lookup
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        order_number,
        title,
        description,
        total_amount,
        status,
        buyer_id,
        seller_id,
        created_at
      `)
      .eq("order_number", orderNumber)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Order not found" });
      }
      throw error;
    }

    // Return order info with buyer_id for confirmation
    res.json({
      order_id: data.id,
      order_number: data.order_number,
      title: data.title,
      description: data.description,
      total_amount: data.total_amount,
      status: data.status,
      buyer_id: data.buyer_id,
      seller_id: data.seller_id,
    });
  } catch (err) {
    console.error("Get order by number error:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Get user's orders (as seller)
app.get("/orders", requireAuth, async (req, res) => {
  try {
    const { data, error } = await req.authClient
      .from("orders")
      .select(`
        *,
        payments (*)
      `)
      .eq("seller_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Update order status
app.patch("/orders/:id/status", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = [
    "awaiting_payment",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const { data, error } = await req.authClient
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Update order status error:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// ============================================================
// ROUTES: Buyer Confirmation
// ============================================================

// Buyer confirms order received
app.post("/orders/:id/confirm-received", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    // Get order to verify buyer
    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check if user is the buyer
    if (order.buyer_id !== req.user.id) {
      return res.status(403).json({ error: "Only the buyer can confirm receipt" });
    }

    // Check if order is in correct status (paid or shipped)
    if (!["paid", "shipped", "delivered"].includes(order.status)) {
      return res.status(400).json({ error: "Order must be paid first" });
    }

    // Update order status to completed
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ status: "completed" })
      .eq("id", id);

    if (updateError) throw updateError;

    // Create fund release record for seller payout
    await supabaseAdmin.from("fund_releases").insert({
      order_id: id,
      seller_id: order.seller_id,
      amount: order.total_amount,
      status: "pending",
    });

    res.json({
      message: "Order confirmed as received. Funds will be released to seller.",
      status: "completed"
    });
  } catch (err) {
    console.error("Confirm received error:", err);
    res.status(500).json({ error: "Failed to confirm order receipt" });
  }
});

// ============================================================
// ROUTES: Payments & Payment Proofs
// ============================================================

// Get payment by order ID
app.get("/payments/order/:orderId", requireAuth, async (req, res) => {
  const { orderId } = req.params;

  try {
    const { data, error } = await req.authClient
      .from("payments")
      .select(`
        *,
        payment_proofs (*)
      `)
      .eq("order_id", orderId)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Get payment error:", err);
    res.status(500).json({ error: "Failed to fetch payment" });
  }
});

// Upload payment proof (Buyer uploads proof of transfer)
// Note: For file uploads, you need multer. Install with: npm i multer
// This version stores base64 or expects frontend to upload to Supabase Storage directly
app.post("/payment-proofs", optionalAuth, async (req, res) => {
  const { payment_id, order_id, amount, proof_url, note } = req.body;

  if (!payment_id || !order_id) {
    return res.status(400).json({ error: "Payment ID and Order ID are required" });
  }

  try {
    // Use admin client to bypass RLS for payment proof submission
    // Only include essential fields that are guaranteed to exist
    const insertData = {
      payment_id,
      order_id,
      amount: amount ? parseInt(amount) : null,
      proof_url: proof_url || null,
      note: note || "",
      status: "pending",
    };

    const { data, error } = await supabaseAdmin
      .from("payment_proofs")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Payment proof error:", error);
      throw error;
    }

    // Update order status to 'verification' and set buyer_id if user is logged in
    const orderUpdate = { status: "verification" };
    if (req.user?.id) {
      orderUpdate.buyer_id = req.user.id;
    }
    await supabaseAdmin
      .from("orders")
      .update(orderUpdate)
      .eq("id", order_id);

    // Update payment status
    await supabaseAdmin
      .from("payments")
      .update({ status: "awaiting_verification" })
      .eq("id", payment_id);

    // Get order details for notification
    const { data: orderData } = await supabaseAdmin
      .from("orders")
      .select("seller_id, buyer_id, order_number, title, total_amount")
      .eq("id", order_id)
      .single();

    if (orderData) {
      // Notify seller that buyer has submitted payment proof
      if (orderData.seller_id) {
        await createNotification(
          orderData.seller_id,
          "payment_submitted",
          "Bukti Pembayaran Diterima 📤",
          `Pembeli telah mengirim bukti pembayaran untuk pesanan ${orderData.order_number}. Menunggu verifikasi admin.`,
          order_id,
          orderData.order_number,
          { amount: orderData.total_amount }
        );
      }

      // Notify buyer that their payment is being verified
      if (req.user?.id) {
        await createNotification(
          req.user.id,
          "payment_submitted",
          "Bukti Pembayaran Terkirim 📤",
          `Bukti pembayaran untuk pesanan ${orderData.order_number} telah dikirim dan sedang diverifikasi.`,
          order_id,
          orderData.order_number
        );
      }
    }

    res.status(201).json({
      message: "Payment proof submitted successfully",
      data,
    });
  } catch (err) {
    console.error("Submit payment proof error:", err);
    res.status(500).json({ error: "Failed to submit payment proof" });
  }
});

// ============================================================
// ROUTES: Admin Panel
// ============================================================

// Get all orders (Admin)
app.get("/admin/orders", requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.query;

  try {
    let query = supabaseAdmin
      .from("orders")
      .select(`
        *,
        payments (*),
        seller:profiles!orders_seller_id_fkey (id, full_name, email)
      `)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Admin get orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Get all pending payment proofs (Admin)
app.get("/admin/payment-proofs", requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.query;

  try {
    // First, get all payment proofs without ordering by submitted_at (might not exist)
    let query = supabaseAdmin
      .from("payment_proofs")
      .select(`
        *,
        order:orders (id, order_number, title, total_amount, seller_id),
        payment:payments (id, amount, status)
      `);

    if (status && status !== 'all') {
      query = query.eq("status", status);
    }
    // If no status or status is 'all', return all proofs

    const { data, error } = await query;

    if (error) {
      console.error("Payment proofs query error:", error);
      throw error;
    }

    console.log(`Found ${data?.length || 0} payment proofs with status: ${status || 'pending'}`);
    res.json(data || []);
  } catch (err) {
    console.error("Admin get payment proofs error:", err);
    res.status(500).json({ error: "Failed to fetch payment proofs" });
  }
});

// Approve or Reject payment proof (Admin)
app.patch("/admin/payment-proofs/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { action, rejection_reason } = req.body; // action: 'approve' or 'reject'

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Use 'approve' or 'reject'" });
  }

  try {
    // Get payment proof details first
    const { data: proof, error: fetchError } = await supabaseAdmin
      .from("payment_proofs")
      .select("*, order:orders(*), payment:payments(*)")
      .eq("id", id)
      .single();

    if (fetchError || !proof) {
      return res.status(404).json({ error: "Payment proof not found" });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Update payment proof status - only update status field
    const { error: updateError } = await supabaseAdmin
      .from("payment_proofs")
      .update({ status: newStatus })
      .eq("id", id);

    if (updateError) {
      console.error("Update proof status error:", updateError);
      throw updateError;
    }

    // If approved, update order and payment status
    if (action === "approve") {
      await supabaseAdmin
        .from("orders")
        .update({ status: "paid" })
        .eq("id", proof.order_id);

      await supabaseAdmin
        .from("payments")
        .update({ status: "paid" })
        .eq("id", proof.payment_id);

      // Send notification to buyer
      if (proof.order?.buyer_id) {
        await createNotification(
          proof.order.buyer_id,
          "payment_verified",
          "Pembayaran Terverifikasi ✅",
          `Pembayaran untuk pesanan ${proof.order.order_number} telah diverifikasi. Pesanan akan segera diproses.`,
          proof.order_id,
          proof.order.order_number,
          { amount: proof.order.total_amount }
        );
      }

      // Send notification to seller
      if (proof.order?.seller_id) {
        await createNotification(
          proof.order.seller_id,
          "payment_verified",
          "Pembayaran Diterima 💰",
          `Pembayaran untuk pesanan ${proof.order.order_number} telah dikonfirmasi. Silakan proses pengiriman barang.`,
          proof.order_id,
          proof.order.order_number,
          { amount: proof.order.total_amount }
        );
      }
    } else {
      // If rejected, set order back to awaiting_payment
      await supabaseAdmin
        .from("orders")
        .update({ status: "awaiting_payment" })
        .eq("id", proof.order_id);

      await supabaseAdmin
        .from("payments")
        .update({ status: "rejected" })
        .eq("id", proof.payment_id);

      // Send notification to buyer about rejection
      if (proof.order?.buyer_id) {
        await createNotification(
          proof.order.buyer_id,
          "payment_rejected",
          "Bukti Pembayaran Ditolak ❌",
          `Bukti pembayaran untuk pesanan ${proof.order.order_number} tidak valid. ${rejection_reason ? `Alasan: ${rejection_reason}` : 'Silakan unggah ulang bukti pembayaran yang benar.'}`,
          proof.order_id,
          proof.order.order_number,
          { rejection_reason }
        );
      }
    }

    res.json({
      message: `Payment proof ${newStatus}`,
      status: newStatus,
    });
  } catch (err) {
    console.error("Admin update payment proof error:", err);
    res.status(500).json({ error: "Failed to update payment proof" });
  }
});

// Mark order as delivered (triggers fund release to seller)
app.patch("/admin/orders/:id/deliver", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Get order with seller bank account
    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        seller:profiles!orders_seller_id_fkey (id, full_name, email),
        payments (*)
      `)
      .eq("id", id)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "paid" && order.status !== "shipped") {
      return res.status(400).json({ error: "Order must be paid or shipped first" });
    }

    // Update order status to delivered
    await supabaseAdmin
      .from("orders")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Create fund release record (for tracking)
    await supabaseAdmin.from("fund_releases").insert({
      order_id: id,
      seller_id: order.seller_id,
      amount: order.total_amount,
      status: "pending", // Admin will manually transfer
      created_at: new Date().toISOString(),
    });

    res.json({
      message: "Order marked as delivered. Fund release initiated.",
      order_id: id,
      seller_id: order.seller_id,
      amount: order.total_amount,
    });
  } catch (err) {
    console.error("Admin deliver order error:", err);
    res.status(500).json({ error: "Failed to mark order as delivered" });
  }
});

// Complete fund release (Admin confirms transfer to seller)
app.patch("/admin/fund-releases/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { transfer_proof, transfer_note } = req.body;

  try {
    // Update fund release
    const { data, error } = await supabaseAdmin
      .from("fund_releases")
      .update({
        status: "completed",
        transferred_at: new Date().toISOString(),
        transferred_by: req.user.id,
        transfer_proof,
        transfer_note,
      })
      .eq("id", id)
      .select("*, order:orders(*)")
      .single();

    if (error) throw error;

    // Mark order as completed
    if (data.order_id) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", data.order_id);
    }

    // Send notification to seller about fund release
    if (data.seller_id && data.order) {
      await createNotification(
        data.seller_id,
        "fund_released",
        "Dana Telah Dicairkan 🎉",
        `Dana sebesar Rp ${data.amount?.toLocaleString('id-ID')} untuk pesanan ${data.order.order_number} telah ditransfer ke rekening Anda.`,
        data.order_id,
        data.order.order_number,
        { amount: data.amount, transfer_note }
      );
    }

    // Send notification to buyer about order completion
    if (data.order?.buyer_id) {
      await createNotification(
        data.order.buyer_id,
        "order_completed",
        "Transaksi Selesai 🎉",
        `Transaksi ${data.order.order_number} telah selesai. Terima kasih telah bertransaksi di Flocify!`,
        data.order_id,
        data.order.order_number
      );
    }

    res.json({
      message: "Fund release completed",
      data,
    });
  } catch (err) {
    console.error("Admin complete fund release error:", err);
    res.status(500).json({ error: "Failed to complete fund release" });
  }
});

// Get pending fund releases (Admin)
app.get("/admin/fund-releases", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("fund_releases")
      .select(`
        *,
        order:orders (
          id, 
          order_number, 
          title, 
          total_amount,
          bank_account:bank_accounts (id, bank, account_number, account_name)
        ),
        seller:profiles!fund_releases_seller_id_fkey (id, full_name, email)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Map bank to bank_name for frontend compatibility
    const mappedData = (data || []).map(fund => {
      if (fund.order?.bank_account) {
        fund.order.bank_account.bank_name = fund.order.bank_account.bank;
      }
      return fund;
    });

    res.json(mappedData);
  } catch (err) {
    console.error("Admin get fund releases error:", err);
    res.status(500).json({ error: "Failed to fetch fund releases" });
  }
});

// ============================================================
// ROUTES: Dashboard Stats
// ============================================================

app.get("/dashboard/stats", requireAuth, async (req, res) => {
  try {
    // Get user's order stats
    const { data: orders, error } = await req.authClient
      .from("orders")
      .select("id, status, total_amount")
      .eq("seller_id", req.user.id);

    if (error) throw error;

    const stats = {
      total_orders: orders?.length || 0,
      awaiting_payment: orders?.filter((o) => o.status === "awaiting_payment").length || 0,
      paid: orders?.filter((o) => ["paid", "shipped", "delivered"].includes(o.status)).length || 0,
      completed: orders?.filter((o) => o.status === "completed").length || 0,
      total_revenue: orders
        ?.filter((o) => o.status === "completed")
        .reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0,
    };

    res.json(stats);
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ============================================================
// NOTIFICATIONS ENDPOINTS
// ============================================================

// Get user's notifications
app.get("/notifications", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Get unread notifications count
app.get("/notifications/count", requireAuth, async (req, res) => {
  try {
    const { count, error } = await supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", req.user.id)
      .eq("is_read", false);

    if (error) throw error;

    res.json({ unread: count || 0 });
  } catch (err) {
    console.error("Get notification count error:", err);
    res.status(500).json({ error: "Failed to fetch notification count" });
  }
});

// Mark notification as read
app.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", req.user.id);

    if (error) throw error;

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("Mark notification read error:", err);
    res.status(500).json({ error: "Failed to update notification" });
  }
});

// Mark all notifications as read
app.patch("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq("user_id", req.user.id)
      .eq("is_read", false);

    if (error) throw error;

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error("Mark all notifications read error:", err);
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

// ============================================================
// Health Check
// ============================================================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Flocify API Server",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Start Server
// ============================================================
app.listen(port, () => {
  console.log(`🚀 Flocify API server running on http://localhost:${port}`);
  console.log(`📋 Endpoints available:`);
  console.log(`   POST /auth/register - Register new user`);
  console.log(`   POST /auth/login - Login`);
  console.log(`   GET  /auth/me - Get current user`);
  console.log(`   POST /orders - Create order (Seller)`);
  console.log(`   GET  /orders - Get user's orders`);
  console.log(`   GET  /orders/:id - Get order detail`);
  console.log(`   GET  /orders/number/:num - Public order lookup`);
  console.log(`   POST /payment-proofs - Submit payment proof`);
  console.log(`   GET  /admin/orders - Admin: Get all orders`);
  console.log(`   GET  /admin/payment-proofs - Admin: Get pending proofs`);
  console.log(`   PATCH /admin/payment-proofs/:id - Admin: Approve/Reject`);
});
