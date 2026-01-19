# Order Evidence Backend - Testing Guide

## Prerequisites

1. **Multer installed:**
   ```bash
   cd backend
   npm install multer
   ```

2. **Supabase Storage Bucket created:**
   - Go to Supabase Dashboard → Storage
   - Create bucket: `order-evidences` (private, 5MB limit)

3. **Backend server running:**
   ```bash
   cd backend
   npm run dev
   ```

---

## Postman Tests

### 1. Upload Evidence Photo

**Endpoint:** `POST http://localhost:1234/order-evidences/upload`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Body (form-data):**
```
file: <select an image file>
order_id: <existing order UUID>
upload_order: 0
```

**Expected Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "evidence-uuid",
    "order_id": "order-uuid",
    "image_url": "https://.../storage/v1/object/public/order-evidences/...",
    "image_name": "my-fish.jpg",
    "file_size": 234567,
    "mime_type": "image/jpeg",
    "uploaded_by": "user-uuid",
    "upload_order": 0,
    "created_at": "2024-01-20T..."
  }
}
```

**Error Cases to Test:**
- No file: `{ "error": "No file uploaded" }`
- No order_id: `{ "error": "order_id is required" }`
- Wrong file type (.pdf): `{ "error": "Invalid file type..." }`
- File too large (>5MB): Multer error
- Not seller: `{ "error": "Not authorized..." }`
- Max 5 photos: `{ "error": "Maximum 5 photos per order" }`

---

### 2. Get Evidence Photos

**Endpoint:** `GET http://localhost:1234/order-evidences/:orderId`

Replace `:orderId` with actual order UUID.

**No Authentication Required** (public endpoint for buyers)

**Expected Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "evidence-1",
      "order_id": "order-uuid",
      "image_url": "https://.../photo1.jpg",
      "image_name": "fish-front.jpg",
      "upload_order": 0,
      "created_at": "..."
    },
    {
      "id": "evidence-2",
      "order_id": "order-uuid",
      "image_url": "https://.../photo2.jpg",
      "image_name": "fish-side.jpg", 
      "upload_order": 1,
      "created_at": "..."
    }
  ],
  "count": 2
}
```

**Test Cases:**
- Order with no photos: `{ "data": [], "count": 0 }`
- Non-existent order: Still returns empty array
- Order with deleted photos: Only returns non-deleted ones

---

### 3. Delete Evidence Photo

**Endpoint:** `DELETE http://localhost:1234/order-evidences/:id`

Replace `:id` with evidence UUID.

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Evidence deleted successfully"
}
```

**Error Cases:**
- Not seller/admin: `{ "error": "Not authorized..." }`
- Non-existent evidence: `{ "error": "Evidence not found" }`
- No auth token: 401 Unauthorized

---

## Manual Testing Workflow

### Scenario: Seller uploads fish photos for order

1. **Create test order** (use existing order endpoint or database)
2. **Login as seller** to get JWT token
3. **Upload first photo:**
   ```
   POST /order-evidences/upload
   file: fish-front.jpg
   order_id: <order_id>
   upload_order: 0
   ```
4. **Upload second photo:**
   ```
   POST /order-evidences/upload
   file: fish-side.jpg
   order_id: <order_id>
   upload_order: 1
   ```
5. **Get all photos:**
   ```
   GET /order-evidences/<order_id>
   ```
   Should return 2 photos in order
6. **Delete one photo:**
   ```
   DELETE /order-evidences/<evidence_id>
   ```
7. **Get again:**
   ```
   GET /order-evidences/<order_id>
   ```
   Should return 1 photo (the other is soft-deleted)

---

## Database Verification

After uploads, check database:

```sql
-- Check evidences table
SELECT * FROM order_evidences 
WHERE order_id = '<your_order_id>'
ORDER BY upload_order;

-- Check if soft delete works
SELECT * FROM order_evidences 
WHERE is_deleted = true;

-- Check storage
-- Go to Supabase Dashboard → Storage → order-evidences
-- You should see folders with order IDs containing images
```

---

## Common Issues

### 1. "Bucket not found"
**Solution:** Create bucket in Supabase Dashboard (Storage → New Bucket)

### 2. "Cannot find module 'multer'"
**Solution:** `npm install multer` in backend folder

### 3. "Upload failed" but no specific error
**Solution:** Check Supabase Storage bucket permissions and size limits

### 4. Images uploaded but URL not accessible
**Solution:** Make sure bucket is configured correctly (public vs private)

---

## Next Steps

Once all tests pass:
- [ ] Document API in Postman collection
- [ ] Add rate limiting for uploads
- [ ] Move to Phase 3 (Frontend integration)
