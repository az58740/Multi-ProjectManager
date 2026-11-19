"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";
import { messages, type Locale } from "@/lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  toggleLocale: () => void;
  t: (typeof messages)[Locale];
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("fa");

  useLayoutEffect(() => {
    const stored = window.localStorage.getItem("mpm-locale");
    if (stored === "fa" || stored === "en") setLocale(stored);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
    window.localStorage.setItem("mpm-locale", locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      toggleLocale: () => setLocale((current) => (current === "fa" ? "en" : "fa")),
      t: messages[locale],
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside Providers");
  return value;
}
