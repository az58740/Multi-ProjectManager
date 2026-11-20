# راهنمای امن backup و پاکسازی کاربران production

این راهنما برای دیتابیس production پروژه است. تا وقتی DSN مستقیم production با محیط درست تطبیق داده نشده و backup قابل‌بازیابی آزمایش نشده، هیچ `DELETE` یا reset اجرا نشود.

## تشخیص فعلی ورود

`/_ready` در production پاسخ `{ "dataMode": "database", "status": "ready" }` می‌دهد و deployment اصلاح ورود با commit `f807b82` وضعیت `READY` دارد. backend ایمیل را trim و lowercase می‌کند و برای ایمیل ناشناخته یا رمز اشتباه عمداً پاسخ 401 عمومی می‌دهد. بنابراین پیام ورود به‌تنهایی ثابت نمی‌کند کاربر وجود ندارد. قبل از تغییر رمز یا داده، با DSN مستقیم و فقط read-only تعداد کاربران، `lower(trim(email))`، `status` و نسخهٔ migrationها بررسی شوند؛ هرگز `password_hash`، session token یا DSN در خروجی ثبت نشود. اگر کاربر در Preview یا حالت `demo` ساخته شده باشد، آن حساب الزاماً در production وجود ندارد.

## انتخاب backup

در Neon، snapshot و PITR برای بازگشت سریع داخل تاریخچهٔ پروژه مناسب‌اند. snapshot چندمرحله‌ای امکان ساخت branch جدا برای بازرسی read-only می‌دهد. برای نسخهٔ مستقل خارج از Neon، آرشیو منطقی PostgreSQL با `pg_dump -Fc` تهیه شود؛ Neon توصیه می‌کند از connection string مستقیمِ بدون pooling استفاده شود و نسخهٔ ابزار با PostgreSQL پروژه سازگار باشد.

## runbook پیشنهادی

1. در Neon Console روی root/production branch یک snapshot با نامی مانند `pre-auth-cleanup-2026-11-20` و retention مشخص بسازید. اگر snapshot در دسترس نیست، DSN مستقیمِ بدون pooling را فقط از secret manager بگیرید.
2. آرشیو را خارج از repository و در storage رمزنگاری‌شده نگه دارید:

   ```bash
   umask 077
   pg_dump --format=custom --file=production-pre-auth-cleanup-2026-11-20.dump "$NEON_DIRECT_DATABASE_URL"
   sha256sum production-pre-auth-cleanup-2026-11-20.dump > production-pre-auth-cleanup-2026-11-20.sha256
   ```

3. روی branch/database جداگانه restore کنید، نه روی production. با `pg_restore --list` وجود schema را بررسی و با اتصال read-only تعداد جدول‌های کلیدی و کاربران را تطبیق دهید. موفقیت backup بدون restore آزمایشی کافی نیست.
4. پیش از پاکسازی در production، با transaction و count اولیه فقط جدول‌های auth را هدف بگیرید. داده‌های پروژه، export، ledger و migration نباید حذف شوند:

   ```sql
   BEGIN;
   SELECT count(*) AS sessions_before FROM auth_sessions;
   SELECT count(*) AS users_before FROM auth_users;
   DELETE FROM auth_sessions;
   DELETE FROM auth_users;
   SELECT count(*) AS sessions_after FROM auth_sessions;
   SELECT count(*) AS users_after FROM auth_users;
   -- فقط اگر هر دو مقدار after صفر و محیط صحیح بود:
   COMMIT;
   -- در غیر این صورت: ROLLBACK;
   ```

5. پیش از حذف، bootstrap مدیر جدید را با `BOOTSTRAP_ADMIN_EMAIL` و `BOOTSTRAP_ADMIN_PASSWORD` در secret/environment امن تنظیم کنید. رمز را در chat، log یا Git نگذارید. پس از deploy، با مدیر جدید login و `/_ready` را verify کنید و بلافاصله متغیرهای bootstrap را حذف و redeploy کنید.
6. بعد از cleanup فقط با queryهای read-only صفر بودن session/user و باقی ماندن schema/data پروژه و ledger را بررسی کنید. سپس یک ثبت‌نام و login آزمایشی مجاز انجام دهید.

منابع رسمی: [Neon Backup & Restore](https://neon.com/docs/guides/backup-restore)، [Neon pg_dump/pg_restore](https://neon.com/docs/manage/backup-pg-dump)، و [Neon PostgreSQL-compatible export](https://neon.com/docs/guides/export-neon-postgres-compatible).
