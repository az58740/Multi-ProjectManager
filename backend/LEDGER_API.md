# Ledger API — MVP

تمام مسیرها پس از ورود معتبر و در scope پروژهٔ موجود در `{code}` هستند. دفترکل به نوع پروژه وابسته نیست؛ حساب‌های `shared` برای حساب‌های بانکی/صندوق مشترک شرکت استفاده می‌شوند و حساب‌های `project` فقط در همان پروژه قابل استفاده‌اند.

## Accounts

- `GET /api/v1/projects/{code}/ledger/accounts`
- `POST /api/v1/projects/{code}/ledger/accounts`

نمونهٔ ثبت حساب:

```json
{
  "scope": "shared",
  "code": "BANK-USD",
  "name": "حساب بانکی دلار",
  "accountType": "asset",
  "currency": "USD"
}
```

`scope` یکی از `shared` یا `project` است. `accountType` یکی از `asset`, `liability`, `equity`, `revenue` یا `expense` است. `currency` کد سه‌حرفی بزرگ مانند `USD` یا `IRR` است. حساب `shared` برای بانک/صندوق شرکت و حساب `project` فقط برای همان پروژه است.

## Journal entries

- `GET /api/v1/projects/{code}/ledger/entries`
- `POST /api/v1/projects/{code}/ledger/entries`

ثبت سند فقط وقتی پذیرفته می‌شود که حداقل دو خط داشته باشد، هر خط دقیقاً بدهکار یا بستانکار باشد و جمع `functionalDebit` با جمع `functionalCredit` برابر شود. مبالغ رشتهٔ ده‌دهی هستند و هرگز در Go یا JSON به float تبدیل نمی‌شوند.

```json
{
  "entryDate": "2026-11-20",
  "description": "ثبت فروش بار",
  "idempotencyKey": "sale-shipment-001",
  "lines": [
    {
      "accountId": "acct_project_receivable",
      "currency": "USD",
      "debitAmount": "1000",
      "functionalDebit": "420000000",
      "exchangeRate": "420000"
    },
    {
      "accountId": "acct_project_sales",
      "currency": "USD",
      "creditAmount": "1000",
      "functionalCredit": "420000000",
      "exchangeRate": "420000"
    }
  ]
}
```

`exchangeRate` و معادل ارز مبنا در خود خط ذخیره می‌شوند تا نرخ تاریخی سند با نرخ‌های بعدی تغییر نکند. `accountId` هر خط باید از همان پروژه یا از حسابی با scope `shared` باشد؛ حساب project متعلق به پروژهٔ دیگر پذیرفته نیست. ارسال دوبارهٔ همان `idempotencyKey` در همان پروژه، همان سند قبلی را برمی‌گرداند؛ این رفتار در race هم برقرار است. کلید در پروژهٔ دیگر مستقل است. یک کلید نباید برای payload جدید استفاده شود؛ برای عملیات جدید کلید جدید بسازید، چون تکرار کلید مالک سند قبلی است.

نمونهٔ درخواست کامل پس از ورود معتبر:

```http
POST /api/v1/projects/EXP-1405/ledger/entries HTTP/1.1
Content-Type: application/json
Cookie: mpm_session=<session-cookie>
Origin: https://your-production-origin.example
```

```json
{
  "entryDate": "2026-11-20",
  "description": "ثبت فروش بار",
  "idempotencyKey": "sale-shipment-001",
  "lines": [
    {"accountId":"acct_project_receivable","currency":"USD","debitAmount":"1000","functionalDebit":"420000000","exchangeRate":"420000"},
    {"accountId":"acct_project_sales","currency":"USD","creditAmount":"1000","functionalCredit":"420000000","exchangeRate":"420000"}
  ]
}
```

پاسخ موفق `201` شامل سند ایجادشده، شناسهٔ آن و خطوط ذخیره‌شده است. تکرار همان درخواست با همان کلید، همان سند قبلی را برمی‌گرداند؛ حتی اگر retry هم‌زمان دیگری برندهٔ درج شده باشد. برای payload جدید باید کلید جدید استفاده شود. خطای تراز، خط نامعتبر، حساب خارج از scope یا JSON نامعتبر باید پیش از درج رد شود. در PostgreSQL کنترل idempotency داخل transaction و با unique constraint روی `(project_id, idempotency_key)` انجام می‌شود؛ در race درخواست بازنده سند committed برنده را دوباره می‌خواند، بنابراین حداکثر یک سند ساخته می‌شود.

این مرحله هنوز اتصال خودکار سندها به محموله، هزینهٔ مستقیم، فروش، دریافت واسط، تبدیل ارز یا موجودی ملزومات را انجام نمی‌دهد؛ این اتصال‌ها در migration و APIهای مرحلهٔ بعد اضافه می‌شوند.
