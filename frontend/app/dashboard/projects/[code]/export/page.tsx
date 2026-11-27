"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Boxes, Leaf, LoaderCircle, LogOut, ShoppingCart, ScrollText, TrendingUp, Warehouse } from "lucide-react";
import { useLocale } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";
import { ExportOperationsWorkspace } from "@/components/export-operations-workspace";
import { ExportWorkspace } from "@/components/export-workspace";
import { LanguageToggle } from "@/components/language-toggle";
import { ProjectDetails } from "@/components/project-details";
import { ProjectForm } from "@/components/project-form";
import { ProjectModal } from "@/components/project-modal";
import { accountMessages } from "@/lib/account-i18n";
import { jsonHeaders } from "@/lib/accounts";
import { exportMessages } from "@/lib/export-i18n";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isProjectListPayload, isProjectRecord, type Project, type ProjectWritePayload } from "@/lib/projects";

type ExportSection = "sales" | "purchases" | "catalog" | "logistics";

export default function ExportDashboardPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { locale, t } = useLocale();
  const m = exportMessages[locale];
  const [project, setProject] = useState<Project | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "notFound" | "ready">("loading");
  const [attempt, setAttempt] = useState(0);
  const [demoMode, setDemoMode] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [modal, setModal] = useState<"details" | "edit" | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const editBusyRef = useRef(false);
  const [editError, setEditError] = useState(false);
  const [projectSaved, setProjectSaved] = useState(false);
  const [section, setSection] = useState<ExportSection>("sales");
  const code = typeof params.code === "string" ? params.code : "";
  const closeModal = useCallback(() => setModal(null), []);

  useEffect(() => {
    let active = true;
    async function loadProject() {
      setLoadState("loading");
      try {
        const { response, payload } = await fetchJsonWithTimeout("/api/v1/projects", { cache: "no-store" }, 10_000);
        if (response.status === 401) { router.replace("/login"); return; }
        if (!response.ok) throw new Error("project service unavailable");
        if (!isProjectListPayload(payload)) throw new Error("invalid project response");
        const matched = payload.items.find((item) => item.code === code && item.type === "export");
        if (active) {
          setProject(matched ?? null);
          setDemoMode(payload.dataMode === "demo");
          setLoadState(matched ? "ready" : "notFound");
        }
      } catch { if (active) setLoadState("error"); }
    }
    if (code) void loadProject();
    else setLoadState("notFound");
    return () => { active = false; };
  }, [code, router, attempt]);

  async function signOut() {
    setLogoutError(false);
    try {
      const response = await fetchWithTimeout("/api/v1/auth/logout", { method: "POST", headers: jsonHeaders() }, 4_000);
      if (!response.ok) throw new Error("logout failed");
      router.replace("/");
    } catch { setLogoutError(true); }
  }

  async function saveProject(input: ProjectWritePayload) {
    if (!project || editBusyRef.current) return;
    editBusyRef.current = true;
    setEditBusy(true); setEditError(false);
    try {
      const { response, payload } = await fetchJsonWithTimeout(`/api/v1/projects/${encodeURIComponent(project.id)}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify(input) });
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) throw new Error("project update failed");
      if (!isProjectRecord(payload)) throw new Error("invalid project response");
      if (payload.type !== "export") { router.replace("/dashboard"); return; }
      setProject(payload); setModal(null); setProjectSaved(true);
    } catch { setEditError(true); }
    finally { editBusyRef.current = false; setEditBusy(false); }
  }

  if (loadState === "loading") {
    return <main className="flex min-h-screen items-center justify-center gap-2 bg-cream text-sm font-semibold text-muted" role="status"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" />{t.loading}</main>;
  }
  if (loadState === "error" || loadState === "notFound" || !project) {
    const isError = loadState === "error";
    return <main className="grid min-h-screen place-items-center bg-cream p-6"><section className="w-full max-w-lg rounded-[28px] border border-line bg-paper p-8 text-center"><span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-sage text-forest"><Leaf className="size-6" aria-hidden="true" /></span><h1 className="mb-0 mt-5 text-xl font-black text-forest">{isError ? m.projectLoadError : t.exportNotFoundTitle}</h1>{!isError && <p className="mb-0 mt-2 text-sm leading-7 text-muted">{t.exportNotFoundDescription}</p>}<div className="mt-6 flex flex-wrap justify-center gap-3">{isError && <button type="button" onClick={() => setAttempt((current) => current + 1)} className="min-h-11 rounded-full bg-forest px-5 text-sm font-extrabold text-white">{m.retry}</button>}<Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-xs font-extrabold text-forest">{t.exportBackToProjects}</Link></div></section></main>;
  }

  return (
    <main className="min-h-screen bg-cream pb-24 lg:pb-0">
      <header className="border-b border-line bg-paper"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3 lg:px-8"><Link href="/dashboard" className="inline-flex items-center gap-3"><BrandMark /></Link><div className="flex items-center gap-2 sm:gap-3"><span dir="ltr" className="hidden rounded-lg bg-cream px-2 py-1 font-mono text-[10px] font-black text-forest sm:inline">{project.code}</span><LanguageToggle /><button type="button" onClick={() => void signOut()} aria-label={t.logout} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-3 text-sm font-semibold text-muted transition hover:bg-cream hover:text-forest"><LogOut className="size-4" aria-hidden="true" /><span className="hidden sm:inline">{t.logout}</span></button></div></div></header>
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-start lg:gap-8">
          <div className="min-w-0">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs font-extrabold text-forest">{<ArrowRight className={`size-4 ${locale === "en" ? "rotate-180" : ""}`} aria-hidden="true" />}{t.exportBackToProjects}</Link>
            {demoMode && <div className="mt-5 rounded-2xl border border-amber/30 bg-amber-soft/80 px-4 py-3 text-[11px] font-semibold leading-5 text-forest sm:text-xs">{t.demoBanner}</div>}
            {logoutError && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">{accountMessages[locale].logoutError}</div>}
            {projectSaved && <div role="status" className="mt-5 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-xs font-bold text-forest">{m.projectSaved}</div>}
            <section className="mt-4 overflow-hidden rounded-[22px] border border-emerald-200 bg-gradient-to-br from-emerald-100 via-green-50 to-teal-100 p-3 text-emerald-950 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-200 text-emerald-900"><Leaf className="size-4" aria-hidden="true" /></span><div className="min-w-0"><p className="mb-0 truncate text-[9px] font-extrabold uppercase tracking-[0.1em] text-emerald-900">{t.exportDashboardKicker}</p><h1 className="mb-0 mt-0.5 truncate text-xs font-black leading-tight tracking-tight sm:text-base">{project.name}</h1></div></div><div className="flex shrink-0 items-center gap-2"><span className="hidden rounded-full bg-emerald-200/80 px-2.5 py-1 text-[10px] font-bold text-emerald-950 sm:inline">{m.projectStatus[project.status]}</span><button type="button" onClick={() => { setEditError(false); setModal("details"); }} aria-label={m.projectDetails} title={m.projectDetails} className="inline-flex size-8 items-center justify-center rounded-full border border-emerald-300 text-emerald-950 transition hover:bg-white/50 sm:size-9"><ScrollText className="size-3.5" aria-hidden="true" /></button></div></div>
            </section>
          </div>
          <aside className="order-first hidden lg:order-last lg:block"><div className="sticky top-24 rounded-[28px] border border-emerald-100 bg-white/90 p-3 shadow-xl shadow-emerald-950/[0.05] backdrop-blur"><div className="mb-3 rounded-2xl bg-forest p-3 text-white"><p className="m-0 text-[10px] font-bold text-amber-light">{t.exportDashboardKicker}</p><p className="m-0 mt-1 truncate text-sm font-black">{project.name}</p></div><p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">{locale === "fa" ? "بخش‌های پروژه" : "PROJECT SECTIONS"}</p>{[
            ["sales", locale === "fa" ? "فروش" : "Sales", locale === "fa" ? ["عملیات فروش", "طرف‌حساب‌ها"] : ["Sales operations", "Counterparties"]],
            ["purchases", locale === "fa" ? "خرید" : "Purchases", locale === "fa" ? ["ثبت خرید", "هزینه‌های خرید"] : ["Purchase entry", "Purchase costs"]],
            ["catalog", locale === "fa" ? "کالاها" : "Products", locale === "fa" ? ["کالاهای صادراتی", "ملزومات"] : ["Export products", "Supplies"]],
            ["logistics", locale === "fa" ? "لجستیک" : "Logistics", locale === "fa" ? ["محموله‌ها", "پیگیری حمل"] : ["Shipments", "Transport tracking"]]
          ].map(([key, label, children]) => { const Icon = key === "sales" ? TrendingUp : key === "purchases" ? ShoppingCart : key === "catalog" ? Boxes : Warehouse; return <div key={key as string}><button type="button" onClick={() => setSection(key as ExportSection)} className={`mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-sm font-extrabold transition ${section === key ? "bg-sage text-forest" : "text-muted hover:bg-cream hover:text-forest"}`}><Icon className="size-4" aria-hidden="true" /><span>{label as string}</span><span className={`ms-auto text-xs transition-transform ${section === key ? "rotate-180" : ""}`}>⌄</span></button>{section === key && <div className="mb-1 ms-5 border-s border-emerald-200 ps-2">{(children as string[]).map((child) => <button key={child} type="button" onClick={() => setSection(key as ExportSection)} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-xs font-bold text-muted transition hover:bg-cream hover:text-forest"><span className="size-1.5 rounded-full bg-emerald-500" />{child}</button>)}</div>}</div>; })}</div></aside>
          <nav aria-label={locale === "fa" ? "ناوبری موبایل صادرات" : "Mobile export navigation"} className="fixed inset-x-2 bottom-2 z-30 grid grid-cols-4 gap-1 rounded-[20px] border border-line bg-paper/95 p-1.5 shadow-xl shadow-forest/10 backdrop-blur lg:hidden">{[["sales", TrendingUp, locale === "fa" ? "فروش" : "Sales"], ["purchases", ShoppingCart, locale === "fa" ? "خرید" : "Purchases"], ["catalog", Boxes, locale === "fa" ? "کالاها" : "Products"], ["logistics", Warehouse, locale === "fa" ? "لجستیک" : "Logistics"]].map(([key, Icon, label]) => <button key={key as string} type="button" onClick={() => setSection(key as ExportSection)} className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-extrabold ${section === key ? "bg-forest text-white" : "text-muted"}`}><Icon className="size-3.5" aria-hidden="true" />{label as string}</button>)}</nav>
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        {section === "sales" && <ExportOperationsWorkspace code={project.code} mode="sale" />}
        {section === "purchases" && <ExportOperationsWorkspace code={project.code} mode="purchase" />}
        {section === "catalog" && <ExportOperationsWorkspace code={project.code} mode="catalog" onBackToMain={() => setSection("sales")} />}
        {section === "logistics" && <ExportWorkspace code={project.code} />}
          </div>
        </div>
      </div>
      {modal && <ProjectModal title={modal === "details" ? t.projectDetails : t.editProjectTitle} onClose={closeModal}>{modal === "details" ? <ProjectDetails project={project} onEdit={() => { setEditError(false); setModal("edit"); }} /> : <ProjectForm initial={project} isEdit busy={editBusy} error={editError ? m.projectSaveError : ""} currencyNote={m.currencyNote} onSubmit={(input) => void saveProject(input)} onCancel={closeModal} />}</ProjectModal>}
    </main>
  );
}
