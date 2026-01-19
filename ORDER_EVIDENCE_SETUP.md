# Order Evidence Backend - Setup Instructions

## Step 1: Install Multer

**Run this command manually in your terminal (CMD, not PowerShell):**

```bash
cd backend
npm install multer
```

**Or if you have PowerShell admin access:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
npm install multer
```

---

## Step 2: Create Supabase Storage Bucket

**Option A: Via Supabase Dashboard (Recommended)**

1. Go to https://supabase.com/dashboard
2. Select your Flocify project
3. Click **Storage** in left sidebar
4. Click **New bucket**
5. Configure:
   ```
   Name: order-evidences
   Public: OFF (unchecked)
   File size limit: 5242880 (5MB)
   Allowed MIME types: image/jpeg, image/png, image/webp
   ```
6. Click **Create bucket**

**Option B: Via SQL (Alternative)**

Run this in Supabase SQL Editor:
```sql
-- This creates the bucket via database
-- Note: Might need additional steps in Supabase dashboard
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-evidences', 'order-evidences', false);
```

---

## Step 3: Test Storage Bucket

After creating bucket, test upload permissions:

1. Go to Storage → order-evidences
2. Try uploading a test image
3. If successful, bucket is ready!

---

## Next Steps

Once multer is installed and bucket is created:
1. Backend endpoints will be added to server.js
2. Test with Postman
3. Integrate with frontend
