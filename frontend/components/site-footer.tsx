"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { useLocale } from "@/app/providers";

export function SiteFooter() {
  const { t } = useLocale();
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex w-fit items-center gap-3">
          <BrandMark compact />
          <span className="text-sm font-extrabold text-forest">{t.brand}</span>
        </Link>
        <p className="m-0 text-sm text-muted">{t.footerLine}</p>
      </div>
    </footer>
  );
}
