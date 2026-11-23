# Ledger API — MVP

تمام مسیرها پس از ورود معتبر و در scope پروژهٔ موجود در `{code}` هستند. دفترکل به نوع پروژه وابسته نیست؛ حساب‌های `shared` برای حساب‌های بانکی/صندوق مشترک شرکت استفاده می‌شوند و حساب‌های `project` فقط در همان پروژه قابل استفاده‌اند.

## Accounts

- `GET /api/v1/projects/{code}/ledger/accounts`
- `POST /api/v1/projects/{code}/ledger/accounts`

کد حساب (`code`) توسط سیستم با پیشوند `ACC-` ساخته می‌شود و ارسال آن در درخواست نادیده گرفته می‌شود. نمونهٔ ثبت حساب:

```json
{
  "scope": "project",
  "name": "حساب بانکی دلار",
  "accountNumber": "123456789",
  "bankName": "بانک ملت",
  "accountType": "asset",
  "currency": "USD"
}
```

`scope` یکی از `shared` یا `project` است. `accountType` یکی از `asset`, `liability`, `equity`, `revenue` یا `expense` است. `currency` کد سه‌حرفی بزرگ مانند `USD` یا `IRR` است.

## Exchanges

- `GET /api/v1/projects/{code}/ledger/exchanges`
- `POST /api/v1/projects/{code}/ledger/exchanges`

صرافی‌ها موجودیت مستقلی از حساب‌ها هستند:

```json
{
  "name": "صرافی نمونه",
  "address": "تهران، خیابان ولیعصر",
  "primaryPhone": "02112345678",
  "secondaryPhone": "09121234567"
}
```

## Products

- `GET /api/v1/projects/{code}/ledger/products`
- `POST /api/v1/projects/{code}/ledger/products`

کد کالا (`code`) توسط سیستم با پیشوند `SKU-` ساخته می‌شود و کاربر نباید آن را وارد کند. درخواست شامل `name`, `itemType`, `unit`, `currency` و به‌صورت اختیاری `scope` است. مقدار `scope` می‌تواند `project` یا `shared` باشد؛ در حالت `shared`، مقدار اختیاری `sharedScope` می‌تواند `all` یا نوع پروژه مانند `export` باشد. پاسخ `GET` کالاهای اختصاصی پروژه و کالاهای مشترک مجاز برای همان نوع پروژه را برمی‌گرداند.

## Journal entries

- `GET /api/v1/projects/{code}/ledger/entries`
- `POST /api/v1/projects/{code}/ledger/entries`

ثبت سند فقط وقتی پذیرفته می‌شود که حداقل دو خط داشته باشد، هر خط دقیقاً بدهکار یا بستانکار باشد و جمع `functionalDebit` با جمع `functionalCredit` برابر شود. مبالغ رشتهٔ ده‌دهی هستند و هرگز در Go یا JSON به float تبدیل نمی‌شوند.

`exchangeRate` و معادل ارز مبنا در خود خط ذخیره می‌شوند تا نرخ تاریخی سند با نرخ‌های بعدی تغییر نکند. `accountId` هر خط باید از همان پروژه یا از حسابی با scope `shared` باشد؛ حساب project متعلق به پروژهٔ دیگر پذیرفته نیست. ارسال دوبارهٔ همان `idempotencyKey` در همان پروژه، همان سند قبلی را برمی‌گرداند.
