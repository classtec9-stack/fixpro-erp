# FixPro ERP 🔧
### نظام إدارة مراكز صيانة الهواتف والكمبيوتر

---

## 🗂️ هيكل المشروع

```
fixpro-erp/
├── backend/                  ← Node.js + Express API
│   ├── src/
│   │   ├── config/           ← إعدادات قاعدة البيانات
│   │   ├── controllers/      ← منطق الأعمال
│   │   ├── middleware/       ← Auth، Error handling
│   │   ├── routes/           ← API endpoints
│   │   ├── services/         ← WhatsApp، Email، PDF
│   │   ├── utils/            ← Logger، helpers
│   │   └── index.js          ← نقطة البداية
│   ├── .env.example          ← نسخة وعدّل القيم
│   └── package.json
├── frontend/                 ← React.js (قريباً)
├── mobile/                   ← React Native Expo (قريباً)
└── database/
    └── schema.sql            ← قاعدة البيانات الكاملة
```

---

## 🚀 طريقة التشغيل المحلي

### 1. إنشاء مشروع Supabase (مجاني)
1. اذهب إلى [supabase.com](https://supabase.com) وأنشئ حساباً مجانياً
2. أنشئ مشروعاً جديداً
3. افتح **SQL Editor** وانسخ محتوى `database/schema.sql` بالكامل وشغّله
4. انسخ `Project URL` و `API Keys` من **Settings > API**

### 2. إعداد Backend

```bash
cd backend
cp .env.example .env
# افتح .env وأضف بيانات Supabase
nano .env

npm install
npm run dev
```

✅ السيرفر يعمل على: `http://localhost:3000`
✅ Health check: `http://localhost:3000/health`

### 3. اختبار الـ API

```bash
# تسجيل الدخول
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fixpro.sa","password":"Admin@1234"}'

# قائمة الأوردرات (مع التوكن)
curl http://localhost:3000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 📡 API Endpoints

| الطريقة | المسار | الوصف |
|---------|--------|-------|
| POST | `/api/auth/login` | تسجيل الدخول |
| GET | `/api/auth/me` | بيانات المستخدم الحالي |
| GET | `/api/dashboard` | لوحة التحكم |
| GET | `/api/orders` | قائمة الأوردرات |
| POST | `/api/orders` | إنشاء أوردر جديد |
| GET | `/api/orders/:id` | تفاصيل أوردر |
| PATCH | `/api/orders/:id/status` | تحديث الحالة |
| POST | `/api/orders/:id/parts` | إضافة قطعة للأوردر |
| GET | `/api/customers` | قائمة العملاء |
| POST | `/api/customers` | إضافة عميل |
| GET | `/api/inventory/parts` | المخزون |
| GET | `/api/inventory/alerts` | تنبيهات النفاد |
| POST | `/api/invoices` | إنشاء فاتورة |
| POST | `/api/invoices/:id/pay` | تسجيل دفعة |
| GET | `/api/reports/revenue` | تقرير الإيرادات |
| GET | `/api/reports/technicians` | تقرير الفنيين |

---

## 🌐 النشر المجاني على Railway

```bash
# 1. ثبّت Railway CLI
npm install -g @railway/cli

# 2. سجّل الدخول
railway login

# 3. أنشئ مشروعاً جديداً
cd backend
railway init

# 4. أضف متغيرات البيئة
railway variables set DATABASE_URL="..." JWT_SECRET="..."

# 5. انشر
railway up
```

---

## 🛠️ التقنيات المستخدمة

| الطبقة | التقنية |
|--------|---------|
| Backend | Node.js 18 + Express 4 |
| Database | PostgreSQL (Supabase) |
| Auth | JWT + bcryptjs |
| Logging | Winston |
| Security | Helmet + CORS + Rate Limiting |
| Hosting | Railway (مجاني) |

---

## 📋 الخطوات القادمة

- [ ] Frontend React.js Dashboard
- [ ] Mobile App (React Native + Expo)
- [ ] WhatsApp إشعارات (واتساب Business App يدوياً في البداية)
- [ ] PDF Invoices (pdfmake)
- [ ] Email (Resend - مجاني)

---

> **ملاحظة:** غيّر كلمة مرور المدير فوراً بعد أول تشغيل!
> Admin: `admin@fixpro.sa` / `Admin@1234`
