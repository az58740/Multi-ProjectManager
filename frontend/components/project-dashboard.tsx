"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, CirclePlus, ClipboardList, Globe2, Leaf, LogOut, MapPin, Plus, Search, Snowflake, Warehouse, X } from "lucide-react";
import { useLocale } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { ProjectDetails } from "@/components/project-details";
import { ProjectForm } from "@/components/project-form";
import { ProjectModal } from "@/components/project-modal";
import { fetchWithTimeout } from "@/lib/http";
import { isProjectListPayload, isProjectRecord, isProjectStatus, isProjectType, PROJECT_STATUSES, PROJECT_TYPES, type Project, type ProjectStatus, type ProjectType, type ProjectWritePayload } from "@/lib/projects";

type ModalMode = "create" | "edit" | "details" | null;
type SessionPayload = { authenticated?: boolean; authorized?: boolean };

function typeLabel(type: ProjectType, t: ReturnType<typeof useLocale>["t"]) {
  const labels: Record<ProjectType, string> = {
    export: t.typeExport,
    "cold-storage": t.typeColdStorage,
    sorting: t.typeSorting,
    construction: t.typeConstruction,
    rental: t.typeRental,
    other: t.typeOther,
  };
  return labels[type];
}

function TypeIcon({ type, className = "size-5" }: { type: ProjectType; className?: string }) {
  if (type === "export") return <Leaf className={className} aria-hidden="true" />;
  if (type === "cold-storage") return <Snowflake className={className} aria-hidden="true" />;
  if (type === "sorting") return <Warehouse className={className} aria-hidden="true" />;
  return <Building2 className={className} aria-hidden="true" />;
}

function statusLabel(status: ProjectStatus, t: ReturnType<typeof useLocale>["t"]) {
  const labels: Record<ProjectStatus, string> = {
    active: t.statusActive,
    planning: t.statusPlanning,
    paused: t.statusPaused,
    completed: t.statusCompleted,
  };
  return labels[status];
}

export function ProjectDashboard() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const isFa = locale === "fa";
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProjectType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      let sessionVerified = false;
      try {
        const sessionResponse = await fetchWithTimeout("/api/v1/auth/session", { cache: "no-store" }, 8_000);
        if (!sessionResponse.ok) {
          router.replace("/login");
          return;
        }
        const session = await sessionResponse.json() as SessionPayload;
        if (!session.authenticated) {
          router.replace("/login");
          return;
        }
        if (session.authorized === false) {
          if (active) setAccessDenied(true);
          return;
        }
        sessionVerified = true;
        if (active) setAuthorized(true);

        const projectResponse = await fetchWithTimeout("/api/v1/projects", { cache: "no-store" }, 10_000);
        if (!projectResponse.ok) throw new Error("project service unavailable");
        const payload: unknown = await projectResponse.json();
        if (!isProjectListPayload(payload)) throw new Error("invalid project response");
        if (active) {
          setProjects(payload.items);
          setDemoMode(payload.dataMode === "demo");
        }
      } catch {
        if (active && sessionVerified) setLoadError(true);
        else if (active) router.replace("/login");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  const closeModal = useCallback(() => setModalMode(null), []);

  async function signOut() {
    try {
      await fetchWithTimeout("/api/v1/auth/logout", {
        method: "POST",
        headers: { "X-App-Origin": window.location.origin },
      }, 4_000);
    } finally {
      router.push("/login");
    }
  }

  async function showDetails(project: Project) {
    setSelectedProject(project);
    setDetailsLoading(true);
    setDetailsError(false);
    setModalMode("details");
    try {
      const response = await fetchWithTimeout(`/api/v1/projects/${encodeURIComponent(project.id)}`, { cache: "no-store" }, 10_000);
      if (!response.ok) throw new Error("project details unavailable");
      const payload: unknown = await response.json();
      if (!isProjectRecord(payload)) throw new Error("invalid project response");
      setSelectedProject(payload);
    } catch {
      setDetailsError(true);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function saveProject(payload: ProjectWritePayload) {
    if (isSubmitting) return;
    const isEdit = modalMode === "edit" && selectedProject !== null;
    setIsSubmitting(true);
    try {
      const url = isEdit ? `/api/v1/projects/${encodeURIComponent(selectedProject.id)}` : "/api/v1/projects";
      const response = await fetchWithTimeout(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-App-Origin": window.location.origin },
        body: JSON.stringify(payload),
      }, 10_000);
      if (!response.ok) throw new Error("project api unavailable");
      const result: unknown = await response.json();
      if (!isProjectRecord(result)) throw new Error("invalid project response");
      setProjects((current) => isEdit
        ? current.map((item) => item.id === result.id ? result : item)
        : [result, ...current.filter((item) => item.id !== result.id)]);
      setNotice(isEdit ? t.projectUpdated : t.projectCreated);
      setNoticeError(false);
      setModalMode(null);
      setSelectedProject(null);
    } catch {
      setNotice(t.errorSaveProject);
      setNoticeError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale === "fa" ? "fa-IR" : "en-US");
    return projects.filter((project) => {
      if (typeFilter !== "all" && project.type !== typeFilter) return false;
      if (statusFilter !== "all" && project.status !== statusFilter) return false;
      if (!normalized) return true;
      const searchable = [
        project.code,
        project.name,
        project.type,
        typeLabel(project.type, t),
        project.location,
        project.destination,
        project.manager,
        project.accountant,
      ].join(" ").toLocaleLowerCase(locale === "fa" ? "fa-IR" : "en-US");
      return searchable.includes(normalized);
    });
  }, [locale, projects, query, statusFilter, t, typeFilter]);

  const counts = useMemo(() => ({
    total: projects.length,
    active: projects.filter((project) => project.status === "active").length,
    planning: projects.filter((project) => project.status === "planning").length,
    paused: projects.filter((project) => project.status === "paused").length,
    completed: projects.filter((project) => project.status === "completed").length,
  }), [projects]);

  if (loading || (!authorized && !accessDenied)) {
    return <main className="grid min-h-screen place-items-center bg-cream text-sm font-semibold text-muted"><p role="status" aria-live="polite">{t.loading}</p></main>;
  }

  if (accessDenied) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream p-6">
        <section className="w-full max-w-lg rounded-[28px] border border-line bg-paper p-7 text-center shadow-xl shadow-forest/5 sm:p-10">
          <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-amber-soft text-forest"><Building2 className="size-6" aria-hidden="true" /></span>
          <h1 className="mb-0 mt-5 text-xl font-black leading-8 text-forest">{t.accountNotAllowed}</h1>
          <button type="button" onClick={signOut} className="mt-6 min-h-12 rounded-full bg-forest px-6 text-sm font-extrabold text-white transition hover:bg-forest-light">{t.logout}</button>
        </section>
      </main>
    );
  }

  const typeNames: Record<ProjectType, string> = {
    export: t.typeExport,
    "cold-storage": t.typeColdStorage,
    sorting: t.typeSorting,
    construction: t.typeConstruction,
    rental: t.typeRental,
    other: t.typeOther,
  };
  const statusNames: Record<ProjectStatus, string> = {
    active: t.statusActive,
    planning: t.statusPlanning,
    paused: t.statusPaused,
    completed: t.statusCompleted,
  };
  const modalTitle = modalMode === "create" ? t.dialogTitle : modalMode === "edit" ? t.editProjectTitle : t.projectDetails;

  return (
    <main className="min-h-screen bg-cream">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-3"><BrandMark /></Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageToggle />
            <button type="button" onClick={signOut} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-muted transition hover:bg-cream hover:text-forest">
              <LogOut className="size-4" aria-hidden="true" /><span className="hidden sm:inline">{t.logout}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-5 sm:px-6 sm:py-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8 lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-7 rounded-[26px] border border-line bg-paper p-4">
            <p className="mb-3 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">{t.allProjects}</p>
            <div className="flex items-center gap-3 rounded-2xl bg-sage px-4 py-3 text-sm font-extrabold text-forest">
              <ClipboardList className="size-4" aria-hidden="true" />{t.activeProjects}
            </div>
            <div className="mt-5 rounded-2xl bg-forest p-4 text-white">
              <div className="grid size-10 place-items-center rounded-[14px] bg-white/10 text-amber-light"><Globe2 className="size-5" aria-hidden="true" /></div>
              <p className="mb-0 mt-4 text-sm font-extrabold">{t.approachKicker}</p>
              <p className="mb-0 mt-1 text-xs leading-6 text-white/70">{t.approachDescription}</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          {demoMode && <div className="mb-5 rounded-2xl border border-amber/30 bg-amber-soft/80 px-4 py-3 text-xs font-semibold leading-6 text-forest sm:text-sm">{t.demoBanner}</div>}
          {loadError && <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{t.errorProjects}</div>}
          {notice && (
            <div role={noticeError ? "alert" : "status"} className={`mb-5 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${noticeError ? "border-red-200 bg-red-50 text-red-800" : "border-sage-dark bg-sage text-forest"}`}>
              {!noticeError && <Check className="size-4" aria-hidden="true" />}{notice}
              <button type="button" onClick={() => setNotice("")} className="ms-auto rounded-full p-1 hover:bg-white/70" aria-label={t.close}><X className="size-4" aria-hidden="true" /></button>
            </div>
          )}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-amber">{t.dashboardKicker}</span>
              <h1 className="m-0 mt-2 text-3xl font-black tracking-tight text-forest sm:text-4xl">{t.dashboardTitle}</h1>
              <p className="mb-0 mt-2 text-sm leading-7 text-muted">{t.dashboardSubtitle}</p>
            </div>
            <button type="button" onClick={() => { setSelectedProject(null); setModalMode("create"); setNotice(""); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white shadow-md shadow-forest/10 transition hover:-translate-y-0.5 hover:bg-forest-light">
              <CirclePlus className="size-5" aria-hidden="true" />{t.createProject}
            </button>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {[
              [t.summaryTotal, counts.total, "bg-paper"],
              [t.summaryActive, counts.active, "bg-sage"],
              [t.summaryPlanning, counts.planning, "bg-amber-soft"],
              [t.summaryPaused, counts.paused, "bg-paper"],
              [t.summaryCompleted, counts.completed, "bg-paper"],
            ].map(([label, count, color]) => (
              <div key={label} className={`rounded-2xl border border-line ${color} px-4 py-4`}>
                <p className="mb-1 mt-0 text-xs font-semibold leading-5 text-muted">{label}</p>
                <p className="m-0 text-2xl font-black text-forest">{Number(count).toLocaleString(isFa ? "fa-IR" : "en-US")}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_190px]">
            <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-paper px-4 text-sm text-muted focus-within:border-forest/40 focus-within:ring-4 focus-within:ring-sage/70">
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <label htmlFor="project-search" className="sr-only">{t.projectSearch}</label>
              <input id="project-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.projectSearchPlaceholder} className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
            </div>
            <label className="block text-xs font-bold text-muted">
              <span className="sr-only">{t.filterType}</span>
              <select aria-label={t.filterType} value={typeFilter} onChange={(event) => { const next = event.target.value; setTypeFilter(next === "all" || isProjectType(next) ? next : "all"); }} className="min-h-12 w-full rounded-2xl border border-line bg-paper px-4 text-sm font-semibold text-ink outline-none focus:border-forest/40 focus:ring-4 focus:ring-sage/70">
                <option value="all">{t.filterType}: {t.filterAll}</option>
                {PROJECT_TYPES.map((item) => <option key={item} value={item}>{typeNames[item]}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-muted">
              <span className="sr-only">{t.filterStatus}</span>
              <select aria-label={t.filterStatus} value={statusFilter} onChange={(event) => { const next = event.target.value; setStatusFilter(next === "all" || isProjectStatus(next) ? next : "all"); }} className="min-h-12 w-full rounded-2xl border border-line bg-paper px-4 text-sm font-semibold text-ink outline-none focus:border-forest/40 focus:ring-4 focus:ring-sage/70">
                <option value="all">{t.filterStatus}: {t.filterAll}</option>
                {PROJECT_STATUSES.map((item) => <option key={item} value={item}>{statusNames[item]}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-between px-1 text-xs font-semibold text-muted">
            <span>{t.projectCount}</span>
            <span>{filteredProjects.length.toLocaleString(isFa ? "fa-IR" : "en-US")} / {projects.length.toLocaleString(isFa ? "fa-IR" : "en-US")}</span>
          </div>

          {loadError ? null : filteredProjects.length === 0 ? (
            <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-[26px] border border-dashed border-sage-dark bg-paper px-6 text-center">
              <span className="grid size-14 place-items-center rounded-[20px] bg-sage text-forest"><ClipboardList className="size-6" aria-hidden="true" /></span>
              <p className="mb-0 mt-4 font-extrabold text-forest">{projects.length === 0 && !query && typeFilter === "all" && statusFilter === "all" ? t.noProjects : t.noResults}</p>
              {projects.length === 0 && <button type="button" onClick={() => { setSelectedProject(null); setModalMode("create"); }} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-forest underline decoration-sage-dark underline-offset-4"><Plus className="size-4" aria-hidden="true" />{t.createFirstProject}</button>}
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => {
                const validType: ProjectType = isProjectType(project.type) ? project.type : "other";
                return (
                  <article key={project.id} className="group rounded-[25px] border border-line bg-paper transition duration-300 hover:-translate-y-1 hover:border-sage-dark hover:shadow-xl hover:shadow-forest/5">
                    <button type="button" onClick={() => void showDetails(project)} aria-label={`${t.projectDetails}: ${project.code} — ${project.name}`} className="block w-full rounded-[25px] p-5 text-start outline-none focus-visible:ring-4 focus-visible:ring-sage-dark sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-12 shrink-0 place-items-center rounded-[17px] bg-sage text-forest"><TypeIcon type={validType} /></span>
                          <span dir="ltr" className="truncate rounded-lg bg-cream px-2.5 py-1.5 font-mono text-xs font-black text-forest">{project.code}</span>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${project.status === "planning" ? "bg-amber-soft text-[#87652a]" : project.status === "paused" ? "bg-stone-100 text-stone-700" : project.status === "completed" ? "bg-forest text-white" : "bg-sage text-forest"}`}>
                          {statusLabel(project.status, t)}
                        </span>
                      </div>
                      <h2 className="mb-0 mt-5 line-clamp-2 min-h-14 text-lg font-extrabold leading-7 text-forest">{project.name}</h2>
                      <p className="mb-0 mt-1 text-xs font-semibold text-muted">{typeLabel(validType, t)}</p>
                      <div className="mt-5 space-y-3 border-t border-line pt-4 text-xs text-muted">
                        <div className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-amber" aria-hidden="true" /><span className="truncate">{project.location || "—"}</span><span className="ms-auto shrink-0 font-semibold">{t.projectLocation}</span></div>
                        <div className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-amber" aria-hidden="true" /><span className="truncate">{project.destination || "—"}</span><span className="ms-auto shrink-0 font-semibold">{t.projectDestination}</span></div>
                        <div className="flex items-center gap-2"><span className="grid size-4 shrink-0 place-items-center rounded-full bg-sage text-[9px] font-black text-forest">{(project.manager || "?").slice(0, 1)}</span><span className="truncate">{project.manager || "—"}</span><span className="ms-auto shrink-0 font-semibold">{t.projectManager}</span></div>
                        <div className="flex items-center gap-2"><span className="grid size-4 shrink-0 place-items-center rounded-full bg-amber-soft text-[9px] font-black text-forest">{(project.accountant || "?").slice(0, 1)}</span><span className="truncate">{project.accountant || "—"}</span><span className="ms-auto shrink-0 font-semibold">{t.projectAccountant}</span></div>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {modalMode && (
        <ProjectModal title={modalTitle} onClose={closeModal}>
          {modalMode === "details" && (
            detailsLoading ? <p role="status" aria-live="polite" className="py-10 text-center text-sm font-semibold text-muted">{t.loadingDetails}</p>
              : detailsError || !selectedProject ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{t.errorDetails}<button type="button" onClick={() => selectedProject && void showDetails(selectedProject)} className="ms-3 font-bold underline">{t.retryDetails}</button></div>
                : <ProjectDetails project={selectedProject} onEdit={() => { setNotice(""); setNoticeError(false); setModalMode("edit"); }} />
          )}
          {(modalMode === "create" || modalMode === "edit") && (
            <ProjectForm
              key={modalMode === "edit" ? selectedProject?.id ?? "edit" : "create"}
              initial={modalMode === "edit" ? selectedProject ?? undefined : undefined}
              isEdit={modalMode === "edit"}
              busy={isSubmitting}
              error={noticeError ? notice : ""}
              onSubmit={(payload) => void saveProject(payload)}
              onCancel={closeModal}
            />
          )}
        </ProjectModal>
      )}
    </main>
  );
}
