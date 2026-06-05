import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export const LangContext = createContext({ lang: 'ar', setLang: () => {}, isAr: true, isEn: false })

// ── ترجمات مختصرة للاستخدام المباشر في الصفحات ───────────
export const TR = {
  // صفحات
  dashboard:     { ar: 'لوحة التحكم',           en: 'Dashboard' },
  tickets:       { ar: 'تذاكر الصيانة',          en: 'Repair Tickets' },
  customers:     { ar: 'العملاء',                en: 'Customers' },
  technicians:   { ar: 'الفنيون',               en: 'Technicians' },
  inventory:     { ar: 'المخزون',               en: 'Inventory' },
  suppliers:     { ar: 'الموردون',              en: 'Suppliers' },
  invoices:      { ar: 'الفواتير',              en: 'Invoices' },
  reports:       { ar: 'التقارير',              en: 'Reports' },
  notifications: { ar: 'الإشعارات',             en: 'Notifications' },
  settings:      { ar: 'الإعدادات',             en: 'Settings' },
  printCenter:   { ar: 'مركز الطباعة',          en: 'Print Center' },
  shopSettings:  { ar: 'إعدادات المحل',         en: 'Shop Settings' },
  printerSettings:{ ar: 'إعدادات الطابعات',     en: 'Printer Settings' },
  branches:        { ar: 'إدارة الفروع',          en: 'Branch Management' },
  whatsapp:        { ar: 'واتساب',                 en: 'WhatsApp' },
  appointments:    { ar: 'الحجوزات',              en: 'Appointments' },
  servicePrices:   { ar: 'تسعير الخدمات',         en: 'Service Pricing' },
  devices:         { ar: 'لوحة الأجهزة',           en: 'Devices Board' },
  logout:        { ar: 'تسجيل الخروج',          en: 'Logout' },

  // أزرار عامة
  save:          { ar: 'حفظ',                   en: 'Save' },
  cancel:        { ar: 'إلغاء',                 en: 'Cancel' },
  add:           { ar: 'إضافة',                 en: 'Add' },
  edit:          { ar: 'تعديل',                 en: 'Edit' },
  delete:        { ar: 'حذف',                   en: 'Delete' },
  search:        { ar: 'بحث',                   en: 'Search' },
  close:         { ar: 'إغلاق',                 en: 'Close' },
  confirm:       { ar: 'تأكيد',                 en: 'Confirm' },
  refresh:       { ar: 'تحديث',                 en: 'Refresh' },
  print:         { ar: 'طباعة',                 en: 'Print' },
  download:      { ar: 'تحميل',                 en: 'Download' },
  send:          { ar: 'إرسال',                 en: 'Send' },
  viewAll:       { ar: 'عرض الكل',              en: 'View All' },
  newTicket:     { ar: 'تذكرة جديدة',           en: 'New Ticket' },
  loading:       { ar: 'جاري التحميل...',       en: 'Loading...' },
  noData:        { ar: 'لا توجد بيانات',        en: 'No data found' },
  all:           { ar: 'الكل',                  en: 'All' },

  // حالات التذاكر
  status_new:              { ar: 'تم الاستلام',          en: 'Received' },
  status_quick_check:      { ar: 'فحص سريع',             en: 'Quick Check' },
  status_diagnosing:       { ar: 'قيد الفحص',            en: 'Diagnosing' },
  status_waiting_approval: { ar: 'انتظار موافقة',        en: 'Awaiting Approval' },
  status_in_repair:        { ar: 'داخل الورشة',          en: 'In Repair' },
  status_waiting_part:     { ar: 'ينتظر قطعة',           en: 'Waiting for Part' },
  status_ready:            { ar: 'جاهز للتسليم',         en: 'Ready' },
  status_delivered:        { ar: 'تم التسليم',           en: 'Delivered' },
  status_rejected:         { ar: 'مرفوض',                en: 'Rejected' },
  status_cancelled:        { ar: 'ملغي',                 en: 'Cancelled' },

  // حقول
  customer:      { ar: 'العميل',                en: 'Customer' },
  device:        { ar: 'الجهاز',               en: 'Device' },
  technician:    { ar: 'الفني',                en: 'Technician' },
  priority:      { ar: 'الأولوية',             en: 'Priority' },
  status:        { ar: 'الحالة',               en: 'Status' },
  date:          { ar: 'التاريخ',              en: 'Date' },
  actions:       { ar: 'إجراءات',              en: 'Actions' },
  name:          { ar: 'الاسم',                en: 'Name' },
  phone:         { ar: 'الجوال',               en: 'Phone' },
  email:         { ar: 'البريد',               en: 'Email' },
  address:       { ar: 'العنوان',              en: 'Address' },
  total:         { ar: 'الإجمالي',             en: 'Total' },
  quantity:      { ar: 'الكمية',               en: 'Qty' },
  price:         { ar: 'السعر',                en: 'Price' },
  category:      { ar: 'القسم',                en: 'Category' },
  notes:         { ar: 'ملاحظات',              en: 'Notes' },

  // أولويات
  priority_normal: { ar: 'عادي',               en: 'Normal' },
  priority_urgent: { ar: 'عاجل',               en: 'Urgent' },
  priority_vip:    { ar: 'VIP',                en: 'VIP' },

  // أدوار
  role_admin:            { ar: 'مدير النظام',       en: 'System Admin' },
  role_branch_manager:   { ar: 'مشرف الفرع',        en: 'Branch Manager' },
  role_receptionist:     { ar: 'موظف استقبال',      en: 'Receptionist' },
  role_technician:       { ar: 'مهندس صيانة',       en: 'Technician' },
  role_customer_service: { ar: 'خدمة العملاء',      en: 'Customer Service' },
  role_warehouse:        { ar: 'مسؤول المخزن',      en: 'Warehouse' },
  role_accountant:       { ar: 'محاسب',             en: 'Accountant' },

  // لوحة التحكم
  todayTickets:    { ar: 'تذاكر اليوم',           en: "Today's Tickets" },
  activeOrders:    { ar: 'قيد العمل',             en: 'Active Orders' },
  monthRevenue:    { ar: 'إيرادات الشهر',          en: 'Month Revenue' },
  lowStockAlerts:  { ar: 'تنبيهات المخزون',        en: 'Stock Alerts' },
  recentTickets:   { ar: 'آخر التذاكر',            en: 'Recent Tickets' },
  techPerformance: { ar: 'أداء الفنيين اليوم',     en: "Today's Tech Performance" },

  // تحيات
  morning:   { ar: 'صباح الخير',    en: 'Good Morning' },
  afternoon: { ar: 'مساء الخير',    en: 'Good Afternoon' },
  evening:   { ar: 'مساء النور',    en: 'Good Evening' },

  // مخزون
  addPart:       { ar: 'إضافة صنف',            en: 'Add Part' },
  addCategory:   { ar: 'إضافة قسم',            en: 'Add Category' },
  lowStock:      { ar: 'تنبيهات النفاد',        en: 'Low Stock Alerts' },
  available:     { ar: 'متوفر',                 en: 'Available' },
  low:           { ar: 'منخفض',                en: 'Low' },

  // فواتير
  paid:          { ar: 'مدفوع',                en: 'Paid' },
  pending:       { ar: 'معلق',                 en: 'Pending' },
  partial:       { ar: 'دفع جزئي',             en: 'Partial' },
  cancelled_inv: { ar: 'ملغي',                 en: 'Cancelled' },
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('lang') || 'ar')

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const setLang = useCallback((newLang) => {
    localStorage.setItem('lang', newLang)
    document.documentElement.lang = newLang
    document.documentElement.dir  = newLang === 'ar' ? 'rtl' : 'ltr'
    setLangState(newLang)
  }, [])

  const isAr = lang === 'ar'
  const isEn = lang === 'en'

  // دالة الترجمة
  const t = useCallback((key) => {
    const entry = TR[key]
    if (!entry) return key
    return lang === 'en' ? (entry.en || entry.ar) : (entry.ar || entry.en)
  }, [lang])

  return (
    <LangContext.Provider value={{ lang, setLang, isAr, isEn, t, TR }}>
      {children}
    </LangContext.Provider>
  )
}

export const useLang = () => useContext(LangContext)

// Hook مختصر للاستخدام في الصفحات
export function useT() {
  const { t, lang, isAr, isEn } = useLang()
  return { t, lang, isAr, isEn }
}
