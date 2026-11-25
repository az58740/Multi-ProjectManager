"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, ChevronRight, Landmark, LoaderCircle, ReceiptText, WalletCards } from "lucide-react";
import { useLocale } from "@/app/providers";
import { LedgerWorkspace } from "@/components/ledger-workspace";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isLedgerAccountList, type LedgerAccount } from "@/lib/ledger";
import type { Project } from "@/lib/projects";

type FinancialTab = "overview" | "receive" | "pay" | "receive-fx" | "sell-fx";
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


function FxSaleForm({ code, accounts, onSaved }: { code: string; accounts: LedgerAccount[]; onSaved: () => void }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), sourceAmount: "", rate: "", sourceCurrency: "USD", targetCurrency: "IRR", sourceAccount: "", targetAccount: "", exchange: "", reference: "", fee: "0", description: "" });
  const activeAccounts = accounts.filter((item) => item.isActive);
  const sourceAccounts = activeAccounts.filter((item) => item.accountType === "asset");
  const targetAccounts = activeAccounts.filter((item) => item.accountType === "asset");
  function set(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const validNumber = (value: string) => decimal.test(value) && Number(value) > 0;
    if (!form.date || !validNumber(form.sourceAmount) || !validNumber(form.rate) || !form.sourceAccount || !form.targetAccount || form.sourceAccount === form.targetAccount || form.sourceCurrency === form.targetCurrency) { setError(fa ? "تاریخ، مبلغ، نرخ، دو ارز متفاوت و دو حساب متفاوت را کامل و معتبر وارد کنید." : "Enter a valid date, amount, rate, two different currencies and two different accounts."); return; }
    setBusy(true);
    const targetAmount = String(Number(form.sourceAmount) * Number(form.rate));
    const details = [form.exchange && `${fa ? "صرافی/طرف‌حساب" : "Exchange/counterparty"}: ${form.exchange}`, form.reference && `${fa ? "مرجع" : "Reference"}: ${form.reference}`, form.description].filter(Boolean).join(" | ");
    const description = `${fa ? "فروش ارز" : "Foreign currency sale"}${details ? ` - ${details}` : ""}`;
    const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `fx-sale-${Date.now()}`;
    try {
      const response = await fetchWithTimeout(`/api/v1/projects/${encodeURIComponent(code)}/ledger/entries`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ entryDate: form.date, description, idempotencyKey: key, lines: [
        { accountId: form.targetAccount, currency: form.targetCurrency, debitAmount: targetAmount, creditAmount: "0", functionalDebit: targetAmount, functionalCredit: "0", exchangeRate: "1", memo: fa ? "دریافت وجه فروش ارز" : "Foreign currency sale proceeds" },
        { accountId: form.sourceAccount, currency: form.sourceCurrency, debitAmount: "0", creditAmount: form.sourceAmount, functionalDebit: "0", functionalCredit: targetAmount, exchangeRate: form.rate, memo: form.fee !== "0" ? `${fa ? "کارمزد فروش ارز" : "FX sale fee"}: ${form.fee}` : (fa ? "کاهش موجودی ارز فروخته‌شده" : "Sold currency reduction") },
      ] }) }, 12_000);
      if (!response.ok) throw new Error("save");
      setMessage(fa ? "فروش ارز با موفقیت ثبت شد." : "Foreign currency sale saved successfully.");
      setForm((current) => ({ ...current, sourceAmount: "", rate: "", exchange: "", reference: "", fee: "0", description: "" }));
      onSaved();
    } catch { setError(fa ? "ثبت فروش ارز انجام نشد؛ حساب‌ها و تراز ارز را بررسی کنید." : "FX sale could not be saved; check accounts and currency balance."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={(event) => void submit(event)} className="rounded-[22px] border border-line bg-paper p-4 sm:p-5" noValidate>
    <div className="flex items-center gap-2 border-b border-line pb-3"><ArrowLeftRight className="size-4 text-amber" /><h2 className="m-0 text-sm font-black text-forest">{fa ? "جزئیات فروش ارز" : "Foreign currency sale details"}</h2></div>
    {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">{error}</p>}{message && <p role="status" className="mt-3 rounded-xl border border-sage-dark bg-sage px-3 py-2 text-xs font-bold text-forest">{message}</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className={labelClass}>{fa ? "تاریخ فروش" : "Sale date"}<input type="date" required value={form.date} onChange={(event) => set("date", event.target.value)} className={inputClass} dir="ltr" /></label><label className={labelClass}>{fa ? "شماره مرجع" : "Reference no."}<input value={form.reference} onChange={(event) => set("reference", event.target.value)} maxLength={100} className={inputClass} /></label><label className={labelClass}>{fa ? "صرافی / طرف‌حساب" : "Exchange / counterparty"}<input value={form.exchange} onChange={(event) => set("exchange", event.target.value)} maxLength={140} className={inputClass} /></label><label className={labelClass}>{fa ? "کارمزد" : "Fee"}<input inputMode="decimal" value={form.fee} onChange={(event) => set("fee", event.target.value)} className={inputClass} dir="ltr" /></label><label className={labelClass}>{fa ? "ارز فروخته‌شده" : "Currency sold"}<select value={form.sourceCurrency} onChange={(event) => set("sourceCurrency", event.target.value)} className={inputClass} dir="ltr">{currencies.filter((currency) => currency !== form.targetCurrency).map((currency) => <option key={currency}>{currency}</option>)}</select></label><label className={labelClass}>{fa ? "ارز دریافتی" : "Currency received"}<select value={form.targetCurrency} onChange={(event) => set("targetCurrency", event.target.value)} className={inputClass} dir="ltr">{currencies.filter((currency) => currency !== form.sourceCurrency).map((currency) => <option key={currency}>{currency}</option>)}</select></label><label className={labelClass}>{fa ? "مبلغ ارز فروخته‌شده" : "Amount sold"}<input required inputMode="decimal" value={form.sourceAmount} onChange={(event) => set("sourceAmount", event.target.value)} className={inputClass} dir="ltr" placeholder="0.00" /></label><label className={labelClass}>{fa ? "نرخ تبدیل" : "Conversion rate"}<input required inputMode="decimal" value={form.rate} onChange={(event) => set("rate", event.target.value)} className={inputClass} dir="ltr" placeholder="1" /></label><label className={labelClass}>{fa ? "حساب ارز فروخته‌شده" : "Sold currency account"}<select required value={form.sourceAccount} onChange={(event) => set("sourceAccount", event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب" : "Choose account"}</option>{sourceAccounts.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name} ({item.currency})</option>)}</select></label><label className={labelClass}>{fa ? "حساب ارز دریافتی" : "Received currency account"}<select required value={form.targetAccount} onChange={(event) => set("targetAccount", event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب" : "Choose account"}</option>{targetAccounts.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name} ({item.currency})</option>)}</select></label><label className={`${labelClass} sm:col-span-2`}>{fa ? "شرح تکمیلی" : "Additional description"}<textarea rows={2} value={form.description} onChange={(event) => set("description", event.target.value)} maxLength={300} className={`${inputClass} resize-y py-2`} /></label></div>
    <p className="mt-3 mb-0 rounded-xl bg-amber-soft px-3 py-2 text-[10px] leading-5 text-[#735722]">{fa ? "مبلغ ارز دریافتی از حاصل‌ضرب مبلغ ارز فروخته‌شده در نرخ تبدیل محاسبه می‌شود." : "The received amount is calculated from the sold amount multiplied by the conversion rate."}</p>
    <button disabled={busy || !activeAccounts.length} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-forest px-4 text-xs font-extrabold text-white disabled:opacity-60">{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ثبت فروش ارز" : "Save FX sale"}</button>
  </form>;
}

export function FinancialWorkspace({ projects, tab, onBack }: { projects: Project[]; tab: FinancialTab; onBack: () => void }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [code, setCode] = useState(projects[0]?.code ?? "");
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [refresh, setRefresh] = useState(0);
  const items = [{ key: "receive" as const, icon: ArrowDownToLine, fa: "دریافت", en: "Receipts" }, { key: "pay" as const, icon: ArrowUpFromLine, fa: "پرداخت", en: "Payments" }, { key: "receive-fx" as const, icon: Banknote, fa: "دریافت ارز", en: "Receive FX" }, { key: "sell-fx" as const, icon: ArrowLeftRight, fa: "فروش ارز", en: "Sell FX" }];
  const active = items.find((item) => item.key === tab);
  const Icon = active?.icon ?? ReceiptText;
  const activeAccounts = accounts.filter((account) => account.isActive);
  const currencyCount = new Set(activeAccounts.map((account) => account.currency)).size;

  useEffect(() => {
    if (!code) return;
    void fetchJsonWithTimeout(`/api/v1/projects/${encodeURIComponent(code)}/ledger/accounts`, { cache: "no-store" }).then(({ response, payload }) => {
      if (response.ok && isLedgerAccountList(payload)) setAccounts(payload.items);
    });
  }, [code, refresh]);

  return <section className="mt-3 space-y-4" aria-labelledby="financial-title">
    <button type="button" onClick={onBack} aria-label={fa ? "بازگشت به منوی اصلی" : "Back to main menu"} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold text-muted transition hover:bg-amber-100 hover:text-amber-950"><ChevronRight className={`size-3.5 ${!fa ? "rotate-180" : ""}`} aria-hidden="true" />{fa ? "بازگشت به منوی اصلی" : "Back to main menu"}</button>
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-amber-950 shadow-sm sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-900"><Icon className="size-4" aria-hidden="true" /></span>
        <h1 id="financial-title" className="m-0 min-w-0 text-sm font-black leading-6 tracking-normal">{fa ? (active?.fa ?? "مدیریت مالی") : (active?.en ?? "Financial management")}</h1>
        <label className="ms-auto block min-w-0 w-36 sm:w-56">
          <span className="sr-only">{fa ? "انتخاب پروژهٔ مالی" : "Select financial project"}</span>
          <select value={code} onChange={(event) => { setCode(event.target.value); setAccounts([]); }} className="min-h-9 w-full rounded-lg border border-amber-200 bg-white/80 px-2 text-xs font-bold text-amber-950 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 [&>option]:text-ink">
            <option value="" disabled>{fa ? "انتخاب پروژه" : "Choose a project"}</option>
            {projects.map((project) => <option key={project.id} value={project.code}>{project.name}</option>)}
          </select>
        </label>
      </div>
    </div>

    {tab === "overview" ? <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: fa ? "حساب‌های فعال" : "Active accounts", value: activeAccounts.length, icon: WalletCards, tone: "bg-sage text-forest" },
          { label: fa ? "پروژه‌های در دسترس" : "Available projects", value: projects.length, icon: Landmark, tone: "bg-amber-soft text-amber" },
          { label: fa ? "ارزهای ثبت‌شده" : "Currencies in use", value: currencyCount, icon: Banknote, tone: "bg-[#eaf0f7] text-[#365c83]" },
        ].map(({ label, value, icon: MetricIcon, tone }) => <article key={label} className="flex min-h-28 items-center gap-4 rounded-[22px] border border-line/80 bg-white p-4 shadow-sm shadow-forest/[0.035] sm:p-5"><span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tone}`}><MetricIcon className="size-5" aria-hidden="true" /></span><div><p className="m-0 text-xs font-bold text-muted">{label}</p><p className="mb-0 mt-1 text-2xl font-black text-forest">{value.toLocaleString(fa ? "fa-IR" : "en-US")}</p></div></article>)}
      </div>
      <div className="rounded-[24px] border border-line/80 bg-white p-5 shadow-sm shadow-forest/[0.035] sm:p-6">
        <p className="m-0 text-xs font-extrabold text-amber">{fa ? "نمای کلی" : "AT A GLANCE"}</p>
        <h2 className="mb-0 mt-1 text-base font-black text-forest sm:text-lg">{fa ? "مدیریت مالی پروژه‌ها" : "Project financial management"}</h2>
        <p className="mb-0 mt-2 max-w-3xl text-xs leading-6 text-muted sm:text-sm">{fa ? "برای ثبت دریافت و پرداخت، مدیریت ارز یا بررسی اسناد مالی، یکی از گزینه‌های منوی مالی را انتخاب کنید. اطلاعات حساب‌ها با پروژهٔ انتخاب‌شده هماهنگ می‌شود." : "Choose a finance option from the navigation to record receipts and payments, manage currency, or review financial entries. Account data follows the selected project."}</p>
        {!activeAccounts.length && code && <p className="mb-0 mt-4 rounded-xl border border-amber-200 bg-amber-soft/70 px-4 py-3 text-xs font-bold leading-6 text-[#735722]">{fa ? "برای این پروژه هنوز حساب فعالی ثبت نشده است. ابتدا حساب‌های مالی پروژه را بررسی کنید." : "No active accounts are registered for this project yet. Review the project financial accounts first."}</p>}
      </div>
    </div> : code && (tab === "receive" || tab === "pay") ? <><DetailedTransactionForm key={`${code}-${tab}`} code={code} kind={tab} accounts={accounts} onSaved={() => setRefresh((value) => value + 1)} /><LedgerWorkspace key={`${code}-${refresh}`} code={code} hideAccountManagement /></> : code && tab === "sell-fx" ? <><FxSaleForm key={`${code}-sell-fx`} code={code} accounts={accounts} onSaved={() => setRefresh((value) => value + 1)} /><LedgerWorkspace key={`${code}-${refresh}`} code={code} hideAccountManagement /></> : code ? <LedgerWorkspace key={`${code}-${refresh}`} code={code} hideAccountManagement /> : <p className="rounded-2xl border border-dashed border-sage-dark bg-white p-6 text-center text-xs font-bold text-muted">{fa ? "برای شروع یک پروژه را انتخاب کنید." : "Choose a project to begin."}</p>}
  </section>;
}
