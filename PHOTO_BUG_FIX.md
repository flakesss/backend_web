# Fix Photo Display Bug - Troubleshooting Guide

## Masalah
- Foto berhasil upload ke storage ✅
- Data tersimpan di database `order_evidences` ✅  
- Foto TIDAK muncul di buyer side ❌
- Network tab menunjukkan error 400 ❌

## Root Cause
**Backend menggunakan `getPublicUrl()` untuk Supabase Storage bucket yang PRIVATE.**

Public URL tidak akan bekerja jika bucket private!

## Solusi

### Option 1: Set Bucket Jadi Public (RECOMMENDED - Paling Simple)

**1. Buat bucket di Supabase Dashboard:**
```
- Nama: order-evidences
- Public: ✅ CHECKED (PENTING!)
- File size limit: 5MB
- Allowed MIME types: image/jpeg, image/png, image/webp
```

**2. Backend sudah benar** - pakai `getPublicUrl()` akan jalan untuk public bucket

**3. Verifikasi:**
- Cek di Supabase Dashboard → Storage
- Bucket `order-evidences` harus ada
- Harus di-set sebagai **Public**

### Option 2: Keep Private + Use Signed URLs (Lebih Aman, Lebih Kompleks)

Jika ingin bucket tetap private:

**Backend perlu diubah:**
```javascript
// Ganti getPublicUrl() dengan createSignedUrl()
const { data: urlData, error: signError } = await supabaseAdmin.storage
  .from('order-evidences')
  .createSignedUrl(fileName, 3600 * 24 * 365) // Valid 1 tahun

if (signError) {
  console.error('Signed URL error:', signError)
  return res.status(500).json({ error: 'Failed to generate URL' })
}

// Save urlData.signedUrl to database instead of publicUrl
```

**Kekurangan:**
- URL kadaluarsa setelah periode tertentu
- Perlu regenerate URL secara berkala

## Recommended Action NOW

**Langkah 1: Cek Bucket**
1. Buka Supabase Dashboard
2. Storage → Buckets
3. Cari `order-evidences`

**Langkah 2: Jika Bucket Tidak Ada**
- Klik "New Bucket"
- Nama: `order-evidences`  
- ✅ **CHECK "Public bucket"**
- Create

**Langkah 3: Jika Bucket Ada Tapi Private**
- Click bucket name
- Settings/Configuration
- Toggle "Public" ON

**Langkah 4: Test**
- Upload foto baru dari seller
- Cek buyer side - foto harus muncul

## Debug Commands

**Cek bucket via Supabase JS:**
```javascript
const { data: buckets } = await supabaseAdmin.storage.listBuckets()
console.log('Buckets:', buckets)
// Should see: { id: 'order-evidences', name: 'order-evidences', public: true }
```

**Cek file via storage:**
```javascript
const { data: files } = await supabaseAdmin.storage
  .from('order-evidences')
  .list()
console.log('Files:', files)
```

## Catatan

Untuk use case foto produk yang dilihat buyer, **PUBLIC BUCKET** adalah pilihan terbaik karena:
- Foto memang ditujukan untuk dilihat publik
- Lebih simple
- Tidak ada URL expiry
- Performance lebih baik
