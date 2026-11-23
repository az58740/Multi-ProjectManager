"use client";

import { Pencil, MapPin } from "lucide-react";
import { useLocale } from "@/app/providers";
import { isProjectType, type Project, type ProjectStatus, type ProjectType } from "@/lib/projects";

export function ProjectDetails({ project, onEdit }: { project: Project; onEdit: () => void }) {
  const { locale, t } = useLocale();
  const type: ProjectType = isProjectType(project.type) ? project.type : "other";
  const typeNames: Record<ProjectType, string> = {
    export: t.typeExport,
    "cold-storage": t.typeColdStorage,
    sorting: t.typeSorting,
    construction: t.typeConstruction,
    rental: t.typeRental,
    "personal-account": t.typePersonalAccount,
    other: t.typeOther,
  };
  const statusNames: Record<ProjectStatus, string> = {
    planning: t.statusPlanning,
    active: t.statusActive,
    paused: t.statusPaused,
    completed: t.statusCompleted,
  };
  const dateTime = (value: string) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  };
  const date = (value: string) => {
    if (!value) return "—";
    const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" });
  };
  const fields = [
    [t.detailsId, project.id],
    [t.detailsCode, project.code],
    [t.detailsName, project.name],
    [t.detailsType, typeNames[type]],
    [t.detailsLocation, project.location],
    [t.detailsDestination, project.destination],
    [t.detailsManager, project.manager],
    [t.detailsAccountant, project.accountant],
    [t.detailsStatus, statusNames[project.status]],
    [t.detailsStartDate, date(project.startDate)],
    [t.detailsEndDate, date(project.endDate)],
    [t.detailsDescription, project.description || t.noDescription],
    [t.detailsCostCurrency, project.defaultCostCurrency],
    [t.detailsSalesCurrency, project.defaultSalesCurrency],
    [t.detailsCreatedAt, dateTime(project.createdAt)],
    [t.detailsUpdatedAt, dateTime(project.updatedAt)],
  ] as const;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-sage px-3 py-1.5 font-mono text-sm font-black text-forest" dir="ltr">{project.code}</span>
        <span className="rounded-full bg-amber-soft px-3 py-1.5 text-xs font-bold text-[#87652a]">{statusNames[project.status]}</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted"><MapPin className="size-4 text-amber" aria-hidden="true" />{project.location || "—"}</span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className={`rounded-xl border border-line bg-white/70 px-4 py-3 ${label === t.detailsDescription ? "sm:col-span-2" : ""}`}>
            <dt className="mb-1 text-xs font-semibold text-muted">{label}</dt>
            <dd className="m-0 break-words whitespace-pre-wrap text-sm font-bold leading-6 text-ink">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onEdit} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light">
          <Pencil className="size-4" aria-hidden="true" />{t.editProject}
        </button>
      </div>
    </div>
  );
}
