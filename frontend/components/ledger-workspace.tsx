"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, CirclePlus, FilePlus2, LoaderCircle, Plus, RefreshCw, Trash2, WalletCards } from "lucide-react";
import { useLocale } from "@/app/providers";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { ledgerMessages } from "@/lib/ledger-i18n";
import { isJournalEntryList, isLedgerAccountList, type JournalEntry, type LedgerAccount, type LedgerAccountScope, type LedgerAccountType, type LedgerSharedScope } from "@/lib/ledger";

const inputClass = "mt-2 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const labelClass = "block text-xs font-bold text-ink";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-60";
const decimalPattern = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const CURRENCIES = ["USD", "EUR", "AED", "TRY", "GBP", "CNY", "IRR"] as const;

type Panel = "accounts" | "entries" | "newEntry";
type EntrySide = "debit" | "credit";
type DraftLine = { accountId: string; side: EntrySide; currency: string; amount: string; rate: string; memo: string };
type LoadState<T> = { status: "loading" | "error" | "ready"; items: T[] };

type DecimalValue = { digits: bigint; scale: number };

function decimalValue(value: string): DecimalValue | null {
  const trimmed = value.trim();
  if (!decimalPattern.test(trimmed)) return null;
  const [integer, fraction = ""] = trimmed.split(".");
  return { digits: BigInt(`${integer}${fraction}`), scale: fraction.length };
}

function decimalText(value: DecimalValue): string {
  if (value.digits === 0n) return "0";
  const raw = value.digits.toString().padStart(value.scale + 1, "0");
  if (value.scale === 0) return raw;
  return `${raw.slice(0, -value.scale)}.${raw.slice(-value.scale)}`.replace(/0+$/, "").replace(/\.$/, "");
}

function multiplyDecimal(first: string, second: string): string | null {
  const a = decimalValue(first);
  const b = decimalValue(second);
  if (!a || !b || a.digits <= 0n || b.digits <= 0n) return null;
  return decimalText({ digits: a.digits * b.digits, scale: a.scale + b.scale });
}

function sumDecimals(values: string[]): string {
  const parsed = values.map(decimalValue).filter((value): value is DecimalValue => Boolean(value));
  if (!parsed.length) return "0";
  const scale = Math.max(...parsed.map((value) => value.scale));
  const digits = parsed.reduce((total, value) => total + value.digits * 10n ** BigInt(scale - value.scale), 0n);
  return decimalText({ digits, scale });
}

function sameDecimal(first: string, second: string): boolean {
  const a = decimalValue(first);
  const b = decimalValue(second);
  if (!a || !b) return false;
  const scale = Math.max(a.scale, b.scale);
  return a.digits * 10n ** BigInt(scale - a.scale) === b.digits * 10n ** BigInt(scale - b.scale);
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(account?: LedgerAccount): DraftLine {
  return { accountId: account?.id ?? "", side: "debit", currency: account?.currency ?? "USD", amount: "", rate: "", memo: "" };
}

function AccountForm({ busy, onSave, message }: { busy: boolean; onSave: (input: { scope: LedgerAccountScope; sharedScope: LedgerSharedScope; code: string; name: string; accountType: LedgerAccountType; currency: string }) => Promise<boolean>; message: string }) {
  const { locale } = useLocale();
  const m = ledgerMessages[locale];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const scope = String(data.get("scope"));
    const sharedScope = String(data.get("sharedScope") ?? "all");
    const accountType = String(data.get("accountType"));
    const currency = String(data.get("currency") ?? "").trim().toUpperCase();
    const code = String(data.get("code") ?? "").trim();
    const name = String(data.get("name") ?? "").trim();
    if (!code || !name || !/^[A-Z]{3}$/.test(currency)) return;
    if (scope !== "project" && scope !== "shared") return;
    if (!["all", "export", "cold-storage", "sorting", "construction", "rental", "other", "project"].includes(sharedScope)) return;
    if (!["asset", "liability", "equity", "revenue", "expense"].includes(accountType)) return;
    const saved = await onSave({ scope: scope as LedgerAccountScope, sharedScope: sharedScope as LedgerSharedScope, code, name, accountType: accountType as LedgerAccountType, currency });
    if (saved) form.reset();
  }

  return <form onSubmit={(event) => void submit(event)} className="space-y-3" noValidate aria-busy={busy}>
    {message && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
	      <label className={labelClass}>{m.accountCode}<input name="code" required maxLength={40} className={inputClass} dir="ltr" placeholder="BANK-USD" /></label>
	      <label className={labelClass}>{m.currency}<select name="currency" required className={inputClass} dir="ltr" defaultValue="USD">{CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
    </div>
    <label className={labelClass}>{m.accountName}<input name="name" required maxLength={120} className={inputClass} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>{m.scope}<select name="scope" defaultValue="project" className={inputClass}><option value="project">{m.project}</option><option value="shared">{m.shared}</option></select></label>
      <label className={labelClass}>{m.sharedScope}<select name="sharedScope" defaultValue="all" className={inputClass}><option value="all">{m.allProjects}</option><option value="export">{m.exportProjects}</option><option value="construction">{m.constructionProjects}</option><option value="cold-storage">{m.coldStorageProjects}</option><option value="sorting">{m.sortingProjects}</option><option value="rental">{m.rentalProjects}</option><option value="other">{m.otherProjects}</option></select></label>
      <label className={labelClass}>{m.accountType}<select name="accountType" defaultValue="asset" className={inputClass}><option value="asset">{m.asset}</option><option value="liability">{m.liability}</option><option value="equity">{m.equity}</option><option value="revenue">{m.revenue}</option><option value="expense">{m.expense}</option></select></label>
    </div>
    <p className="m-0 text-xs leading-5 text-muted">{m.createAccountHint}</p>
    <button type="submit" disabled={busy} className={`${buttonClass} w-full`}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CirclePlus className="size-4" aria-hidden="true" />}{m.saveAccount}</button>
  </form>;
}

function AccountCard({ account }: { account: LedgerAccount }) {
  const { locale } = useLocale();
  const m = ledgerMessages[locale];
  return <article className="group rounded-[20px] border border-line bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-sage-dark hover:shadow-md hover:shadow-forest/5">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sage text-forest"><WalletCards className="size-4" aria-hidden="true" /></span><div className="min-w-0"><p dir="ltr" className="m-0 break-all font-mono text-[10px] font-black text-forest">{account.code}</p><h3 className="mb-0 mt-1 break-words text-sm font-black leading-5 text-ink">{account.name}</h3></div></div><span className="shrink-0 rounded-full bg-sage px-2 py-1 text-[10px] font-bold text-forest">{account.scope === "shared" ? m.shared : m.project}</span></div>
    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]"><span className="rounded-full bg-cream px-2 py-1 font-bold text-muted">{m[account.accountType]}</span><span dir="ltr" className="rounded-full bg-cream px-2 py-1 font-bold text-muted">{account.currency}</span>{account.scope === "shared" && <span className="rounded-full bg-amber-soft px-2 py-1 font-bold text-[#735722]">{m[`${account.sharedScope}Projects` as keyof typeof m] ?? account.sharedScope}</span>}</div>
  </article>;
}

function EntryLineEditor({ line, index, accounts, onChange, onRemove, canRemove }: { line: DraftLine; index: number; accounts: LedgerAccount[]; onChange: (patch: Partial<DraftLine>) => void; onRemove: () => void; canRemove: boolean }) {
  const { locale } = useLocale();
  const m = ledgerMessages[locale];
  const functional = multiplyDecimal(line.amount, line.rate) ?? "—";
  return <div className="rounded-2xl border border-line bg-white p-4">
    <div className="mb-3 flex items-center justify-between gap-3"><p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-amber">{m.line} {index + 1}</p>{canRemove && <button type="button" onClick={onRemove} className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 className="size-3.5" aria-hidden="true" />{m.removeLine}</button>}</div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_140px_minmax(0,1fr)_minmax(0,1fr)]">
      <label className={labelClass}>{m.chooseAccount}<select value={line.accountId} onChange={(event) => { const account = accounts.find((item) => item.id === event.target.value); onChange({ accountId: event.target.value, currency: account?.currency ?? line.currency }); }} className={inputClass}><option value="">{m.chooseAccount}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></label>
      <label className={labelClass}>{m.debit}/{m.credit}<select value={line.side} onChange={(event) => onChange({ side: event.target.value as EntrySide })} className={inputClass}><option value="debit">{m.debit}</option><option value="credit">{m.credit}</option></select></label>
      <label className={labelClass}>{m.amount}<input value={line.amount} onChange={(event) => onChange({ amount: event.target.value })} inputMode="decimal" className={inputClass} dir="ltr" placeholder="0.00" /></label>
      <label className={labelClass}>{m.exchangeRate}<input value={line.rate} onChange={(event) => onChange({ rate: event.target.value })} inputMode="decimal" className={inputClass} dir="ltr" placeholder="420000" /></label>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]"><label className={labelClass}>{m.currency}<input value={line.currency} onChange={(event) => onChange({ currency: event.target.value.toUpperCase() })} maxLength={3} className={inputClass} dir="ltr" /></label><label className={labelClass}>{m.functionalAmount}<input value={functional} readOnly className={`${inputClass} bg-cream`} dir="ltr" /></label></div>
    <label className={`${labelClass} mt-3`}>{m.memo}<input value={line.memo} onChange={(event) => onChange({ memo: event.target.value })} maxLength={500} className={inputClass} /></label>
  </div>;
}

function ManualEntryForm({ accounts, busy, message, onSave }: { accounts: LedgerAccount[]; busy: boolean; message: string; onSave: (payload: { entryDate: string; description: string; idempotencyKey: string; lines: Array<Record<string, string>> }) => Promise<boolean> }) {
  const { locale } = useLocale();
  const m = ledgerMessages[locale];
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [key, setKey] = useState(idempotencyKey);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const functionalDebits = lines.map((line) => line.side === "debit" ? multiplyDecimal(line.amount, line.rate) ?? "0" : "0");
  const functionalCredits = lines.map((line) => line.side === "credit" ? multiplyDecimal(line.amount, line.rate) ?? "0" : "0");
  const debitTotal = sumDecimals(functionalDebits);
  const creditTotal = sumDecimals(functionalCredits);
  const validLines = lines.length >= 2 && lines.every((line) => {
    const amount = decimalValue(line.amount);
    const rate = decimalValue(line.rate);
    return Boolean(line.accountId) && /^[A-Z]{3}$/.test(line.currency) && Boolean(amount && amount.digits > 0n) && Boolean(rate && rate.digits > 0n) && Boolean(multiplyDecimal(line.amount, line.rate));
  });
  const balanced = validLines && sameDecimal(debitTotal, creditTotal) && debitTotal !== "0";

  function updateLine(index: number, patch: Partial<DraftLine>) { setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line)); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    if (busy || !description.trim() || !entryDate || !balanced) return;
    const payloadLines: Array<Record<string, string>> = [];
    for (const line of lines) {
      const functional = multiplyDecimal(line.amount, line.rate);
      if (!line.accountId || !/^[A-Z]{3}$/.test(line.currency) || !functional || !decimalValue(line.amount) || !decimalValue(line.rate)) return;
      payloadLines.push({ accountId: line.accountId, currency: line.currency, debitAmount: line.side === "debit" ? line.amount : "0", creditAmount: line.side === "credit" ? line.amount : "0", functionalDebit: line.side === "debit" ? functional : "0", functionalCredit: line.side === "credit" ? functional : "0", exchangeRate: line.rate, memo: line.memo.trim() });
    }
    const saved = await onSave({ entryDate, description: description.trim(), idempotencyKey: key, lines: payloadLines });
    if (saved) { setDescription(""); setLines([emptyLine(), emptyLine()]); setKey(idempotencyKey()); setSubmitAttempted(false); }
  }

  return <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate aria-busy={busy}>
    {message && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">{message}</p>}
    <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]"><label className={labelClass}>{m.entryDate}<input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className={inputClass} dir="ltr" /></label><label className={labelClass}>{m.description}<input value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={240} className={inputClass} /></label></div>
    <div className="rounded-2xl border border-sage-dark bg-sage/60 px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3 text-xs"><span className="font-bold text-forest">{m.idempotency}: <code dir="ltr" className="font-mono">{key}</code></span><span className={`rounded-full px-2.5 py-1 font-black ${balanced ? "bg-forest text-white" : "bg-amber-soft text-[#735722]"}`}>{balanced ? m.balanced : m.unbalanced}</span></div><p className="mb-0 mt-1 text-xs text-muted">{m.idempotencyHint}</p>{submitAttempted && !validLines && <p role="alert" className="mb-0 mt-2 text-xs font-bold text-red-800">{m.invalidAmount}</p>}{submitAttempted && validLines && !balanced && <p role="alert" className="mb-0 mt-2 text-xs font-bold text-red-800">{m.invalidLines}</p>}<dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted">{m.debitTotal}</dt><dd dir="ltr" className="m-0 mt-1 font-black text-forest">{debitTotal}</dd></div><div><dt className="text-muted">{m.creditTotal}</dt><dd dir="ltr" className="m-0 mt-1 font-black text-forest">{creditTotal}</dd></div></dl></div>
    <div className="space-y-3">{lines.map((line, index) => <EntryLineEditor key={index} line={line} index={index} accounts={accounts} onChange={(patch) => updateLine(index, patch)} onRemove={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} canRemove={lines.length > 2} />)}</div>
    <div className="flex flex-wrap gap-3"><button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-5 text-sm font-extrabold text-forest hover:bg-cream"><Plus className="size-4" aria-hidden="true" />{m.addLine}</button><button type="submit" disabled={busy || !balanced || !description.trim() || !accounts.length} className={buttonClass}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FilePlus2 className="size-4" aria-hidden="true" />}{m.saveEntry}</button></div>
  </form>;
}

function EntryCard({ entry, accounts }: { entry: JournalEntry; accounts: LedgerAccount[] }) {
  const { locale } = useLocale();
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.code ?? id;
  return <article className="rounded-2xl border border-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p dir="ltr" className="m-0 font-mono text-xs font-black text-forest">{entry.entryDate}</p><h3 className="mb-0 mt-2 text-sm font-black text-ink">{entry.description}</h3></div><span dir="ltr" className="rounded-full bg-cream px-2.5 py-1 font-mono text-[10px] text-muted">{entry.id}</span></div><div className="mt-4 space-y-2">{entry.lines.map((line) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream/60 px-3 py-2 text-xs"><span className="font-bold text-forest">{accountName(line.accountId)}</span><span dir="ltr" className="font-mono text-muted">{line.debitAmount !== "0" ? `Dr ${line.debitAmount}` : `Cr ${line.creditAmount}`} {line.currency}</span></div>)}</div><p dir="ltr" className="mb-0 mt-3 text-[10px] text-muted">{new Date(entry.createdAt).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</p></article>;
}

export function LedgerWorkspace({ code, hideAccountManagement = false }: { code: string; hideAccountManagement?: boolean }) {
  const { locale } = useLocale();
  const m = ledgerMessages[locale];
  const [panel, setPanel] = useState<Panel>(hideAccountManagement ? "entries" : "accounts");
  const [accounts, setAccounts] = useState<LoadState<LedgerAccount>>({ status: "loading", items: [] });
  const [entries, setEntries] = useState<LoadState<JournalEntry>>({ status: "loading", items: [] });
  const [busy, setBusy] = useState<"account" | "entry" | null>(null);
  const [error, setError] = useState<"account" | "accountConflict" | "entry" | "accountsLoad" | "entriesLoad" | null>(null);
  const [notice, setNotice] = useState<"account" | "entry" | null>(null);
  const path = `/api/v1/projects/${encodeURIComponent(code)}/ledger`;

  const loadAccounts = useCallback(async () => {
    setAccounts((current) => ({ ...current, status: "loading" }));
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${path}/accounts`, { cache: "no-store" });
      if (response.status === 401) { window.location.href = "/login"; return; }
      if (!response.ok || !isLedgerAccountList(payload)) throw new Error("accounts unavailable");
      setAccounts({ status: "ready", items: payload.items }); setError(null);
    } catch { setAccounts((current) => ({ ...current, status: "error" })); setError("accountsLoad"); }
  }, [path]);

  const loadEntries = useCallback(async () => {
    setEntries((current) => ({ ...current, status: "loading" }));
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${path}/entries`, { cache: "no-store" });
      if (response.status === 401) { window.location.href = "/login"; return; }
      if (!response.ok || !isJournalEntryList(payload)) throw new Error("entries unavailable");
      setEntries({ status: "ready", items: payload.items }); setError(null);
    } catch { setEntries((current) => ({ ...current, status: "error" })); setError("entriesLoad"); }
  }, [path]);

  useEffect(() => { void loadAccounts(); void loadEntries(); }, [loadAccounts, loadEntries]);

  async function saveAccount(input: { scope: LedgerAccountScope; sharedScope: LedgerSharedScope; code: string; name: string; accountType: LedgerAccountType; currency: string }): Promise<boolean> {
    setBusy("account"); setError(null); setNotice(null);
    try {
      const response = await fetchWithTimeout(`${path}/accounts`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(input) });
      if (response.status === 401) { window.location.href = "/login"; return false; }
      if (response.status === 409) { setError("accountConflict"); return false; }
      if (!response.ok) throw new Error("account save failed");
      setNotice("account"); await loadAccounts(); setPanel("accounts"); return true;
    } catch { setError("account"); return false; } finally { setBusy(null); }
  }

  async function saveEntry(input: { entryDate: string; description: string; idempotencyKey: string; lines: Array<Record<string, string>> }): Promise<boolean> {
    setBusy("entry"); setError(null); setNotice(null);
    try {
      const response = await fetchWithTimeout(`${path}/entries`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(input) }, 12_000);
      if (response.status === 401) { window.location.href = "/login"; return false; }
      if (!response.ok) throw new Error("entry save failed");
      setNotice("entry"); await loadEntries(); setPanel("entries"); return true;
    } catch { setError("entry"); return false; } finally { setBusy(null); }
  }

  const accountError = error === "accountsLoad" ? m.accountLoadError : error === "accountConflict" ? m.accountConflict : error === "account" ? m.accountSaveError : "";
  const entryError = error === "entriesLoad" ? m.entryLoadError : error === "entry" ? m.entrySaveError : "";
  const accountCount = useMemo(() => accounts.status === "ready" ? accounts.items.length : 0, [accounts]);
  const entryCount = useMemo(() => entries.status === "ready" ? entries.items.length : 0, [entries]);

  return <section className="mt-8 rounded-[28px] border border-line bg-paper p-5 shadow-sm sm:p-7" aria-labelledby="ledger-title">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-amber"><BookOpen className="size-4" aria-hidden="true" />{m.accounts}</div><h2 id="ledger-title" className="mb-0 mt-2 text-2xl font-black text-forest">{m.title}</h2><p className="mb-0 mt-2 max-w-2xl text-sm leading-7 text-muted">{m.subtitle}</p></div><div className="flex flex-wrap gap-2">{!hideAccountManagement && <button type="button" onClick={() => setPanel("accounts")} aria-pressed={panel === "accounts"} className={`min-h-10 rounded-full px-4 text-xs font-extrabold ${panel === "accounts" ? "bg-forest text-white" : "border border-line text-forest"}`}>{m.accounts} ({accountCount})</button>}<button type="button" onClick={() => setPanel("entries")} aria-pressed={panel === "entries"} className={`min-h-10 rounded-full px-4 text-xs font-extrabold ${panel === "entries" ? "bg-forest text-white" : "border border-line text-forest"}`}>{m.entries} ({entryCount})</button><button type="button" onClick={() => setPanel("newEntry")} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-amber px-4 text-xs font-extrabold text-[#3d2b07]"><FilePlus2 className="size-3.5" aria-hidden="true" />{m.newEntry}</button></div></div>
    {notice && <div role="status" className="mt-5 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{notice === "account" ? m.accountSaved : m.entrySaved}</div>}
    {panel === "accounts" && !hideAccountManagement && <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px]"><div className="min-w-0">{accounts.status === "loading" ? <Loading message={m.loading} /> : accounts.status === "error" ? <ErrorBox message={m.accountLoadError} onRetry={() => void loadAccounts()} retry={m.retry} /> : accounts.items.length === 0 ? <Empty message={m.noAccounts} /> : <div className="grid gap-3 sm:grid-cols-2">{accounts.items.map((account) => <AccountCard key={account.id} account={account} />)}</div>}</div><aside className="rounded-2xl border border-line bg-cream/70 p-4"><div className="mb-4 flex items-center gap-2"><WalletCards className="size-5 text-forest" aria-hidden="true" /><h3 className="m-0 text-sm font-black text-forest">{m.newAccount}</h3></div><AccountForm busy={busy === "account"} onSave={saveAccount} message={accountError} /></aside></div>}
    {panel === "entries" && <div className="mt-6">{entries.status === "loading" ? <Loading message={m.loading} /> : entries.status === "error" ? <ErrorBox message={m.entryLoadError} onRetry={() => void loadEntries()} retry={m.retry} /> : entries.items.length === 0 ? <Empty message={m.noEntries} /> : <div className="grid gap-3 md:grid-cols-2">{entries.items.map((entry) => <EntryCard key={entry.id} entry={entry} accounts={accounts.items} />)}</div>}</div>}
    {panel === "newEntry" && <div className="mt-6"><ManualEntryForm accounts={accounts.items.filter((account) => account.isActive)} busy={busy === "entry"} message={entryError} onSave={saveEntry} /></div>}
  </section>;
}

function Loading({ message }: { message: string }) { return <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" />{message}</div>; }
function Empty({ message }: { message: string }) { return <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-sage-dark bg-cream/60 px-5 text-center text-sm font-bold text-forest">{message}</div>; }
function ErrorBox({ message, onRetry, retry }: { message: string; onRetry: () => void; retry: string }) { return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-800">{message}<button type="button" onClick={onRetry} className="ms-2 inline-flex items-center gap-1 font-bold underline"><RefreshCw className="size-3.5" aria-hidden="true" />{retry}</button></div>; }
