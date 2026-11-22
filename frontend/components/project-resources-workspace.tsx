"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Boxes, CirclePlus, LoaderCircle, X } from "lucide-react";
import { useLocale } from "@/app/providers";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isLedgerProductList, type LedgerProduct } from "@/lib/ledger";
import { ProjectModal } from "@/components/project-modal";
import type { Project } from "@/lib/projects";

const inputClass = "mt-2 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-60";
const currencies = ["USD", "EUR", "AED", "TRY", "GBP", "CNY", "IRR"] as const;

export function ProjectResourcesWorkspace({ projects }: { projects: Project[] }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [projectCode, setProjectCode] = useState(projects[0]?.code ?? "");
  const [products, setProducts] = useState<LedgerProduct[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [product, setProduct] = useState({ code: "", name: "", itemType: "resale", unit: "kg", currency: "USD" });
  const path = `/api/v1/projects/${encodeURIComponent(projectCode)}/ledger`;

  async function loadProducts() {
    if (!projectCode) return;
    const response = await fetchJsonWithTimeout(`${path}/products`, { cache: "no-store" });
    if (!isLedgerProductList(response.payload)) throw new Error("invalid");
    setProducts(response.payload.items);
  }

  useEffect(() => {
    void loadProducts().catch(() => setMessage(fa ? "دریافت کالاها انجام نشد." : "Could not load products."));
  }, [path, fa]);

  function resetAndClose() {
    setModal(false);
    setProduct((current) => ({ ...current, code: "", name: "" }));
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetchWithTimeout(`${path}/products`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ ...product, code: product.code.trim().toUpperCase(), name: product.name.trim() }),
      });
      if (response.status === 409) throw new Error("duplicate");
      if (!response.ok) throw new Error("save");
      resetAndClose();
      await loadProducts();
      setMessage(fa ? "کالا یا ملزومات ثبت شد." : "Product or supply saved.");
    } catch (error) {
      setMessage(error instanceof Error && error.message === "duplicate" ? (fa ? "کد کالا تکراری است." : "Product code already exists.") : (fa ? "ثبت کالا انجام نشد." : "Product could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section id="catalog" className="mt-6 rounded-[28px] border border-line bg-paper p-5 shadow-sm sm:p-7" aria-labelledby="catalog-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-amber"><Boxes className="size-4" aria-hidden="true" />{fa ? "مدیریت کالا و ملزومات" : "Products & supplies"}</div>
          <h2 id="catalog-title" className="mb-0 mt-2 text-2xl font-black text-forest">{fa ? "کالاها و ملزومات عملیاتی" : "Products and operational supplies"}</h2>
          <p className="mb-0 mt-2 max-w-2xl text-sm leading-7 text-muted">{fa ? "کالاهای قابل‌فروش و ملزومات مصرفی را در کاتالوگ مرکزی تعریف کنید." : "Define resale products and operational supplies in the central catalog."}</p>
        </div>
        <label className="text-xs font-bold text-muted">{fa ? "پروژهٔ مرجع" : "Reference project"}
          <select value={projectCode} onChange={(event) => setProjectCode(event.target.value)} className={`${inputClass} mt-1 min-w-52`} dir="ltr">
            {projects.map((project) => <option key={project.id} value={project.code}>{project.code} — {project.name}</option>)}
          </select>
        </label>
      </div>
      {message && <p role="status" className="mt-5 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{message}</p>}
      <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => setModal(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-sage-dark bg-sage px-5 text-sm font-extrabold text-forest transition hover:bg-sage-dark"><CirclePlus className="size-4" />{fa ? "تعریف کالا/ملزومات" : "Add product/supply"}</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {products.length ? products.map((item) => <article key={item.id} className="group rounded-[20px] border border-line bg-cream/50 p-3.5 transition hover:-translate-y-0.5 hover:border-sage-dark hover:bg-white hover:shadow-md hover:shadow-forest/5"><div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center rounded-xl bg-sage text-forest"><Boxes className="size-4" aria-hidden="true" /></span><span dir="ltr" className="rounded-full bg-white/80 px-2 py-1 font-mono text-[10px] font-black text-forest">{item.code}</span></div><h3 className="mb-0 mt-3 text-sm font-black text-ink">{item.name}</h3><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted"><span className="rounded-full bg-white/80 px-2 py-1 font-bold">{item.itemType === "resale" ? (fa ? "قابل‌فروش" : "Resale") : (fa ? "ملزومات" : "Supply")}</span><span className="rounded-full bg-white/80 px-2 py-1 font-bold">{item.unit}</span><span dir="ltr" className="rounded-full bg-white/80 px-2 py-1 font-bold">{item.currency}</span></div></article>) : <p className="rounded-2xl border border-dashed border-sage-dark p-6 text-sm text-muted">{fa ? "کالایی ثبت نشده است." : "No products yet."}</p>}
      </div>
    </section>
    {modal && <ProjectModal title={fa ? "تعریف کالا یا ملزومات" : "Define product or supply"} onClose={() => { if (!busy) setModal(false); }}><button type="button" onClick={() => { if (!busy) setModal(false); }} className="sr-only" aria-label={fa ? "بستن فرم" : "Close form"}><X /></button><form onSubmit={(event) => void saveProduct(event)} className="space-y-4"><label className="block text-xs font-bold">{fa ? "کد کالا" : "SKU"}<input required value={product.code} onChange={(event) => setProduct({ ...product, code: event.target.value })} className={inputClass} dir="ltr" /></label><label className="block text-xs font-bold">{fa ? "نام" : "Name"}<input required value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} className={inputClass} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{fa ? "نوع" : "Type"}<select value={product.itemType} onChange={(event) => setProduct({ ...product, itemType: event.target.value })} className={inputClass}><option value="resale">{fa ? "قابل‌فروش / صادراتی" : "Resale / export"}</option><option value="supply">{fa ? "ملزومات مصرفی" : "Operational supply"}</option></select></label><label className="text-xs font-bold">{fa ? "واحد" : "Unit"}<input required value={product.unit} onChange={(event) => setProduct({ ...product, unit: event.target.value })} className={inputClass} /></label></div><label className="block text-xs font-bold">{fa ? "ارز" : "Currency"}<select value={product.currency} onChange={(event) => setProduct({ ...product, currency: event.target.value })} className={inputClass} dir="ltr">{currencies.map((item) => <option key={item}>{item}</option>)}</select></label><div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setModal(false)} className="min-h-11 rounded-full border border-line px-5 text-sm font-bold text-muted">{fa ? "انصراف" : "Cancel"}</button><button disabled={busy || !projectCode} className={buttonClass}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ثبت کالا" : "Save product"}</button></div></form></ProjectModal>}
  </>;
}
