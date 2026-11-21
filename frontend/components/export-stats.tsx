"use client";

import { useEffect, useState } from "react";
import { BarChart3, Boxes, BookOpen, PackageCheck, UsersRound } from "lucide-react";
import { useLocale } from "@/app/providers";
import { fetchJsonWithTimeout } from "@/lib/http";
import { isLedgerAccountList, isLedgerProductList } from "@/lib/ledger";
import { isListOf, isCounterparty, isShipment } from "@/lib/export-records";

export function ExportStats({ code }: { code: string }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [stats, setStats] = useState({ counterparties: 0, shipments: 0, accounts: 0, products: 0 });
  useEffect(() => {
    const root = `/api/v1/projects/${encodeURIComponent(code)}`;
    void Promise.all([fetchJsonWithTimeout(`${root}/export/counterparties`, { cache: "no-store" }), fetchJsonWithTimeout(`${root}/export/shipments`, { cache: "no-store" }), fetchJsonWithTimeout(`${root}/ledger/accounts`, { cache: "no-store" }), fetchJsonWithTimeout(`${root}/ledger/products`, { cache: "no-store" })]).then(([counterparties, shipments, accounts, products]) => {
      setStats({ counterparties: isListOf(counterparties.payload, isCounterparty) ? counterparties.payload.items.length : 0, shipments: isListOf(shipments.payload, isShipment) ? shipments.payload.items.length : 0, accounts: isLedgerAccountList(accounts.payload) ? accounts.payload.items.length : 0, products: isLedgerProductList(products.payload) ? products.payload.items.length : 0 });
    }).catch(() => undefined);
  }, [code]);
  const cards = [[UsersRound, fa ? "طرف‌حساب‌ها" : "Counterparties", stats.counterparties], [Boxes, fa ? "محموله‌ها" : "Shipments", stats.shipments], [PackageCheck, fa ? "کالاها" : "Products", stats.products], [BookOpen, fa ? "حساب‌های فعال" : "Ledger accounts", stats.accounts]] as const;
  return <section className="mt-8 rounded-[28px] bg-forest p-5 text-white shadow-xl shadow-forest/10 sm:p-7" aria-labelledby="stats-title"><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-amber-light"><BarChart3 className="size-4" aria-hidden="true" />{fa ? "نمای مدیریتی" : "Management view"}</div><h2 id="stats-title" className="mb-0 mt-2 text-2xl font-black">{fa ? "آمار این پروژه در یک نگاه" : "Project metrics at a glance"}</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([Icon, label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><Icon className="size-5 text-amber-light" aria-hidden="true" /><p className="mb-0 mt-4 text-xs text-white/65">{label}</p><p className="mb-0 mt-1 text-3xl font-black">{value.toLocaleString(fa ? "fa-IR" : "en-US")}</p></div>)}</div></section>;
}
