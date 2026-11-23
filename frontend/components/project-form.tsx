"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useLocale } from "@/app/providers";
import type { ProjectFormInitialValues } from "@/components/project-create-types";
import { CURRENCY_CODES, PROJECT_STATUSES, PROJECT_TYPES, isProjectStatus, isProjectType, type ProjectStatus, type ProjectType, type ProjectWritePayload } from "@/lib/projects";

const inputClass = "mt-2 min-h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm font-medium text-ink outline-none transition placeholder:text-muted focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const labelClass = "block text-sm font-bold text-ink";
const sectionClass = "rounded-2xl border border-line bg-white/60 p-4 sm:p-5";

type Props = {
  initial?: ProjectFormInitialValues;
  isEdit: boolean;
  busy: boolean;
  error: string;
  onSubmit: (payload: ProjectWritePayload) => void;
  onCancel: () => void;
  currencyNote?: string;
};

export function ProjectForm({ initial, isEdit, busy, error, onSubmit, onCancel, currencyNote }: Props) {
  const { locale, t } = useLocale();
  const initialType = initial?.type ?? "export";
  const [type, setType] = useState<ProjectType>(initialType);
  const [costCurrency, setCostCurrency] = useState(initial?.defaultCostCurrency ?? "");
  const [salesCurrency, setSalesCurrency] = useState(initial?.defaultSalesCurrency ?? "");
  const [customCost, setCustomCost] = useState(initial?.defaultCostCurrency && !CURRENCY_CODES.includes(initial.defaultCostCurrency as (typeof CURRENCY_CODES)[number]) ? initial.defaultCostCurrency : "");
  const [customSales, setCustomSales] = useState(initial?.defaultSalesCurrency && !CURRENCY_CODES.includes(initial.defaultSalesCurrency as (typeof CURRENCY_CODES)[number]) ? initial.defaultSalesCurrency : "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const isFa = locale === "fa";

  const costSelectValue = useMemo(() => CURRENCY_CODES.includes(costCurrency as (typeof CURRENCY_CODES)[number]) ? costCurrency : costCurrency ? "custom" : "", [costCurrency]);
  const salesSelectValue = useMemo(() => CURRENCY_CODES.includes(salesCurrency as (typeof CURRENCY_CODES)[number]) ? salesCurrency : salesCurrency ? "custom" : "", [salesCurrency]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const rawType = String(values.get("type") ?? "export");
    const rawStatus = String(values.get("status") ?? "planning");
    if (!isProjectType(rawType) || !isProjectStatus(rawStatus)) return;
    const customCostValue = String(values.get("customCostCurrency") ?? "").trim().toUpperCase();
    const customSalesValue = String(values.get("customSalesCurrency") ?? "").trim().toUpperCase();
    const cost = String(values.get("costCurrency") ?? "");
    const sales = String(values.get("salesCurrency") ?? "");
    onSubmit({
      name: String(values.get("name") ?? "").trim(),
      type: rawType,
      location: String(values.get("location") ?? "").trim(),
      destination: String(values.get("destination") ?? "").trim(),
      manager: String(values.get("manager") ?? "").trim(),
      accountant: String(values.get("accountant") ?? "").trim(),
      status: rawStatus,
      startDate: String(values.get("startDate") ?? ""),
      endDate: String(values.get("endDate") ?? ""),
      description: String(values.get("description") ?? "").trim(),
      defaultCostCurrency: rawType === "export" ? (cost === "custom" ? customCostValue : cost) : "",
      defaultSalesCurrency: rawType === "export" ? (sales === "custom" ? customSalesValue : sales) : "",
    });
  }

  const typeLabels: Record<ProjectType, string> = {
    export: t.typeExport,
    "cold-storage": t.typeColdStorage,
    sorting: t.typeSorting,
    construction: t.typeConstruction,
    rental: t.typeRental,
    "personal-account": t.typePersonalAccount,
    other: t.typeOther,
  };
  const statusLabels: Record<ProjectStatus, string> = {
    planning: t.statusPlanning,
    active: t.statusActive,
    paused: t.statusPaused,
    completed: t.statusCompleted,
  };

  function currencySelector(name: "costCurrency" | "salesCurrency", value: string, setValue: (next: string) => void, customName: "customCostCurrency" | "customSalesCurrency", customValue: string, setCustomValue: (next: string) => void, label: string) {
    const customId = `${customName}-field`;
    return (
      <div>
        <label htmlFor={`${name}-field`} className={labelClass}>{label}<span className="ms-2 text-xs font-normal text-muted">({t.optional})</span></label>
        <select id={`${name}-field`} name={name} value={value} onChange={(event) => setValue(event.target.value)} className={inputClass}>
          <option value="">—</option>
          {CURRENCY_CODES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          <option value="custom">{t.currencyCustom}</option>
        </select>
        {value === "custom" && (
          <>
            <label htmlFor={customId} className="mt-3 block text-xs font-semibold text-muted">{t.currencyCustomLabel}</label>
            <input id={customId} name={customName} value={customValue} onChange={(event) => setCustomValue(event.target.value.toUpperCase())} required maxLength={3} minLength={3} pattern="[A-Za-z]{3}" title={t.currencyCustomLabel} placeholder={t.currencyCodeHint} className={inputClass} />
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={busy} className="space-y-4">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error}</p>}
      <section className={sectionClass} aria-labelledby="form-basics-title">
        <h3 id="form-basics-title" className="mb-4 mt-0 text-sm font-black text-forest">{t.basics}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {isEdit ? (
            <label htmlFor="project-code" className={labelClass}>{t.fieldProjectCode}
              <input id="project-code" readOnly value={initial?.code ?? ""} dir="ltr" className={`${inputClass} bg-cream`} />
            </label>
          ) : (
            <p className="m-0 self-center text-xs font-semibold leading-6 text-muted sm:col-span-2">{t.codeAutoGenerated}</p>
          )}
          <label htmlFor="project-name" className={labelClass}>{t.fieldProjectName}<span className="ms-1 text-red-700" aria-hidden="true">*</span>
            <input id="project-name" name="name" required maxLength={120} defaultValue={initial?.name ?? ""} placeholder={t.exampleProjectName} className={inputClass} />
          </label>
          <label htmlFor="project-type" className={labelClass}>{t.fieldProjectType}
            <select id="project-type" name="type" value={type} onChange={(event) => { const next = event.target.value; if (isProjectType(next)) setType(next); }} className={inputClass}>
              {PROJECT_TYPES.map((item) => <option key={item} value={item}>{typeLabels[item]}</option>)}
            </select>
          </label>
          <label htmlFor="project-status" className={labelClass}>{t.fieldStatus}
            <select id="project-status" name="status" defaultValue={initial?.status ?? "planning"} className={inputClass}>
              {PROJECT_STATUSES.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="form-location-title">
        <h3 id="form-location-title" className="mb-4 mt-0 text-sm font-black text-forest">{t.locationDates}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="project-location" className={labelClass}>{t.fieldLocation}<span className="ms-2 text-xs font-normal text-muted">({t.optional})</span>
            <input id="project-location" name="location" maxLength={120} defaultValue={initial?.location ?? ""} placeholder={t.exampleLocation} className={inputClass} />
          </label>
          <label htmlFor="project-destination" className={labelClass}>{t.fieldDestination}<span className="ms-2 text-xs font-normal text-muted">({t.optional})</span>
            <input id="project-destination" name="destination" maxLength={120} defaultValue={initial?.destination ?? ""} placeholder={t.exampleDestination} className={inputClass} />
          </label>
          <label htmlFor="project-start-date" className={labelClass}>{t.fieldStartDate}<span className="ms-2 text-xs font-normal text-muted">({t.optional})</span>
            <input id="project-start-date" name="startDate" type="date" max={endDate || undefined} value={startDate} onChange={(event) => setStartDate(event.target.value)} className={inputClass} />
          </label>
          <label htmlFor="project-end-date" className={labelClass}>{t.fieldEndDate}<span className="ms-2 text-xs font-normal text-muted">({t.optional})</span>
            <input id="project-end-date" name="endDate" type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass} />
          </label>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="form-team-title">
        <h3 id="form-team-title" className="mb-4 mt-0 text-sm font-black text-forest">{t.team}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="project-manager" className={labelClass}>{t.fieldManager}<span className="ms-2 text-xs font-normal text-muted">({t.optional})</span>
            <input id="project-manager" name="manager" maxLength={120} defaultValue={initial?.manager ?? ""} placeholder={t.managerNamePlaceholder} className={inputClass} />
          </label>
          <label htmlFor="project-accountant" className={labelClass}>{t.fieldAccountant}<span className="ms-2 text-xs font-normal text-muted">({t.optional})</span>
            <input id="project-accountant" name="accountant" maxLength={120} defaultValue={initial?.accountant ?? ""} placeholder={t.accountantNamePlaceholder} className={inputClass} />
          </label>
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="form-description-title">
        <h3 id="form-description-title" className="mb-4 mt-0 text-sm font-black text-forest">{t.descriptionGroup}</h3>
        <label htmlFor="project-description" className={labelClass}>{t.fieldDescription}<span className="ms-2 text-xs font-normal text-muted">({t.optional})</span>
          <textarea id="project-description" name="description" rows={4} maxLength={1000} defaultValue={initial?.description ?? ""} className={`${inputClass} min-h-28 resize-y py-3`} />
        </label>
      </section>

      {type === "export" && (
        <section className={sectionClass} aria-label={`${t.defaultCostCurrency} / ${t.defaultSalesCurrency}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            {currencySelector("costCurrency", costSelectValue, (next) => { setCostCurrency(next === "custom" ? "custom" : next); setCustomCost(next === "custom" && !CURRENCY_CODES.includes(costCurrency as (typeof CURRENCY_CODES)[number]) ? costCurrency : ""); }, "customCostCurrency", customCost, setCustomCost, t.defaultCostCurrency)}
            {currencySelector("salesCurrency", salesSelectValue, (next) => { setSalesCurrency(next === "custom" ? "custom" : next); setCustomSales(next === "custom" && !CURRENCY_CODES.includes(salesCurrency as (typeof CURRENCY_CODES)[number]) ? salesCurrency : ""); }, "customSalesCurrency", customSales, setCustomSales, t.defaultSalesCurrency)}
          </div>
          <p className="mb-0 mt-3 text-xs leading-6 text-muted">{currencyNote ?? t.currencyDefaultNote}</p>
        </section>
      )}

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-12 rounded-full border border-line px-5 text-sm font-bold text-muted transition hover:bg-cream disabled:opacity-60">{t.cancel}</button>
        <button type="submit" disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-6 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-wait disabled:opacity-70">
          {isEdit ? <Check className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
          {busy ? (isEdit ? t.savingChanges : t.savingProject) : (isEdit ? t.saveChanges : t.saveProject)}
        </button>
      </div>
    </form>
  );
}
