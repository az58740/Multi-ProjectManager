"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Landmark, LoaderCircle, MapPin, Pencil, Phone, Plus, RefreshCw } from "lucide-react";
import { useLocale } from "@/app/providers";
import { ProjectModal } from "@/components/project-modal";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isLedgerAccountList, isLedgerExchangeList, type LedgerAccount, type LedgerExchange } from "@/lib/ledger";
import type { Project } from "@/lib/projects";

const inputClass = "mt-1 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-60";
const banks = ["بانک ملی ایران", "بانک ملت", "بانک صادرات ایران", "بانک تجارت", "بانک پاسارگاد", "بانک سامان", "بانک پارسیان", "بانک اقتصاد نوین", "سایر"];
const emptyAccount = { name: "", accountNumber: "", bankName: banks[0], currency: "USD", openingBalance: "0", scope: "project", sharedScope: "project", isActive: true };

type AccountDraft = typeof emptyAccount;

export function AccountDirectoryWorkspace({ projects }: { projects: Project[] }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [projectCode, setProjectCode] = useState(projects[0]?.code ?? "");
  const [tab, setTab] = useState<"accounts" | "exchanges">("accounts");
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [exchanges, setExchanges] = useState<LedgerExchange[]>([]);
  const [accountForm, setAccountForm] = useState<AccountDraft>(emptyAccount);
  const [exchangeForm, setExchangeForm] = useState({ name: "", address: "", primaryPhone: "", secondaryPhone: "" });
  const [editing, setEditing] = useState<LedgerAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const path = `/api/v1/projects/${encodeURIComponent(projectCode)}/ledger`;

  async function load() {
    if (!projectCode) return;
    const [accountResponse, exchangeResponse] = await Promise.all([fetchJsonWithTimeout(`${path}/accounts`, { cache: "no-store" }), fetchJsonWithTimeout(`${path}/exchanges`, { cache: "no-store" })]);
    if (!isLedgerAccountList(accountResponse.payload) || !isLedgerExchangeList(exchangeResponse.payload)) throw new Error("invalid");
    setAccounts(accountResponse.payload.items); setExchanges(exchangeResponse.payload.items);
  }
  useEffect(() => { void load().catch(() => setMessage(fa ? "دریافت اطلاعات انجام نشد." : "Could not load the directory.")); }, [path, fa]);

  async function submit(event: FormEvent<HTMLFormElement>, kind: "account" | "exchange") {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const body = kind === "account" ? { ...accountForm, accountType: "asset" } : exchangeForm;
      const response = await fetchWithTimeout(`${path}/${kind === "account" ? "accounts" : "exchanges"}`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
      if (!response.ok) throw new Error(response.status === 409 ? "duplicate" : "save");
      if (kind === "account") setAccountForm(emptyAccount); else setExchangeForm({ name: "", address: "", primaryPhone: "", secondaryPhone: "" });
      await load(); setMessage(fa ? (kind === "account" ? "حساب با موفقیت ثبت شد." : "صرافی با موفقیت ثبت شد.") : (kind === "account" ? "Account saved." : "Exchange saved."));
    } catch (error) { setMessage(error instanceof Error && error.message === "duplicate" ? (fa ? "این مورد قبلاً ثبت شده است." : "This item already exists.") : (fa ? "ثبت اطلاعات انجام نشد." : "Could not save the information.")); }
    finally { setBusy(false); }
  }

  async function updateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; setBusy(true); setMessage("");
    try {
      const response = await fetchWithTimeout(`${path}/accounts/${encodeURIComponent(editing.id)}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ ...accountForm, accountType: editing.accountType }) });
      if (!response.ok) throw new Error("save");
      setEditing(null); await load(); setMessage(fa ? "حساب ویرایش شد." : "Account updated.");
    } catch { setMessage(fa ? "ویرایش حساب انجام نشد." : "Could not update account."); }
    finally { setBusy(false); }
  }

  const money = (value: string, currency: string) => `${value || "0"} ${currency}`;
  return <section className="mt-6 rounded-[28px] border border-line bg-paper p-4 shadow-sm sm:p-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-amber"><Landmark className="size-4" />{fa ? "دفتر حساب‌ها" : "Account directory"}</div><h2 className="mb-0 mt-2 text-xl font-black leading-tight text-forest">{fa ? "حساب‌ها و صرافی‌ها" : "Accounts & exchanges"}</h2><p className="mb-0 mt-1 text-sm leading-6 text-muted">{fa ? "تعریف، ویرایش و مشاهدهٔ موجودی حساب‌ها." : "Define, edit, and monitor account balances."}</p></div><label className="text-xs font-bold text-muted">{fa ? "پروژه" : "Project"}<select value={projectCode} onChange={(event) => setProjectCode(event.target.value)} className={`${inputClass} min-w-48`} dir="ltr">{projects.map((project) => <option key={project.id} value={project.code}>{project.code} — {project.name}</option>)}</select></label></div>
    {message && <p role="status" className="mt-4 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{message}</p>}
    <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-cream p-1"><button type="button" onClick={() => setTab("accounts")} className={`min-h-11 rounded-xl text-sm font-extrabold ${tab === "accounts" ? "bg-white text-forest shadow-sm" : "text-muted"}`}>{fa ? `حساب‌ها (${accounts.length})` : `Accounts (${accounts.length})`}</button><button type="button" onClick={() => setTab("exchanges")} className={`min-h-11 rounded-xl text-sm font-extrabold ${tab === "exchanges" ? "bg-white text-forest shadow-sm" : "text-muted"}`}>{fa ? `صرافی‌ها (${exchanges.length})` : `Exchanges (${exchanges.length})`}</button></div>
    {tab === "accounts" ? <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]"><div className="grid gap-3 sm:grid-cols-2">{accounts.length ? accounts.map((account) => <article key={account.id} className="rounded-[22px] border border-line bg-cream/50 p-4"><div className="flex items-start justify-between gap-2"><span className="grid size-9 place-items-center rounded-xl bg-sage text-forest"><Landmark className="size-4" /></span><button type="button" onClick={() => { setEditing(account); setAccountForm({ name: account.name, accountNumber: account.accountNumber, bankName: account.bankName || banks[0], currency: account.currency, openingBalance: account.openingBalance, scope: account.scope, sharedScope: account.sharedScope, isActive: account.isActive }); }} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-sage-dark bg-white px-2.5 text-[10px] font-bold text-forest"><Pencil className="size-3" />{fa ? "ویرایش" : "Edit"}</button></div><h3 className="mb-0 mt-3 text-sm font-black text-ink">{account.name}</h3><p className="mb-0 mt-1 text-xs text-muted">{account.bankName || (fa ? "بانک ثبت نشده" : "Bank not specified")}</p><div className="mt-3 rounded-xl bg-sage/70 p-2 text-[10px] font-bold text-muted"><b className="block text-[9px] text-muted">{fa ? "موجودی فعلی" : "Current balance"}</b><strong dir="ltr" className="mt-1 block text-forest">{money(account.currentBalance, account.currency)}</strong></div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-muted"><span dir="ltr" className="rounded-full bg-white px-2 py-1">{account.accountNumber || "—"}</span><span className="rounded-full bg-white px-2 py-1">{account.scope === "shared" ? (fa ? "مشترک همه پروژه‌ها" : "Shared") : (fa ? "اختصاصی پروژه" : "Project")}</span><span className={`rounded-full px-2 py-1 ${account.isActive ? "bg-sage text-forest" : "bg-stone-200 text-stone-700"}`}>{account.isActive ? (fa ? "فعال" : "Active") : (fa ? "غیرفعال" : "Inactive")}</span></div></article>) : <p className="rounded-2xl border border-dashed border-sage-dark p-6 text-sm text-muted">{fa ? "هنوز حسابی ثبت نشده است." : "No accounts yet."}</p>}</div><form onSubmit={(event) => void submit(event, "account")} className="rounded-[22px] border border-sage-dark bg-sage/50 p-4"><h3 className="mb-0 text-sm font-black text-forest"><Plus className="me-1 inline size-4" />{fa ? "تعریف حساب جدید" : "Define account"}</h3><AccountFields value={accountForm} onChange={setAccountForm} fa={fa} /><button disabled={busy || !projectCode} className={`${buttonClass} mt-4 w-full`}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ثبت حساب" : "Save account"}</button></form></div> : <div className="mt-5 grid gap-5 sm:grid-cols-2">{exchanges.length ? exchanges.map((item) => <article key={item.id} className="rounded-[22px] border border-line bg-cream/50 p-4"><div className="flex items-start justify-between gap-2"><span className="grid size-9 place-items-center rounded-xl bg-amber-soft text-forest"><MapPin className="size-4" /></span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-forest">{fa ? "فعال" : "Active"}</span></div><h3 className="mb-0 mt-3 text-sm font-black text-ink">{item.name}</h3><p className="mb-0 mt-2 text-xs text-muted">{item.address}</p><div className="mt-3 space-y-1 text-xs text-muted"><p className="mb-0"><Phone className="me-1 inline size-3.5" />{item.primaryPhone}</p><p className="mb-0"><Phone className="me-1 inline size-3.5" />{item.secondaryPhone}</p></div></article>) : <p className="rounded-2xl border border-dashed border-sage-dark p-6 text-sm text-muted">{fa ? "هنوز صرافی ثبت نشده است." : "No exchanges yet."}</p>}<form onSubmit={(event) => void submit(event, "exchange")} className="rounded-[22px] border border-amber/30 bg-amber-soft/50 p-4"><h3 className="mb-0 text-sm font-black text-forest"><Plus className="me-1 inline size-4" />{fa ? "تعریف صرافی جدید" : "Define exchange"}</h3><div className="mt-4 space-y-3"><label className="block text-xs font-bold">{fa ? "نام صرافی" : "Exchange name"}<input required value={exchangeForm.name} onChange={(event) => setExchangeForm({ ...exchangeForm, name: event.target.value })} className={inputClass} /></label><label className="block text-xs font-bold">{fa ? "آدرس" : "Address"}<input required value={exchangeForm.address} onChange={(event) => setExchangeForm({ ...exchangeForm, address: event.target.value })} className={inputClass} /></label><label className="block text-xs font-bold">{fa ? "شماره تماس اول" : "Primary phone"}<input required value={exchangeForm.primaryPhone} onChange={(event) => setExchangeForm({ ...exchangeForm, primaryPhone: event.target.value })} className={inputClass} dir="ltr" /></label><label className="block text-xs font-bold">{fa ? "شماره تماس دوم" : "Secondary phone"}<input required value={exchangeForm.secondaryPhone} onChange={(event) => setExchangeForm({ ...exchangeForm, secondaryPhone: event.target.value })} className={inputClass} dir="ltr" /></label><button disabled={busy || !projectCode} className={`${buttonClass} w-full`}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ثبت صرافی" : "Save exchange"}</button></div></form></div>}
    <button type="button" onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-muted hover:text-forest"><RefreshCw className="size-3.5" />{fa ? "به‌روزرسانی فهرست" : "Refresh directory"}</button>
    {editing && <ProjectModal title={fa ? "ویرایش حساب" : "Edit account"} onClose={() => { if (!busy) setEditing(null); }}><form onSubmit={(event) => void updateAccount(event)}><AccountFields value={accountForm} onChange={setAccountForm} fa={fa} /><button className={`${buttonClass} mt-5 w-full`} disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ذخیره تغییرات" : "Save changes"}</button></form></ProjectModal>}
  </section>;
}

function AccountFields({ value, onChange, fa }: { value: AccountDraft; onChange: (value: AccountDraft) => void; fa: boolean }) {
  const set = (key: keyof AccountDraft, next: string) => onChange({ ...value, [key]: next });
  return <div className="mt-4 space-y-3"><label className="block text-xs font-bold">{fa ? "نام حساب" : "Account name"}<input required value={value.name} onChange={(event) => set("name", event.target.value)} className={inputClass} /></label><label className="block text-xs font-bold">{fa ? "شماره حساب" : "Account number"}<input required value={value.accountNumber} onChange={(event) => set("accountNumber", event.target.value)} className={inputClass} dir="ltr" /></label><label className="block text-xs font-bold">{fa ? "بانک" : "Bank"}<select value={value.bankName} onChange={(event) => set("bankName", event.target.value)} className={inputClass}>{banks.map((bank) => <option key={bank}>{bank}</option>)}</select></label><label className="block text-xs font-bold">{fa ? "دامنه حساب" : "Account scope"}<select value={value.scope} onChange={(event) => onChange({ ...value, scope: event.target.value, sharedScope: event.target.value === "shared" ? "all" : "project" })} className={inputClass}><option value="project">{fa ? "اختصاصی همین پروژه" : "This project only"}</option><option value="shared">{fa ? "مشترک همه پروژه‌ها" : "Shared with all projects"}</option></select></label><label className="block text-xs font-bold">{fa ? "وضعیت" : "Status"}<select value={value.isActive ? "active" : "inactive"} onChange={(event) => onChange({ ...value, isActive: event.target.value === "active" })} className={inputClass}><option value="active">{fa ? "فعال" : "Active"}</option><option value="inactive">{fa ? "غیرفعال" : "Inactive"}</option></select></label><label className="block text-xs font-bold">{fa ? "ارز" : "Currency"}<select value={value.currency} onChange={(event) => set("currency", event.target.value)} className={inputClass} dir="ltr">{["USD", "EUR", "AED", "TRY", "GBP", "IRR"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="block text-xs font-bold">{fa ? "موجودی اول سال مالی" : "Opening fiscal-year balance"}<input required value={value.openingBalance} onChange={(event) => set("openingBalance", event.target.value)} className={inputClass} inputMode="decimal" dir="ltr" /></label></div>;
}
