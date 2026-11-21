"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Boxes, CirclePlus, LoaderCircle, PackageCheck, ShoppingCart } from "lucide-react";
import { useLocale } from "@/app/providers";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isLedgerAccountList, isLedgerProductList, type LedgerAccount, type LedgerProduct } from "@/lib/ledger";

const inputClass = "mt-2 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-60";
const currencies = ["USD", "EUR", "AED", "TRY", "GBP", "CNY", "IRR"] as const;

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
  const [mode, setMode] = useState<"purchase" | "catalog">("purchase");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("1");
  const [currency, setCurrency] = useState("USD");
  const [debitAccount, setDebitAccount] = useState("");
  const [creditAccount, setCreditAccount] = useState("");
  const [productForm, setProductForm] = useState({ code: "", name: "", itemType: "resale", unit: "kg", currency: "USD" });

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
  const creditAccounts = useMemo(() => accounts.filter((item) => ["asset", "liability"].includes(item.accountType)), [accounts]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetchWithTimeout(`${path}/products`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ ...productForm, code: productForm.code.trim(), name: productForm.name.trim() }) });
      if (!response.ok) throw new Error("save");
      setProductForm({ code: "", name: "", itemType: "resale", unit: "kg", currency: "USD" });
      await load(); setMessage(fa ? "کالا ثبت شد." : "Product saved."); setMode("purchase");
    } catch { setMessage(fa ? "ثبت کالا انجام نشد؛ کد کالا را تکراری وارد نکنید." : "Product could not be saved; check for a duplicate code."); }
    finally { setBusy(false); }
  }

  async function registerPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const amountNumber = amount.trim(); const rateNumber = rate.trim();
    const functional = decimalMultiply(amountNumber, rateNumber);
    if (!selectedProduct || !debitAccount || !creditAccount || !functional) { setMessage(fa ? "کالا، حساب‌ها، مبلغ و نرخ را معتبر وارد کنید." : "Choose a product and accounts, then enter valid amount and rate."); setBusy(false); return; }
    const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `purchase-${Date.now()}`;
    try {
      const response = await fetchWithTimeout(`${path}/entries`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ entryDate: new Date().toISOString().slice(0, 10), description: `${fa ? "خرید" : "Purchase"}: ${selectedProduct.name} (${selectedProduct.itemType})`, idempotencyKey: key, lines: [
        { accountId: debitAccount, currency, debitAmount: amountNumber, creditAmount: "0", functionalDebit: functional, functionalCredit: "0", exchangeRate: rateNumber, memo: selectedProduct.itemType === "resale" ? (fa ? "خرید کالای قابل‌فروش/صادراتی" : "Resale/export goods purchase") : (fa ? "خرید ملزومات عملیاتی" : "Operational supplies purchase") },
        { accountId: creditAccount, currency, debitAmount: "0", creditAmount: amountNumber, functionalDebit: "0", functionalCredit: functional, exchangeRate: rateNumber, memo: fa ? "پرداخت یا حساب پرداختنی خرید" : "Purchase payment or payable" },
      ] }) }, 12_000);
      if (!response.ok) throw new Error("entry");
      setAmount(""); setMessage(fa ? "عملیات خرید ثبت شد و سند حسابداری به‌صورت خودکار ایجاد شد." : "Purchase operation saved and its journal entry was created automatically.");
    } catch { setMessage(fa ? "ثبت عملیات انجام نشد. حساب‌ها و تراز ارز مبنا را بررسی کنید." : "Operation failed. Check the accounts and functional balance."); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 rounded-[28px] border border-amber/30 bg-amber-soft/45 p-5 shadow-sm sm:p-7" aria-labelledby="operations-title">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#8a6415]"><ShoppingCart className="size-4" aria-hidden="true" />{fa ? "عملیات هوشمند" : "Smart operations"}</div><h2 id="operations-title" className="mb-0 mt-2 text-2xl font-black text-forest">{fa ? "ثبت عملیات؛ سند خودش ساخته می‌شود" : "Record operations; journals are automatic"}</h2><p className="mb-0 mt-2 max-w-2xl text-sm leading-7 text-muted">{fa ? "به‌جای ورود خط‌های بدهکار و بستانکار، خرید و تعریف کالا را ثبت کنید. سیستم سند متوازن و قابل retry ایجاد می‌کند." : "Register a purchase or product instead of typing journal lines. The system creates a balanced, retry-safe entry."}</p></div><div className="flex gap-2"><button type="button" onClick={() => setMode("purchase")} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-extrabold ${mode === "purchase" ? "bg-forest text-white" : "border border-line bg-white text-forest"}`}><ShoppingCart className="size-3.5" />{fa ? "ثبت خرید" : "New purchase"}</button><button type="button" onClick={() => setMode("catalog")} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-extrabold ${mode === "catalog" ? "bg-forest text-white" : "border border-line bg-white text-forest"}`}><Boxes className="size-3.5" />{fa ? "تعریف کالا" : "Product catalog"}</button></div></div>
    {message && <p role="status" className="mt-5 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{message}</p>}
    {mode === "catalog" ? <form onSubmit={(event) => void createProduct(event)} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5"><label className="text-xs font-bold text-ink">{fa ? "کد کالا" : "SKU"}<input required value={productForm.code} onChange={(event) => setProductForm({ ...productForm, code: event.target.value.toUpperCase() })} className={inputClass} dir="ltr" placeholder="APPLE-001" /></label><label className="text-xs font-bold text-ink">{fa ? "نام کالا" : "Product name"}<input required value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} className={inputClass} /></label><label className="text-xs font-bold text-ink">{fa ? "نوع" : "Type"}<select value={productForm.itemType} onChange={(event) => setProductForm({ ...productForm, itemType: event.target.value })} className={inputClass}><option value="resale">{fa ? "قابل‌فروش / صادراتی" : "Resale / export"}</option><option value="supply">{fa ? "ملزومات مصرفی" : "Operational supply"}</option></select></label><label className="text-xs font-bold text-ink">{fa ? "واحد" : "Unit"}<input required value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })} className={inputClass} /></label><button className={`${buttonClass} mt-5`} disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <CirclePlus className="size-4" />}{fa ? "ثبت کالا" : "Save product"}</button></form> : <form onSubmit={(event) => void registerPurchase(event)} className="mt-6 grid gap-4 lg:grid-cols-3"><label className="text-xs font-bold text-ink">{fa ? "کالای خریداری‌شده" : "Purchased product"}<select required value={productId} onChange={(event) => { setProductId(event.target.value); const product = products.find((item) => item.id === event.target.value); if (product) setCurrency(product.currency); }} className={inputClass}><option value="">{fa ? "انتخاب کالا" : "Choose product"}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name} ({product.itemType === "resale" ? (fa ? "قابل‌فروش" : "resale") : (fa ? "ملزومات" : "supply")})</option>)}</select></label><label className="text-xs font-bold text-ink">{fa ? "حساب موجودی/ملزومات" : "Inventory / supply account"}<select required value={debitAccount} onChange={(event) => setDebitAccount(event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب بدهکار" : "Choose debit account"}</option>{assetAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></label><label className="text-xs font-bold text-ink">{fa ? "بانک یا پرداختنی" : "Bank or payable"}<select required value={creditAccount} onChange={(event) => setCreditAccount(event.target.value)} className={inputClass}><option value="">{fa ? "انتخاب حساب بستانکار" : "Choose credit account"}</option>{creditAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></label><label className="text-xs font-bold text-ink">{fa ? "مبلغ خرید" : "Purchase amount"}<input required value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} inputMode="decimal" dir="ltr" /></label><label className="text-xs font-bold text-ink">{fa ? "ارز" : "Currency"}<select value={currency} onChange={(event) => setCurrency(event.target.value)} className={inputClass} dir="ltr">{currencies.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-bold text-ink">{fa ? "نرخ ارز مبنا" : "Functional rate"}<input required value={rate} onChange={(event) => setRate(event.target.value)} className={inputClass} inputMode="decimal" dir="ltr" /></label><div className="lg:col-span-3 flex flex-wrap items-center justify-between gap-3"><p className="m-0 text-xs leading-6 text-muted">{selectedProduct ? (selectedProduct.itemType === "resale" ? (fa ? "این عملیات خرید کالای قابل‌فروش/محموله صادراتی است." : "This is a resale/export goods purchase.") : (fa ? "این عملیات خرید ملزومات مصرفی است؛ تخصیص به محموله در گام بعدی انجام می‌شود." : "This is a supply purchase; allocation to shipments follows in the next step.")) : (fa ? "ابتدا کاتالوگ کالا را تکمیل کنید." : "Create products in the catalog first.")}</p><button className={buttonClass} disabled={busy || !products.length}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}{fa ? "ثبت خرید و ایجاد خودکار سند" : "Save purchase & create journal"}</button></div></form>}
  </section>;
}
