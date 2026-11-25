"use client";

import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, ChevronRight } from "lucide-react";
import { useLocale } from "@/app/providers";
import { LedgerWorkspace } from "@/components/ledger-workspace";

type FinancialTab = "receive" | "pay" | "receive-fx" | "sell-fx";

export function FinancialWorkspace({ code, tab, onTabChange, onBack }: { code: string; tab: FinancialTab; onTabChange: (tab: FinancialTab) => void; onBack: () => void }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const items = [
    { key: "receive" as const, icon: ArrowDownToLine, fa: "دریافت", en: "Receipts" },
    { key: "pay" as const, icon: ArrowUpFromLine, fa: "پرداخت", en: "Payments" },
    { key: "receive-fx" as const, icon: Banknote, fa: "دریافت ارز", en: "Receive FX" },
    { key: "sell-fx" as const, icon: ArrowLeftRight, fa: "فروش ارز", en: "Sell FX" },
  ];
  const active = items.find((item) => item.key === tab) ?? items[0];
  const Icon = active.icon;
  return <section className="mt-4" aria-labelledby="financial-title">
    <div className="flex flex-col gap-3 rounded-[22px] border border-amber/30 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-3 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-200 text-amber-950"><Icon className="size-4" aria-hidden="true" /></span><div className="min-w-0"><p className="m-0 text-[9px] font-extrabold uppercase tracking-[0.12em] text-amber-950">{fa ? "مدیریت مالی" : "Financial management"}</p><h1 id="financial-title" className="mb-0 mt-0.5 truncate text-base font-black leading-tight text-amber-950 sm:text-xl">{fa ? active.fa : active.en}</h1></div></div>
        <button type="button" onClick={onBack} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-white/70 px-2.5 text-[10px] font-extrabold text-amber-950 hover:bg-white"><ChevronRight className={`size-3.5 ${!fa ? "rotate-180" : ""}`} aria-hidden="true" />{fa ? "بازگشت به منوی اصلی" : "Back to main menu"}</button>
      </div>
      <nav aria-label={fa ? "منوی عملیات مالی" : "Financial operations"} className="grid grid-cols-4 gap-1 rounded-2xl border border-amber-200 bg-white/60 p-1">
        {items.map(({ key, icon: ItemIcon, fa: faLabel, en }) => <button key={key} type="button" onClick={() => onTabChange(key)} aria-pressed={tab === key} className={`flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-extrabold leading-none sm:gap-1.5 sm:text-[10px] ${tab === key ? "bg-amber-200 text-amber-950" : "text-amber-950/70 hover:bg-amber-100"}`}><ItemIcon className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{fa ? faLabel : en}</span></button>)}
      </nav>
      <p className="m-0 text-[11px] leading-5 text-amber-950/70">{fa ? "حساب‌های پروژه را انتخاب کنید و سند دریافت، پرداخت یا گردش ارز را در دفترکل دوطرفه ثبت کنید." : "Choose project accounts and record receipts, payments or foreign-currency activity in the double-entry ledger."}</p>
    </div>
    <LedgerWorkspace code={code} hideAccountManagement />
  </section>;
}
