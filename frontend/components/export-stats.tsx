"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, Boxes, PackageCheck, UsersRound } from "lucide-react";
import { useLocale } from "@/app/providers";
import { fetchJsonWithTimeout } from "@/lib/http";
import { isLedgerAccountList, isLedgerProductList, type LedgerProduct } from "@/lib/ledger";
import { isListOf, isCounterparty, isShipment } from "@/lib/export-records";

type ProductScopeFilter = "all" | "project" | "shared";

export function ExportStats({ code }: { code: string }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [stats, setStats] = useState({ counterparties: 0, shipments: 0, accounts: 0 });
  const [products, setProducts] = useState<LedgerProduct[]>([]);
  const [scopeFilter, setScopeFilter] = useState<ProductScopeFilter>("all");

  useEffect(() => {
    const root = `/api/v1/projects/${encodeURIComponent(code)}`;
    void Promise.all([
      fetchJsonWithTimeout(`${root}/export/counterparties`, { cache: "no-store" }),
      fetchJsonWithTimeout(`${root}/export/shipments`, { cache: "no-store" }),
      fetchJsonWithTimeout(`${root}/ledger/accounts`, { cache: "no-store" }),
      fetchJsonWithTimeout(`${root}/ledger/products`, { cache: "no-store" }),
    ]).then(([counterparties, shipments, accounts, productResponse]) => {
      setStats({
        counterparties: isListOf(counterparties.payload, isCounterparty) ? counterparties.payload.items.length : 0,
        shipments: isListOf(shipments.payload, isShipment) ? shipments.payload.items.length : 0,
        accounts: isLedgerAccountList(accounts.payload) ? accounts.payload.items.length : 0,
      });
      if (isLedgerProductList(productResponse.payload)) setProducts(productResponse.payload.items);
    }).catch(() => undefined);
  }, [code]);

  const filteredProducts = useMemo(() => scopeFilter === "all" ? products : products.filter((item) => item.scope === scopeFilter), [products, scopeFilter]);
  const cards = [[UsersRound, fa ? "طرف‌حساب‌ها" : "Counterparties", stats.counterparties], [Boxes, fa ? "محموله‌ها" : "Shipments", stats.shipments], [PackageCheck, fa ? "کالاها" : "Products", filteredProducts.length], [BookOpen, fa ? "حساب‌های فعال" : "Ledger accounts", stats.accounts]] as const;
  const filters: { value: ProductScopeFilter; fa: string; en: string }[] = [
    { value: "all", fa: "همه کالاها", en: "All products" },
    { value: "project", fa: "اختصاصی پروژه", en: "Project-specific" },
    { value: "shared", fa: "کالاهای مشترک", en: "Shared products" },
  ];

  return <section className="mt-8 rounded-[28px] bg-forest p-5 text-white shadow-xl shadow-forest/10 sm:p-7" aria-labelledby="stats-title">
    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-amber-light"><BarChart3 className="size-4" aria-hidden="true" />{fa ? "نمای مدیریتی" : "Management view"}</div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="stats-title" className="mb-0 mt-2 text-2xl font-black">{fa ? "آمار این پروژه در یک نگاه" : "Project metrics at a glance"}</h2><p className="mb-0 mt-1 text-xs text-white/60">{fa ? "گزارش کالاها را بر اساس دامنهٔ استفاده تفکیک کنید." : "Filter product reporting by availability scope."}</p></div><fieldset className="m-0 border-0 p-0"><legend className="sr-only">{fa ? "فیلتر دامنه کالا" : "Product scope filter"}</legend><div className="flex flex-wrap gap-1.5 rounded-2xl bg-white/10 p-1">{filters.map((filter) => <button key={filter.value} type="button" onClick={() => setScopeFilter(filter.value)} aria-pressed={scopeFilter === filter.value} className={`min-h-9 rounded-xl px-3 text-[11px] font-extrabold transition ${scopeFilter === filter.value ? "bg-white text-forest" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>{fa ? filter.fa : filter.en}</button>)}</div></fieldset></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([Icon, label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><Icon className="size-5 text-amber-light" aria-hidden="true" /><p className="mb-0 mt-4 text-xs text-white/65">{label}</p><p className="mb-0 mt-1 text-3xl font-black">{value.toLocaleString(fa ? "fa-IR" : "en-US")}</p></div>)}</div>
  </section>;
}
