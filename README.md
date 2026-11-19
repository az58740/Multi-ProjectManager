# Multi-Project Manager

بدايةٔ یک سامانهٔ پروژه‌محور برای مجموعه‌ای با فعالیت‌های صادرات میوه و تره‌بار، سردخانه، همکاری با مراکز سورتینگ، ساخت‌وساز و اجارهٔ املاک. رابط فارسی/انگلیسی و RTL/LTR است. نام «گروه بازرگانی و توسعه» و نشان برگ/جعبه فعلاً هویت موقت‌اند؛ نام رسمی و لوگوی شرکت هنوز دریافت نشده است.

## قابلیت‌های آماده

- ویترین عمومی واکنش‌گرا با معرفی حوزه‌های فعالیت و تصویرهای محلی WebP.
- ورود Manus OAuth واقعی و نشست امن سمت سرور؛ بدون کاربر جعلی یا bypass توسعه.
- مدیریت پروژه‌ها: شمارندهٔ وضعیت، جست‌وجو، فیلتر نوع/وضعیت، کد خودکار، نمای جزئیات، ایجاد و ویرایش.
- فیلدهای پروژه: نام، نوع، موقعیت، مقصد، مسئول، حسابدار، وضعیت، تاریخ شروع/پایان و شرح.
- پروژهٔ صادراتی می‌تواند ارز هزینه و فروش پیش‌فرض داشته باشد؛ این‌ها فقط پیش‌فرض پروژه‌اند و ارز واقعی هر ماشین در ماژول بعدی قابل تغییر خواهد بود.
- API Go، ذخیره‌ساز حافظه‌ای صرفاً نمایشی، PostgreSQL با migrations افزایشی، Dockerfile برای هر سرویس و Vercel multi-service config.

مسئول و حسابدار فعلی نام متنی‌اند، نه کاربر یا مجوز؛ تمام اعضای allowlist در نسخهٔ فعلی به پروژه‌های مشترک دسترسی دارند. دفترکل، هزینه/فروش ماشین، تسویهٔ واسطه، نرخ ارز، کنترل دسترسی به تفکیک پروژه و backup عملیاتی هنوز پیاده نشده‌اند. تا پیش از تکمیل آن‌ها دادهٔ واقعی مالی وارد نکنید.

## ساختار

- `frontend/`: Next.js App Router، React، TypeScript، Tailwind CSS
- `backend/`: API ماژولار Go، ورود OAuth، پروژه‌ها و migrations PostgreSQL
- `docker-compose.yml`: اجرای داخلی web + API + PostgreSQL با volume پایدار
- `vercel.json`: مسیریابی Vercel میان سرویس frontend و Go Container API
- `docs/DEPLOYMENT.md`: دستورهای استقرار Vercel/سرور داخلی، امنیت و backup
- `docs/GITHUB-TRANSFER.md`: انتقال سورس به repository موجود
- `TODO.md`: موارد باز و کارهای محصولی بعدی

این یک سامانهٔ ماژولار است، نه مجموعه‌ای از microserviceهای مستقل.

## اجرای توسعه

پیش‌نیاز: Node.js 20.9 یا بالاتر، pnpm 11 و Go 1.22 یا بالاتر.

```bash
pnpm install
pnpm dev
```

API در پورت 8080 و Next.js در پورت 3000 اجرا می‌شوند. بدون `DATABASE_URL` و در محیط development، داده‌های پروژهٔ demo فقط در حافظهٔ فرایند می‌مانند و با restart پاک می‌شوند؛ پاسخ API حالت `dataMode: demo` را اعلام می‌کند. برای دیدن داشبورد همچنان OAuth واقعی و نشست معتبر Manus لازم است.

بررسی‌ها:

```bash
pnpm typecheck
pnpm build:web
cd backend && go test ./...
```

## اجرای Compose

Docker Engine و Compose v2 لازم‌اند. برای نمونهٔ پیکربندی محلی:

```bash
cp .env.example .env
# رمز قوی بسازید: openssl rand -hex 32؛ سپس .env را با آن، OAuth، APP_ALLOWED_OPEN_IDS و مبدأ HTTPS پر کنید
docker compose up --build -d
```

Compose شامل web، API و PostgreSQL است. دیتابیس در volume `postgres_data` نگهداری می‌شود. `WEB_BIND` پیش‌فرض `127.0.0.1` است؛ برای دسترسی از LAN آن را فقط پس از تنظیم firewall به IP خصوصی سرور یا `0.0.0.0` تغییر دهید. پیکربندی production به HTTPS reverse proxy و `PUBLIC_APP_ORIGIN` دقیق نیاز دارد. از `docker compose down -v` استفاده نکنید مگر اینکه حذف دیتابیس را عمداً بخواهید. فایل `.env` را commit نکنید.

جزئیات متغیرهای حساس، راه‌اندازی سرور داخلی و backup/restore در [راهنمای استقرار](docs/DEPLOYMENT.md) آمده‌اند.

## Vercel و PostgreSQL

`vercel.json` دو سرویس frontend/Go و مسیرهای API را تعریف می‌کند. Vercel container حافظهٔ پایدار دیتابیس نیست؛ PostgreSQL باید به‌صورت سرویس مستقل و قابل‌دسترسی شبکه‌ای وصل شود. برای دادهٔ دائمی backend به `DATABASE_URL` و `APP_ALLOWED_OPEN_IDS` نیاز دارد. مقادیر Manus OAuth از Preview به Vercel خودکار منتقل نمی‌شوند؛ دامنهٔ OAuth نهایی باید HTTPS باشد و callback آن پذیرفته شود. **هنوز deployment واقعی Vercel یا پایگاه‌داده ایجاد نشده است.** تا وقتی PostgreSQL، مقادیر OAuth سمت‌سرور و deployment آزمایشی تنظیم و آزموده نشده‌اند، آن را سامانهٔ عملیاتی تلقی نکنید.

## GitHub

مخزن `az58740/Multi-ProjectManager` کاربر در GitHub موجود است. انتقال کد به آن و اتصال خودکار Vercel پس از commit انجام می‌شود، اما اتصال مستقیم مخزن موجود به‌عنوان مخزن canonical در پروژهٔ Webdev از مسیر رسمی فعلی پشتیبانی نمی‌شود؛ بنابراین کپی GitHub و workspace Webdev فعلاً دو نسخه‌اند و همگام‌سازی آینده با commit/PR انجام می‌شود. راهنمای جزئیات در [انتقال به GitHub](docs/GITHUB-TRANSFER.md) است.

## منابع تصویر

عکس‌های سایت در `frontend/public/images/` نگهداری می‌شوند تا در Vercel یا شبکهٔ شرکت به سرویس تصاویر بیرونی نیاز نباشد. منبع و مجوز هر asset در [فهرست تصاویر](docs/ASSETS.md) ثبت شده است. مراکز سورتینگ، تأمین‌کننده/شریک‌اند و شرکت خودش عملیات سورتینگ انجام نمی‌دهد.
