# Shipping Backend API - Testing Guide

## Prerequisites
1. ✅ Migration SQL sudah dijalankan
2. ✅ Biteship API Key dari https://biteship.com/dashboard/settings
3. ✅ Update `.env` file dengan API key

## Environment Setup

Update `backend/.env`:
```bash
BITESHIP_API_KEY=YOUR_ACTUAL_API_KEY_HERE
BITESHIP_BASE_URL=https://api.biteship.com/v1
```

## API Endpoints

### 1. GET /seller/address
Get seller's shipping address from profile

**Auth:** Required (Bearer token)

**Response:**
```json
{
  "success": true,
  "data": {
    "seller_address": {
      "sender_name": "Aquatic Shop",
      "phone_number": "082345678901",
      "full_address": "Jl. Gatot Subroto No. 45",
      "city": "Bandung",
      "province": "Jawa Barat",
      "postal_code": "40123",
      "coordinates": { "lat": -6.9175, "lng": 107.6191 }
    },
    "full_name": "John Doe",
    "username": "john_seller"
  }
}
```

---

### 2. POST /seller/address
Update seller's shipping address

**Auth:** Required (Bearer token)

**Request Body:**
```json
{
  "sender_name": "Aquatic Shop",
  "phone_number": "082345678901",
  "full_address": "Jl. Gatot Subroto No. 45",
  "city": "Bandung",
  "province": "Jawa Barat",
  "postal_code": "4012 3",
  "latitude": -6.9175,
  "longitude": 107.6191
}
```

**Validation:**
- All fields required except latitude/longitude
- postal_code: Must be exactly 5 digits
- phone_number: Indonesian format

**Response:**
```json
{
  "success": true,
  "message": "Seller address updated successfully",
  "data": {
    "sender_name": "Aquatic Shop",
    "phone_number": "082345678901",
    "full_address": "Jl. Gatot Subroto No. 45",
    "city": "Bandung",
    "province": "Jawa Barat",
    "postal_code": "40123",
    "coordinates": { "lat": -6.9175, "lng": 107.6191 }
  }
}
```

---

### 3. POST /shipping/calculate-rates
Calculate shipping costs using Biteship API

**Auth:** Required (Bearer token)

**Request Body (Menggunakan Postal Code):**
```json
{
  "destination_postal_code": "12190",
  "destination_city": "Jakarta Selatan",
  "destination_province": "DKI Jakarta",
  "item_weight": 500,
  "item_value": 150000,
  "couriers": "jne,jnt,sicepat"
}
```

**Request Body (Menggunakan Coordinates):**
```json
{
  "destination_latitude": -6.2088,
  "destination_longitude": 106.8456,
  "destination_city": "Jakarta Selatan",
  "destination_province": "DKI Jakarta",
  "item_weight": 500,
  "item_value": 150000,
  "item_length": 20,
  "item_width": 15,
  "item_height": 10
}
```

**Parameters:**
- `destination_postal_code` OR `destination_latitude/longitude` - required
- `destination_city` - optional (for display)
- `destination_province` - optional (for display)
- `item_weight` - required (in grams)
- `item_value` - optional (default: 100000)
- `item_length/width/height` - optional (in cm)
- `couriers` - optional (default: "jne,jnt,sicepat,pos,anteraja")

**Response:**
```json
{
  "success": true,
  "origin": {
    "city": "Bandung",
    "province": "Jawa Barat",
    "postal_code": "40123"
  },
  "destination": {
    "city": "Jakarta Selatan",
    "province": "DKI Jakarta",
    "postal_code": "12190"
  },
  "rates": [
    {
      "courier_code": "jne",
      "courier_name": "JNE",
      "courier_service_code": "reg",
      "courier_service_name": "REG",
      "description": "Regular Service",
      "shipping_cost": 15000,
      "estimated_days": "2-3 days",
      "company": "JNE",
      "type": "express"
    },
    {
      "courier_code": "jnt",
      "courier_name": "J&T Express",
      "courier_service_code": "ez",
      "courier_service_name": "EZ",
      "description": "Economic Service",
      "shipping_cost": 12000,
      "estimated_days": "3-4 days",
      "company": "J&T",
      "type": "economy"
    }
  ]
}
```

**Error Responses:**
- `400` - Seller address not set
- `400` - Missing required fields
- `502` - Biteship API error
- `500` - Internal server error

---

## Testing dengan Postman

### Step 1: Login & Get Token
```
POST http://localhost:1234/auth/login
Body: { "phone_number": "08xxx", "password": "xxx" }
```
Copy `token` dari response

### Step 2: Set Seller Address
```
POST http://localhost:1234/seller/address
Headers: Authorization: Bearer YOUR_TOKEN
Body: {
  "sender_name": "Test Shop",
  "phone_number": "081234567890",
  "full_address": "Jl. Test No. 123",
  "city": "Bandung",
  "province": "Jawa Barat",
  "postal_code": "40123"
}
```

### Step 3: Calculate Shipping Rates
```
POST http://localhost:1234/shipping/calculate-rates
Headers: Authorization: Bearer YOUR_TOKEN
Body: {
  "destination_postal_code": "12190",
  "destination_city": "Jakarta Selatan",
  "destination_province": "DKI Jakarta",
  "item_weight": 500
}
```

---

## Common Issues

**Error: "Seller address not set"**
- Solution: Panggil `POST /seller/address` terlebih dahulu

**Error: "Biteship API error"**
- Check: API key di .env sudah benar?
- Check: Internet connection
- Check: Biteship API quota belum habis

**Error: "Postal code must be 5 digits"**
- Format: "40123" (5 digit number string)
- Salah: "401 23", "4012", "401234"

---

## Next Steps (Frontend)

Setelah backend siap, untuk frontend perlu:
1. Seller address management page
2. Shipping cost calculator component
3. Integration dengan order creation flow
