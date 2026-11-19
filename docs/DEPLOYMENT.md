# آماده‌سازی استقرار: Vercel یا سرور داخلی

## وضعیت فعلی

سورس در GitHub قرار گرفته و پروژهٔ Vercel `multi-project-manager` به آن متصل است. اولین build به علت تشخیص هم‌زمان Next.js و Container با خطای `MULTIPLE_FRAMEWORKS_SERVICE` شکست خورد؛ `vercel.json` اکنون `framework: nextjs` را برای frontend و `framework: container` را برای backend صریح می‌کند و build بعدی باید در Vercel بررسی شود. در پروژهٔ جدید Vercel، SSO protection روی deployment URLها روشن است؛ با این حال PostgreSQL پایدار، allowlist و OAuth سروری هنوز تنظیم نشده‌اند. برای production واقعی آماده نیست. Docker CLI در این محیط نیست، بنابراین Compose build/run هم آزموده نشده است. دسترسی از ایران، شرایط استفاده، منطقهٔ داده، شبکه و backup ارائه‌دهنده را پیش از انتخاب کنترل کنید.

## گزینهٔ Vercel

`vercel.json` مسیرهای سایت Next.js از `frontend/` را به سرویس فرانت‌اند و `/api/*`، `/_health` و `/_ready` را به سرویس Container بک‌اند Go از `backend/` می‌فرستد. `framework` برای frontend روی `nextjs` و برای backend روی `container` تنظیم شده است؛ Container از `backend/Dockerfile` ساخته می‌شود. مقدار `PORT=8080` لازم است و اپ مقدار `PORT` را می‌خواند. [Vercel Services](https://vercel.com/docs/services) · [Service configuration reference](https://vercel.com/docs/services/config-reference) · [Container Runtime](https://vercel.com/docs/functions/runtimes/container)

### پایگاه‌دادهٔ Vercel

کانتینر بک‌اند محل نگهداری دیتابیس دائمی نیست و فایل‌های محلی/حافظهٔ فرایند می‌توانند با restart یا scale شدن از بین بروند. PostgreSQL باید بیرون از کانتینر Go، به‌صورت سرویس پایدار و قابل‌دسترسی شبکه‌ای میزبانی شود. در این استقرار متغیر `DATABASE_URL` را فقط برای سرویس بک‌اند تعریف کنید. محدودیت IP خروجی، TLS و اتصال دیتابیس را مطابق مستندات ارائه‌دهنده بررسی کنید. backup خودکار را فعال کنید و بازیابی از backup را عملاً تمرین کنید.

### متغیرهای server-only لازم

- `APP_ENV=production`
- `PORT=8080`
- `DATABASE_URL` برای PostgreSQL پایدار
- `APP_ALLOWED_OPEN_IDS`، فهرست شناسه‌های Manus `openId` جداشده با ویرگول؛ بدون این مقدار backend در حالت دیتابیس fail-closed می‌شود
- `MANUS_PROJECT_ID`
- `MANUS_OAUTH_PORTAL_URL`
- `MANUS_OAUTH_API_URL`
- `MANUS_JWT_SECRET`
- `PUBLIC_APP_ORIGIN`، دقیقاً مبدأ HTTPS نهایی سایت

`MANUS_*` و `DATABASE_URL` از Preview به Vercel خودکار منتقل نمی‌شوند. آن‌ها را در Environment Variables سمت سرور تعریف کنید؛ هرگز در Git یا `NEXT_PUBLIC_*` قرار ندهید. callback مبدأ نهایی باید توسط سیاست OAuth پذیرفته شود. اگر کارمندان حساب Manus ندارند، پیش از deployment باید provider ورود سازمانی دیگری انتخاب و پیاده‌سازی شود؛ در حال حاضر چنین provider دیگری تنظیم نشده است.

### مراحل عملی Vercel

1. ابتدا repository را در GitHub آماده کنید؛ راه انتقال به repository فعلی در [راهنمای GitHub](GITHUB-TRANSFER.md) است.
2. در Vercel همان repository را import کنید و تنظیم `vercel.json` را نگه دارید تا سرویس‌ها و rewriteها از monorepo خوانده شوند.
3. PostgreSQL پایدار انتخاب کنید و `DATABASE_URL` را فقط به سرویس بک‌اند بدهید.
4. متغیرهای بالا را برای environment درست (Preview/Production) وارد کنید. `PORT=8080` را در Container service رعایت کنید.
5. Deployment preview را ابتدا با حساب مجاز آزمایش کنید: `/_health` زنده‌بودن را می‌سنجد و `/_ready` آمادگی OAuth را. سپس login، فهرست، ایجاد و ویرایش یک پروژهٔ آزمایشی و اتصال PostgreSQL را بررسی کنید.
6. قبل از هر دادهٔ واقعی، backup/restore و دسترسی حساب‌های غیرمجاز را آزمایش کنید.

Container Runtime و چندسرویسی از امکانات Vercel است که جزئیات و محدودیت‌های آن ممکن است با زمان، منطقه یا پلن تغییر کند؛ مستند رسمی زمان استقرار را ملاک قرار دهید. در Vercel برنامهٔ frontend فقط UI است؛ دادهٔ پایدار در سرویس PostgreSQL خارجی می‌ماند. [PostgreSQL در Vercel](https://vercel.com/docs/postgres)

## گزینهٔ سرور داخلی شرکت با Docker Compose

Compose اکنون سه سرویس `web`، `api` و `db` دارد. PostgreSQL در volume نام‌دار `postgres_data` پایدار می‌ماند؛ فرانت‌اند Next.js از build مستقل standalone استفاده می‌کند و API Go فقط در شبکهٔ خصوصی Compose قابل‌دسترسی است. تنها پورت وب روی میزبان منتشر می‌شود؛ پیش‌فرض آن `127.0.0.1:3000` است تا بدون تصمیم صریح روی شبکه باز نشود.

### راه‌اندازی

نیاز است Docker Engine و افزونهٔ Docker Compose v2 روی سرور نصب باشند، کد روی سرور موجود باشد و فضای دیسک/backup برای PostgreSQL در نظر گرفته شود. در مخزن:

```bash
cp .env.example .env
```

فایل `.env` را روی خود سرور و خارج از Git پر کنید:

- `POSTGRES_PASSWORD`: رمز تصادفی قوی و یکتا؛ برای نمونه `openssl rand -hex 32`. Compose آن را جدا از `DATABASE_URL` به‌عنوان `PGPASSWORD` می‌فرستد، پس محارف رزروشدهٔ URI باعث شکست اتصال نمی‌شوند.
- `APP_ALLOWED_OPEN_IDS`: شناسه‌های `openId` مجاز، جداشده با ویرگول؛ ورود نام/ایمیل کافی نیست
- مقادیر Manus OAuth و `MANUS_JWT_SECRET`
- `PUBLIC_APP_ORIGIN`: مبدأ دقیق HTTPS بعد از reverse proxy
- برای دسترسی فقط از خود سرور، `WEB_BIND=127.0.0.1` بماند؛ اگر کارمندان باید از LAN استفاده کنند، آن را به IP خصوصی سرور یا `0.0.0.0` تغییر دهید و firewall را فقط برای شبکهٔ مجاز باز کنید

وقتی مقادیر تنظیم شدند:

```bash
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:3000/_health
curl -i http://127.0.0.1:3000/_ready
```

`/_health` فرایند Go را از مسیر proxy سایت آزمایش می‌کند؛ `/_ready` اگر OAuth کامل پیکربندی نشده باشد `503` می‌دهد. برای مشاهدهٔ لاگ‌ها:

```bash
docker compose logs --tail=100 web api db
```

مهاجرت‌های PostgreSQL در شروع API و با جدول نسخه‌ها و قفل تراکنشی اجرا می‌شوند. برای URL داخلی Compose از `sslmode=disable` استفاده شده، چون اتصال داخل شبکهٔ Docker است؛ اتصال از شبکهٔ بیرونی باید با TLS و firewall محدود شود. Compose نام کاربری/میزبان/پایگاه‌داده را در `DATABASE_URL` و رمز را جداگانه در `PGPASSWORD` می‌فرستد؛ برای Vercel، `DATABASE_URL` ارائه‌دهنده را بدون تغییر وارد کنید.

### انتشار داخلی امن

برای استفادهٔ شرکتی، endpoint را با DNS داخلی یا دامنهٔ مورد توافق پشت reverse proxy دارای HTTPS قرار دهید؛ TLS برای OAuth عملیاتی و کوکی امن لازم است. `PUBLIC_APP_ORIGIN` باید دقیقاً همان مبدأ HTTPS باشد. اگر موبایل‌ها از بیرون LAN وصل می‌شوند، VPN سازمانی را به بازکردن PostgreSQL/API روی اینترنت ترجیح دهید. خود UI باید از شبکهٔ مجاز قابل‌دسترسی باشد؛ پورت دیتابیس و API را مستقیم به اینترنت publish نکنید.

برای به‌روزرسانی پس از دریافت کد جدید:

```bash
git pull
docker compose up --build -d
```

دستور `docker compose down` سرویس‌ها را متوقف می‌کند اما volume داده را نگه می‌دارد. از `docker compose down -v` استفاده نکنید مگر اینکه حذف دیتابیس عمداً تأیید شده باشد؛ `-v` دادهٔ PostgreSQL این Compose را پاک می‌کند.

### پشتیبان‌گیری و بازیابی

Volume روی همان دیسک، backup نیست. یک dump رمزنگاری‌شدهٔ زمان‌بندی‌شده به مقصد جدا از سرور ذخیره کنید و restore را روی دیتابیس آزمایشی تمرین کنید. نمونهٔ dump دستی:

```bash
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "backups/postgres-$(date +%F-%H%M).sql.gz"
```

هنگام بازیابی، ابتدا API را متوقف کنید، دیتابیس هدف را برای restore آماده کنید و بعد از بررسی نتیجه API را بالا بیاورید. سیاست retention، رمزنگاری، دسترسی و آزمون بازیابی را شرکت باید تعیین کند.

## اتصال GitHub و مسیر انتقال

برای انتقال سورس به `az58740/Multi-ProjectManager`، مراحل و محدودیت تفاوت «کپی سورس» با «مخزن اصلی Webdev» در [راهنمای GitHub](GITHUB-TRANSFER.md) توضیح داده شده است. اتصال Repository به Vercel یک مرحلهٔ جدا از انتشار این Preview است.

## محدودیت‌های محصولی پیش از دادهٔ واقعی

مدیریت پایهٔ پروژه، جست‌وجو/فیلتر، ایجاد و ویرایش آماده می‌شود؛ ولی کاربر/نقش/مجوز به تفکیک پروژه پیاده نشده است. هر عضو allowlist فعلاً پروژه‌های مشترک را می‌بیند. دفترکل، هزینه و فروش ماشین، تسویهٔ واسط، نرخ ارز، حساب‌های بانکی مشترک، گردش ملزومات، ممیزی تغییرات و برنامهٔ بازیابی سازمانی جزو این مرحله نیستند. تا تحلیل و پیاده‌سازی این الزامات و بازبینی امنیتی، اطلاعات واقعی مالی شرکت را وارد نکنید.

## منابع رسمی

- [Vercel Services](https://vercel.com/docs/services)
- [Container Runtime](https://vercel.com/docs/functions/runtimes/container)
- [پورت کانتینر Vercel](https://vercel.com/docs/functions/runtimes/container#port-resolution)
- [اجرای Dockerfile ساده روی Vercel](https://vercel.com/changelog/deploy-a-container-from-a-plain-dockerfile)
- [PostgreSQL در Vercel](https://vercel.com/docs/postgres)
- [پشتیبان‌گیری Neon](https://neon.com/docs/postgres/backup-restore/backups)
- [پشتیبان‌گیری Supabase](https://supabase.com/docs/guides/platform/backups)
- [شرایط Neon](https://neon.com/terms-of-service)
- [شرایط Supabase](https://supabase.com/terms)
