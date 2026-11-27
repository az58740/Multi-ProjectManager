"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Boxes, CirclePlus, LoaderCircle, PackageOpen, RotateCcw, Search, SlidersHorizontal, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/app/providers";
import { jsonHeaders } from "@/lib/accounts";
import { exportMessages } from "@/lib/export-i18n";
import { asciiNumber, COUNTERPARTY_ROLES, isCounterparty, isListOf, isShipment, SHIPMENT_STATUSES, type Counterparty, type CounterpartyInput, type CounterpartyRole, type Shipment, type ShipmentInput, type ShipmentStatus } from "@/lib/export-records";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { ProjectModal } from "@/components/project-modal";

type ListState<T> = { status: "loading" | "error" | "ready"; items: T[] };
type SaveKind = "counterparty" | "shipment";
type FormError = "requiredName" | "requiredRole" | "requiredReference" | "requiredSupplier" | "invalidPallets" | "invalidWeight";
const inputClass = "mt-2 min-h-10 w-full rounded-2xl border border-line bg-white px-3 text-xs font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const labelClass = "block text-xs font-bold text-ink";
const submitClass = "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-forest px-4 text-xs font-extrabold text-white transition hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-60";

function Required() { return <span className="ms-1 text-red-700" aria-hidden="true">*</span>; }
function Optional({ text }: { text: string }) { return <span className="ms-2 text-xs font-normal text-muted">({text})</span>; }

function CounterpartyForm({ busy, saveError, onSave }: { busy: boolean; saveError: boolean; onSave: (input: CounterpartyInput) => Promise<boolean> }) {
  const { locale } = useLocale();
  const m = exportMessages[locale];
  const [error, setError] = useState<FormError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const roles = data.getAll("roles").filter((role): role is CounterpartyRole => typeof role === "string" && (COUNTERPARTY_ROLES as readonly string[]).includes(role));
    if (!name) { setError("requiredName"); return; }
    if (!roles.length) { setError("requiredRole"); return; }
    setError(null);
    const saved = await onSave({ name, roles, phone: String(data.get("phone") ?? "").trim(), country: String(data.get("country") ?? "").trim(), notes: String(data.get("notes") ?? "").trim() });
    if (saved) form.reset();
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-busy={busy} className="space-y-4">
      {(error || saveError) && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error ? m[error] : m.counterpartySaveError}</p>}
      <label className={labelClass}>{m.name}<Required /><input name="name" required maxLength={120} autoComplete="organization" className={inputClass} /></label>
      <fieldset className="m-0 border-0 p-0"><legend className={labelClass}>{m.roles}<Required /></legend><div className="mt-2 flex flex-wrap gap-2">{COUNTERPARTY_ROLES.map((role) => <label key={role} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink"><input type="checkbox" name="roles" value={role} className="size-4 accent-forest" />{m[role]}</label>)}</div></fieldset>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <label className={labelClass}>{m.phone}<Optional text={m.optional} /><input name="phone" type="tel" maxLength={120} autoComplete="tel" className={inputClass} /></label>
        <label className={labelClass}>{m.country}<Optional text={m.optional} /><input name="country" maxLength={120} className={inputClass} /></label>
      </div>
      <label className={labelClass}>{m.notes}<Optional text={m.optional} /><textarea name="notes" rows={3} maxLength={1000} className={`${inputClass} min-h-24 resize-y py-3`} /></label>
      <button type="submit" disabled={busy} className={submitClass}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CirclePlus className="size-4" aria-hidden="true" />}{busy ? m.saving : m.saveCounterparty}</button>
    </form>
  );
}

function ShipmentForm({ suppliers, supplierStatus, busy, saveError, onSave }: { suppliers: Counterparty[]; supplierStatus: ListState<Counterparty>["status"]; busy: boolean; saveError: boolean; onSave: (input: ShipmentInput) => Promise<boolean> }) {
  const { locale } = useLocale();
  const m = exportMessages[locale];
  const [error, setError] = useState<FormError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const reference = String(data.get("reference") ?? "").trim();
    const supplierId = String(data.get("supplierId") ?? "");
    const pallets = asciiNumber(String(data.get("palletCount") ?? ""));
    const weightKg = asciiNumber(String(data.get("weightKg") ?? ""));
    const destination = String(data.get("destination") ?? "").trim();
    const status = String(data.get("status") ?? "planning");
    if (!reference) { setError("requiredReference"); return; }
    if (!suppliers.some((supplier) => supplier.id === supplierId)) { setError("requiredSupplier"); return; }
    if (!/^\d+$/.test(pallets) || !Number.isSafeInteger(Number(pallets)) || Number(pallets) < 1) { setError("invalidPallets"); return; }
    if (!/^\d+(?:\.\d+)?$/.test(weightKg) || !/[1-9]/.test(weightKg)) { setError("invalidWeight"); return; }
    if (!(SHIPMENT_STATUSES as readonly string[]).includes(status)) return;
    setError(null);
    const saved = await onSave({ reference, supplierId, palletCount: Number(pallets), weightKg, destination, status: status as ShipmentStatus, notes: String(data.get("notes") ?? "").trim() });
    if (saved) form.reset();
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-busy={busy} className="space-y-4">
      {(error || saveError) && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error ? m[error] : m.shipmentSaveError}</p>}
      <label className={labelClass}>{m.reference}<Required /><input name="reference" required maxLength={120} className={inputClass} /></label>
      <label className={labelClass}>{m.supplierLabel}<Required /><select name="supplierId" defaultValue="" required disabled={supplierStatus !== "ready" || !suppliers.length} className={`${inputClass} disabled:bg-cream`}><option value="">{m.selectSupplier}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      {supplierStatus === "loading" && <p role="status" className="m-0 text-xs leading-6 text-muted">{m.loading}</p>}
      {supplierStatus === "error" && <p className="m-0 text-xs leading-6 text-red-800">{m.suppliersUnavailable}</p>}
      {supplierStatus === "ready" && !suppliers.length && <p className="m-0 rounded-xl bg-amber-soft p-3 text-xs leading-6 text-[#735722]">{m.noSuppliers}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <label className={labelClass}>{m.palletCount}<Required /><input name="palletCount" required inputMode="numeric" maxLength={15} className={inputClass} /></label>
        <label className={labelClass}>{m.weightKg}<Required /><input name="weightKg" required inputMode="decimal" maxLength={24} className={inputClass} /></label>
      </div>
      <label className={labelClass}>{m.destination}<Optional text={m.optional} /><input name="destination" maxLength={120} className={inputClass} /></label>
      <label className={labelClass}>{m.status}<select name="status" defaultValue="planning" className={inputClass}>{SHIPMENT_STATUSES.map((status) => <option key={status} value={status}>{m[status]}</option>)}</select></label>
      <label className={labelClass}>{m.notes}<Optional text={m.optional} /><textarea name="notes" rows={3} maxLength={1000} className={`${inputClass} min-h-24 resize-y py-3`} /></label>
      <button type="submit" disabled={busy || supplierStatus !== "ready" || !suppliers.length} className={submitClass}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CirclePlus className="size-4" aria-hidden="true" />}{busy ? m.saving : m.saveShipment}</button>
    </form>
  );
}

export function ExportWorkspace({ code }: { code: string }) {
  const { locale } = useLocale();
  const m = exportMessages[locale];
  const router = useRouter();
  const [area, setArea] = useState<"counterparties" | "shipments">("counterparties");
  const [counterparties, setCounterparties] = useState<ListState<Counterparty>>({ status: "loading", items: [] });
  const [shipments, setShipments] = useState<ListState<Shipment>>({ status: "loading", items: [] });
  const [busy, setBusy] = useState<SaveKind | null>(null);
  const busyRef = useRef(false);
  const [saveError, setSaveError] = useState<SaveKind | null>(null);
  const [notice, setNotice] = useState<SaveKind | null>(null);
  const [formModal, setFormModal] = useState<SaveKind | null>(null);
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<ShipmentStatus | "all">("all");
  const [shipmentDestinationFilter, setShipmentDestinationFilter] = useState("");
  const [shipmentReferenceFilter, setShipmentReferenceFilter] = useState("");
  const [shipmentSupplierFilter, setShipmentSupplierFilter] = useState("all");
  const [shipmentMinWeight, setShipmentMinWeight] = useState("");
  const [shipmentMaxWeight, setShipmentMaxWeight] = useState("");
  const [counterpartySearch, setCounterpartySearch] = useState("");
  const [counterpartyRoleFilter, setCounterpartyRoleFilter] = useState<CounterpartyRole | "all">("all");
  const [counterpartyCountryFilter, setCounterpartyCountryFilter] = useState("");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const path = `/api/v1/projects/${encodeURIComponent(code)}/export`;

  const loadCounterparties = useCallback(async () => {
    setCounterparties((current) => ({ ...current, status: "loading" }));
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${path}/counterparties`, { cache: "no-store" });
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) throw new Error("counterparties unavailable");
      if (!isListOf(payload, isCounterparty)) throw new Error("invalid response");
      setCounterparties({ status: "ready", items: payload.items });
    } catch { setCounterparties((current) => ({ ...current, status: "error" })); }
  }, [path, router]);

  const loadShipments = useCallback(async () => {
    setShipments((current) => ({ ...current, status: "loading" }));
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${path}/shipments`, { cache: "no-store" });
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) throw new Error("shipments unavailable");
      if (!isListOf(payload, isShipment)) throw new Error("invalid response");
      setShipments({ status: "ready", items: payload.items });
    } catch { setShipments((current) => ({ ...current, status: "error" })); }
  }, [path, router]);

  useEffect(() => { void loadCounterparties(); void loadShipments(); }, [loadCounterparties, loadShipments]);

  async function save(kind: SaveKind, input: CounterpartyInput | ShipmentInput): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(kind); setSaveError(null); setNotice(null);
    try {
      const resource = kind === "counterparty" ? "counterparties" : "shipments";
      const response = await fetchWithTimeout(`${path}/${resource}`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(input) });
      if (response.status === 401) { router.replace("/login"); return false; }
      if (!response.ok) throw new Error("save failed");
      setNotice(kind);
      // A successful save remains successful even if the subsequent refresh fails.
      await (kind === "counterparty" ? loadCounterparties() : loadShipments());
      return true;
    } catch {
      // The server may have saved the record even if its response was lost.
      // Refresh the list and ask the user to check it before retrying.
      setSaveError(kind);
      await (kind === "counterparty" ? loadCounterparties() : loadShipments());
      return false;
    }
    finally { busyRef.current = false; setBusy(null); }
  }

  const suppliers = counterparties.items.filter((item) => item.roles.includes("supplier"));
  const count = <T,>(state: ListState<T>) => state.status === "ready" ? state.items.length.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") : state.status === "loading" ? m.countLoading : m.countUnavailable;
  const normalize = (value: string) => value.trim().toLocaleLowerCase(locale === "fa" ? "fa-IR" : "en-US");
  const normalizedDestination = normalize(shipmentDestinationFilter);
  const normalizedReference = normalize(shipmentReferenceFilter);
  const normalizedCounterpartySearch = normalize(counterpartySearch);
  const normalizedCountry = normalize(counterpartyCountryFilter);
  const minWeight = Number(shipmentMinWeight);
  const maxWeight = Number(shipmentMaxWeight);
  const filteredShipments = shipments.items.filter((item) => {
    if (shipmentStatusFilter !== "all" && item.status !== shipmentStatusFilter) return false;
    if (shipmentSupplierFilter !== "all" && item.supplierId !== shipmentSupplierFilter) return false;
    if (normalizedReference && !normalize(item.reference).includes(normalizedReference)) return false;
    if (normalizedDestination && !normalize(item.destination).includes(normalizedDestination)) return false;
    if (shipmentMinWeight.trim() && (!Number.isFinite(minWeight) || Number(item.weightKg) < minWeight)) return false;
    if (shipmentMaxWeight.trim() && (!Number.isFinite(maxWeight) || Number(item.weightKg) > maxWeight)) return false;
    return true;
  });
  const filteredCounterparties = counterparties.items.filter((item) => {
    if (counterpartyRoleFilter !== "all" && !item.roles.includes(counterpartyRoleFilter)) return false;
    if (normalizedCounterpartySearch && ![item.name, item.phone, item.country, item.notes].some((value) => normalize(value).includes(normalizedCounterpartySearch))) return false;
    if (normalizedCountry && !normalize(item.country).includes(normalizedCountry)) return false;
    return true;
  });
  const clearFilters = () => { setShipmentStatusFilter("all"); setShipmentDestinationFilter(""); setShipmentReferenceFilter(""); setShipmentSupplierFilter("all"); setShipmentMinWeight(""); setShipmentMaxWeight(""); setCounterpartySearch(""); setCounterpartyRoleFilter("all"); setCounterpartyCountryFilter(""); };
  const selectedState = area === "counterparties" ? { ...counterparties, items: filteredCounterparties } : { ...shipments, items: filteredShipments };

  return (
    <>
      <section className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={m.records}>
        {([{ key: "counterparties", icon: UsersRound, label: m.counterparties, description: m.counterpartiesSummary, count: count(counterparties) }, { key: "shipments", icon: Boxes, label: m.shipments, description: m.shipmentsSummary, count: count(shipments) }] as const).map(({ key, icon: Icon, label, description, count: value }) => (
          <button key={key} type="button" onClick={() => setArea(key)} aria-pressed={area === key} className={`flex min-w-0 items-center gap-2 rounded-[20px] border p-3 text-start transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest ${area === key ? "border-sage-dark bg-sage" : "border-line bg-paper hover:border-sage-dark"}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/75 text-forest"><Icon className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-black text-forest">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-muted">{description}</span></span>
            <span className="text-sm font-black text-forest" aria-live="polite">{value}</span>
          </button>
        ))}
      </section>

      {notice && <div role="status" className="mt-5 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{notice === "counterparty" ? m.counterpartySaved : m.shipmentSaved}</div>}
      <section className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 rounded-[22px] border border-line bg-paper p-3.5 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3"><div><p className="m-0 text-xs font-extrabold text-amber">{m.sectionLabel}</p><h2 className="mb-0 mt-1 text-base font-black text-forest sm:text-xl">{area === "counterparties" ? m.counterpartyTitle : m.shipmentTitle}</h2><p className="mb-0 mt-1 text-xs leading-5 text-muted">{area === "counterparties" ? m.counterpartyDescription : m.shipmentDescription}</p></div><span className="rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-muted">{area === "counterparties" ? (selectedState.status === "ready" ? filteredCounterparties.length.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") : count(counterparties)) : selectedState.status === "ready" ? filteredShipments.length.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") : count(shipments)}</span></div>
          {selectedState.status === "ready" && <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-2.5" aria-label={locale === "fa" ? "فیلترهای جستجوی پیشرفته" : "Advanced search filters"}><button type="button" onClick={() => setAdvancedFiltersOpen((value) => !value)} className="flex min-h-9 w-full items-center gap-2 text-start text-[11px] font-extrabold text-sky-950"><SlidersHorizontal className="size-4" aria-hidden="true" />{locale === "fa" ? "فیلترهای جستجوی پیشرفته" : "Advanced search filters"}<span className="ms-auto text-xs">{advancedFiltersOpen ? "▲" : "▼"}</span></button>{advancedFiltersOpen && <div className="mt-2 grid gap-2 border-t border-sky-200 pt-2 sm:grid-cols-2 lg:grid-cols-3"><label className="text-[10px] font-extrabold text-sky-950"><span>{area === "shipments" ? (locale === "fa" ? "شماره مرجع" : "Reference") : (locale === "fa" ? "نام، تلفن یا یادداشت" : "Name, phone or notes")}</span><div className="relative"><Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><input value={area === "shipments" ? shipmentReferenceFilter : counterpartySearch} onChange={(event) => area === "shipments" ? setShipmentReferenceFilter(event.target.value) : setCounterpartySearch(event.target.value)} className="min-h-9 w-full rounded-xl border border-sky-200 bg-white pe-2 ps-7 text-[11px] font-medium text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-sky-200" placeholder={locale === "fa" ? "جست‌وجو..." : "Search..."} /></div></label>{area === "shipments" ? <><label className="text-[10px] font-extrabold text-sky-950"><span>{locale === "fa" ? "وضعیت" : "Status"}</span><select value={shipmentStatusFilter} onChange={(event) => setShipmentStatusFilter(event.target.value as ShipmentStatus | "all")} className="mt-1 min-h-9 w-full rounded-xl border border-sky-200 bg-white px-2 text-[11px] font-bold text-sky-950 outline-none focus:ring-2 focus:ring-sky-200"><option value="all">{locale === "fa" ? "همه وضعیت‌ها" : "All statuses"}</option>{SHIPMENT_STATUSES.map((status) => <option key={status} value={status}>{m[status]}</option>)}</select></label><label className="text-[10px] font-extrabold text-sky-950"><span>{locale === "fa" ? "تأمین‌کننده" : "Supplier"}</span><select value={shipmentSupplierFilter} onChange={(event) => setShipmentSupplierFilter(event.target.value)} className="mt-1 min-h-9 w-full rounded-xl border border-sky-200 bg-white px-2 text-[11px] font-bold text-sky-950 outline-none focus:ring-2 focus:ring-sky-200"><option value="all">{locale === "fa" ? "همه تأمین‌کنندگان" : "All suppliers"}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="text-[10px] font-extrabold text-sky-950"><span>{locale === "fa" ? "مقصد" : "Destination"}</span><input value={shipmentDestinationFilter} onChange={(event) => setShipmentDestinationFilter(event.target.value)} className="mt-1 min-h-9 w-full rounded-xl border border-sky-200 bg-white px-2 text-[11px] font-medium text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-sky-200" placeholder={locale === "fa" ? "مثلاً دبی" : "e.g. Dubai"} /></label><label className="text-[10px] font-extrabold text-sky-950"><span>{locale === "fa" ? "حداقل وزن (کیلوگرم)" : "Min weight (kg)"}</span><input value={shipmentMinWeight} onChange={(event) => setShipmentMinWeight(event.target.value)} inputMode="decimal" dir="ltr" className="mt-1 min-h-9 w-full rounded-xl border border-sky-200 bg-white px-2 text-[11px] text-ink outline-none focus:ring-2 focus:ring-sky-200" /></label><label className="text-[10px] font-extrabold text-sky-950"><span>{locale === "fa" ? "حداکثر وزن (کیلوگرم)" : "Max weight (kg)"}</span><input value={shipmentMaxWeight} onChange={(event) => setShipmentMaxWeight(event.target.value)} inputMode="decimal" dir="ltr" className="mt-1 min-h-9 w-full rounded-xl border border-sky-200 bg-white px-2 text-[11px] text-ink outline-none focus:ring-2 focus:ring-sky-200" /></label></> : <><label className="text-[10px] font-extrabold text-sky-950"><span>{locale === "fa" ? "نقش" : "Role"}</span><select value={counterpartyRoleFilter} onChange={(event) => setCounterpartyRoleFilter(event.target.value as CounterpartyRole | "all")} className="mt-1 min-h-9 w-full rounded-xl border border-sky-200 bg-white px-2 text-[11px] font-bold text-sky-950 outline-none focus:ring-2 focus:ring-sky-200"><option value="all">{locale === "fa" ? "همه نقش‌ها" : "All roles"}</option>{COUNTERPARTY_ROLES.map((role) => <option key={role} value={role}>{m[role]}</option>)}</select></label><label className="text-[10px] font-extrabold text-sky-950"><span>{locale === "fa" ? "کشور" : "Country"}</span><input value={counterpartyCountryFilter} onChange={(event) => setCounterpartyCountryFilter(event.target.value)} className="mt-1 min-h-9 w-full rounded-xl border border-sky-200 bg-white px-2 text-[11px] text-ink outline-none focus:ring-2 focus:ring-sky-200" placeholder={locale === "fa" ? "مثلاً امارات" : "e.g. UAE"} /></label></>}<button type="button" onClick={clearFilters} className="mt-1 inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-sky-300 bg-white px-3 text-[10px] font-extrabold text-sky-950 hover:bg-sky-100"><RotateCcw className="size-3.5" />{locale === "fa" ? "پاک‌سازی فیلترها" : "Clear filters"}</button></div>}</div>}
          {selectedState.status === "loading" ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" />{m.loading}</div> : selectedState.status === "error" ? <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-800">{area === "counterparties" ? m.counterpartyLoadError : m.shipmentLoadError}<button type="button" onClick={() => void (area === "counterparties" ? loadCounterparties() : loadShipments())} className="ms-2 font-bold underline">{m.retry}</button></div> : selectedState.items.length === 0 ? <div className="mt-5 flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-sage-dark bg-cream/70 px-5 py-8 text-center"><PackageOpen className="size-8 text-forest/60" aria-hidden="true" /><p className="mb-0 mt-3 text-sm font-extrabold text-forest">{area === "counterparties" ? m.noCounterparties : m.noShipments}</p><p className="mb-0 mt-2 text-xs leading-6 text-muted">{area === "counterparties" ? m.noCounterpartiesHint : m.noShipmentsHint}</p></div> : area === "counterparties" ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{filteredCounterparties.map((item) => <article key={item.id} className="min-w-0 rounded-2xl border border-line bg-white p-3"><h3 className="m-0 break-words text-sm font-black text-forest">{item.name}</h3><div className="mt-3 flex flex-wrap gap-1.5">{item.roles.map((role) => <span key={role} className="rounded-full bg-sage px-2.5 py-1 text-xs font-bold text-forest">{m[role]}</span>)}</div>{(item.phone || item.country) && <dl className="mb-0 mt-4 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted">{m.phone}</dt><dd dir="auto" className="m-0 break-all font-semibold text-ink">{item.phone || "—"}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">{m.country}</dt><dd className="m-0 break-words font-semibold text-ink">{item.country || "—"}</dd></div></dl>}{item.notes && <p className="mb-0 mt-3 whitespace-pre-wrap break-words border-t border-line pt-3 text-xs leading-6 text-muted">{item.notes}</p>}</article>)}</div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{shipments.items.map((item) => <article key={item.id} className="min-w-0 rounded-2xl border border-line bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="m-0 break-all text-base font-black text-forest">{item.reference}</h3><span className="rounded-full bg-amber-soft px-2.5 py-1 text-xs font-bold text-[#735722]">{m[item.status]}</span></div><dl className="mb-0 mt-4 space-y-2 text-xs">{[[m.supplierLabel, counterparties.status === "ready" ? counterparties.items.find((supplier) => supplier.id === item.supplierId)?.name || m.unknownSupplier : counterparties.status === "loading" ? m.countLoading : m.countUnavailable], [m.destination, item.destination], [m.palletCount, item.palletCount.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")], [m.weightKg, item.weightKg]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="shrink-0 text-muted">{label}</dt><dd dir="auto" className="m-0 break-words text-end font-semibold text-ink">{value || "—"}</dd></div>)}</dl>{item.notes && <p className="mb-0 mt-3 whitespace-pre-wrap break-words border-t border-line pt-3 text-xs leading-6 text-muted">{item.notes}</p>}</article>)}</div>
          )}
        </div>
        <aside className="rounded-[22px] border border-line bg-paper p-4 sm:p-5"><p className="m-0 text-xs font-extrabold uppercase tracking-[0.14em] text-amber">{m.sectionLabel}</p><h2 className="m-0 mt-1 text-base font-black text-forest">{area === "counterparties" ? m.addCounterparty : m.addShipment}</h2><p className="mb-4 mt-2 text-xs leading-6 text-muted">{area === "counterparties" ? m.counterpartyFormDescription : m.shipmentFormDescription}</p><button type="button" onClick={() => setFormModal(area === "counterparties" ? "counterparty" : "shipment")} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-forest px-4 text-xs font-extrabold text-white"><CirclePlus className="size-4" />{area === "counterparties" ? m.addCounterparty : m.addShipment}</button></aside>
      </section>
      {formModal && <ProjectModal title={formModal === "counterparty" ? m.addCounterparty : m.addShipment} onClose={() => setFormModal(null)}>{formModal === "counterparty" ? <CounterpartyForm busy={busy !== null} saveError={saveError === "counterparty"} onSave={(input) => save("counterparty", input)} /> : <ShipmentForm suppliers={suppliers} supplierStatus={counterparties.status} busy={busy !== null} saveError={saveError === "shipment"} onSave={(input) => save("shipment", input)} />}</ProjectModal>}
    </>
  );
}
