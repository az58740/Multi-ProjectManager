"use client";

import { useLocale } from "@/app/providers";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  return (
    <span className={`inline-flex items-center gap-3 ${compact ? "gap-2" : ""}`}>
      <span className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-forest text-cream shadow-sm shadow-forest/15">
        <svg viewBox="0 0 48 48" className="size-7" fill="none" aria-hidden="true">
          <path d="M10 18.5 24 11l14 7.5v15L24 41l-14-7.5v-15Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M10.5 19 24 26l13.5-7M24 26v14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M24.5 7.8c.4-3.1 3.8-4.5 7.7-4.1-.4 4-2.6 6.3-6.3 6.4M24.6 12.8c.2-3.8 2.8-6 6.3-6.1" stroke="#D6A448" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && <span className="whitespace-nowrap text-xs font-extrabold tracking-tight text-forest sm:text-sm">{t.brand}</span>}
    </span>
  );
}
