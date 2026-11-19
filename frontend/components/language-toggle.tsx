"use client";

import { Languages } from "lucide-react";
import { useLocale } from "@/app/providers";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, toggleLocale } = useLocale();
  return (
    <span className={className}>
      <button
        type="button"
        onClick={toggleLocale}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-semibold text-ink transition hover:border-sage-dark hover:bg-sage/60"
        aria-label={locale === "fa" ? "Switch to English" : "تغییر زبان به فارسی"}
      >
        <Languages className="size-4" aria-hidden="true" />
        <span>{locale === "fa" ? "EN" : "فا"}</span>
      </button>
    </span>
  );
}
