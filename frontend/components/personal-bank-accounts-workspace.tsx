"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Landmark, LoaderCircle, Pencil, Plus, RefreshCw, WalletCards } from "lucide-react";
import { useLocale } from "@/app/providers";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isLedgerAccountList, type LedgerAccount } from "@/lib/ledger";

const inputClass = "mt-1 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-teal-500/40 focus:ring-4 focus:ring-teal-100";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-teal-800 px-5 text-sm font-extrabold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60";
const banks = ["بانک ملی ایران", "بانک ملت", "بانک صادرات ایران", "بانک تجارت", "بانک پاسارگاد", "بانک سامان", "بانک پارسیان", "بانک اقتصاد نوین", "سایر"];
const currencies = ["IRR", "USD", "EUR", "AED", "TRY", "GBP", "CNY"];
type Draft = { name: string; accountNumber: string; bankName: string; currency: string; openingBalance: string };
const emptyDraft: Draft = { name: "", accountNumber: "", bankName: banks[0], currency: "IRR", openingBalance: "0" };

export function PersonalBankAccountsWorkspace({ code }: { code: string }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<LedgerAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const path = `/api/v1/projects/${encodeURIComponent(code)}/ledger`;

  const load = useCallback(async () => {
    setState("loading");
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${path}/accounts`, { cache: "no-store" });
      if (response.status === 401) { window.location.href = "/login"; return; }
      if (!response.ok || !isLedgerAccountList(payload)) throw new Error("load");
      setAccounts(payload.items.filter((account) => account.accountType === "asset"));
      setState("ready");
    } catch { setState("error"); setMessage(fa ? "دریافت حساب‌های بانکی انجام نشد." : "Could not load bank accounts."); }
  }, [fa, path]);

  useEffect(() => { void load(); }, [load]);

  function beginEdit(account: LedgerAccount) {
    setEditing(account);
    setDraft({ name: account.name, accountNumber: account.accountNumber, bankName: account.bankName || banks[0], currency: account.currency, openingBalance: account.openingBalance });
    setMessage("");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    const body = { ...draft, scope: "project", sharedScope: "project", accountType: "asset", isActive: true };
    try {
      const url = editing ? `${path}/accounts/${encodeURIComponent(editing.id)}` : `${path}/accounts`;
      const response = await fetchWithTimeout(url, { method: editing ? "PUT" : "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
      if (response.status === 401) { window.location.href = "/login"; return; }
      if (!response.ok) throw new Error(response.status === 409 ? "duplicate" : "save");
      setDraft(emptyDraft); setEditing(null); await load();
      setMessage(fa ? (editing ? "حساب بانکی ویرایش شد." : "حساب بانکی با موفقیت ثبت شد.") : (editing ? "Bank account updated." : "Bank account saved."));
    } catch (error) {
      setMessage(error instanceof Error && error.message === "duplicate" ? (fa ? "این حساب قبلاً ثبت شده است." : "This account already exists.") : (fa ? "ثبت حساب بانکی انجام نشد." : "Could not save the bank account."));
    } finally { setBusy(false); }
  }

  return <section className="mt-6 rounded-[28px] border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-4 shadow-sm sm:p-7" aria-labelledby="personal-bank-accounts-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-teal-800"><Landmark className="size-4" />{fa ? "حساب‌های بانکی" : "Bank accounts"}</div><h2 id="personal-bank-accounts-title" className="mb-0 mt-2 text-xl font-black text-teal-950">{fa ? "مدیریت حساب‌های بانکی شخص" : "Personal bank account management"}</h2><p className="mb-0 mt-1 text-sm leading-6 text-teal-950/70">{fa ? "کد حساب به‌صورت سیستمی ساخته می‌شود و ماندهٔ فعلی در دفترکل به‌روزرسانی خواهد شد." : "Account codes are generated automatically and current balances follow the ledger."}</p></div><span className="inline-flex min-h-9 items-center gap-2 self-start rounded-full bg-white px-3 text-xs font-black text-teal-900 shadow-sm"><WalletCards className="size-4" />{accounts.length} {fa ? "حساب" : "accounts"}</span></div>
    {message && <p role="status" className="mt-4 rounded-2xl border border-teal-200 bg-white px-4 py-3 text-sm font-bold text-teal-900">{message}</p>}
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div>{state === "loading" ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted"><LoaderCircle className="size-5 animate-spin" />{fa ? "در حال دریافت…" : "Loading…"}</div> : state === "error" ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{fa ? "خطا در دریافت فهرست." : "Could not load the list."}<button type="button" onClick={() => void load()} className="ms-2 font-bold underline"><RefreshCw className="me-1 inline size-3.5" />{fa ? "تلاش دوباره" : "Retry"}</button></div> : accounts.length === 0 ? <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-teal-300 bg-white/70 px-5 text-center text-sm font-bold text-teal-900">{fa ? "هنوز حساب بانکی برای این شخص ثبت نشده است." : "No bank account has been registered for this person yet."}</div> : <div className="grid gap-3 sm:grid-cols-2">{accounts.map((account) => <article key={account.id} className="rounded-[22px] border border-teal-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><span className="grid size-9 place-items-center rounded-xl bg-teal-100 text-teal-800"><Landmark className="size-4" /></span><button type="button" onClick={() => beginEdit(account)} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-teal-200 px-2.5 text-[10px] font-bold text-teal-900"><Pencil className="size-3" />{fa ? "ویرایش" : "Edit"}</button></div><p dir="ltr" className="mb-0 mt-3 font-mono text-[10px] font-black text-teal-800">{account.code}</p><h3 className="mb-0 mt-1 text-sm font-black text-ink">{account.name}</h3><p className="mb-0 mt-1 text-xs text-muted">{account.bankName || (fa ? "بانک ثبت نشده" : "Bank not specified")}</p><p dir="ltr" className="mb-0 mt-2 text-xs text-muted">{account.accountNumber || "—"}</p><div className="mt-3 rounded-xl bg-teal-50 p-2"><b className="block text-[9px] text-muted">{fa ? "موجودی فعلی" : "Current balance"}</b><strong dir="ltr" className="mt-1 block text-sm text-teal-900">{account.currentBalance || "0"} {account.currency}</strong></div></article>)}</div>}</div>
      <form onSubmit={(event) => void submit(event)} className="rounded-[22px] border border-teal-200 bg-white/80 p-4"><h3 className="mb-0 text-sm font-black text-teal-950"><Plus className="me-1 inline size-4" />{fa ? (editing ? "ویرایش حساب بانکی" : "ثبت حساب بانکی جدید") : (editing ? "Edit bank account" : "Add bank account")}</h3><div className="mt-4 space-y-3"><label className="block text-xs font-bold">{fa ? "نام حساب" : "Account name"}<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass} /></label><label className="block text-xs font-bold">{fa ? "شماره حساب" : "Account number"}<input required value={draft.accountNumber} onChange={(event) => setDraft({ ...draft, accountNumber: event.target.value })} className={inputClass} dir="ltr" /></label><label className="block text-xs font-bold">{fa ? "بانک" : "Bank"}<select value={draft.bankName} onChange={(event) => setDraft({ ...draft, bankName: event.target.value })} className={inputClass}>{banks.map((bank) => <option key={bank}>{bank}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-bold">{fa ? "ارز" : "Currency"}<select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} className={inputClass} dir="ltr">{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label className="block text-xs font-bold">{fa ? "موجودی افتتاحیه" : "Opening balance"}<input required value={draft.openingBalance} onChange={(event) => setDraft({ ...draft, openingBalance: event.target.value })} className={inputClass} inputMode="decimal" dir="ltr" /></label></div><button disabled={busy} className={`${buttonClass} mt-1 w-full`}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? (editing ? "ذخیره تغییرات" : "ثبت حساب") : (editing ? "Save changes" : "Save account")}</button>{editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setDraft(emptyDraft); }} className="mt-2 min-h-10 w-full rounded-full border border-line text-xs font-bold text-muted">{fa ? "انصراف از ویرایش" : "Cancel edit"}</button>}</div></form>
    </div>
  </section>;
}
