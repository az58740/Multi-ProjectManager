# Multi-Project Manager

سامانهٔ دو زبانهٔ فارسی/انگلیسی برای معرفی فعالیت‌های مجموعه و مدیریت چند پروژه. محصول فعلی روی مدیریت پروژه‌های صادرات میوه و تره‌بار، داده‌های پایهٔ صادرات، دفترکل مالی اولیه و منابع مشترک متمرکز است و برای توسعهٔ ماژول‌های سردخانه، سورتینگ، ساخت‌وساز و اجارهٔ املاک نیز ساختار نوع پروژه را دارد.

> این فایل راهنمای اصلی تحویل پروژه است. یک توسعه‌دهندهٔ جدید باید بتواند با خواندن آن معماری، روش اجرا، قراردادهای مهم، وضعیت فعلی و کارهای بعدی را بفهمد. برای جزئیات عمیق‌تر، به سندهای داخل `docs/` و قراردادهای API داخل `backend/` مراجعه کنید.

## وضعیت فعلی

- مخزن GitHub: [`az58740/Multi-ProjectManager`](https://github.com/az58740/Multi-ProjectManager)
- شاخهٔ اصلی: `main`
- مسیر کاری فعلی: `/home/ubuntu/work/Multi-ProjectManager`
- آخرین تغییر UI منتشرشده: commit `410b30c` با عنوان `feat: redesign compact project and export dashboards`
- deployment production فعلی: پروژهٔ Vercel با نام `multi-project-manager`
- دامنهٔ production ثبت‌شده: `https://multi-project-manager-rho.vercel.app`
- stack اصلی: Next.js 16، React 19، TypeScript، Tailwind CSS، Go، PostgreSQL و Docker

هر تغییری که در `main` push شود، در صورت فعال بودن اتصال GitHub/Vercel، deployment جدید Vercel را ایجاد می‌کند. قبل از push، تست‌ها و وضعیت migrationها را بررسی کنید.

## این سامانه چه کاری انجام می‌دهد؟

سامانه دو بخش اصلی دارد:

1. **ویترین عمومی:** معرفی فعالیت‌های مجموعه به زبان فارسی و انگلیسی، شامل صادرات میوه و تره‌بار، سردخانه، همکاری با مراکز سورتینگ، ساخت‌وساز و اجارهٔ املاک.
2. **داشبورد داخلی:** ورود با ایمیل و رمز عبور، مدیریت پروژه‌ها، مدیریت کاربران توسط مدیر، مدیریت منابع پروژه، داشبورد اختصاصی پروژهٔ صادرات، طرف‌حساب‌ها، محموله‌ها، کالاها/ملزومات و دفترکل مالی اولیه.

پروژه‌ها با `type` از یکدیگر تفکیک می‌شوند. پروژه‌ای با `type=export` به مسیر اختصاصی زیر می‌رود:

```text
/dashboard/projects/{code}/export
```

در این مسیر، `{code}` کد پروژه است، نه شناسهٔ دیتابیسی آن.

## معماری کلی

```text
Browser
  │
  ▼
Next.js frontend (frontend/)
  │  /api/*, /_health, /_ready طبق vercel.json
  ▼
Go HTTP API (backend/)
  │
  ▼
PostgreSQL / Neon در production
```

در محیط توسعهٔ غیرproduction، اگر `DATABASE_URL` تنظیم نشده باشد، backend به memory store آزمایشی می‌رود. داده‌های memory store با restart از بین می‌روند و نباید برای اطلاعات واقعی مالی یا production استفاده شوند. در production نبود `DATABASE_URL` باید باعث توقف امن سرویس شود.

### ساختار پوشه‌ها

```text
.
├── backend/
│   ├── cmd/api/                         نقطهٔ ورود API Go
│   ├── internal/auth/                   ثبت‌نام، ورود، نشست و مدیریت کاربر
│   ├── internal/projects/               پروژه‌ها و migrationهای PostgreSQL
│   ├── internal/export/                 طرف‌حساب‌ها و محموله‌ها
│   ├── internal/ledger/                 حساب‌ها، سندها و دفترکل
│   ├── internal/...                     storeهای memory/PostgreSQL و middlewareها
│   ├── EXPORT_API.md                    قرارداد API صادرات
│   └── LEDGER_API.md                    قرارداد API دفترکل
├── frontend/
│   ├── app/                             routeهای Next.js
│   ├── components/                      dashboardها و workspaceهای React
│   ├── lib/                             type، validator، API helper و ترجمه‌ها
│   ├── public/images/                   تصاویر ویترین
│   └── Dockerfile                       image فرانت‌اند
├── docs/
│   ├── DEPLOYMENT.md                    استقرار Vercel، Compose و backup
│   ├── PROJECT-HANDOFF-FA.md            سند تحویل فارسی
│   ├── PURCHASE-SHIPMENT-SUPPLY-USAGE.md مدل خرید، محموله و مصرف
│   ├── PRODUCTION-DATA-OPERATIONS.md    عملیات حساس دادهٔ production
│   ├── GITHUB-TRANSFER.md               انتقال/همگام‌سازی GitHub
│   └── ASSETS.md                         منبع و مجوز تصاویر
├── docker-compose.yml                   اجرای web، API و PostgreSQL
├── vercel.json                          route کردن frontend و API
├── plan.md                              تصمیم‌های طراحی و معماری
├── TODO.md                              فهرست کارهای انجام‌شده و باز
└── .env.example                         نمونهٔ متغیرهای محیطی
```

## راه‌اندازی محلی

### پیش‌نیازها

- Node.js نسخهٔ `20.9+`
- pnpm نسخهٔ `11`؛ نسخهٔ lockfile فعلی `pnpm@11.25.0` است
- Go نسخهٔ `1.22+` برای اجرای API و تست backend
- Docker و Docker Compose v2، در صورت اجرای PostgreSQL کانتینری
- PostgreSQL آزمایشی جداگانه، در صورت اجرای integration test

### اجرای سریع با memory store

این حالت فقط برای توسعهٔ رابط کاربری و آزمایش موقت مناسب است:

```bash
pnpm install --frozen-lockfile
export APP_ENV=development
export BOOTSTRAP_ADMIN_EMAIL=admin@example.test
read -s -p 'Temporary local admin password: ' BOOTSTRAP_ADMIN_PASSWORD
export BOOTSTRAP_ADMIN_PASSWORD
printf '\n'
pnpm dev
```

پس از اجرا:

- frontend: `http://localhost:3000`
- API: `http://localhost:8080`
- origin پیش‌فرض frontend: `http://localhost:3000`

اگر frontend با origin دیگری اجرا می‌شود، `PUBLIC_APP_ORIGIN` را دقیقاً با origin همان مرورگر تنظیم کنید؛ بدون path و بدون slash پایانی.

### اجرای کامل با Docker Compose

```bash
cp .env.example .env
# .env را برای محیط محلی تکمیل کنید
# سپس:
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:3000/_health
curl -i http://127.0.0.1:3000/_ready
```

volume دیتابیس `postgres_data` پایدار است. برای حذف volume از `docker compose down -v` استفاده نکنید، مگر اینکه حذف کامل دیتابیس عمداً تأیید شده باشد.

## دستورهای مهم توسعه

```bash
pnpm dev             # اجرای هم‌زمان Go API و Next.js
pnpm dev:web         # فقط frontend
pnpm typecheck       # بررسی TypeScript
pnpm build:web       # build production فرانت‌اند
pnpm test:api        # go test ./...

# بررسی مستقیم backend
cd backend
go test ./...
go vet ./...
gofmt -w .
```

برای integration testهای PostgreSQL، `TEST_DATABASE_URL` را به یک دیتابیس آزمایشی خالی و disposable بدهید. هرگز production یا دیتابیس دارای اطلاعات واقعی را به test ندهید.

## متغیرهای محیطی

فایل `.env.example` مرجع اولیه است. `.env`، secretها و connection string هرگز نباید commit شوند.

| متغیر | کاربرد |
|---|---|
| `DATABASE_URL` | اتصال پایدار PostgreSQL/Neon؛ برای production الزامی است |
| `APP_ENV` | معمولاً `development` یا `production` |
| `PUBLIC_APP_ORIGIN` | origin دقیق عمومی برای بررسی same-origin و CORS؛ نمونه: `https://projects.example.com` |
| `BOOTSTRAP_ADMIN_EMAIL` | مدیر اولیه فقط هنگام راه‌اندازی دیتابیس خالی |
| `BOOTSTRAP_ADMIN_PASSWORD` | رمز مدیر اولیه؛ پس از ورود موفق حذف شود |
| `POSTGRES_PASSWORD` | رمز PostgreSQL در Compose |
| `WEB_BIND` / `WEB_PORT` | bind و port سرویس web در Compose |
| `PORT` | port سرویس API در محیط deployment؛ در Vercel معمولاً `8080` تنظیم می‌شود |
| `TEST_DATABASE_URL` | فقط برای integration test روی دیتابیس آزمایشی |

رمزها باید حداقل ۴ و حداکثر ۷۲ بایت UTF-8 باشند؛ برای مدیر production رمز قوی‌تر از حداقل انتخاب کنید. متغیرهای bootstrap فقط server-side هستند و نباید `NEXT_PUBLIC_` باشند. بعد از ساخته‌شدن مدیر، آن دو متغیر را حذف و redeploy کنید؛ restart نباید حساب موجود را overwrite کند.

## احراز هویت و سطح دسترسی فعلی

- ورود با ایمیل و رمز عبور محلی انجام می‌شود؛ Manus OAuth در این پروژه استفاده نمی‌شود.
- نشست در backend ایجاد و قابل ابطال است.
- ثبت‌نام عمومی در نسخهٔ فعلی بدون تأیید ایمیل یا تأیید مدیر حساب را فعال می‌کند.
- مدیر می‌تواند کاربران را ایجاد/ویرایش کند، نام، نقش، وضعیت و رمز را تغییر دهد.
- حداقل یک مدیر فعال باید باقی بماند.
- تمام کاربران فعال فعلاً به همهٔ پروژه‌ها دسترسی دارند؛ مجوز مستقل برای هر پروژه هنوز پیاده نشده است.
- نقش `admin` مجوز مدیریت کاربران اضافه می‌کند، اما به‌تنهایی مدل کامل permission پروژه‌ای نیست.
- بازیابی رمز با ایمیل، audit log و گزارش امنیتی هنوز وجود ندارد.

پیش از استفادهٔ عملیاتی با دادهٔ واقعی، ثبت‌نام عمومی و دسترسی پروژه‌ها باید بازبینی و محدود شود.

## مسیرهای اصلی frontend

| مسیر | توضیح |
|---|---|
| `/` | ویترین عمومی فارسی/انگلیسی |
| `/login` | ورود و ثبت‌نام |
| `/dashboard` | داشبورد اصلی پروژه‌ها و منابع/کاتالوگ |
| `/dashboard/users` | مدیریت کاربران برای مدیر |
| `/dashboard/projects/[code]/export` | داشبورد اختصاصی پروژهٔ صادرات |

داشبورد اصلی در `frontend/components/project-dashboard.tsx` پروژه‌ها را با کارت‌های compact نمایش می‌دهد. بخش «منابع و کاتالوگ» از منوی دسکتاپ و navigation موبایل قابل دسترسی است و حساب‌ها و کالاها را برای پروژهٔ انتخابی مدیریت می‌کند.

داشبورد صادرات در `frontend/app/dashboard/projects/[code]/export/page.tsx` سه بخش دارد:

1. **نمای کلی:** عملیات خرید، تعریف کالا و آمار خلاصه.
2. **طرف‌حساب و محموله:** فهرست compact و modalهای ثبت/ویرایش.
3. **دفترکل:** حساب‌ها و سندهای پروژه.

در دسکتاپ منوها کنار یا در نوار بالایی قرار می‌گیرند و در موبایل به‌صورت navigation افقی/بالایی نمایش داده می‌شوند. فرم‌های ثبت و ویرایش باید modal باقی بمانند و به‌صورت inline دائمی به صفحه برنگردند.

## قرارداد APIهای اصلی

تمام endpointهای داخلی به نشست معتبر نیاز دارند. درخواست‌های تغییردهنده باید `Origin` مجاز داشته باشند. پاسخ‌ها JSON و `Cache-Control: no-store` هستند. payload باید یک object JSON باشد؛ bodyهای بزرگ‌تر از ۶۴ KiB و fieldهای ناشناخته رد می‌شوند.

### پروژه‌ها

```text
GET    /api/v1/projects
POST   /api/v1/projects
PUT    /api/v1/projects/{id}
DELETE /api/v1/projects/{id}
```

داشبورد صادرات با کد پروژه resolve می‌شود و فقط پروژهٔ موجود با `type=export` پذیرفته می‌شود.

### طرف‌حساب‌ها و محموله‌ها

```text
GET  /api/v1/projects/{code}/export/counterparties
POST /api/v1/projects/{code}/export/counterparties
GET  /api/v1/projects/{code}/export/shipments
POST /api/v1/projects/{code}/export/shipments
```

نقش طرف‌حساب یکی یا چند مورد از `supplier`، `customer` و `intermediary` است. برای ایجاد محموله، `supplierId` باید به تأمین‌کنندهٔ همان پروژه اشاره کند. `palletCount` عدد صحیح مثبت و `weightKg` رشتهٔ decimal مثبت است؛ وزن هرگز به float تبدیل نمی‌شود. وضعیت محموله یکی از `planning`، `in_transit`، `delivered` و `sold` است.

جزئیات کامل و نمونهٔ payload در [`backend/EXPORT_API.md`](backend/EXPORT_API.md) قرار دارد.

### حساب‌ها و سندهای دفترکل

```text
GET  /api/v1/projects/{code}/ledger/accounts
POST /api/v1/projects/{code}/ledger/accounts
GET  /api/v1/projects/{code}/ledger/entries
POST /api/v1/projects/{code}/ledger/entries
```

حساب‌ها `scope=project` یا `scope=shared` دارند. حساب shared برای بانک/صندوق مشترک شرکت است و هنگام فهرست برای پروژه بر اساس `shared_scope` فیلتر می‌شود. نوع حساب یکی از `asset`، `liability`، `equity`، `revenue` و `expense` است.

سند دفترکل باید حداقل دو خط داشته باشد و جمع بدهکار و بستانکار functional برابر باشد. مبالغ، نرخ ارز و معادل ارز مبنا به‌صورت رشتهٔ decimal ذخیره می‌شوند؛ در Go یا JSON به float تبدیل نکنید. `idempotencyKey` برای هر پروژه یکتا است و retry همان کلید باید همان سند قبلی را برگرداند. برای عملیات جدید کلید جدید بسازید.

جزئیات کامل در [`backend/LEDGER_API.md`](backend/LEDGER_API.md) قرار دارد.

### منابع پروژه

```text
GET/POST /api/v1/projects/{code}/ledger/accounts
GET/POST /api/v1/projects/{code}/ledger/products
```

کالاها `itemType=resale` برای کالای قابل‌فروش/صادراتی یا `itemType=supply` برای ملزومات مصرفی هستند. حساب مشترک می‌تواند برای همهٔ پروژه‌ها یا نوع مشخص پروژه (`export`، `cold-storage`، `sorting`، `construction`، `rental`، `other`) قابل استفاده باشد.

## قواعد مدل مالی و عملیاتی

«خرید» و «محموله» دو موجودیت مستقل هستند:

```text
Purchase 1 ── N PurchaseItem 1 ── N SupplyUsage N ── 1 Shipment
```

- ثبت Purchase نباید Shipment ایجاد کند.
- ثبت Shipment نباید Purchase ایجاد کند.
- `SupplyUsage` پل تخصیص/مصرف خرید برای یک محموله است.
- یک قلم خرید می‌تواند بین چند محموله تقسیم شود.
- مجموع تخصیص‌ها نباید از مقدار خرید بیشتر شود.
- کنترل تخصیص چندمحموله‌ای باید در transaction با قفل `FOR UPDATE` انجام شود.
- مقدار، مبلغ، نرخ ارز و معادل ارز مبنا باید decimal و بدون float باشند.
- خرید، پرداخت، مصرف، برگشت و اصلاح باید source event و journal entry قابل‌ردگیری داشته باشند.
- پرداخت خرید، مقدار مصرف یا بهای محموله را تغییر نمی‌دهد.
- کاهش مصرف با حذف فیزیکی سابقه انجام نمی‌شود؛ باید عملیات اصلاحی و سند معکوس ثبت شود.

جزئیات جداول پیشنهادی، سناریوهای حسابداری و قواعد تخصیص در [`docs/PURCHASE-SHIPMENT-SUPPLY-USAGE.md`](docs/PURCHASE-SHIPMENT-SUPPLY-USAGE.md) است.

## PostgreSQL و migrationها

migrationها در `backend/internal/projects/migrations/` قرار دارند و به‌صورت افزایشی اجرا می‌شوند؛ migration قبلی را بازنویسی نکنید. migrationهای مرتبط شامل داده‌های auth، پروژه‌ها، export core، ledger و scope حساب shared هستند.

نکات حساس:

- پیش از migration روی دیتابیس موجود backup قابل‌بازیابی تهیه کنید.
- migration قدیمی 004 ممکن است حساب‌های `pending` و نشست‌های آن‌ها را حذف کند؛ قبل از ارتقا وضعیت کاربران را بررسی کنید.
- deploy شدن image لزوماً به معنی اجرای migration موردنظر نیست؛ runner و لاگ startup را بررسی کنید.
- migration جدید را additive نگه دارید و برای constraintهای جدید دادهٔ قدیمی را ابتدا normalize کنید.
- تست migration روی دیتابیس آزمایشی انجام شود، نه production.

## استقرار production

راهنمای کامل در [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) است. خلاصهٔ ترتیب کار:

1. PostgreSQL پایدار مانند Neon بسازید و `DATABASE_URL` را فقط در secretهای deployment قرار دهید.
2. `APP_ENV=production`، `PORT=8080` و `PUBLIC_APP_ORIGIN` دقیق HTTPS را تنظیم کنید.
3. در دیتابیس خالی، `BOOTSTRAP_ADMIN_EMAIL` و `BOOTSTRAP_ADMIN_PASSWORD` را موقتاً تنظیم کنید.
4. deploy کنید و `/_health`، `/_ready`، ورود مدیر و ثبت‌نام آزمایشی را بررسی کنید.
5. bootstrap secrets را حذف و دوباره deploy کنید.
6. migration، backup و restore را ثبت و آزمایش کنید.
7. پس از هر push به `main`، deployment مربوط به SHA همان commit را در Vercel بررسی کنید؛ build موفق به‌تنهایی سلامت دیتابیس و ورود را ثابت نمی‌کند.

برای اجرای داخلی:

```bash
git pull origin main
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:3000/_health
curl -i http://127.0.0.1:3000/_ready
```

در Compose، port web به‌صورت پیش‌فرض روی localhost bind است. برای دسترسی شبکهٔ داخلی، bind و firewall را آگاهانه تغییر دهید و reverse proxy دارای HTTPS استفاده کنید.

## Backup و عملیات حساس داده

- backup رمزنگاری‌شده را در محل مستقل نگه دارید.
- restore را روی دیتابیس آزمایشی تمرین کنید.
- برای Compose نمونهٔ dump:

```bash
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "backups/postgres-$(date +%F-%H%M).sql.gz"
```

- قبل از migration، پاک‌سازی کاربر، reset یا restore وضعیت فعلی و تأیید صاحب سیستم را ثبت کنید.
- از `docker compose down -v` و حذف مستقیم دادهٔ production استفاده نکنید، مگر با تأیید صریح و backup قابل‌بازیابی.
- جزئیات عملیات حساس در [`docs/PRODUCTION-DATA-OPERATIONS.md`](docs/PRODUCTION-DATA-OPERATIONS.md) است.

## طراحی و قواعد توسعهٔ frontend

- متن‌های user-facing باید در فارسی و انگلیسی پشتیبانی شوند؛ ترجمه‌ها در `frontend/lib/*-i18n.ts` نگهداری می‌شوند.
- API type و validator را در `frontend/lib/` نگه دارید و دادهٔ خام backend را بدون validation وارد UI نکنید.
- فرم‌های ثبت/ویرایش را با `ProjectModal` باز کنید و بستن با close، Escape و overlay را حفظ کنید.
- در layout داشبورد، صفحهٔ اول را با workspaceهای بزرگ شلوغ نکنید؛ قابلیت‌ها از navigation قابل دسترسی باشند.
- داده‌های پولی، وزن، تعداد و نرخ ارز را با string/decimal نگه دارید؛ از `number` برای محاسبات مالی استفاده نکنید.
- برای retry درخواست‌های قابل‌تکرار، idempotency key و رفتار backend را رعایت کنید.
- تصاویر ویترین در `frontend/public/images/` هستند و منبع/مجوزشان در [`docs/ASSETS.md`](docs/ASSETS.md) ثبت شده است.

## وضعیت قابلیت‌ها و roadmap

### تکمیل‌شده

- ویترین responsive فارسی/انگلیسی.
- ورود، ثبت‌نام، نشست قابل ابطال و مدیریت کاربران توسط مدیر.
- CRUD پروژه‌ها با جست‌وجو، فیلتر، وضعیت، مسئول، حسابدار، موقعیت و مقصد.
- داشبورد فشردهٔ پروژه‌ها با navigation منابع و کاتالوگ.
- داشبورد صادرات با navigation نمای کلی، عملیات، رکوردها و دفترکل.
- ثبت طرف‌حساب و محموله با PostgreSQL و memory demo.
- حساب‌های project/shared و سندهای balanced با decimal string و idempotency.
- ثبت خرید اولیه و ایجاد خودکار سند حسابداری در workspace عملیات.
- فرم‌های ثبت عملیات، کالا، طرف‌حساب و محموله به‌صورت modal.

### کارهای باز و اولویت‌دار

1. پیاده‌سازی کامل `Purchase`، `PurchaseItem` و `SupplyUsage` و API آن‌ها.
2. تخصیص یک خرید به چند محموله با transaction، `FOR UPDATE`، کنترل مجموع مقدار و تست PostgreSQL.
3. اتصال idempotent رویدادهای خرید، پرداخت، فروش، دریافت واسطه، مصرف و برگشت به journal entry.
4. افزودن پرداخت مرحله‌ای، تبدیل ارز، موجودی ملزومات و گزارش سود/زیان.
5. افزودن مجوز مستقل پروژه، نقش‌های جزئی‌تر، audit log و بازیابی رمز امن.
6. تکمیل migrationهای production و اجرای رسمی آن‌ها پس از backup.
7. جایگزینی نام، لوگو و هویت موقت با دارایی‌های رسمی شرکت.

فهرست جزئی‌تر در [`TODO.md`](TODO.md) نگهداری می‌شود. هنگام تکمیل هر قابلیت، هم کد و هم این README/سند handoff را به‌روز کنید.

## عیب‌یابی سریع

### ورود `دسترسی مجاز نیست` می‌دهد

`PUBLIC_APP_ORIGIN` باید دقیقاً با origin عمومی مرورگر برابر باشد. برای deploymentهای Vercel، origin دامنهٔ مورد استفاده باید در منطق auth مجاز باشد. همچنین `DATABASE_URL`، وضعیت `/_ready` و cookie نشست را بررسی کنید.

### داده‌ها پس از restart ناپدید می‌شوند

احتمالاً backend در memory demo اجرا شده است. `DATABASE_URL` تنظیم کنید و مطمئن شوید backend واقعاً به PostgreSQL متصل شده است.

### build موفق است اما API کار نمی‌کند

build فقط compile و static generation را بررسی می‌کند. `/_health`، `/_ready`، لاگ API، متغیرهای محیطی، routeهای `vercel.json` و اتصال PostgreSQL را جداگانه بررسی کنید.

### ثبت سند دفترکل رد می‌شود

تعداد خطوط، برابر بودن functional debit/credit، معتبر بودن account scope، decimal string بودن مبالغ و یکتا بودن `idempotencyKey` را بررسی کنید.

### migration روی دیتابیس قدیمی مشکل ایجاد می‌کند

ابتدا backup بگیرید، وضعیت migrationهای اجراشده و کاربران `pending` را بررسی کنید و سپس migration را روی clone یا دیتابیس آزمایشی اجرا کنید. migrationهای قبلی را دستی حذف یا ویرایش نکنید.

## چک‌لیست تحویل به توسعه‌دهندهٔ بعدی

- [ ] repository و branch درست را clone کرده‌اید.
- [ ] `pnpm install --frozen-lockfile` موفق است.
- [ ] `.env` از روی `.env.example` ساخته شده و secretها commit نمی‌شوند.
- [ ] frontend با `pnpm dev:web` اجرا می‌شود.
- [ ] API با PostgreSQL آزمایشی یا memory demo آگاهانه اجرا می‌شود.
- [ ] `pnpm typecheck` و `pnpm build:web` موفق هستند.
- [ ] برای تغییرات backend، `go test ./...` و `go vet ./...` اجرا شده‌اند.
- [ ] قرارداد API مرتبط و migrationهای مربوط مطالعه شده‌اند.
- [ ] تغییرات مالی از float استفاده نمی‌کنند و idempotency دارند.
- [ ] پیش از migration یا عملیات production، backup و restore آزمایشی انجام شده است.
- [ ] commit، deployment Vercel و health/readiness بررسی شده‌اند.

## اسناد مرجع

- [راهنمای استقرار](docs/DEPLOYMENT.md)
- [سند تحویل فارسی](docs/PROJECT-HANDOFF-FA.md)
- [قرارداد API صادرات](backend/EXPORT_API.md)
- [قرارداد API دفترکل](backend/LEDGER_API.md)
- [مدل خرید، محموله و مصرف](docs/PURCHASE-SHIPMENT-SUPPLY-USAGE.md)
- [عملیات دادهٔ production](docs/PRODUCTION-DATA-OPERATIONS.md)
- [فهرست تصاویر](docs/ASSETS.md)
- [اصول طراحی داشبورد با الهام از Citi Bike](docs/UI-DESIGN-CITI-BIKE-FA.md)
- [کارهای باز](TODO.md)
- [تصمیم‌های معماری و طراحی](plan.md)
