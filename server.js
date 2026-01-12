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

console.log('Allowed CORS origins:', allowedOrigins);
console.log('NODE_ENV:', process.env.NODE_ENV);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      console.log('CORS allowed:', origin);
      callback(null, true);
    } else if (process.env.NODE_ENV !== 'production') {
      // In development, allow all origins
      console.log('CORS allowed (dev mode):', origin);
      callback(null, true);
    } else {
      // In production, check if FRONTEND_URL is set, if not allow all (temporary)
      if (!process.env.FRONTEND_URL) {
        console.log('⚠️ FRONTEND_URL not set, allowing:', origin);
        callback(null, true);
      } else {
        console.log('❌ CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
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
// AUTO-CANCEL SCHEDULER
// ============================================================
const { startAutoCancelScheduler } = require('./jobs/autoCancelOrders');

// Start the auto-cancel scheduler when server starts
if (process.env.NODE_ENV !== 'test') {
  startAutoCancelScheduler();
}

// ============================================================
// ADMIN MIDDLEWARE
// ============================================================
const { requireAdmin } = require('./middleware/requireAdmin');

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

// ============================================================
// ADMIN CHECK ENDPOINT
// ============================================================
app.get("/admin/check", requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      return res.json({ isAdmin: false });
    }

    res.json({
      isAdmin: profile.role === 'admin',
      role: profile.role
    });
  } catch (err) {
    console.error('Admin check error:', err);
    res.json({ isAdmin: false });
  }
});

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

// ============================================================
// ROUTES: Authentication
// ============================================================


// Register new user with phone, username (email optional)
app.post("/auth/register", async (req, res) => {
  const { phone, email, username, password, full_name } = req.body;

  // Validate required fields (email is now OPTIONAL)
  if (!phone || !username || !password) {
    return res.status(400).json({ error: "Phone, username, and password are required" });
  }

  // Validate password strength
  const { validatePasswordStrength, getPasswordErrorMessage } = require('./utils/passwordValidator');
  const passwordValidation = validatePasswordStrength(password);

  if (!passwordValidation.isValid) {
    const errorMessage = getPasswordErrorMessage(passwordValidation.requirements);
    return res.status(400).json({
      error: errorMessage,
      requirements: passwordValidation.requirements
    });
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

    // Step 3: If email provided, check if it exists
    if (email) {
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
    }

    // Step 4: New user - Register with phone (email optional)
    // Generate a dummy email if not provided (Supabase requires email field)
    const userEmail = email || `${phone.replace(/\+/g, '')}@temp.flocify.local`;

    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email: userEmail,
      password: password,
      phone: phone,
      email_confirm: email ? false : true, // Auto-confirm if dummy email
      phone_confirm: false, // Will be confirmed via OTP
      user_metadata: {
        email: email || null, // Store actual email (or null)
        username: username,
        full_name: full_name || "",
        has_email: !!email // Flag to track if user provided email
      }
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
          email: email || null, // Store real email or null
          username: username
        })
        .eq("id", signUpData.user.id);

      if (profileError) {
        console.error("Profile update error:", profileError);
      }
    }

    // Now send OTP to the phone number
    const { data: otpData, error: otpError } = await supabase.auth.signInWithOtp({
      phone: phone,
    });

    if (otpError) {
      console.error("OTP send error:", otpError);
      // User is created but OTP failed - still return success but warn
      return res.status(201).json({
        message: "Registration successful but failed to send OTP. Please try resend OTP.",
        user: signUpData.user,
        requires_phone_verification: true,
        otp_error: otpError.message,
        has_email: !!email
      });
    }

    console.log("OTP sent successfully to:", phone);

    res.status(201).json({
      message: "Registration successful. Please verify the OTP sent to your phone.",
      user: signUpData.user,
      requires_phone_verification: true,
      has_email: !!email
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



// Login with phone, email, or username
app.post("/auth/login", async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: "Identifier and password are required" });
  }

  try {
    let loginData, loginError;

    // Smart identifier detection
    if (identifier.includes('@')) {
      // Email login
      console.log("Login attempt with email:", identifier);
      const result = await supabase.auth.signInWithPassword({
        email: identifier,
        password
      });
      loginData = result.data;
      loginError = result.error;
    } else if (/^[0-9+]/.test(identifier)) {
      // Phone login
      console.log("Login attempt with phone:", identifier);
      const result = await supabase.auth.signInWithPassword({
        phone: identifier,
        password
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
          password
        });
        loginData = result.data;
        loginError = result.error;
      } else if (profile.email) {
        const result = await supabase.auth.signInWithPassword({
          email: profile.email,
          password
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

// ============================================================
// GOOGLE OAUTH CALLBACK
// ============================================================
const { handleOAuthUser } = require('./utils/oauthHandler');

app.post("/auth/oauth/callback", async (req, res) => {
  const { user } = req.body;

  if (!user || !user.email) {
    return res.status(400).json({ error: "Invalid OAuth user data" });
  }

  try {
    const result = await handleOAuthUser(user);

    if (!result.success) {
      return res.status(500).json({ error: result.error || "OAuth login failed" });
    }

    res.json({
      success: true,
      merged: result.merged,
      message: result.merged
        ? "Account linked successfully"
        : "OAuth login successful",
      userId: result.profileId
    });
  } catch (err) {
    console.error("OAuth callback error:", err);
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

// Update user profile
app.patch("/auth/me", requireAuth, async (req, res) => {
  const { full_name, phone } = req.body;

  try {
    // Normalize phone number to +62 format
    let normalizedPhone = phone;
    if (phone) {
      // Remove spaces, dashes, parentheses
      normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');

      // Convert 08xxx to +628xxx
      if (normalizedPhone.startsWith('08')) {
        normalizedPhone = '+62' + normalizedPhone.substring(1);
      }
      // Convert 8xxx to +628xxx  
      else if (normalizedPhone.startsWith('8') && !normalizedPhone.startsWith('+')) {
        normalizedPhone = '+62' + normalizedPhone;
      }
      // Already +62xxx, keep as is
      else if (normalizedPhone.startsWith('+62')) {
        normalizedPhone = normalizedPhone;
      }
      // Other formats - keep as user entered
    }

    // Update profile in database
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: full_name || null,
        phone: normalizedPhone || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", req.user.id)
      .select()
      .single();

    if (error) {
      console.error("Update profile error:", error);
      throw error;
    }

    // Also update user metadata in auth
    try {
      await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
        user_metadata: {
          ...req.user.user_metadata,
          full_name: full_name || req.user.user_metadata?.full_name,
        }
      });
    } catch (metaError) {
      console.error("Update user metadata error:", metaError);
      // Continue even if metadata update fails
    }

    res.json(data);
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Forgot Password - Send reset link to email
app.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // Check if user with this email exists
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = users.users.some(u => u.email === email);

    if (!userExists) {
      // Return success even if email doesn't exist (security best practice)
      return res.json({
        message: "If an account with that email exists, a password reset link has been sent."
      });
    }

    // Send password reset email via Supabase
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`
    });

    if (error) {
      console.error("Reset password error:", error);
      throw error;
    }

    res.json({
      message: "If an account with that email exists, a password reset link has been sent.",
      success: true
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

// Change password
app.post("/auth/change-password", requireAuth, async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: "New password is required" });
  }

  // Validate password strength
  const { validatePasswordStrength, getPasswordErrorMessage } = require('./utils/passwordValidator');
  const passwordValidation = validatePasswordStrength(newPassword);

  if (!passwordValidation.isValid) {
    const errorMessage = getPasswordErrorMessage(passwordValidation.requirements);
    return res.status(400).json({
      error: errorMessage,
      requirements: passwordValidation.requirements
    });
  }

  try {
    // Update user password using admin client
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      req.user.id,
      { password: newPassword }
    );

    if (error) {
      console.error("Change password error:", error);
      throw error;
    }

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// ============================================================
// ROUTES: Email Management (Add email to phone-only accounts)
// ============================================================

// Check email status for current user
app.get("/profile/email-status", requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", req.user.id)
      .single();

    // Check if current email is dummy
    const isDummyEmail = !profile?.email || profile.email.endsWith('@temp.flocify.local');

    // Is verified? Check email_confirmed_at
    const isVerified = req.user.email_confirmed_at && !isDummyEmail;

    // Has email? True if not dummy
    const hasEmail = !isDummyEmail;

    res.json({
      has_email: hasEmail,
      email: isDummyEmail ? null : profile?.email,
      is_verified: isVerified
    });
  } catch (err) {
    console.error("Get email status error:", err);
    res.status(500).json({ error: "Failed to get email status" });
  }
});

// Add email to user profile (Step 1: initiate)
app.post("/profile/add-email", requireAuth, async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  try {
    // Check if email already exists in system
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUsers.users.some(u =>
      u.email === email && u.id !== req.user.id
    );

    if (emailExists) {
      return res.status(400).json({ error: "Email already in use by another account" });
    }

    // Set email immediately as VERIFIED (skip verification for now)
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      req.user.id,
      {
        email: email,
        email_confirm: true,  // ← AUTO-VERIFY (no link needed!)
        user_metadata: {
          ...req.user.user_metadata,
          has_email: true
        }
      }
    );

    if (updateError) {
      console.error("Update user metadata error:", updateError);
      return res.status(500).json({ error: "Failed to update email: " + updateError.message });
    }

    // Update profiles table
    await supabaseAdmin
      .from("profiles")
      .update({ email: email })
      .eq("id", req.user.id);

    res.json({
      message: "Email added and verified successfully!",
      email: email,
      is_verified: true  // Already verified!
    });
  } catch (err) {
    console.error("Add email error:", err);
    res.status(500).json({ error: "Failed to add email: " + err.message });
  }
});

// Verify email - just set email_confirm to true
app.post("/profile/verify-email", requireAuth, async (req, res) => {
  try {
    // Just confirm the email that's already set
    await supabaseAdmin.auth.admin.updateUserById(
      req.user.id,
      {
        email_confirm: true,
        user_metadata: {
          ...req.user.user_metadata,
          has_email: true
        }
      }
    );

    // Update profile table updated_at
    await supabaseAdmin
      .from("profiles")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("id", req.user.id);

    res.json({
      message: "Email verified successfully!",
      email: req.user.email
    });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ error: "Failed to verify email" });
  }
});

// Resend email verification
app.post("/profile/resend-email-verification", requireAuth, async (req, res) => {
  // Get email from request body or use current user email
  const email = req.body.email || req.user.email;

  if (!email || email.endsWith('@temp.flocify.local')) {
    return res.status(400).json({ error: "No valid email to send verification to" });
  }

  try {
    // Send OTP to email
    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: false,
      }
    });

    if (error) {
      throw error;
    }

    res.json({ message: "Verification code resent to your email" });
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ error: "Failed to resend verification" });
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

  // Validate minimum product price (Rp 10,000)
  const MIN_PRODUCT_PRICE = 10000;
  if (finalProductPrice < MIN_PRODUCT_PRICE) {
    return res.status(400).json({
      error: `Nominal produk minimum adalah Rp ${MIN_PRODUCT_PRICE.toLocaleString('id-ID')}`,
      min_amount: MIN_PRODUCT_PRICE
    });
  }

  try {
    // RATE LIMITING: Check if user has created an order recently
    const COOLDOWN_MINUTES = 2; // 2 minutes cooldown
    const { data: recentOrders, error: checkError } = await supabaseAdmin
      .from('orders')
      .select('created_at')
      .eq('seller_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!checkError && recentOrders && recentOrders.length > 0) {
      const lastOrderTime = new Date(recentOrders[0].created_at);
      const now = new Date();
      const diffMinutes = (now - lastOrderTime) / 1000 / 60;

      if (diffMinutes < COOLDOWN_MINUTES) {
        const remainingSeconds = Math.ceil((COOLDOWN_MINUTES - diffMinutes) * 60);
        const remainingMinutes = Math.floor(remainingSeconds / 60);
        const remainingSecondsDisplay = remainingSeconds % 60;

        return res.status(429).json({
          error: "Terlalu cepat membuat pesanan",
          message: `Harap tunggu ${remainingMinutes > 0 ? `${remainingMinutes} menit ` : ''}${remainingSecondsDisplay} detik sebelum membuat pesanan baru`,
          cooldown_remaining_seconds: remainingSeconds,
          retry_after: new Date(lastOrderTime.getTime() + COOLDOWN_MINUTES * 60 * 1000).toISOString()
        });
      }
    }

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
// ROUTES: Order Cancellation
// ============================================================

// Cancel Order (Seller Only - Auto-cancel or Request Approval)
app.post("/orders/:id/cancel", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;

  try {
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        error: "Alasan pembatalan harus diisi (minimal 10 karakter)"
      });
    }

    // Get order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    // Verify seller
    if (order.seller_id !== userId) {
      return res.status(403).json({
        error: "Hanya penjual yang dapat membatalkan pesanan"
      });
    }

    // Check if already cancelled
    if (order.cancelled_at) {
      return res.status(400).json({
        error: "Pesanan sudah dibatalkan sebelumnya"
      });
    }

    // Check if order is completed/delivered
    if (order.status === 'completed' || order.status === 'delivered') {
      return res.status(400).json({
        error: "Tidak dapat membatalkan pesanan yang sudah selesai"
      });
    }

    // Check if payment proof exists
    const { data: paymentProof } = await supabaseAdmin
      .from('payment_proofs')
      .select('id')
      .eq('order_id', id)
      .maybeSingle();

    // AUTO-CANCEL if no payment proof
    if (!paymentProof) {
      const { error: cancelError } = await supabaseAdmin
        .from('orders')
        .update({
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          cancelled_by: userId,
          status: 'cancelled'
        })
        .eq('id', id);

      if (cancelError) {
        console.error('[Cancel Order] Error:', cancelError);
        return res.status(500).json({ error: "Gagal membatalkan pesanan" });
      }

      console.log(`[Cancel Order] Order ${id} cancelled automatically by seller ${userId}`);

      return res.json({
        success: true,
        message: "Pesanan berhasil dibatalkan",
        cancelled_immediately: true
      });
    }

    // CREATE CANCELLATION REQUEST if payment proof exists
    const { data: request, error: requestError } = await supabaseAdmin
      .from('order_cancellation_requests')
      .insert({
        order_id: id,
        requested_by: userId,
        reason: reason,
        status: 'pending'
      })
      .select()
      .single();

    if (requestError) {
      console.error('[Cancel Request] Error:', requestError);
      return res.status(500).json({ error: "Gagal membuat permintaan pembatalan" });
    }

    console.log(`[Cancel Request] Cancellation request created for order ${id} by seller ${userId}`);

    return res.json({
      success: true,
      message: "Permintaan pembatalan telah dikirim ke admin untuk ditinjau",
      cancelled_immediately: false,
      request_id: request.id
    });

  } catch (err) {
    console.error('[Cancel Order] Error:', err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get Cancellation Request Status for Order
app.get("/orders/:id/cancellation-request", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Verify user has access to this order
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('seller_id, buyer_id')
      .eq('id', id)
      .single();

    if (!order || (order.seller_id !== userId && order.buyer_id !== userId)) {
      return res.status(403).json({ error: "Tidak memiliki akses ke pesanan ini" });
    }

    // Get cancellation request
    const { data: request, error } = await supabaseAdmin
      .from('order_cancellation_requests')
      .select('*')
      .eq('order_id', id)
      .order('requested_at', { ascending: false })
      .maybeSingle();

    if (error) {
      console.error('[Get Cancellation Request] Error:', error);
      return res.status(500).json({ error: "Gagal mengambil data" });
    }

    res.json({
      has_request: !!request,
      request: request || null
    });

  } catch (err) {
    console.error('[Get Cancellation Request] Error:', err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get User's Cancellation Requests
app.get("/orders/my-cancellation-requests", requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data, error } = await supabaseAdmin
      .from('cancellation_requests_view')
      .select('*')
      .eq('requested_by', userId)
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('[My Cancellation Requests] Error:', error);
      return res.status(500).json({ error: "Gagal mengambil data" });
    }

    res.json({ requests: data || [] });

  } catch (err) {
    console.error('[My Cancellation Requests] Error:', err);
    res.status(500).json({ error: "Internal server error" });
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

// Get Cancellation Requests (Admin)
app.get("/admin/cancellation-requests", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query; // pending, approved, rejected

    let query = supabaseAdmin
      .from('cancellation_requests_view')
      .select('*');

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('requested_at', { ascending: false });

    if (error) {
      console.error('[Admin Cancellation Requests] Error:', error);
      return res.status(500).json({ error: "Gagal mengambil data" });
    }

    res.json({ requests: data || [] });

  } catch (err) {
    console.error('[Admin Cancellation Requests] Error:', err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Approve or Reject Cancellation Request (Admin)
app.patch("/admin/cancellation-requests/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { action, admin_notes } = req.body; // action: 'approve' or 'reject'
  const adminId = req.user.id;

  try {
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        error: "Action harus 'approve' atau 'reject'"
      });
    }

    // Get cancellation request
    const { data: request, error: requestError } = await supabaseAdmin
      .from('order_cancellation_requests')
      .select('*, orders(*)')
      .eq('id', id)
      .single();

    if (requestError || !request) {
      return res.status(404).json({ error: "Permintaan tidak ditemukan" });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        error: "Permintaan sudah diproses sebelumnya"
      });
    }

    // Update request status
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { error: updateError } = await supabaseAdmin
      .from('order_cancellation_requests')
      .update({
        status: newStatus,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        admin_notes: admin_notes || null
      })
      .eq('id', id);

    if (updateError) {
      console.error('[Admin Cancel Request Update] Error:', updateError);
      return res.status(500).json({ error: "Gagal memperbarui permintaan" });
    }

    // If approved, cancel the order
    if (action === 'approve') {
      const { error: cancelError } = await supabaseAdmin
        .from('orders')
        .update({
          cancelled_at: new Date().toISOString(),
          cancellation_reason: request.reason,
          cancelled_by: request.requested_by,
          status: 'cancelled'
        })
        .eq('id', request.order_id);

      if (cancelError) {
        console.error('[Admin Cancel Order] Error:', cancelError);
        return res.status(500).json({ error: "Gagal membatalkan pesanan" });
      }

      console.log(`[Admin Approve Cancel] Order ${request.order_id} cancelled by admin ${adminId}`);
    }

    res.json({
      success: true,
      message: action === 'approve'
        ? "Permintaan pembatalan disetujui. Pesanan dibatalkan."
        : "Permintaan pembatalan ditolak.",
      order_cancelled: action === 'approve'
    });

  } catch (err) {
    console.error('[Admin Cancel Request] Error:', err);
    res.status(500).json({ error: "Internal server error" });
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

// Get admin statistics
app.get("/admin/stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Get all orders
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, status, total_amount, created_at");

    if (ordersError) throw ordersError;

    // Get all payment proofs
    const { data: paymentProofs, error: proofsError } = await supabaseAdmin
      .from("payment_proofs")
      .select("id, status");

    if (proofsError) throw proofsError;

    // Get total users count
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, created_at");

    if (profilesError) throw profilesError;

    // Calculate stats
    const stats = {
      totalUsers: profiles?.length || 0,
      totalOrders: orders?.length || 0,
      pendingPayments: paymentProofs?.filter(p => p.status === 'pending').length || 0,
      verifiedPayments: orders?.filter(o => ['paid', 'shipped', 'delivered', 'completed'].includes(o.status)).length || 0,
      totalRevenue: orders
        ?.filter(o => o.status === 'completed')
        .reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0,
      // Additional useful stats
      awaitingPayment: orders?.filter(o => o.status === 'awaiting_payment').length || 0,
      inVerification: orders?.filter(o => o.status === 'verification').length || 0,
      activeOrders: orders?.filter(o => ['paid', 'shipped', 'delivered'].includes(o.status)).length || 0,
    };

    res.json(stats);
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch admin statistics" });
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
// ROUTES: Feedback (CSAT - Customer Satisfaction)
// ============================================================

// Submit feedback (can be authenticated or anonymous)
app.post("/feedback", optionalAuth, async (req, res) => {
  const { order_id, order_number, rating, comment, device_info } = req.body;

  // Validate required fields
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Rating must be between 1 and 5" });
  }

  try {
    // Determine feedback type from device_info context
    let feedbackType = 'buyer_payment_completed'; // default
    if (device_info?.context === 'seller_order_created') {
      feedbackType = 'seller_order_created';
    } else if (device_info?.context === 'post_transaction') {
      feedbackType = 'buyer_payment_completed';
    }

    // Get user full name from profile if authenticated
    let userFullName = null;
    if (req.user?.id) {
      try {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", req.user.id)
          .single();

        userFullName = profile?.full_name || null;
      } catch (profileErr) {
        console.error("Failed to fetch user profile:", profileErr);
        // Continue without name if profile fetch fails
      }
    }

    const feedbackData = {
      order_id: order_id || null,
      order_number: order_number || null,
      user_id: req.user?.id || null, // Can be null for anonymous feedback
      user_full_name: userFullName,
      rating: parseInt(rating),
      comment: comment || null,
      feedback_type: feedbackType,
      device_info: device_info || {},
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from("feedback")
      .insert(feedbackData)
      .select()
      .single();

    if (error) {
      console.error("Feedback submission error:", error);
      throw error;
    }

    // If order_id provided, optionally create a notification for seller
    if (order_id && feedbackType === 'buyer_payment_completed') {
      try {
        // Get order to find seller
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("seller_id, order_number")
          .eq("id", order_id)
          .single();

        if (order?.seller_id) {
          await createNotification(
            order.seller_id,
            "feedback_received",
            "Feedback Diterima ⭐",
            `${userFullName || 'Pembeli'} memberikan rating ${rating} bintang untuk order ${order.order_number}`,
            order_id,
            order.order_number,
            { rating, has_comment: !!comment, feedback_type: feedbackType }
          );
        }
      } catch (notifErr) {
        console.error("Failed to create feedback notification:", notifErr);
        // Don't fail the feedback submission if notification fails
      }
    }

    res.status(201).json({
      message: "Terima kasih atas feedback Anda!",
      feedback: data
    });
  } catch (err) {
    console.error("Submit feedback error:", err);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});


// Get feedback (admin only or by order_id for seller)
app.get("/feedback", requireAuth, async (req, res) => {
  const { order_id, limit = 100 } = req.query;

  try {
    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .single();

    let query = supabaseAdmin
      .from("feedback")
      .select(`
        *,
        order:orders (
          id,
          order_number,
          title,
          seller_id
        )
      `)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    // If not admin, only show feedback for their orders
    if (profile?.role !== "admin") {
      if (order_id) {
        // Verify user owns this order
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("seller_id")
          .eq("id", order_id)
          .single();

        if (!order || order.seller_id !== req.user.id) {
          return res.status(403).json({ error: "Access denied" });
        }

        query = query.eq("order_id", order_id);
      } else {
        // Get feedback for all user's orders
        const { data: userOrders } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("seller_id", req.user.id);

        const orderIds = (userOrders || []).map(o => o.id);
        query = query.in("order_id", orderIds);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("Get feedback error:", err);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// Get feedback summary/statistics (admin only)
app.get("/feedback/stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("feedback")
      .select("rating, created_at");

    if (error) throw error;

    const stats = {
      total: data.length,
      average_rating: data.length > 0
        ? (data.reduce((sum, f) => sum + f.rating, 0) / data.length).toFixed(2)
        : 0,
      rating_distribution: {
        1: data.filter(f => f.rating === 1).length,
        2: data.filter(f => f.rating === 2).length,
        3: data.filter(f => f.rating === 3).length,
        4: data.filter(f => f.rating === 4).length,
        5: data.filter(f => f.rating === 5).length,
      },
      recent_feedback: data.slice(0, 10)
    };

    res.json(stats);
  } catch (err) {
    console.error("Get feedback stats error:", err);
    res.status(500).json({ error: "Failed to fetch feedback statistics" });
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
// ROUTES: Push Notifications
// ============================================================

const { sendNotification, broadcastNotification } = require('./utils/sendNotification');

// Subscribe to push notifications
app.post("/notifications/subscribe", requireAuth, async (req, res) => {
  const { fcm_token, device_type, device_name } = req.body;
  const userId = req.user.id;

  if (!fcm_token) {
    return res.status(400).json({ error: "FCM token is required" });
  }

  try {
    // Upsert token (update if exists, insert if new)
    const { data, error } = await supabaseAdmin
      .from('fcm_tokens')
      .upsert({
        user_id: userId,
        token: fcm_token,
        device_type: device_type || 'web',
        device_name: device_name || null,
        last_used_at: new Date().toISOString(),
        is_active: true
      }, {
        onConflict: 'token',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      console.error('[Subscribe] Error:', error);
      throw error;
    }

    console.log(`[Subscribe] User ${userId} subscribed to push notifications`);

    res.json({
      success: true,
      message: 'Successfully subscribed to notifications',
      token_id: data.id
    });
  } catch (err) {
    console.error('[Subscribe] Error:', err);
    res.status(500).json({ error: 'Failed to subscribe to notifications' });
  }
});

// Unsubscribe from push notifications
app.delete("/notifications/unsubscribe", requireAuth, async (req, res) => {
  const { fcm_token } = req.body;
  const userId = req.user.id;

  if (!fcm_token) {
    return res.status(400).json({ error: "FCM token is required" });
  }

  try {
    const { error } = await supabaseAdmin
      .from('fcm_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', fcm_token);

    if (error) throw error;

    console.log(`[Unsubscribe] User ${userId} unsubscribed`);

    res.json({
      success: true,
      message: 'Successfully unsubscribed from notifications'
    });
  } catch (err) {
    console.error('[Unsubscribe] Error:', err);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Get user's active devices/tokens (optional, for settings page)
app.get("/notifications/devices", requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data, error } = await supabaseAdmin
      .from('fcm_tokens')
      .select('id, device_type, device_name, created_at, last_used_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('last_used_at', { ascending: false });

    if (error) throw error;

    res.json({ devices: data || [] });
  } catch (err) {
    console.error('[GetDevices] Error:', err);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

// Admin: Broadcast notification to all users
app.post("/admin/broadcast-notification", requireAuth, requireAdmin, async (req, res) => {
  const { title, message, url, image } = req.body;

  if (!title || !message) {
    return res.status(400).json({ error: "Title and message are required" });
  }

  try {
    const result = await broadcastNotification(
      {
        title,
        body: message,
        image: image || null
      },
      {
        type: 'broadcast',
        url: url || '/home'
      }
    );

    if (!result.success) {
      throw new Error(result.error || result.message);
    }

    console.log(`[AdminBroadcast] Sent to ${result.successCount} devices`);

    res.json({
      success: true,
      message: `Notification sent to ${result.successCount} devices`,
      details: result
    });
  } catch (err) {
    console.error('[AdminBroadcast] Error:', err);
    res.status(500).json({ error: 'Failed to broadcast notification' });
  }
});

// ============================================================
// ROUTES: Legal Documents (Terms & Privacy)
// ============================================================

// Get active Terms of Service
app.get("/legal/terms", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('legal_documents')
      .select('id, title, content, version, effective_date, updated_at')
      .eq('type', 'terms_of_service')
      .eq('is_active', true)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Terms of Service not found' });
    }

    res.json(data);
  } catch (err) {
    console.error('[GetTerms] Error:', err);
    res.status(500).json({ error: 'Failed to get Terms of Service' });
  }
});

// Get active Privacy Policy
app.get("/legal/privacy", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('legal_documents')
      .select('id, title, content, version, effective_date, updated_at')
      .eq('type', 'privacy_policy')
      .eq('is_active', true)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Privacy Policy not found' });
    }

    res.json(data);
  } catch (err) {
    console.error('[GetPrivacy] Error:', err);
    res.status(500).json({ error: 'Failed to get Privacy Policy' });
  }
});

// Get both Terms and Privacy (for registration page)
app.get("/legal/all", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('legal_documents')
      .select('id, type, title, content, version, effective_date')
      .eq('is_active', true)
      .in('type', ['terms_of_service', 'privacy_policy']);

    if (error) throw error;

    const documents = {
      terms: data.find(d => d.type === 'terms_of_service') || null,
      privacy: data.find(d => d.type === 'privacy_policy') || null
    };

    res.json(documents);
  } catch (err) {
    console.error('[GetAllLegal] Error:', err);
    res.status(500).json({ error: 'Failed to get legal documents' });
  }
});

// Record user acceptance (called during registration or when user accepts updated terms)
app.post("/legal/accept", requireAuth, async (req, res) => {
  const { document_id, document_type } = req.body;
  const userId = req.user.id;

  if (!document_id || !document_type) {
    return res.status(400).json({ error: 'Document ID and type are required' });
  }

  try {
    // Get document version
    const { data: document, error: docError } = await supabaseAdmin
      .from('legal_documents')
      .select('version')
      .eq('id', document_id)
      .single();

    if (docError) throw docError;

    // Get client IP and user agent
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Record acceptance
    const { data, error } = await supabaseAdmin
      .from('user_legal_acceptances')
      .insert({
        user_id: userId,
        document_id: document_id,
        document_type: document_type,
        document_version: document.version,
        ip_address: ipAddress,
        user_agent: userAgent
      })
      .select()
      .single();

    if (error) {
      // If already accepted (unique constraint), that's fine
      if (error.code === '23505') {
        return res.json({
          success: true,
          message: 'Document already accepted',
          already_accepted: true
        });
      }
      throw error;
    }

    console.log(`[LegalAcceptance] User ${userId} accepted ${document_type} v${document.version}`);

    res.json({
      success: true,
      message: 'Legal document acceptance recorded',
      acceptance: data
    });
  } catch (err) {
    console.error('[AcceptLegal] Error:', err);
    res.status(500).json({ error: 'Failed to record acceptance' });
  }
});

// Get user's legal document acceptances
app.get("/legal/my-acceptances", requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data, error } = await supabaseAdmin
      .from('user_legal_acceptances')
      .select('document_type, document_version, accepted_at')
      .eq('user_id', userId)
      .order('accepted_at', { ascending: false });

    if (error) throw error;

    res.json({ acceptances: data || [] });
  } catch (err) {
    console.error('[GetAcceptances] Error:', err);
    res.status(500).json({ error: 'Failed to get acceptances' });
  }
});

// Admin: Update legal document (create new version)
app.post("/admin/legal/update", requireAuth, requireAdmin, async (req, res) => {
  const { type, title, content, version } = req.body;

  if (!type || !content || !version) {
    return res.status(400).json({ error: 'Type, content, and version are required' });
  }

  try {
    // Deactivate current active document
    await supabaseAdmin
      .from('legal_documents')
      .update({ is_active: false })
      .eq('type', type)
      .eq('is_active', true);

    // Insert new version
    const { data, error } = await supabaseAdmin
      .from('legal_documents')
      .insert({
        type: type,
        title: title,
        content: content,
        version: version,
        effective_date: new Date().toISOString().split('T')[0],
        is_active: true,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[AdminLegal] Updated ${type} to version ${version}`);

    res.json({
      success: true,
      message: 'Legal document updated',
      document: data
    });
  } catch (err) {
    console.error('[UpdateLegal] Error:', err);
    res.status(500).json({ error: 'Failed to update legal document' });
  }
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

// ============================================================
// ROUTES: QRIS Dynamic Generation
// ============================================================

// Admin: Upload/Save QRIS Settings
app.post("/admin/qris/upload", requireAuth, async (req, res) => {
  const { qris_data, merchant_name, merchant_city } = req.body;

  if (!qris_data) {
    return res.status(400).json({ error: "QRIS data is required" });
  }

  try {
    const { validateQRISFormat, extractMerchantInfo } = require('./utils/qris');

    // Validate QRIS format
    if (!validateQRISFormat(qris_data)) {
      return res.status(400).json({ error: "Invalid QRIS format" });
    }

    // Extract merchant info if not provided
    let merchantInfo = { merchantName: merchant_name, merchantCity: merchant_city };
    if (!merchant_name || !merchant_city) {
      const extracted = extractMerchantInfo(qris_data);
      merchantInfo.merchantName = merchant_name || extracted.merchantName || 'Flocify';
      merchantInfo.merchantCity = merchant_city || extracted.merchantCity || 'Jakarta';
    }

    // Deactivate all existing QRIS
    await supabaseAdmin
      .from('qris_settings')
      .update({ is_active: false })
      .eq('is_active', true);

    // Insert new QRIS
    const { data, error } = await supabaseAdmin
      .from('qris_settings')
      .insert({
        qris_data: qris_data,
        merchant_name: merchantInfo.merchantName,
        merchant_city: merchantInfo.merchantCity,
        created_by: req.user.id,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Insert QRIS error:', error);
      throw error;
    }

    res.json({
      message: 'QRIS uploaded successfully',
      qris: data
    });
  } catch (err) {
    console.error('Upload QRIS error:', err);
    res.status(500).json({ error: 'Failed to upload QRIS' });
  }
});

// Admin: Get Current Active QRIS
app.get("/admin/qris/current", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('qris_settings')
      .select('*')
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    res.json({
      qris: data || null
    });
  } catch (err) {
    console.error('Get QRIS error:', err);
    res.status(500).json({ error: 'Failed to get QRIS settings' });
  }
});

// User: Generate Dynamic QRIS
app.post("/qris/generate", requireAuth, async (req, res) => {
  const { amount, order_id } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Valid amount required" });
  }

  try {
    // Get active QRIS
    const { data: qrisSettings, error: qrisError } = await supabaseAdmin
      .from('qris_settings')
      .select('*')
      .eq('is_active', true)
      .single();

    if (qrisError || !qrisSettings) {
      return res.status(404).json({ error: 'No active QRIS found. Please contact admin.' });
    }

    // Generate dynamic QRIS
    const { generateDynamicQRIS } = require('./utils/qris');
    const dynamicQRIS = generateDynamicQRIS(qrisSettings.qris_data, parseInt(amount));

    // Log transaction
    const { data: transaction, error: transError } = await supabaseAdmin
      .from('qris_transactions')
      .insert({
        user_id: req.user.id,
        order_id: order_id || null,
        amount: parseInt(amount),
        generated_qris: dynamicQRIS,
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
      })
      .select()
      .single();

    if (transError) {
      console.error('Log QRIS transaction error:', transError);
      // Continue even if logging fails
    }

    res.json({
      qris_string: dynamicQRIS,
      amount: parseInt(amount),
      merchant_name: qrisSettings.merchant_name,
      merchant_city: qrisSettings.merchant_city,
      transaction_id: transaction?.id,
      expires_at: transaction?.expires_at
    });
  } catch (err) {
    console.error('Generate QRIS error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate QRIS' });
  }
});

// User: Get QRIS Transaction Status
app.get("/qris/transaction/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabaseAdmin
      .from('qris_transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error) throw error;

    res.json({ transaction: data });
  } catch (err) {
    console.error('Get QRIS transaction error:', err);
    res.status(404).json({ error: 'Transaction not found' });
  }
});

// Admin: Delete QRIS Settings
app.delete("/admin/qris/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    // Delete QRIS setting
    const { error } = await supabaseAdmin
      .from('qris_settings')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete QRIS error:', error);
      throw error;
    }

    res.json({
      message: 'QRIS deleted successfully'
    });
  } catch (err) {
    console.error('Delete QRIS error:', err);
    res.status(500).json({ error: 'Failed to delete QRIS' });
  }
});

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
      message: result.message
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

// Get Available Coupons (Public + User's Private Vouchers)
app.get("/coupons/available", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Get PUBLIC vouchers (everyone can see)
    const { data: publicVouchers, error: publicError } = await supabaseAdmin
      .from('coupon_stats')
      .select('*')
      .eq('is_active', true)
      .eq('voucher_type', 'public')
      .gt('quota', 0)
      .order('created_at', { ascending: false });

    if (publicError) {
      console.error('[Available Coupons] Public Error:', publicError);
      return res.status(500).json({ error: "Gagal mengambil voucher" });
    }

    // 2. Get PRIVATE vouchers assigned to this user
    const { data: privateAssignments, error: privateError } = await supabaseAdmin
      .from('user_vouchers')
      .select(`
                *,
                coupons:coupon_id (
                    id,
                    code,
                    description,
                    discount_amount,
                    discount_type,
                    quota,
                    max_uses_per_user,
                    voucher_type,
                    is_active,
                    valid_from,
                    valid_until,
                    created_at,
                    updated_at
                )
            `)
      .eq('user_id', userId)
      .eq('is_claimed', false);

    if (privateError) {
      console.error('[Available Coupons] Private Error:', privateError);
      // Continue without private vouchers if error
    }

    // Extract coupon data from private assignments
    const privateVouchers = (privateAssignments || [])
      .map(assignment => assignment.coupons)
      .filter(coupon => coupon && coupon.is_active);

    // Combine public and private vouchers
    const allVouchers = [...(publicVouchers || []), ...(privateVouchers || [])];

    console.log('[Available Coupons] Public:', publicVouchers?.length || 0);
    console.log('[Available Coupons] Private (for user):', privateVouchers?.length || 0);
    console.log('[Available Coupons] Total:', allVouchers.length);

    // Filter out expired coupons
    const now = new Date();
    const validCoupons = allVouchers.filter(coupon => {
      if (!coupon.valid_until) return true;

      const validUntil = new Date(coupon.valid_until);
      const isValid = validUntil > now;

      if (!isValid) {
        console.log(`[Available Coupons] Filtered (expired): ${coupon.code}`);
      }

      return isValid;
    });

    // Filter out coupons with no remaining quota
    const availableCoupons = validCoupons.filter(coupon => {
      const remainingQuota = coupon.quota - (coupon.times_used || 0);
      const hasQuota = remainingQuota > 0;

      if (!hasQuota) {
        console.log(`[Available Coupons] Filtered (no quota): ${coupon.code}`);
      }

      return hasQuota;
    });

    console.log('[Available Coupons] Final available:', availableCoupons.length);
    console.log('[Available Coupons] Codes:', availableCoupons.map(c => `${c.code} (${c.voucher_type})`));

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

