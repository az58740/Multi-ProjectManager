"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, Boxes, Building2, Check, CirclePlus, ClipboardList, Globe2, Landmark, Leaf, LogOut, MapPin, Plus, Search, Snowflake, Users, WalletCards, Warehouse, X } from "lucide-react";
import { useLocale } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { ProjectDetails } from "@/components/project-details";
import { ProjectForm } from "@/components/project-form";
import { ProjectModal } from "@/components/project-modal";
import { ProjectResourcesWorkspace } from "@/components/project-resources-workspace";
import { AccountManagementWorkspace } from "@/components/account-management-workspace";
import { FinancialWorkspace } from "@/components/financial-workspace";
import { fetchWithTimeout } from "@/lib/http";
import { accountMessages } from "@/lib/account-i18n";
import { jsonHeaders, type Session } from "@/lib/accounts";
import { isProjectListPayload, isProjectRecord, isProjectStatus, isProjectType, PROJECT_STATUSES, PROJECT_TYPES, type Project, type ProjectStatus, type ProjectType, type ProjectWritePayload } from "@/lib/projects";

type ModalMode = "create" | "edit" | "details" | null;
type DashboardSection = "overview" | "accounts" | "catalog" | "financial";
type FinancialTab = "overview" | "receive" | "pay" | "receive-fx" | "sell-fx";

const financialNavigation = [
  { key: "receive" as const, icon: ArrowDownToLine, fa: "دریافت", en: "Receipts" },
  { key: "pay" as const, icon: ArrowUpFromLine, fa: "پرداخت", en: "Payments" },
  { key: "receive-fx" as const, icon: Banknote, fa: "دریافت ارز", en: "Receive FX" },
  { key: "sell-fx" as const, icon: ArrowLeftRight, fa: "فروش ارز", en: "Sell FX" },
];

function typeLabel(type: ProjectType, t: ReturnType<typeof useLocale>["t"]) {
  const labels: Record<ProjectType, string> = {
    export: t.typeExport,
    "cold-storage": t.typeColdStorage,
    sorting: t.typeSorting,
    construction: t.typeConstruction,
    rental: t.typeRental,
    "personal-account": t.typePersonalAccount,
    other: t.typeOther,
  };
  return labels[type];
}

function TypeIcon({ type, className = "size-5" }: { type: ProjectType; className?: string }) {
  if (type === "export") return <Leaf className={className} aria-hidden="true" />;
  if (type === "cold-storage") return <Snowflake className={className} aria-hidden="true" />;
  if (type === "sorting") return <Warehouse className={className} aria-hidden="true" />;
  if (type === "personal-account") return <Landmark className={className} aria-hidden="true" />;
  return <Building2 className={className} aria-hidden="true" />;
}

const projectTypeStyles: Record<ProjectType, { header: string; icon: string; ink: string; status: string }> = {
  export: { header: "bg-gradient-to-br from-emerald-100 via-green-50 to-teal-100", icon: "bg-emerald-200 text-emerald-900", ink: "text-emerald-950", status: "bg-emerald-200/80 text-emerald-950" },
  "cold-storage": { header: "bg-gradient-to-br from-sky-100 via-cyan-50 to-blue-100", icon: "bg-sky-200 text-sky-900", ink: "text-sky-950", status: "bg-sky-200/80 text-sky-950" },
  sorting: { header: "bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100", icon: "bg-amber-200 text-amber-950", ink: "text-amber-950", status: "bg-amber-200/80 text-amber-950" },
  construction: { header: "bg-gradient-to-br from-violet-100 via-purple-50 to-indigo-100", icon: "bg-violet-200 text-violet-950", ink: "text-violet-950", status: "bg-violet-200/80 text-violet-950" },
  rental: { header: "bg-gradient-to-br from-rose-100 via-pink-50 to-red-100", icon: "bg-rose-200 text-rose-950", ink: "text-rose-950", status: "bg-rose-200/80 text-rose-950" },
  "personal-account": { header: "bg-gradient-to-br from-slate-200 via-stone-100 to-zinc-200", icon: "bg-slate-300 text-slate-950", ink: "text-slate-950", status: "bg-slate-300/80 text-slate-950" },
  other: { header: "bg-gradient-to-br from-stone-100 via-slate-50 to-gray-100", icon: "bg-stone-200 text-stone-900", ink: "text-stone-950", status: "bg-stone-200/80 text-stone-950" },
};

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
  const m = accountMessages[locale];
  const [authorized, setAuthorized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [logoutError, setLogoutError] = useState(false);
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
  const [section, setSection] = useState<DashboardSection>("overview");
  const [financialTab, setFinancialTab] = useState<FinancialTab>("overview");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setSessionError(false);
      let sessionVerified = false;
      try {
        const sessionResponse = await fetchWithTimeout("/api/v1/auth/session", { cache: "no-store" }, 8_000);
        if (sessionResponse.status === 401) {
          router.replace("/login");
          return;
        }
        if (sessionResponse.status === 403) {
          if (active) setAccessDenied(true);
          return;
        }
        if (!sessionResponse.ok) throw new Error("session unavailable");
        const session = await sessionResponse.json() as Session;
        if (!session.authenticated) {
          router.replace("/login");
          return;
        }
        if (session.authorized !== true) {
          if (active) setAccessDenied(true);
          return;
        }
        sessionVerified = true;
        if (active) {
          setIsAdmin(session.user?.role === "admin");
          setAuthorized(true);
        }

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
        else if (active) setSessionError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router, sessionAttempt]);

  const closeModal = useCallback(() => setModalMode(null), []);

  async function signOut() {
    setLogoutError(false);
    try {
      const response = await fetchWithTimeout("/api/v1/auth/logout", {
        method: "POST",
        headers: jsonHeaders(),
      }, 4_000);
      if (!response.ok) throw new Error("logout failed");
      router.replace("/");
    } catch {
      setLogoutError(true);
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
  if (sessionError) {
    return <main className="grid min-h-screen place-items-center bg-cream p-6"><section className="w-full max-w-lg rounded-[28px] border border-line bg-paper p-7 text-center"><p role="alert" className="text-sm leading-7 text-muted">{m.sessionError}</p><button type="button" onClick={() => setSessionAttempt((current) => current + 1)} className="mt-4 min-h-12 rounded-full bg-forest px-6 text-sm font-bold text-white">{m.retry}</button></section></main>;
  }
  if (loading || (!authorized && !accessDenied)) {
    return <main className="grid min-h-screen place-items-center bg-cream text-sm font-semibold text-muted"><p role="status" aria-live="polite">{t.loading}</p></main>;
  }

  if (accessDenied) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream p-6">
        <section className="w-full max-w-lg rounded-[28px] border border-line bg-paper p-7 text-center shadow-xl shadow-forest/5 sm:p-10">
          <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-amber-soft text-forest"><Building2 className="size-6" aria-hidden="true" /></span>
          <h1 className="mb-0 mt-5 text-xl font-black leading-8 text-forest">{t.accountNotAllowed}</h1>
          {logoutError && <p role="alert" className="mt-4 text-sm text-red-800">{m.logoutError}</p>}
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
    "personal-account": t.typePersonalAccount,
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
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#edf3ea_0%,_#f7f7f1_40%,_#f7f7f1_100%)] pb-24 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-paper/90 shadow-sm shadow-forest/[0.03] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-3"><BrandMark /></Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageToggle />
            <button type="button" onClick={signOut} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold text-muted transition hover:border-sage-dark hover:bg-sage/60 hover:text-forest">
              <LogOut className="size-4" aria-hidden="true" /><span className="hidden sm:inline">{t.logout}</span>
            </button>
          </div>
        </div>
      </header>

      <nav aria-label={section === "financial" ? (isFa ? "عملیات مالی" : "Financial operations") : (isFa ? "منوی اصلی داشبورد" : "Main dashboard navigation")} className="fixed inset-x-2 bottom-2 z-30 rounded-[20px] border border-line bg-paper/95 p-1.5 shadow-xl shadow-forest/10 backdrop-blur lg:hidden">
        <div className={`mx-auto grid max-w-[1440px] gap-1 ${section === "financial" ? "grid-cols-6" : "grid-cols-5"}`}>
          {section === "financial" ? <>
            {financialNavigation.map(({ key, icon: Icon, fa, en }) => <button key={key} type="button" aria-current={financialTab === key ? "page" : undefined} onClick={() => setFinancialTab(key)} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[9px] font-extrabold ${financialTab === key ? "bg-amber-100 text-amber-950" : "text-muted"}`}><Icon className="size-3.5" aria-hidden="true" /><span className="truncate">{isFa ? fa : en}</span></button>)}
            {isAdmin && <Link href="/dashboard/users" aria-label={m.users} className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-extrabold text-muted"><Users className="size-3.5" aria-hidden="true" /><span className="truncate">{m.users}</span></Link>}
            <button type="button" onClick={() => setSection("overview")} aria-label={isFa ? "بازگشت به منوی اصلی" : "Back to main menu"} className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-muted"><ClipboardList className="size-4" aria-hidden="true" /></button>
          </> : <>
            <button type="button" onClick={() => setSection("overview")} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-extrabold ${section === "overview" ? "bg-sage text-forest" : "text-muted"}`}><ClipboardList className="size-3.5" />{isFa ? "پروژه‌ها" : "Projects"}</button>
            <button type="button" onClick={() => setSection("accounts")} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-extrabold ${section === "accounts" ? "bg-sage text-forest" : "text-muted"}`}><Landmark className="size-3.5" />{isFa ? "حساب‌ها" : "Accounts"}</button>
            <button type="button" onClick={() => setSection("catalog")} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-extrabold ${section === "catalog" ? "bg-sage text-forest" : "text-muted"}`}><Boxes className="size-3.5" />{isFa ? "کالاها" : "Catalog"}</button>
            <button type="button" onClick={() => { setSection("financial"); setFinancialTab("overview"); }} className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-extrabold text-muted"><WalletCards className="size-3.5" />{isFa ? "مالی" : "Finance"}</button>
            {isAdmin && <Link href="/dashboard/users" className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-extrabold text-muted"><Users className="size-3.5" aria-hidden="true" />{m.users}</Link>}
          </>}
        </div>
      </nav>

      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-5 sm:px-6 sm:py-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8 lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-[26px] border border-white/80 bg-white/85 p-4 shadow-xl shadow-forest/[0.04] backdrop-blur">
            <p className="mb-3 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">{section === "financial" ? (isFa ? "عملیات مالی" : "FINANCE") : t.allProjects}</p>
            {section === "financial" ? <>
              {financialNavigation.map(({ key, icon: Icon, fa, en }) => <button key={key} type="button" aria-current={financialTab === key ? "page" : undefined} onClick={() => setFinancialTab(key)} className={`mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm font-extrabold transition ${financialTab === key ? "bg-amber-100 text-amber-950" : "text-muted hover:bg-cream"}`}><Icon className="size-4" aria-hidden="true" />{isFa ? fa : en}</button>)}
              <button type="button" onClick={() => setSection("overview")} aria-label={isFa ? "بازگشت به منوی اصلی" : "Back to main menu"} className="mt-3 inline-flex size-9 items-center justify-center rounded-xl border border-line text-muted transition hover:border-sage-dark hover:bg-sage/50"><ClipboardList className="size-4" aria-hidden="true" /></button>
            </> : <>
              <button type="button" onClick={() => setSection("overview")} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm font-extrabold ${section === "overview" ? "bg-sage text-forest" : "text-muted hover:bg-cream"}`}><ClipboardList className="size-4" aria-hidden="true" />{t.activeProjects}</button>
              <button type="button" onClick={() => setSection("accounts")} className={`mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm font-extrabold ${section === "accounts" ? "bg-sage text-forest" : "text-muted hover:bg-cream"}`}><Landmark className="size-4" aria-hidden="true" />{isFa ? "مدیریت حساب‌ها" : "Account management"}</button>
              <button type="button" onClick={() => setSection("catalog")} className={`mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm font-extrabold ${section === "catalog" ? "bg-sage text-forest" : "text-muted hover:bg-cream"}`}><Boxes className="size-4" aria-hidden="true" />{isFa ? "کالا و ملزومات" : "Products & supplies"}</button>
              <button type="button" onClick={() => { setSection("financial"); setFinancialTab("overview"); }} className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm font-extrabold text-muted hover:bg-cream"><WalletCards className="size-4" aria-hidden="true" />{isFa ? "مالی" : "Finance"}</button>
              {isAdmin && <Link href="/dashboard/users" className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm font-extrabold text-muted hover:bg-cream"><Users className="size-4" aria-hidden="true" />{m.users}</Link>}
            </>}
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
          {logoutError && <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{m.logoutError}</div>}
          {notice && (
            <div role={noticeError ? "alert" : "status"} className={`mb-5 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${noticeError ? "border-red-200 bg-red-50 text-red-800" : "border-sage-dark bg-sage text-forest"}`}>
              {!noticeError && <Check className="size-4" aria-hidden="true" />}{notice}
              <button type="button" onClick={() => setNotice("")} className="ms-auto rounded-full p-1 hover:bg-white/70" aria-label={t.close}><X className="size-4" aria-hidden="true" /></button>
            </div>
          )}
          {section === "overview" && <div className="relative isolate overflow-hidden rounded-[28px] bg-forest px-5 py-6 text-white shadow-xl shadow-forest/10 sm:px-7 sm:py-8">
            <div aria-hidden="true" className="pointer-events-none absolute -end-10 -top-20 size-64 rounded-full border-[36px] border-white/[0.045]" />
            <div aria-hidden="true" className="pointer-events-none absolute -end-2 -bottom-28 size-48 rounded-full border-[28px] border-amber-light/[0.08]" />
            <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="mb-2 text-xs font-bold tracking-wide text-amber-light">{isFa ? "نمای کلی فعالیت‌ها" : "WORKSPACE OVERVIEW"}</p>
                <h1 className="m-0 truncate text-xl font-black leading-tight tracking-tight sm:text-3xl">{t.dashboardKicker}</h1>
                <p className="mb-0 mt-2 max-w-2xl text-xs leading-6 text-white/75 sm:text-sm sm:leading-7">{t.dashboardSubtitle}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {isAdmin && <Link href="/dashboard/users" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-sm font-extrabold text-white transition hover:bg-white/20"><Users className="size-4" aria-hidden="true" />{m.users}</Link>}
                <button type="button" onClick={() => { setSelectedProject(null); setModalMode("create"); setNotice(""); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-amber-light px-4 text-xs font-extrabold text-forest shadow-md shadow-black/10 transition hover:-translate-y-0.5 hover:bg-amber-bright sm:px-5 sm:text-sm">
                  <CirclePlus className="size-4" aria-hidden="true" />{isFa ? "پروژه جدید" : "New project"}
                </button>
              </div>
            </div>
            <div className="relative mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/15 pt-4 text-xs font-semibold text-white/80 sm:mt-6 sm:gap-x-8">
              <span>{t.summaryTotal}: <strong className="ms-1 text-base font-black text-white">{counts.total.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong></span>
              <span>{t.summaryActive}: <strong className="ms-1 text-base font-black text-white">{counts.active.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong></span>
              <span>{t.summaryPlanning}: <strong className="ms-1 text-base font-black text-white">{counts.planning.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong></span>
            </div>
          </div>}

          {section !== "overview" ? (section === "financial" ? <FinancialWorkspace projects={projects} tab={financialTab} onBack={() => setSection("overview")} /> : projects.length > 0 ? section === "accounts" ? <AccountManagementWorkspace projects={projects} /> : <ProjectResourcesWorkspace projects={projects} /> : <div className="mt-6 rounded-2xl border border-dashed border-sage-dark bg-paper p-8 text-center text-sm text-muted">{t.noProjects}</div>) : <>
          <div className="mt-6 grid grid-cols-2 gap-3 rounded-[24px] border border-white/80 bg-white/65 p-3 shadow-sm shadow-forest/[0.03] sm:grid-cols-[minmax(0,1fr)_190px_190px] sm:p-4">
            <div className="col-span-2 flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-paper px-4 text-sm text-muted focus-within:border-forest/40 focus-within:ring-4 focus-within:ring-sage/70 sm:col-span-1">
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
            <div id="projects-list" className="mt-5 scroll-mt-20 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => {
                const validType: ProjectType = isProjectType(project.type) ? project.type : "other";
                const typeStyle = projectTypeStyles[validType];
                return (
                  <article key={project.id} className="group overflow-hidden rounded-[24px] border border-line/80 bg-white shadow-sm shadow-forest/[0.035] transition duration-300 hover:-translate-y-1 hover:border-sage-dark hover:shadow-xl hover:shadow-forest/[0.08]">
                    <button type="button" onClick={() => validType === "export" ? router.push(`/dashboard/projects/${encodeURIComponent(project.code)}/export`) : validType === "personal-account" ? router.push(`/dashboard/projects/${encodeURIComponent(project.code)}/personal`) : void showDetails(project)} aria-label={`${t.projectDetails}: ${project.name}`} className="block w-full text-start outline-none focus-visible:ring-4 focus-visible:ring-sage-dark">
                      <div className={`${typeStyle.header} ${typeStyle.ink} flex min-h-[62px] items-center justify-between gap-3 px-4 py-3`}>
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${typeStyle.icon}`}><TypeIcon type={validType} className="size-5" /></span>
                          <p className="mb-0 truncate text-sm font-black leading-5">{typeLabel(validType, t)}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${typeStyle.status}`}>{statusLabel(project.status, t)}</span>
                      </div>
                      <div className="p-3.5">
                        <h2 className="mb-3 break-words text-base font-black leading-6 text-forest">{project.name}</h2>
                        <div className="space-y-1 text-[11px] text-muted">
                        <div className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-amber" aria-hidden="true" /><span className="truncate">{project.location || "—"}</span><span className="ms-auto shrink-0 font-semibold">{t.projectLocation}</span></div>
                        <div className="hidden items-center gap-2 sm:flex"><MapPin className="size-3.5 shrink-0 text-amber" aria-hidden="true" /><span className="truncate">{project.destination || "—"}</span><span className="ms-auto shrink-0 font-semibold">{t.projectDestination}</span></div>
                        <div className="hidden items-center gap-2 xl:flex"><span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-sage text-[8px] font-black text-forest">{(project.manager || "?").slice(0, 1)}</span><span className="truncate">{project.manager || "—"}</span><span className="ms-auto shrink-0 font-semibold">{t.projectManager}</span></div>
                        <div className="hidden items-center gap-2 xl:flex"><span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-amber-soft text-[8px] font-black text-forest">{(project.accountant || "?").slice(0, 1)}</span><span className="truncate">{project.accountant || "—"}</span><span className="ms-auto shrink-0 font-semibold">{t.projectAccountant}</span></div>
                        </div>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          </>}
        </section>
      </div>

      {section === "overview" && <footer className="border-t border-line bg-paper">
        <div className="mx-auto max-w-[1440px] px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {[
              [t.summaryTotal, counts.total, "bg-cream"],
              [t.summaryActive, counts.active, "bg-sage"],
              [t.summaryPlanning, counts.planning, "bg-amber-soft"],
              [t.summaryPaused, counts.paused, "bg-cream"],
              [t.summaryCompleted, counts.completed, "bg-cream"],
            ].map(([label, count, color]) => (
              <div key={label} className={`min-w-0 rounded-xl border border-line ${color} px-1.5 py-2 text-center sm:rounded-2xl sm:px-3 sm:py-3`}>
                <p className="m-0 min-h-8 overflow-hidden text-[10px] font-semibold leading-4 text-muted sm:min-h-0 sm:text-xs sm:leading-5">{label}</p>
                <p className="m-0 text-lg font-black text-forest sm:text-2xl">{Number(count).toLocaleString(isFa ? "fa-IR" : "en-US")}</p>
              </div>
            ))}
          </div>
        </div>
      </footer>}

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
