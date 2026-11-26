"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Landmark, LoaderCircle, MapPin, Pencil, Phone, RefreshCw } from "lucide-react";
import { useLocale } from "@/app/providers";
import { ProjectModal } from "@/components/project-modal";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isLedgerAccountList, isLedgerExchangeList, type LedgerAccount, type LedgerExchange } from "@/lib/ledger";
import type { Project } from "@/lib/projects";

const inputClass = "mt-1 min-h-10 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-blue-500/50 focus:ring-4 focus:ring-blue-100";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60";
const banks = ["بانک ملی ایران", "بانک ملت", "بانک صادرات ایران", "بانک تجارت", "بانک پاسارگاد", "بانک سامان", "بانک پارسیان", "بانک اقتصاد نوین", "سایر"];
const emptyAccount = { name: "", accountNumber: "", bankName: banks[0], currency: "USD", openingBalance: "0", scope: "project", scopeProjectId: "", sharedScope: "project", isActive: true };

type AccountDraft = typeof emptyAccount;
export type AccountDirectoryView = "accounts" | "exchanges" | "new-account" | "new-exchange";

export function AccountDirectoryWorkspace({ projects, view, onViewChange }: { projects: Project[]; view: AccountDirectoryView; onViewChange: (view: AccountDirectoryView) => void }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [projectCode, setProjectCode] = useState(projects[0]?.code ?? "");
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [exchanges, setExchanges] = useState<LedgerExchange[]>([]);
  const [accountForm, setAccountForm] = useState<AccountDraft>({ ...emptyAccount, scopeProjectId: projects[0]?.id ?? "" });
  const [exchangeForm, setExchangeForm] = useState({ name: "", address: "", primaryPhone: "", secondaryPhone: "" });
  const [editing, setEditing] = useState<LedgerAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const path = `/api/v1/projects/${encodeURIComponent(projectCode)}/ledger`;

  async function load() {
    if (!projectCode) return;
    const [accountResponse, exchangeResponse] = await Promise.all([
      fetchJsonWithTimeout(`${path}/accounts`, { cache: "no-store" }),
      fetchJsonWithTimeout(`${path}/exchanges`, { cache: "no-store" }),
    ]);
    if (!isLedgerAccountList(accountResponse.payload) || !isLedgerExchangeList(exchangeResponse.payload)) throw new Error("invalid");
    setAccounts(accountResponse.payload.items);
    setExchanges(exchangeResponse.payload.items);
  }

  useEffect(() => {
    void load().catch(() => setMessage(fa ? "دریافت اطلاعات انجام نشد." : "Could not load the directory."));
  }, [path, fa]);

  async function submit(event: FormEvent<HTMLFormElement>, kind: "account" | "exchange") {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const body = kind === "account" ? { ...accountForm, accountType: "asset" } : exchangeForm;
      const response = await fetchWithTimeout(`${path}/${kind === "account" ? "accounts" : "exchanges"}`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
      if (!response.ok) throw new Error(response.status === 409 ? "duplicate" : "save");
      if (kind === "account") {
        setAccountForm({ ...emptyAccount, scopeProjectId: projects[0]?.id ?? "" });
        onViewChange("accounts");
      } else {
        setExchangeForm({ name: "", address: "", primaryPhone: "", secondaryPhone: "" });
        onViewChange("exchanges");
      }
      await load();
      setMessage(fa ? (kind === "account" ? "حساب با موفقیت ثبت شد." : "صرافی با موفقیت ثبت شد.") : (kind === "account" ? "Account saved." : "Exchange saved."));
    } catch (error) {
      setMessage(error instanceof Error && error.message === "duplicate" ? (fa ? "این مورد قبلاً ثبت شده است." : "This item already exists.") : (fa ? "ثبت اطلاعات انجام نشد." : "Could not save the information."));
    } finally {
      setBusy(false);
    }
  }

  async function updateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetchWithTimeout(`${path}/accounts/${encodeURIComponent(editing.id)}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ ...accountForm, accountType: editing.accountType }) });
      if (!response.ok) throw new Error("save");
      setEditing(null);
      await load();
      setMessage(fa ? "حساب ویرایش شد." : "Account updated.");
    } catch {
      setMessage(fa ? "ویرایش حساب انجام نشد." : "Could not update account.");
    } finally {
      setBusy(false);
    }
  }

  const money = (value: string, currency: string) => `${value || "0"} ${currency}`;

  return (
    <section className="mt-5 rounded-[24px] border border-blue-100 bg-slate-50/80 p-3 shadow-sm sm:mt-6 sm:p-5">
      <header className="relative isolate overflow-hidden rounded-[20px] bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-800 px-4 py-4 text-white shadow-lg shadow-blue-900/15 sm:px-5 sm:py-5">
        <div aria-hidden="true" className="pointer-events-none absolute -end-8 -top-12 size-36 rounded-full border-[22px] border-white/[0.08]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-extrabold tracking-[0.12em] text-blue-100"><Landmark className="size-4" />{fa ? "مدیریت حساب‌ها" : "ACCOUNT MANAGEMENT"}</div>
            <h2 className="mb-0 mt-1 truncate text-lg font-black leading-tight sm:text-xl">{fa ? "حساب‌ها و صرافی‌ها" : "Accounts & exchanges"}</h2>
            <p className="mb-0 mt-1 text-[11px] leading-5 text-blue-100/85 sm:text-xs">{fa ? "تعریف و مشاهدهٔ فشردهٔ حساب‌ها و صرافی‌های سامانه" : "Define and monitor your accounts and exchanges."}</p>
          </div>
          <label className="shrink-0 text-[10px] font-bold text-blue-100">{fa ? "پروژه" : "Project"}
            <select value={projectCode} onChange={(event) => setProjectCode(event.target.value)} className="mt-1 min-h-9 w-full min-w-48 rounded-xl border border-white/20 bg-white/15 px-3 text-xs font-semibold text-white outline-none focus:ring-2 focus:ring-white/50" dir="ltr">
              {projects.map((project) => <option className="text-ink" key={project.id} value={project.code}>{project.code} — {project.name}</option>)}
            </select>
          </label>
        </div>
      </header>

      {message && <p role="status" className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900">{message}</p>}

      {view === "accounts" || view === "new-account" ? (
        <div className="mt-3">
          <div className="mb-3">
            <h3 className="m-0 text-sm font-black text-blue-950">{fa ? "فهرست حساب‌ها" : "Account list"}</h3>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {accounts.length ? accounts.map((account) => (
              <article key={account.id} className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-8 place-items-center rounded-xl bg-blue-100 text-blue-800"><Landmark className="size-4" /></span>
                  <button type="button" onClick={() => { setEditing(account); setAccountForm({ name: account.name, accountNumber: account.accountNumber, bankName: account.bankName || banks[0], currency: account.currency, openingBalance: account.openingBalance, scope: account.scope, scopeProjectId: account.projectId, sharedScope: account.sharedScope, isActive: account.isActive }); }} className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 text-[10px] font-bold text-blue-800"><Pencil className="size-3" />{fa ? "ویرایش" : "Edit"}</button>
                </div>
                <h4 className="mb-0 mt-2 text-sm font-black text-blue-950">{account.name}</h4>
                <p className="mb-0 mt-0.5 truncate text-[11px] text-slate-500">{account.bankName || (fa ? "بانک ثبت نشده" : "Bank not specified")}</p>
                <div className="mt-2 flex items-center justify-between rounded-xl bg-white/80 px-2.5 py-1.5 text-[10px] font-bold text-slate-500"><span>{fa ? "موجودی فعلی" : "Current balance"}</span><strong dir="ltr" className="text-blue-900">{money(account.currentBalance, account.currency)}</strong></div>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-bold text-slate-600"><span dir="ltr" className="rounded-full bg-white px-2 py-1">{account.accountNumber || "—"}</span><span className="rounded-full bg-white px-2 py-1">{account.scope === "shared" ? (fa ? "مشترک" : "Shared") : (fa ? "اختصاصی پروژه" : "Project")}</span><span className={`rounded-full px-2 py-1 ${account.isActive ? "bg-blue-200 text-blue-900" : "bg-slate-200 text-slate-600"}`}>{account.isActive ? (fa ? "فعال" : "Active") : (fa ? "غیرفعال" : "Inactive")}</span></div>
              </article>
            )) : <p className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-6 text-center text-xs text-slate-500">{fa ? "هنوز حسابی ثبت نشده است." : "No accounts yet."}</p>}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="mb-3">
            <h3 className="m-0 text-sm font-black text-blue-950">{fa ? "فهرست صرافی‌ها" : "Exchange list"}</h3>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {exchanges.length ? exchanges.map((item) => (
              <article key={item.id} className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex items-start justify-between gap-2"><span className="grid size-8 place-items-center rounded-xl bg-indigo-100 text-indigo-800"><MapPin className="size-4" /></span><span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-900">{fa ? "فعال" : "Active"}</span></div>
                <h4 className="mb-0 mt-2 text-sm font-black text-blue-950">{item.name}</h4>
                <p className="mb-0 mt-1 truncate text-[11px] text-slate-500">{item.address}</p>
                <div className="mt-2 grid gap-1 text-[11px] text-slate-600"><p className="mb-0"><Phone className="me-1 inline size-3" />{item.primaryPhone}</p><p className="mb-0"><Phone className="me-1 inline size-3" />{item.secondaryPhone}</p></div>
              </article>
            )) : <p className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-6 text-center text-xs text-slate-500">{fa ? "هنوز صرافی ثبت نشده است." : "No exchanges yet."}</p>}
          </div>
        </div>
      )}

      <button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold text-slate-500 hover:text-blue-800"><RefreshCw className="size-3.5" />{fa ? "به‌روزرسانی فهرست" : "Refresh directory"}</button>

      {view === "new-account" && <ProjectModal title={fa ? "تعریف حساب جدید" : "Define new account"} onClose={() => { if (!busy) onViewChange("accounts"); }}><form onSubmit={(event) => void submit(event, "account")}><AccountFields value={accountForm} onChange={setAccountForm} fa={fa} projects={projects} /><button disabled={busy || !projectCode} className={`${buttonClass} mt-4 w-full`}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ثبت حساب" : "Save account"}</button></form></ProjectModal>}

      {view === "new-exchange" && <ProjectModal title={fa ? "تعریف صرافی جدید" : "Define new exchange"} onClose={() => { if (!busy) onViewChange("exchanges"); }}><form onSubmit={(event) => void submit(event, "exchange")}><div className="mt-1 space-y-3"><label className="block text-xs font-bold">{fa ? "نام صرافی" : "Exchange name"}<input required value={exchangeForm.name} onChange={(event) => setExchangeForm({ ...exchangeForm, name: event.target.value })} className={inputClass} /></label><label className="block text-xs font-bold">{fa ? "آدرس" : "Address"}<input required value={exchangeForm.address} onChange={(event) => setExchangeForm({ ...exchangeForm, address: event.target.value })} className={inputClass} /></label><label className="block text-xs font-bold">{fa ? "شماره تماس اول" : "Primary phone"}<input required value={exchangeForm.primaryPhone} onChange={(event) => setExchangeForm({ ...exchangeForm, primaryPhone: event.target.value })} className={inputClass} dir="ltr" /></label><label className="block text-xs font-bold">{fa ? "شماره تماس دوم" : "Secondary phone"}<input required value={exchangeForm.secondaryPhone} onChange={(event) => setExchangeForm({ ...exchangeForm, secondaryPhone: event.target.value })} className={inputClass} dir="ltr" /></label><button disabled={busy || !projectCode} className={`${buttonClass} mt-1 w-full`}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ثبت صرافی" : "Save exchange"}</button></div></form></ProjectModal>}

      {editing && <ProjectModal title={fa ? "ویرایش حساب" : "Edit account"} onClose={() => { if (!busy) setEditing(null); }}><form onSubmit={(event) => void updateAccount(event)}><AccountFields value={accountForm} onChange={setAccountForm} fa={fa} projects={projects} /><button className={`${buttonClass} mt-4 w-full`} disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ذخیره تغییرات" : "Save changes"}</button></form></ProjectModal>}
    </section>
  );
}

function AccountFields({ value, onChange, fa, projects }: { value: AccountDraft; onChange: (value: AccountDraft) => void; fa: boolean; projects: Project[] }) {
  const set = (key: keyof AccountDraft, next: string) => onChange({ ...value, [key]: next });
  return <div className="mt-1 space-y-3"><label className="block text-xs font-bold">{fa ? "نام حساب" : "Account name"}<input required value={value.name} onChange={(event) => set("name", event.target.value)} className={inputClass} /></label><label className="block text-xs font-bold">{fa ? "شماره حساب" : "Account number"}<input required value={value.accountNumber} onChange={(event) => set("accountNumber", event.target.value)} className={inputClass} dir="ltr" /></label><label className="block text-xs font-bold">{fa ? "بانک" : "Bank"}<select value={value.bankName} onChange={(event) => set("bankName", event.target.value)} className={inputClass}>{banks.map((bank) => <option key={bank}>{bank}</option>)}</select></label><label className="block text-xs font-bold">{fa ? "دامنه حساب" : "Account scope"}<select value={value.scope === "shared" ? "shared" : `project:${value.scopeProjectId || projects[0]?.id || ""}`} onChange={(event) => { const next = event.target.value; onChange({ ...value, scope: next === "shared" ? "shared" : "project", scopeProjectId: next === "shared" ? "" : next.replace("project:", ""), sharedScope: next === "shared" ? "all" : "project" }); }} className={inputClass}><optgroup label={fa ? "اختصاصی پروژه" : "Project-specific"}>{projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}</optgroup><option value="shared">{fa ? "مشترک همه پروژه‌ها" : "Shared with all projects"}</option></select></label><label className="block text-xs font-bold">{fa ? "وضعیت" : "Status"}<select value={value.isActive ? "active" : "inactive"} onChange={(event) => onChange({ ...value, isActive: event.target.value === "active" })} className={inputClass}><option value="active">{fa ? "فعال" : "Active"}</option><option value="inactive">{fa ? "غیرفعال" : "Inactive"}</option></select></label><label className="block text-xs font-bold">{fa ? "ارز" : "Currency"}<select value={value.currency} onChange={(event) => set("currency", event.target.value)} className={inputClass} dir="ltr">{["USD", "EUR", "AED", "TRY", "GBP", "IRR"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="block text-xs font-bold">{fa ? "موجودی اول سال مالی" : "Opening fiscal-year balance"}<input required value={value.openingBalance} onChange={(event) => set("openingBalance", event.target.value)} className={inputClass} inputMode="decimal" dir="ltr" /></label></div>;
}
