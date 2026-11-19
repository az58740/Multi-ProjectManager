"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpLeft, ArrowUpRight, LogIn, Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { useLocale } from "@/app/providers";

export function SiteHeader() {
  const { locale, t } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const Arrow = locale === "fa" ? ArrowUpLeft : ArrowUpRight;
  const navLabel = locale === "fa" ? "ناوبری اصلی" : "Main navigation";

  function closeMenu() {
    setMenuOpen(false);
  }

  const links = (
    <>
      <a href="#overview" onClick={closeMenu} className="transition hover:text-forest">{t.navOverview}</a>
      <a href="#activities" onClick={closeMenu} className="transition hover:text-forest">{t.navActivities}</a>
      <a href="#approach" onClick={closeMenu} className="transition hover:text-forest">{t.navApproach}</a>
    </>
  );

  return (
    <header className="relative z-20 border-b border-forest/5 bg-cream/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label={t.brand}>
          <BrandMark />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-muted lg:flex" aria-label={navLabel}>
          {links}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageToggle className="hidden sm:inline-flex" />
          <Link href="/login" aria-label={t.login} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-forest px-3 text-sm font-bold text-white shadow-sm shadow-forest/15 transition hover:bg-forest-light sm:px-5">
            <span className="hidden sm:inline">{t.login}</span>
            <LogIn className="size-4 sm:hidden" aria-hidden="true" />
            <Arrow className="hidden size-4 sm:block" aria-hidden="true" />
          </Link>
          <button
            type="button"
            aria-label={menuOpen ? t.mobileMenuClose : t.mobileMenuOpen}
            aria-expanded={menuOpen}
            aria-controls="mobile-site-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-11 place-items-center rounded-full border border-line bg-paper text-forest transition hover:bg-sage lg:hidden"
          >
            {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div id="mobile-site-navigation" className={`${menuOpen ? "block" : "hidden"} border-t border-line bg-paper px-4 py-4 sm:px-6 lg:hidden`}>
        <nav className="flex flex-col gap-4 text-sm font-semibold text-muted" aria-label={navLabel}>
          {links}
          <div className="border-t border-line pt-3 sm:hidden"><LanguageToggle /></div>
        </nav>
      </div>
    </header>
  );
}
