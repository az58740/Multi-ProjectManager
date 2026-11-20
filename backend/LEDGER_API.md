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

`scope` یکی از `shared` یا `project` است. `accountType` یکی از `asset`, `liability`, `equity`, `revenue`, `expense` و `currency` کد سه‌حرفی بزرگ است.

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
      "accountId": "acct_shared_bank_usd",
      "currency": "USD",
      "debitAmount": "1000",
      "functionalDebit": "420000000",
      "exchangeRate": "420000"
    },
    {
      "accountId": "acct_project_receivable",
      "currency": "USD",
      "creditAmount": "1000",
      "functionalCredit": "420000000",
      "exchangeRate": "420000"
    }
  ]
}
```

`exchangeRate` و معادل ارز مبنا در خود خط ذخیره می‌شوند تا نرخ تاریخی سند با نرخ‌های بعدی تغییر نکند. ارسال دوبارهٔ همان `idempotencyKey` در همان پروژه، همان سند قبلی را برمی‌گرداند.

این مرحله هنوز اتصال خودکار سندها به محموله، هزینهٔ مستقیم، فروش، دریافت واسط، تبدیل ارز یا موجودی ملزومات را انجام نمی‌دهد؛ این اتصال‌ها در migration و APIهای مرحلهٔ بعد اضافه می‌شوند.
