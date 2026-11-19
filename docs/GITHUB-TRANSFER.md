# انتقال سورس به GitHub موجود

## تفاوت مهم: کپی سورس در برابر تغییر مخزن اصلی Webdev

پروژهٔ اجرایی فعلی در فضای کاری Webdev است. مسیر رسمی «تغییر canonical repository» در Webdev فقط یک مخزن خصوصیِ جدید ایجاد می‌کند؛ اتصال مستقیم به `az58740/Multi-ProjectManager` موجود یا adoption آن پشتیبانی نمی‌شود. بنابراین افزودن کد به GitHub به معنی تغییر مخزن اصلی Webdev نیست؛ تا وقتی این محدودیت وجود دارد، دو نسخه باید با commit/PR یا export همگام شوند. مخزن Webdev و تنظیمات آن با عملیات زیر تغییر نمی‌کند.

## فایل export

نسخهٔ export شدهٔ سورس در این خروجی قرار می‌گیرد:

`Multi-ProjectManager-source.zip`

آرشیو برای انتقال سورس است و `.git`، `.env` واقعی، `node_modules` و خروجی‌های build را شامل نمی‌شود؛ `go.sum`، lockfile، Dockerfile، Compose و راهنماها همراه سورس هستند. آرشیو را در پوشه‌ای موقت extract کنید، نه روی تنها نسخهٔ کاری خود.

## انتقال به مخزن فعلی

روی کامپیوتری که Git و `unzip` دارد، ابتدا مخزن را clone کنید:

```bash
git clone https://github.com/az58740/Multi-ProjectManager.git
cd Multi-ProjectManager
```

اگر مخزن از قبل commit دارد، شاخهٔ جدا بسازید؛ اگر خالی است، روی branch اولیهٔ آن commit کنید:

```bash
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  git switch -c import/project-management
fi
mkdir -p /tmp/mpm-source
unzip -q /path/to/Multi-ProjectManager-source.zip -d /tmp/mpm-source
cp -a /tmp/mpm-source/. .
```

`/path/to/...` را با محل دانلود فایل جایگزین کنید. سپس diff را بازبینی کنید؛ از جمله `.gitignore` و فایل‌های README. فایل `.env` واقعی را کپی نکنید و credential داخل repository قرار ندهید:

```bash
git status --short
git diff --check
git add -A
git diff --cached --stat
git commit -m "Import project management application"
git push -u origin HEAD
```

اگر branch جدا ساخته شد، در GitHub یک Pull Request از `import/project-management` به branch پیش‌فرض بازبینی و merge کنید. اگر repository خالی بود، اولین push شاخهٔ اولیه را ایجاد می‌کند. بعد از آن Vercel می‌تواند repository را import کند؛ این مرحله مستقل از preview Webdev است.

اگر ترجیح می‌دهید من با GitHub connector شاخهٔ import یا PR بسازم، آن یک نوشتن جداگانه در حساب GitHub است؛ قبل از آن باید محدودهٔ شاخه و این نکته را تأیید کنید که canonical repository پروژهٔ Webdev عوض نمی‌شود.

## نگهداری دو نسخه

- تغییرات آینده در Webdev خودکار در مخزن موجود GitHub ظاهر نمی‌شوند.
- پس از هر تغییر، سورس باید به‌صورت کنترل‌شده در یک import/feature branch همگام و PR شود یا پروژه در یک مسیر مجاز دیگر ادامه پیدا کند.
- از force-push، حذف branch و بازنویسی تاریخچه برای «هماهنگ‌سازی» استفاده نکنید.
- اگر خواسته این است که GitHub موجود منبع اصلی توسعهٔ بعدی باشد، تأیید کنید که تفاوت آن با مخزن canonical Webdev و workflow همگام‌سازی دستی پذیرفته است؛ پیکربندی رسمی Webdev در حال حاضر repository موجود را adopt نمی‌کند.
