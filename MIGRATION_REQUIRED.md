# ⚠️ CRITICAL: Migration Required!

## Error yang Terjadi:
```
GET /seller/address → 500 Internal Server Error
```

## Root Cause:
Database migration **BELUM DIJALANKAN**! 

Column `seller_address` belum ada di table `profiles`.

---

## ✅ SOLUSI: Jalankan Migration

### Step 1: Buka Supabase SQL Editor
1. Login ke https://supabase.com
2. Pilih project Anda
3. Klik **SQL Editor** di sidebar kiri

### Step 2: Run Migration File
Copy & paste **SEMUA ISI** file ini ke SQL Editor:
```
backend/migrations/create_shipping_addresses.sql
```

### Step 3: Execute
Klik tombol **RUN** atau tekan `Ctrl+Enter`

### Step 4: Verify
Jalankan query ini untuk memastikan berhasil:
```sql
-- Check if seller_address column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'seller_address';

-- Check if shipping_addresses table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'shipping_addresses';
```

Harusnya return:
✅ `seller_address` | `jsonb` 
✅ `shipping_addresses` table

---

## After Migration Success:

**Backend akan langsung work** karena code sudah ready.

Restart backend jika perlu:
```bash
cd backend
npm start
```

## Untuk CreateTransaction Page:

Saat ini flow-nya:
1. User buka `/transaction/create`
2. Click "Next" → Check address via API
3. Jika belum ada → Confirm dialog: "Isi alamat sekarang?"
4. Redirect ke `/settings/seller-address`

**Apakah Anda prefer:**
- A) Keep flow ini (separate page)
- B) Inline form di CreateTransaction page?

Silakan pilih, saya bisa adjust!
