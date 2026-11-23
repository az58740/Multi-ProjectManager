"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Boxes, CirclePlus, LoaderCircle, PackageCheck, ShoppingCart, TrendingUp } from "lucide-react";
import { useLocale } from "@/app/providers";
import { ProjectModal } from "@/components/project-modal";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isLedgerAccountList, isLedgerProductList, type LedgerAccount, type LedgerProduct } from "@/lib/ledger";

const inputClass = "mt-2 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-60";
const currencies = ["USD", "EUR", "AED", "TRY", "GBP", "CNY", "IRR"] as const;
type Operation = "purchase" | "sale";
type FormModal = Operation | "catalog" | null;

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

export function ExportOperationsWorkspace({ code }: { code: string }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const path = `/api/v1/projects/${encodeURIComponent(code)}/ledger`;
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [products, setProducts] = useState<LedgerProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("1");
  const [currency, setCurrency] = useState("USD");
  const [debitAccount, setDebitAccount] = useState("");
  const [creditAccount, setCreditAccount] = useState("");
  const [productForm, setProductForm] = useState({ name: "", itemType: "resale", unit: "kg", currency: "USD" });
  const [formModal, setFormModal] = useState<FormModal>(null);

  async function load() {
    const [accountsResult, productsResult] = await Promise.all([
      fetchJsonWithTimeout(`${path}/accounts`, { cache: "no-store" }),
      fetchJsonWithTimeout(`${path}/products`, { cache: "no-store" }),
    ]);
    if (!accountsResult.response.ok || !isLedgerAccountList(accountsResult.payload)) throw new Error("accounts");
    if (!productsResult.response.ok || !isLedgerProductList(productsResult.payload)) throw new Error("products");
    setAccounts(accountsResult.payload.items.filter((item) => item.isActive));
    setProducts(productsResult.payload.items);
  }

  useEffect(() => { void load().catch(() => setMessage(fa ? "دریافت اطلاعات عملیات ممکن نشد." : "Could not load operation data.")); }, [path, fa]);
  const selectedProduct = products.find((item) => item.id === productId);
  const assetAccounts = useMemo(() => accounts.filter((item) => item.accountType === "asset"), [accounts]);
  const payableAccounts = useMemo(() => accounts.filter((item) => ["asset", "liability"].includes(item.accountType)), [accounts]);
  const revenueAccounts = useMemo(() => accounts.filter((item) => item.accountType === "revenue"), [accounts]);
  const transactionProducts = useMemo(() => products.filter((item) => item.itemType === "resale" && (item.scope === "project" || (item.scope === "shared" && ["all", "export"].includes(item.sharedScope)))), [products]);
  const projectProducts = useMemo(() => transactionProducts.filter((item) => item.scope === "project"), [transactionProducts]);
  const sharedProducts = useMemo(() => transactionProducts.filter((item) => item.scope === "shared" && ["all", "export"].includes(item.sharedScope)), [transactionProducts]);

  function resetTransaction() {
    setProductId(""); setAmount(""); setRate("1"); setDebitAccount(""); setCreditAccount("");
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetchWithTimeout(`${path}/products`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ name: productForm.name.trim(), itemType: productForm.itemType, unit: productForm.unit.trim(), currency: productForm.currency, scope: "project", sharedScope: "project" }) });
      if (!response.ok) throw new Error("save");
      setProductForm({ name: "", itemType: "resale", unit: "kg", currency: "USD" });
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
      resetTransaction(); setFormModal(null); setMessage(fa ? `عملیات ${isPurchase ? "خرید" : "فروش"} ثبت شد و سند حسابداری به‌صورت خودکار ایجاد شد.` : `${isPurchase ? "Purchase" : "Sale"} saved and its journal entry was created automatically.`);
    } catch { setMessage(fa ? "ثبت عملیات انجام نشد. حساب‌ها و تراز ارز مبنا را بررسی کنید." : "Operation failed. Check the accounts and functional balance."); }
    finally { setBusy(false); }
  }

  const operationTitle = formModal === "sale" ? (fa ? "ثبت فروش و ایجاد خودکار سند" : "Record sale") : (fa ? "ثبت خرید و ایجاد خودکار سند" : "Record purchase");
  const operationIsSale = formModal === "sale";

  return <>
    <section className="mt-5 rounded-[24px] border border-amber/30 bg-amber-soft/45 p-4 shadow-sm sm:p-5" aria-labelledby="operations-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#8a6415]"><ShoppingCart className="size-4" aria-hidden="true" />{fa ? "عملیات صادرات" : "Export operations"}</div><h2 id="operations-title" className="mb-0 mt-1 text-xl font-black text-forest">{fa ? "ثبت خرید و فروش پروژه" : "Project purchase & sales"}</h2><p className="mb-0 mt-1 text-xs leading-6 text-muted">{fa ? "کالا، خرید و فروش برای همین پروژه ثبت می‌شود و سند حسابداری خودکار ساخته می‌شود." : "Products, purchases, and sales belong to this project and create journal entries automatically."}</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><button type="button" onClick={() => setFormModal("purchase")} className={buttonClass}><ShoppingCart className="size-4" />{fa ? "ثبت خرید" : "New purchase"}</button><button type="button" onClick={() => setFormModal("sale")} className={buttonClass}><TrendingUp className="size-4" />{fa ? "ثبت فروش" : "New sale"}</button><button type="button" onClick={() => setFormModal("catalog")} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-sage-dark bg-sage px-5 text-sm font-extrabold text-forest sm:col-span-1"><Boxes className="size-4" />{fa ? "تعریف کالا" : "Product catalog"}</button></div>
      </div>
      {message && <p role="status" className="mt-4 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{message}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-2xl bg-white/65 p-3"><p className="m-0 text-[11px] text-muted">{fa ? "کالاها" : "Products"}</p><p className="m-0 mt-1 text-xl font-black text-forest">{products.length}</p></div><div className="rounded-2xl bg-white/65 p-3"><p className="m-0 text-[11px] text-muted">{fa ? "حساب‌های فعال" : "Active accounts"}</p><p className="m-0 mt-1 text-xl font-black text-forest">{accounts.length}</p></div><div className="rounded-2xl bg-white/65 p-3"><p className="m-0 text-[11px] text-muted">{fa ? "وضعیت" : "Status"}</p><p className="m-0 mt-1 text-sm font-black text-forest">{products.length ? (fa ? "آمادهٔ ثبت" : "Ready") : (fa ? "کاتالوگ خالی" : "Catalog empty")}</p></div></div>
    </section>
    {formModal && <ProjectModal title={formModal === "catalog" ? (fa ? "تعریف کالا یا ملزومات" : "Define product or supply") : operationTitle} onClose={() => { if (!busy) setFormModal(null); }}>
      {formModal === "catalog" ? <form onSubmit={(event) => void createProduct(event)} className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-ink sm:col-span-2">{fa ? "نام کالا یا ملزومات" : "Product or supply name"}<input required value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} className={inputClass} /></label><label className="text-xs font-bold text-ink">{fa ? "نوع" : "Type"}<select value={productForm.itemType} onChange={(event) => setProductForm({ ...productForm, itemType: event.target.value })} className={inputClass}><option value="resale">{fa ? "قابل‌فروش / صادراتی" : "Resale / export"}</option><option value="supply">{fa ? "ملزومات مصرفی" : "Operational supply"}</option></select></label><label className="text-xs font-bold text-ink">{fa ? "واحد" : "Unit"}<input required value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })} className={inputClass} /></label><label className="text-xs font-bold text-ink sm:col-span-2">{fa ? "ارز" : "Currency"}<select value={productForm.currency} onChange={(event) => setProductForm({ ...productForm, currency: event.target.value })} className={inputClass} dir="ltr">{currencies.map((item) => <option key={item}>{item}</option>)}</select></label><button className={`${buttonClass} sm:col-span-2`} disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <CirclePlus className="size-4" />}{fa ? "ثبت کالا" : "Save product"}</button></form> : <form onSubmit={(event) => void registerTransaction(event, operationIsSale ? "sale" : "purchase")} className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-ink sm:col-span-2">{fa ? "کالای قابل‌فروش" : "Saleable product"}<select required value={productId} onChange={(event) => { setProductId(event.target.value); const selected = products.find((item) => item.id === event.target.value); if (selected) { setCurrency(selected.currency); } }} className={inputClass}><option value="">{fa ? "انتخاب کالا" : "Choose product"}</option>{projectProducts.length > 0 && <optgroup label={fa ? "کالاهای قابل‌فروش همین پروژه" : "This project's saleable products"}>{projectProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}{sharedProducts.length > 0 && <optgroup label={fa ? "کالاهای قابل‌فروش مشترک" : "Shared saleable products"}>{sharedProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}</select></label><label className="text-xs font-bold text-ink">{operationIsSale ? (fa ? "حساب دریافتنی یا بانک" : "Receivable or bank") : (fa ? "حساب کالایی" : "Inventory account")}<select required value={debitAccount} onChange={(event) => setDebitAccount(event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب" : "Choose account"}</option>{assetAccounts.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label className="text-xs font-bold text-ink">{operationIsSale ? (fa ? "درآمد فروش" : "Sales revenue") : (fa ? "بانک یا پرداختنی" : "Bank or payable")}<select required value={creditAccount} onChange={(event) => setCreditAccount(event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب" : "Choose account"}</option>{(operationIsSale ? revenueAccounts : payableAccounts).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label className="text-xs font-bold text-ink">{fa ? "مبلغ" : "Amount"}<input required value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} inputMode="decimal" dir="ltr" /></label><label className="text-xs font-bold text-ink">{fa ? "نرخ ارز مبنا" : "Functional rate"}<input required value={rate} onChange={(event) => setRate(event.target.value)} className={inputClass} inputMode="decimal" dir="ltr" /></label><label className="text-xs font-bold text-ink sm:col-span-2">{fa ? "ارز" : "Currency"}<select value={currency} onChange={(event) => setCurrency(event.target.value)} className={inputClass} dir="ltr">{currencies.map((item) => <option key={item}>{item}</option>)}</select></label><button className={`${buttonClass} sm:col-span-2`} disabled={busy || !transactionProducts.length}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}{fa ? `ثبت ${operationIsSale ? "فروش" : "خرید"} و ایجاد سند` : `Save ${operationIsSale ? "sale" : "purchase"} & create journal`}</button></form>}
    </ProjectModal>}
  </>;
}
