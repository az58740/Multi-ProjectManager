"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Boxes, CirclePlus, LoaderCircle, PackageCheck, ShoppingCart, TrendingUp } from "lucide-react";
import { useLocale } from "@/app/providers";
import { ProjectModal } from "@/components/project-modal";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isJournalEntryList, isLedgerAccountList, isLedgerProductList, type JournalEntry, type LedgerAccount, type LedgerProduct } from "@/lib/ledger";

const inputClass = "mt-2 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-60";
const currencies = ["USD", "EUR", "AED", "TRY", "GBP", "CNY", "IRR"] as const;
type Operation = "purchase" | "sale";
type FormModal = Operation | "catalog" | null;
type OperationsMode = Operation | "catalog";

function decimalMultiply(first: string, second: string): string | null {
  const valid = (value: string) => /^(0|[1-9]\d*)(\.\d+)?$/.test(value) && /[1-9]/.test(value);
  if (!valid(first) || !valid(second)) return null;
  const [a, af = ""] = first.split("."), [b, bf = ""] = second.split(".");
  const digits = (BigInt(`${a}${af}`) * BigInt(`${b}${bf}`)).toString();
  const scale = af.length + bf.length;
  if (!scale) return digits;
  const padded = digits.padStart(scale + 1, "0");
  return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`.replace(/0+$/, "").replace(/\.$/, "");
}

export function ExportOperationsWorkspace({ code, mode = "sale" }: { code: string; mode?: OperationsMode }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const path = `/api/v1/projects/${encodeURIComponent(code)}/ledger`;
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [products, setProducts] = useState<LedgerProduct[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("1");
  const [currency, setCurrency] = useState("USD");
  const [debitAccount, setDebitAccount] = useState("");
  const [creditAccount, setCreditAccount] = useState("");
  const [productForm, setProductForm] = useState({ name: "", itemType: "resale", unit: "kg", currency: "USD" });
  const [editingProduct, setEditingProduct] = useState<LedgerProduct | null>(null);
  const [formModal, setFormModal] = useState<FormModal>(null);

  async function load() {
    const [accountsResult, productsResult, entriesResult] = await Promise.all([
      fetchJsonWithTimeout(`${path}/accounts`, { cache: "no-store" }),
      fetchJsonWithTimeout(`${path}/products`, { cache: "no-store" }),
      fetchJsonWithTimeout(`${path}/entries`, { cache: "no-store" }),
    ]);
    if (!accountsResult.response.ok || !isLedgerAccountList(accountsResult.payload)) throw new Error("accounts");
    if (!productsResult.response.ok || !isLedgerProductList(productsResult.payload)) throw new Error("products");
    if (!entriesResult.response.ok || !isJournalEntryList(entriesResult.payload)) throw new Error("entries");
    setAccounts(accountsResult.payload.items.filter((item) => item.isActive));
    setProducts(productsResult.payload.items);
    setEntries(entriesResult.payload.items);
  }

  useEffect(() => { void load().catch(() => setMessage(fa ? "دریافت اطلاعات عملیات ممکن نشد." : "Could not load operation data.")); }, [path, fa]);
  const selectedProduct = products.find((item) => item.id === productId);
  const assetAccounts = useMemo(() => accounts.filter((item) => item.accountType === "asset"), [accounts]);
  const payableAccounts = useMemo(() => accounts.filter((item) => ["asset", "liability"].includes(item.accountType)), [accounts]);
  const revenueAccounts = useMemo(() => accounts.filter((item) => item.accountType === "revenue"), [accounts]);
  const transactionProducts = useMemo(() => products.filter((item) => item.isActive && item.itemType === "resale" && (item.scope === "project" || (item.scope === "shared" && ["all", "export"].includes(item.sharedScope)))), [products]);
  const projectProducts = useMemo(() => transactionProducts.filter((item) => item.scope === "project"), [transactionProducts]);
  const sharedProducts = useMemo(() => transactionProducts.filter((item) => item.scope === "shared" && ["all", "export"].includes(item.sharedScope)), [transactionProducts]);
  const visibleEntries = useMemo(() => entries.filter((entry) => mode === "sale" ? /فروش|sale/i.test(entry.description) : /خرید|purchase/i.test(entry.description)), [entries, mode]);

  function resetTransaction() {
    setProductId(""); setAmount(""); setRate("1"); setDebitAccount(""); setCreditAccount("");
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetchWithTimeout(`${path}/products${editingProduct ? `/${encodeURIComponent(editingProduct.id)}` : ""}`, { method: editingProduct ? "PUT" : "POST", headers: jsonHeaders(), body: JSON.stringify({ name: productForm.name.trim(), itemType: productForm.itemType, unit: productForm.unit.trim(), currency: productForm.currency, scope: "project", sharedScope: "project", openingStock: editingProduct?.openingStock ?? "0", currentStock: editingProduct?.currentStock ?? "0", isActive: editingProduct?.isActive ?? true }) });
      if (!response.ok) throw new Error("save");
      setProductForm({ name: "", itemType: "resale", unit: "kg", currency: "USD" }); setEditingProduct(null);
      await load(); setMessage(fa ? "کالا یا ملزومات ثبت شد." : "Product or supply saved."); setFormModal(null);
    } catch { setMessage(fa ? "ثبت کالا انجام نشد." : "Product could not be saved."); }
    finally { setBusy(false); }
  }

  async function registerTransaction(event: FormEvent<HTMLFormElement>, operation: Operation) {
    event.preventDefault(); setBusy(true); setMessage("");
    const functional = decimalMultiply(amount.trim(), rate.trim());
    if (!selectedProduct || !debitAccount || !creditAccount || !functional) {
      setMessage(fa ? "کالا، حساب‌ها، مبلغ و نرخ را معتبر وارد کنید." : "Choose a product and accounts, then enter valid amount and rate."); setBusy(false); return;
    }
    const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${operation}-${Date.now()}`;
    const isPurchase = operation === "purchase";
    const description = `${isPurchase ? (fa ? "خرید" : "Purchase") : (fa ? "فروش" : "Sale")}: ${selectedProduct.name}`;
    const debitMemo = isPurchase ? (selectedProduct.itemType === "resale" ? (fa ? "خرید کالای قابل‌فروش/صادراتی" : "Resale/export goods purchase") : (fa ? "خرید ملزومات عملیاتی" : "Operational supplies purchase")) : (fa ? "دریافت وجه فروش" : "Sale receivable or cash");
    const creditMemo = isPurchase ? (fa ? "پرداخت یا حساب پرداختنی خرید" : "Purchase payment or payable") : (fa ? "درآمد فروش صادراتی" : "Export sales revenue");
    try {
      const response = await fetchWithTimeout(`${path}/entries`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ entryDate: new Date().toISOString().slice(0, 10), description, idempotencyKey: key, lines: [
        { accountId: debitAccount, currency, debitAmount: amount.trim(), creditAmount: "0", functionalDebit: functional, functionalCredit: "0", exchangeRate: rate.trim(), memo: debitMemo },
        { accountId: creditAccount, currency, debitAmount: "0", creditAmount: amount.trim(), functionalDebit: "0", functionalCredit: functional, exchangeRate: rate.trim(), memo: creditMemo },
      ] }) }, 12_000);
      if (!response.ok) throw new Error("entry");
      resetTransaction(); await load(); setFormModal(null); setMessage(fa ? `عملیات ${isPurchase ? "خرید" : "فروش"} ثبت شد و سند حسابداری به‌صورت خودکار ایجاد شد.` : `${isPurchase ? "Purchase" : "Sale"} saved and its journal entry was created automatically.`);
    } catch { setMessage(fa ? "ثبت عملیات انجام نشد. حساب‌ها و تراز ارز مبنا را بررسی کنید." : "Operation failed. Check the accounts and functional balance."); }
    finally { setBusy(false); }
  }

  const operationTitle = formModal === "sale" ? (fa ? "ثبت فروش و ایجاد خودکار سند" : "Record sale") : (fa ? "ثبت خرید و ایجاد خودکار سند" : "Record purchase");
  const operationIsSale = formModal === "sale";

  return <>
    <section className="mt-5 rounded-[24px] border border-amber/30 bg-amber-soft/45 p-4 shadow-sm sm:p-5" aria-labelledby="operations-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#8a6415]"><ShoppingCart className="size-4" aria-hidden="true" />{fa ? "عملیات صادرات" : "Export operations"}</div><h2 id="operations-title" className="mb-0 mt-1 text-xl font-black text-forest">{mode === "sale" ? (fa ? "فروش‌های پروژه" : "Project sales") : mode === "purchase" ? (fa ? "خریدهای پروژه" : "Project purchases") : (fa ? "کالاهای پروژه" : "Project products")}</h2><p className="mb-0 mt-1 text-xs leading-6 text-muted">{mode === "catalog" ? (fa ? "کالاهای این پروژه را مشاهده و تعریف کنید." : "View and define products for this project.") : (fa ? "رکوردهای این بخش برای همین پروژه ثبت می‌شوند و سند حسابداری خودکار ساخته می‌شود." : "Records in this section belong to this project and create journal entries automatically.")}</p></div>
        <div className="grid gap-2 sm:grid-cols-2">{mode === "purchase" && <button type="button" onClick={() => setFormModal("purchase")} className={buttonClass}><ShoppingCart className="size-4" />{fa ? "ثبت خرید جدید" : "New purchase"}</button>}{mode === "sale" && <button type="button" onClick={() => setFormModal("sale")} className={buttonClass}><TrendingUp className="size-4" />{fa ? "ثبت فروش جدید" : "New sale"}</button>}{mode === "catalog" && <button type="button" onClick={() => { setEditingProduct(null); setProductForm({ name: "", itemType: "resale", unit: "kg", currency: "USD" }); setFormModal("catalog"); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-sage-dark bg-sage px-5 text-sm font-extrabold text-forest"><Boxes className="size-4" />{fa ? "تعریف کالای جدید" : "New product"}</button>}</div>
      </div>
      {message && <p role="status" className="mt-4 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{message}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-2xl bg-white/65 p-3"><p className="m-0 text-[11px] text-muted">{mode === "sale" ? (fa ? "فروش‌ها" : "Sales") : mode === "purchase" ? (fa ? "خریدها" : "Purchases") : (fa ? "کالاها" : "Products")}</p><p className="m-0 mt-1 text-xl font-black text-forest">{mode === "catalog" ? products.length : 0}</p></div><div className="rounded-2xl bg-white/65 p-3"><p className="m-0 text-[11px] text-muted">{fa ? "حساب‌های فعال" : "Active accounts"}</p><p className="m-0 mt-1 text-xl font-black text-forest">{accounts.length}</p></div><div className="rounded-2xl bg-white/65 p-3"><p className="m-0 text-[11px] text-muted">{fa ? "وضعیت" : "Status"}</p><p className="m-0 mt-1 text-sm font-black text-forest">{products.length ? (fa ? "آمادهٔ ثبت" : "Ready") : (fa ? "کاتالوگ خالی" : "Catalog empty")}</p></div></div>{mode === "catalog" ? <section className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={fa ? "فهرست کالاها" : "Product list"}>{products.length ? products.map((item) => <article key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/75 p-3"><div className="min-w-0"><h3 className="m-0 truncate text-sm font-black text-forest">{item.name}</h3><p className="m-0 mt-1 text-[10px] text-muted">{item.currentStock} {item.unit} · {item.itemType === "resale" ? (fa ? "قابل‌فروش" : "Resale") : (fa ? "ملزومات" : "Supply")}</p></div><button type="button" onClick={() => { setEditingProduct(item); setProductForm({ name: item.name, itemType: item.itemType, unit: item.unit, currency: item.currency }); setFormModal("catalog"); }} className="shrink-0 rounded-full border border-sage-dark px-3 py-1.5 text-[10px] font-bold text-forest">{fa ? "ویرایش" : "Edit"}</button></article>) : <p className="m-0 rounded-2xl border border-dashed border-sage-dark p-5 text-center text-xs text-muted">{fa ? "کالایی برای این پروژه ثبت نشده است." : "No products for this project yet."}</p>}</section> : <section className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={mode === "sale" ? (fa ? "فهرست فروش‌ها" : "Sales list") : (fa ? "فهرست خریدها" : "Purchases list")}>{visibleEntries.length ? visibleEntries.map((entry) => <article key={entry.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/75 p-3"><div className="min-w-0"><h3 className="m-0 truncate text-sm font-black text-forest">{entry.description}</h3><p className="m-0 mt-1 text-[10px] text-muted">{entry.entryDate} · {entry.lines.length} {fa ? "ردیف" : "lines"}</p></div><button type="button" onClick={() => setFormModal(mode)} className="shrink-0 rounded-full border border-sage-dark px-3 py-1.5 text-[10px] font-bold text-forest">{fa ? "ویرایش" : "Edit"}</button></article>) : <p className="m-0 rounded-2xl border border-dashed border-sage-dark p-5 text-center text-xs text-muted">{mode === "sale" ? (fa ? "فروشی ثبت نشده است." : "No sales yet.") : (fa ? "خریدی ثبت نشده است." : "No purchases yet.")}</p>}</section>}
    </section>
    {formModal && <ProjectModal title={formModal === "catalog" ? (editingProduct ? (fa ? "ویرایش کالای پروژه" : "Edit project product") : (fa ? "تعریف کالا یا ملزومات" : "Define product or supply")) : operationTitle} onClose={() => { if (!busy) setFormModal(null); }}>
      {formModal === "catalog" ? <form onSubmit={(event) => void createProduct(event)} className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-ink sm:col-span-2">{fa ? "نام کالا یا ملزومات" : "Product or supply name"}<input required value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} className={inputClass} /></label><label className="text-xs font-bold text-ink">{fa ? "نوع" : "Type"}<select value={productForm.itemType} onChange={(event) => setProductForm({ ...productForm, itemType: event.target.value })} className={inputClass}><option value="resale">{fa ? "قابل‌فروش / صادراتی" : "Resale / export"}</option><option value="supply">{fa ? "ملزومات مصرفی" : "Operational supply"}</option></select></label><label className="text-xs font-bold text-ink">{fa ? "واحد" : "Unit"}<input required value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })} className={inputClass} /></label><label className="text-xs font-bold text-ink sm:col-span-2">{fa ? "ارز" : "Currency"}<select value={productForm.currency} onChange={(event) => setProductForm({ ...productForm, currency: event.target.value })} className={inputClass} dir="ltr">{currencies.map((item) => <option key={item}>{item}</option>)}</select></label><button className={`${buttonClass} sm:col-span-2`} disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <CirclePlus className="size-4" />}{fa ? "ثبت کالا" : "Save product"}</button></form> : <form onSubmit={(event) => void registerTransaction(event, operationIsSale ? "sale" : "purchase")} className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-ink sm:col-span-2">{fa ? "کالای قابل‌فروش" : "Saleable product"}<select required value={productId} onChange={(event) => { setProductId(event.target.value); const selected = products.find((item) => item.id === event.target.value); if (selected) { setCurrency(selected.currency); } }} className={inputClass}><option value="">{fa ? "انتخاب کالا" : "Choose product"}</option>{projectProducts.length > 0 && <optgroup label={fa ? "کالاهای قابل‌فروش همین پروژه" : "This project's saleable products"}>{projectProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}{sharedProducts.length > 0 && <optgroup label={fa ? "کالاهای قابل‌فروش مشترک" : "Shared saleable products"}>{sharedProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}</select></label><label className="text-xs font-bold text-ink">{operationIsSale ? (fa ? "حساب دریافتنی یا بانک" : "Receivable or bank") : (fa ? "حساب کالایی" : "Inventory account")}<select required value={debitAccount} onChange={(event) => setDebitAccount(event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب" : "Choose account"}</option>{assetAccounts.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label className="text-xs font-bold text-ink">{operationIsSale ? (fa ? "درآمد فروش" : "Sales revenue") : (fa ? "بانک یا پرداختنی" : "Bank or payable")}<select required value={creditAccount} onChange={(event) => setCreditAccount(event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب" : "Choose account"}</option>{(operationIsSale ? revenueAccounts : payableAccounts).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label className="text-xs font-bold text-ink">{fa ? "مبلغ" : "Amount"}<input required value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} inputMode="decimal" dir="ltr" /></label><label className="text-xs font-bold text-ink">{fa ? "نرخ ارز مبنا" : "Functional rate"}<input required value={rate} onChange={(event) => setRate(event.target.value)} className={inputClass} inputMode="decimal" dir="ltr" /></label><label className="text-xs font-bold text-ink sm:col-span-2">{fa ? "ارز" : "Currency"}<select value={currency} onChange={(event) => setCurrency(event.target.value)} className={inputClass} dir="ltr">{currencies.map((item) => <option key={item}>{item}</option>)}</select></label><button className={`${buttonClass} sm:col-span-2`} disabled={busy || !transactionProducts.length}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}{fa ? `ثبت ${operationIsSale ? "فروش" : "خرید"} و ایجاد سند` : `Save ${operationIsSale ? "sale" : "purchase"} & create journal`}</button></form>}
    </ProjectModal>}
  </>;
}
