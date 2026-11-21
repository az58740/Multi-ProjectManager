# سند تحویل پروژه Multi-ProjectManager

## وضعیت تحویل

- مخزن: `https://github.com/az58740/Multi-ProjectManager`
- شاخهٔ کاری: `main`
- مسیر کاری: `/home/ubuntu/work/Multi-ProjectManager`
- آخرین commit منتشرشده پیش از این تغییرات: `5f477f4 feat: automate export purchase operations`
- commit این مرحله پس از push در انتهای کار ثبت می‌شود.
- پروژهٔ Vercel: `multi-project-manager` در تیم `Amir's projects`
- دامنهٔ فعلی: `https://multi-project-manager-rho.vercel.app`

## هدف این مرحله

ثبت حساب‌های بانکی و صرافی و تعریف کالا/ملزومات از داشبورد صادرات به داشبورد اصلی `/dashboard` منتقل شد. حساب مشترک اکنون می‌تواند برای همهٔ پروژه‌ها یا فقط یک نوع پروژه قابل استفاده باشد. کالاها دو نوع مفهومی دارند: `resale` برای کالاهای قابل‌فروش/صادراتی و `supply` برای ملزومات مصرفی.

## تغییرات پیاده‌سازی‌شده

- `frontend/components/project-resources-workspace.tsx`: workspace مرکزی با انتخاب پروژه، فهرست حساب‌ها و کالاها و فرم‌های ثبت آن‌ها.
- `frontend/components/project-dashboard.tsx`: نمایش workspace مرکزی در داشبورد اصلی، پیش از فهرست پروژه‌ها.
- `frontend/components/ledger-workspace.tsx`: ارسال و نمایش دامنهٔ حساب shared.
- `frontend/lib/ledger.ts` و `frontend/lib/ledger-i18n.ts`: type/validator و ترجمه‌های `sharedScope`.
- `backend/internal/ledger/store.go`: مدل و اعتبارسنجی scope جدید.
- `backend/internal/ledger/postgres.go`: خواندن/نوشتن `shared_scope` و فیلتر حساب shared بر اساس نوع پروژه.
- `backend/internal/ledger/memory.go`: پشتیبانی demo از دامنهٔ حساب shared.
- `backend/internal/projects/migrations/009_shared_account_scope.sql`: migration افزایشی. پیش از constraint، حساب‌های قدیمی با `scope='project'` به `shared_scope='project'` تبدیل می‌شوند تا migration روی دادهٔ موجود شکست نخورد.

## قرارداد منابع

APIها بر اساس کد پروژه کار می‌کنند:

- `GET/POST /api/v1/projects/{code}/ledger/accounts`
- `GET/POST /api/v1/projects/{code}/ledger/products`

برای حساب، payload شامل `scope`, `code`, `name`, `accountType`, `currency`, `sharedScope` است. برای حساب project، backend مقدار `sharedScope` را به `project` تبدیل می‌کند. برای حساب shared، مقادیر مجاز شامل `all`, `export`, `cold-storage`, `sorting`, `construction`, `rental`, `other` هستند.

برای کالا، payload شامل `code`, `name`, `itemType`, `unit`, `currency` است. `itemType` فقط `resale` یا `supply` است.

## معماری و محدودیت‌های مهم

Frontend با Next.js 16، React 19، TypeScript و Tailwind است. Backend با Go، HTTP JSON API و pgx v5 نوشته شده و PostgreSQL/Neon ذخیره‌سازی اصلی production است. مسیرهای API از `vercel.json` به backend هدایت می‌شوند. در نبود `DATABASE_URL` در محیط غیرproduction، memory store برای demo فعال می‌شود؛ دادهٔ آن پایدار نیست.

حساب shared به یک پروژهٔ مشخص تعلق ندارد، اما هنگام فهرست‌کردن برای پروژه، فقط حساب‌های `all` یا حسابی که `shared_scope` آن با `projects.type` برابر است برگردانده می‌شود. حساب project فقط برای همان پروژه نمایش داده می‌شود.

## تست‌های انجام‌شده

- `pnpm typecheck` موفق.
- `pnpm build:web` موفق؛ routeهای `/dashboard` و `/dashboard/projects/[code]/export` build شدند.
- `git diff --check` موفق.
- Go executable و `gofmt` در Sandbox در دسترس نیستند؛ اعتبارسنجی backend باید از build رسمی Vercel و در صورت فراهم‌شدن Go با `go test ./...` انجام شود.

## دادهٔ production و migration

پیش از اجرای migration روی Neon باید backup/restore قابل‌بازیابی تهیه و وضعیت migration runner بررسی شود. migrationهای قبلی بازنویسی نشده‌اند و migration شمارهٔ 009 additive است. هیچ دادهٔ production نباید برای تست پاک یا reset شود. ایجاد حساب‌ها و کالاها در داشبورد باید ابتدا با یک پروژهٔ آزمایشی و رکوردهای کنترل‌شده بررسی شود.

## مواردی که هنوز کامل نشده‌اند

- API کامل Purchase/SupplyUsage و اتصال کامل آن‌ها به عملیات خرید/مصرف هنوز باید تکمیل شود.
- تخصیص یک خرید به چند محموله با `FOR UPDATE` و کنترل مجموع مقدار هنوز باید تکمیل و تست PostgreSQL شود.
- پرداخت مرحله‌ای، دریافت از واسطه، تبدیل ارز، audit log، مجوز مستقل پروژه و گزارش سود/زیان هنوز roadmap هستند.
- migration 009 باید در production با فرآیند migration رسمی اجرا شود؛ صرفاً deploy شدن کد به معنای اجرای migration نیست.
- پس از deploy، `/_ready` و لاگ build Vercel باید بررسی شوند.

## ادامهٔ پیشنهادی

1. وضعیت GitHub و deployment commit نهایی را بررسی کن.
2. migration 009 را پس از backup روی دیتابیس production اجرا کن.
3. با یک پروژه از هر نوع، فهرست حساب‌های shared را بررسی کن.
4. endpointهای Purchase، Shipment و SupplyUsage را با رویدادهای حسابداری idempotent تکمیل کن.
5. برای تخصیص چندمحموله‌ای transaction و `FOR UPDATE` اضافه کن.
6. تست‌های backend و PostgreSQL را در دیتابیس آزمایشی خالی اجرا کن؛ هرگز production را برای test استفاده نکن.
