"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, ChevronRight, LoaderCircle, ReceiptText } from "lucide-react";
import { useLocale } from "@/app/providers";
import { LedgerWorkspace } from "@/components/ledger-workspace";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isLedgerAccountList, type LedgerAccount } from "@/lib/ledger";
import type { Project } from "@/lib/projects";

type FinancialTab = "receive" | "pay" | "receive-fx" | "sell-fx";
type TransactionKind = "receive" | "pay";
const currencies = ["IRR", "USD", "EUR", "AED", "TRY", "GBP", "CNY"];
const inputClass = "mt-1.5 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-xs font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const labelClass = "block text-xs font-bold text-ink";
const decimal = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function DetailedTransactionForm({ code, kind, accounts, onSaved }: { code: string; kind: TransactionKind; accounts: LedgerAccount[]; onSaved: () => void }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", rate: "1", currency: "IRR", counterparty: "", reference: "", description: "", fee: "0", debit: "", credit: "" });
  const activeAccounts = accounts.filter((item) => item.isActive);
  const debitAccounts = useMemo(() => kind === "receive" ? activeAccounts.filter((item) => ["asset"].includes(item.accountType)) : activeAccounts.filter((item) => ["expense", "liability"].includes(item.accountType)), [activeAccounts, kind]);
  const creditAccounts = useMemo(() => kind === "receive" ? activeAccounts.filter((item) => ["revenue", "asset", "liability"].includes(item.accountType)) : activeAccounts.filter((item) => item.accountType === "asset"), [activeAccounts, kind]);
  function set(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    if (!form.date || !form.amount || !decimal.test(form.amount) || Number(form.amount) <= 0 || !decimal.test(form.rate) || Number(form.rate) <= 0 || !form.debit || !form.credit || form.debit === form.credit) { setError(fa ? "تاریخ، مبلغ، نرخ و دو حساب متفاوت را کامل و معتبر وارد کنید." : "Enter a valid date, amount, rate and two different accounts."); return; }
    setBusy(true);
    const functional = String(Number(form.amount) * Number(form.rate));
    const label = kind === "receive" ? (fa ? "دریافت" : "Receipt") : (fa ? "پرداخت" : "Payment");
    const details = [form.counterparty && `${fa ? "طرف‌حساب" : "Counterparty"}: ${form.counterparty}`, form.reference && `${fa ? "مرجع" : "Reference"}: ${form.reference}`, form.description].filter(Boolean).join(" | ");
    const description = `${label}${details ? ` - ${details}` : ""}`;
    const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `finance-${Date.now()}`;
    try {
      const response = await fetchWithTimeout(`/api/v1/projects/${encodeURIComponent(code)}/ledger/entries`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ entryDate: form.date, description, idempotencyKey: key, lines: [
        { accountId: form.debit, currency: form.currency, debitAmount: form.amount, creditAmount: "0", functionalDebit: functional, functionalCredit: "0", exchangeRate: form.rate, memo: label },
        { accountId: form.credit, currency: form.currency, debitAmount: "0", creditAmount: form.amount, functionalDebit: "0", functionalCredit: functional, exchangeRate: form.rate, memo: form.fee !== "0" ? `${fa ? "کارمزد" : "Fee"}: ${form.fee}` : label },
      ] }) }, 12_000);
      if (!response.ok) throw new Error("save");
      setMessage(fa ? `تراکنش ${label} با موفقیت ثبت شد.` : `${label} transaction saved successfully.`);
      setForm((current) => ({ ...current, amount: "", counterparty: "", reference: "", description: "", fee: "0" }));
      onSaved();
    } catch { setError(fa ? "ثبت تراکنش انجام نشد؛ حساب‌ها و تراز ارز را بررسی کنید." : "Transaction could not be saved; check accounts and currency balance."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={(event) => void submit(event)} className="rounded-[22px] border border-line bg-paper p-4 sm:p-5" noValidate>
    <div className="flex items-center gap-2 border-b border-line pb-3"><ReceiptText className="size-4 text-amber" /><h2 className="m-0 text-sm font-black text-forest">{kind === "receive" ? (fa ? "جزئیات دریافت" : "Receipt details") : (fa ? "جزئیات پرداخت" : "Payment details")}</h2></div>
    {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">{error}</p>}{message && <p role="status" className="mt-3 rounded-xl border border-sage-dark bg-sage px-3 py-2 text-xs font-bold text-forest">{message}</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className={labelClass}>{fa ? "تاریخ تراکنش" : "Transaction date"}<input type="date" required value={form.date} onChange={(event) => set("date", event.target.value)} className={inputClass} dir="ltr" /></label><label className={labelClass}>{fa ? "شماره مرجع / رسید" : "Reference / receipt no."}<input value={form.reference} onChange={(event) => set("reference", event.target.value)} maxLength={100} className={inputClass} /></label><label className={labelClass}>{fa ? "طرف‌حساب" : "Counterparty"}<input value={form.counterparty} onChange={(event) => set("counterparty", event.target.value)} maxLength={140} className={inputClass} /></label><label className={labelClass}>{fa ? "ارز" : "Currency"}<select value={form.currency} onChange={(event) => set("currency", event.target.value)} className={inputClass} dir="ltr">{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label className={labelClass}>{fa ? "مبلغ" : "Amount"}<input required inputMode="decimal" value={form.amount} onChange={(event) => set("amount", event.target.value)} className={inputClass} dir="ltr" placeholder="0.00" /></label><label className={labelClass}>{fa ? "نرخ ارز مبنا" : "Functional rate"}<input required inputMode="decimal" value={form.rate} onChange={(event) => set("rate", event.target.value)} className={inputClass} dir="ltr" /></label><label className={labelClass}>{kind === "receive" ? (fa ? "حساب دریافت‌کننده" : "Receiving account") : (fa ? "حساب هزینه / بدهی" : "Expense / payable account")}<select required value={form.debit} onChange={(event) => set("debit", event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب" : "Choose account"}</option>{debitAccounts.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label className={labelClass}>{kind === "receive" ? (fa ? "حساب درآمد / طرف‌حساب" : "Revenue / counterparty account") : (fa ? "حساب پرداخت‌کننده" : "Paying account")}<select required value={form.credit} onChange={(event) => set("credit", event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب" : "Choose account"}</option>{creditAccounts.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label className={labelClass}>{fa ? "کارمزد" : "Fee"}<input inputMode="decimal" value={form.fee} onChange={(event) => set("fee", event.target.value)} className={inputClass} dir="ltr" /></label><label className={`${labelClass} sm:col-span-2`}>{fa ? "شرح تکمیلی" : "Additional description"}<textarea rows={2} value={form.description} onChange={(event) => set("description", event.target.value)} maxLength={300} className={`${inputClass} resize-y py-2`} /></label></div>
    <button disabled={busy || !activeAccounts.length} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-forest px-4 text-xs font-extrabold text-white disabled:opacity-60">{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? `ثبت ${kind === "receive" ? "دریافت" : "پرداخت"}` : `Save ${kind}`}</button>
  </form>;
}

export function FinancialWorkspace({ projects, tab, onTabChange, onBack }: { projects: Project[]; tab: FinancialTab; onTabChange: (tab: FinancialTab) => void; onBack: () => void }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [code, setCode] = useState(projects[0]?.code ?? "");
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [refresh, setRefresh] = useState(0);
  const items = [{ key: "receive" as const, icon: ArrowDownToLine, fa: "دریافت", en: "Receipts" }, { key: "pay" as const, icon: ArrowUpFromLine, fa: "پرداخت", en: "Payments" }, { key: "receive-fx" as const, icon: Banknote, fa: "دریافت ارز", en: "Receive FX" }, { key: "sell-fx" as const, icon: ArrowLeftRight, fa: "فروش ارز", en: "Sell FX" }];
  const active = items.find((item) => item.key === tab) ?? items[0];
  const Icon = active.icon;
  useEffect(() => { if (!code) return; void fetchJsonWithTimeout(`/api/v1/projects/${encodeURIComponent(code)}/ledger/accounts`, { cache: "no-store" }).then(({ response, payload }) => { if (response.ok && isLedgerAccountList(payload)) setAccounts(payload.items); }); }, [code, refresh]);
  return <section className="mt-4" aria-labelledby="financial-title"><div className="flex flex-col gap-3 rounded-[22px] border border-amber/30 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-3 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-200 text-amber-950"><Icon className="size-4" /></span><div className="min-w-0"><p className="m-0 text-[9px] font-extrabold uppercase tracking-[0.12em] text-amber-950">{fa ? "مدیریت مالی" : "Financial management"}</p><h1 id="financial-title" className="mb-0 mt-0.5 truncate text-base font-black leading-tight text-amber-950 sm:text-xl">{fa ? active.fa : active.en}</h1></div></div><button type="button" onClick={onBack} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-white/70 px-2.5 text-[10px] font-extrabold text-amber-950"><ChevronRight className={`size-3.5 ${!fa ? "rotate-180" : ""}`} />{fa ? "بازگشت به منوی اصلی" : "Back to main menu"}</button></div><label className="block text-[10px] font-extrabold text-amber-950">{fa ? "پروژهٔ مالی" : "Financial project"}<select value={code} onChange={(event) => { setCode(event.target.value); setAccounts([]); }} className="mt-1 min-h-9 w-full rounded-xl border border-amber-200 bg-white px-2 text-xs font-bold text-ink outline-none"><option value="" disabled>{fa ? "انتخاب پروژه" : "Choose a project"}</option>{projects.map((project) => <option key={project.id} value={project.code}>{project.name}</option>)}</select></label><nav className="grid grid-cols-4 gap-1 rounded-2xl border border-amber-200 bg-white/60 p-1" aria-label={fa ? "منوی عملیات مالی" : "Financial operations"}>{items.map(({ key, icon: ItemIcon, fa: faLabel, en }) => <button key={key} type="button" onClick={() => onTabChange(key)} className={`flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-extrabold sm:gap-1.5 sm:text-[10px] ${tab === key ? "bg-amber-200 text-amber-950" : "text-amber-950/70 hover:bg-amber-100"}`}><ItemIcon className="size-3.5" />{fa ? faLabel : en}</button>)}</nav><p className="m-0 text-[11px] leading-5 text-amber-950/70">{fa ? "جزئیات تراکنش را وارد کنید تا سند دوطرفه در دفترکل ثبت شود." : "Enter transaction details to create a double-entry journal record."}</p></div>{code && (tab === "receive" || tab === "pay") ? <><DetailedTransactionForm key={`${code}-${tab}`} code={code} kind={tab} accounts={accounts} onSaved={() => setRefresh((value) => value + 1)} /><LedgerWorkspace key={`${code}-${refresh}`} code={code} hideAccountManagement /></> : code ? <LedgerWorkspace key={`${code}-${refresh}`} code={code} hideAccountManagement /> : <p className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-xs font-bold text-amber-950">{fa ? "برای شروع یک پروژه را انتخاب کنید." : "Choose a project to begin."}</p>}</section>;
}
