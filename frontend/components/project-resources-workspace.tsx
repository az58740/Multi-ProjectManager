"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Boxes, CirclePlus, LoaderCircle, Pencil, Store, X } from "lucide-react";
import { useLocale } from "@/app/providers";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isLedgerProductList, type LedgerProduct } from "@/lib/ledger";
import { ProjectModal } from "@/components/project-modal";
import type { Project } from "@/lib/projects";

const inputClass = "mt-2 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-60";
const currencies = ["USD", "EUR", "AED", "TRY", "GBP", "CNY", "IRR"] as const;
const emptyProduct = { name: "", itemType: "resale", unit: "kg", currency: "USD", scope: "project", scopeProjectId: "", sharedScope: "project", openingStock: "0", currentStock: "0", isActive: true };
type ProductDraft = typeof emptyProduct;

type CatalogTab = "products" | "supplies" | "new-product" | "new-supply";

export function ProjectResourcesWorkspace({ projects, tab, onTabChange }: { projects: Project[]; tab: CatalogTab; onTabChange: (tab: CatalogTab) => void }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [projectCode, setProjectCode] = useState(projects[0]?.code ?? "");
  const [products, setProducts] = useState<LedgerProduct[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<LedgerProduct | null>(null);
  const [product, setProduct] = useState<ProductDraft>({ ...emptyProduct, scopeProjectId: projects[0]?.id ?? "" });
  const path = `/api/v1/projects/${encodeURIComponent(projectCode)}/ledger`;
  const visibleProducts = products.filter((item) => tab === "supplies" ? item.itemType === "supply" : tab === "products" ? item.itemType === "resale" : true);
  const selectedType = tab === "new-supply" ? "supply" : "resale";

  async function loadProducts() {
    if (!projectCode) return;
    const response = await fetchJsonWithTimeout(`${path}/products`, { cache: "no-store" });
    if (!isLedgerProductList(response.payload)) throw new Error("invalid");
    setProducts(response.payload.items);
  }
  useEffect(() => { void loadProducts().catch(() => setMessage(fa ? "دریافت کالاها انجام نشد." : "Could not load products.")); }, [path, fa]);
  useEffect(() => {
    if (tab === "new-product" || tab === "new-supply") {
      setEditing(null);
      setProduct({ ...emptyProduct, itemType: tab === "new-supply" ? "supply" : "resale", scopeProjectId: projects[0]?.id ?? "" });
      setModal(true);
    }
  }, [tab, projects]);

  function openNew(itemType: "resale" | "supply") { setEditing(null); setProduct({ ...emptyProduct, itemType, scopeProjectId: projects[0]?.id ?? "" }); setModal(true); }
  function openEdit(item: LedgerProduct) { setEditing(item); setProduct({ name: item.name, itemType: item.itemType, unit: item.unit, currency: item.currency, scope: item.scope, scopeProjectId: item.projectId, sharedScope: item.sharedScope, openingStock: item.openingStock, currentStock: item.currentStock, isActive: item.isActive }); setModal(true); }
  function closeModal() { if (!busy) setModal(false); }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const body = { ...product, name: product.name.trim(), unit: product.unit.trim() };
      const response = await fetchWithTimeout(`${path}/products${editing ? `/${encodeURIComponent(editing.id)}` : ""}`, { method: editing ? "PUT" : "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
      if (response.status === 409) throw new Error("duplicate");
      if (!response.ok) throw new Error("save");
      setModal(false); onTabChange(product.itemType === "supply" ? "supplies" : "products"); await loadProducts(); setMessage(fa ? (editing ? "کالا ویرایش شد." : "کالا یا ملزومات ثبت شد.") : (editing ? "Product updated." : "Product or supply saved."));
    } catch (error) { setMessage(error instanceof Error && error.message === "duplicate" ? (fa ? "این کالا قبلاً ثبت شده است." : "This product already exists.") : (fa ? "ثبت یا ویرایش کالا انجام نشد." : "Could not save the product.")); }
    finally { setBusy(false); }
  }

  return <><section id="catalog" className="mt-4 rounded-[24px] border border-line bg-paper p-4 shadow-sm sm:p-5" aria-labelledby="catalog-title"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-amber"><Boxes className="size-4" aria-hidden="true" />{fa ? "مدیریت کالا و ملزومات" : "Products & supplies"}</div><h2 id="catalog-title" className="mb-0 mt-1 text-xl font-black text-forest">{fa ? "کالاها و ملزومات عملیاتی" : "Products and operational supplies"}</h2><p className="mb-0 mt-2 max-w-2xl text-sm leading-7 text-muted">{fa ? "کالاها را ویرایش کنید و موجودی اول سال و موجودی فعلی را ببینید." : "Edit products and monitor opening and current stock."}</p></div><label className="text-xs font-bold text-muted">{fa ? "پروژهٔ مرجع" : "Reference project"}<select value={projectCode} onChange={(event) => setProjectCode(event.target.value)} className={`${inputClass} mt-1 min-w-52`} dir="ltr">{projects.map((project) => <option key={project.id} value={project.code}>{project.name}</option>)}</select></label></div>{message && <p role="status" className="mt-5 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{message}</p>}<div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => openNew(selectedType)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-sage-dark bg-sage px-4 text-xs font-extrabold text-forest"><CirclePlus className="size-4" />{fa ? (selectedType === "supply" ? "تعریف ملزومات" : "تعریف کالا") : (selectedType === "supply" ? "Add supply" : "Add product")}</button></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{visibleProducts.length ? visibleProducts.map((item) => <article key={item.id} className="group rounded-[20px] border border-line bg-cream/50 p-3.5 transition hover:-translate-y-0.5 hover:border-sage-dark hover:bg-white hover:shadow-md hover:shadow-forest/5"><div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center rounded-xl bg-sage text-forest"><Boxes className="size-4" aria-hidden="true" /></span><button type="button" onClick={() => openEdit(item)} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-sage-dark bg-white px-2.5 text-[10px] font-bold text-forest"><Pencil className="size-3" />{fa ? "ویرایش" : "Edit"}</button></div><h3 className="mb-0 mt-3 text-sm font-black text-ink">{item.name}</h3><div className="mt-3 rounded-xl bg-sage/70 p-2 text-[10px] font-bold text-muted"><b className="block text-[9px]">{fa ? "موجودی فعلی" : "Current stock"}</b><strong dir="ltr" className="mt-1 block text-forest">{item.currentStock} {item.unit}</strong></div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted"><span className="rounded-full bg-white/80 px-2 py-1 font-bold">{item.scope === "shared" ? (fa ? "قابل اشتراک همه پروژه‌ها" : "Shared with all projects") : (fa ? "اختصاصی پروژه" : "Project-specific")}</span><span className="rounded-full bg-white/80 px-2 py-1 font-bold">{item.itemType === "resale" ? (fa ? "قابل‌فروش" : "Resale") : (fa ? "ملزومات" : "Supply")}</span><span className="rounded-full bg-white/80 px-2 py-1 font-bold">{item.currency}</span><span className={`rounded-full px-2 py-1 font-bold ${item.isActive ? "bg-sage text-forest" : "bg-stone-200 text-stone-700"}`}>{item.isActive ? (fa ? "فعال" : "Active") : (fa ? "غیرفعال" : "Inactive")}</span></div></article>) : <p className="rounded-2xl border border-dashed border-sage-dark p-6 text-sm text-muted">{fa ? "کالایی ثبت نشده است." : "No products yet."}</p>}</div></section>{modal && <ProjectModal title={fa ? (editing ? "ویرایش کالا یا ملزومات" : "تعریف کالا یا ملزومات") : (editing ? "Edit product or supply" : "Define product or supply")} onClose={closeModal}><button type="button" onClick={closeModal} className="sr-only" aria-label={fa ? "بستن فرم" : "Close form"}><X /></button><form onSubmit={(event) => void saveProduct(event)} className="space-y-4"><label className="block text-xs font-bold">{fa ? "نام" : "Name"}<input required value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} className={inputClass} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{fa ? "نوع" : "Type"}<select value={product.itemType} onChange={(event) => setProduct({ ...product, itemType: event.target.value })} className={inputClass}><option value="resale">{fa ? "قابل‌فروش / صادراتی" : "Resale / export"}</option><option value="supply">{fa ? "ملزومات مصرفی" : "Operational supply"}</option></select></label><label className="text-xs font-bold">{fa ? "واحد" : "Unit"}<input required value={product.unit} onChange={(event) => setProduct({ ...product, unit: event.target.value })} className={inputClass} /></label></div><label className="block text-xs font-bold">{fa ? "دامنه کالا" : "Product scope"}<select value={product.scope === "shared" ? "shared" : `project:${product.scopeProjectId || projects[0]?.id || ""}`} onChange={(event) => { const next = event.target.value; setProduct({ ...product, scope: next === "shared" ? "shared" : "project", scopeProjectId: next === "shared" ? "" : next.replace("project:", ""), sharedScope: next === "shared" ? "all" : "project" }); }} className={inputClass}><optgroup label={fa ? "اختصاصی پروژه" : "Project-specific"}>{projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}</optgroup><option value="shared">{fa ? "مشترک همه پروژه‌ها" : "Shared with all projects"}</option></select></label><label className="block text-xs font-bold">{fa ? "وضعیت" : "Status"}<select value={product.isActive ? "active" : "inactive"} onChange={(event) => setProduct({ ...product, isActive: event.target.value === "active" })} className={inputClass}><option value="active">{fa ? "فعال" : "Active"}</option><option value="inactive">{fa ? "غیرفعال" : "Inactive"}</option></select></label><label className="block text-xs font-bold">{fa ? "ارز" : "Currency"}<select value={product.currency} onChange={(event) => setProduct({ ...product, currency: event.target.value })} className={inputClass} dir="ltr">{currencies.map((item) => <option key={item}>{item}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{fa ? "موجودی اول سال" : "Opening stock"}<input required value={product.openingStock} onChange={(event) => setProduct({ ...product, openingStock: event.target.value })} className={inputClass} inputMode="decimal" dir="ltr" /></label><label className="text-xs font-bold">{fa ? "موجودی فعلی" : "Current stock"}<input required value={product.currentStock} onChange={(event) => setProduct({ ...product, currentStock: event.target.value })} className={inputClass} inputMode="decimal" dir="ltr" /></label></div><div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeModal} className="min-h-11 rounded-full border border-line px-5 text-sm font-bold text-muted">{fa ? "انصراف" : "Cancel"}</button><button disabled={busy || !projectCode} className={buttonClass}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ذخیره کالا" : "Save product"}</button></div></form></ProjectModal>}</>;
}
