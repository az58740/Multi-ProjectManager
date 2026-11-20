"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Leaf, LoaderCircle, LogOut, ScrollText } from "lucide-react";
import { useLocale } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";
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
    return <main className="grid min-h-screen place-items-center bg-cream p-6"><section className="w-full max-w-lg rounded-[28px] border border-line bg-paper p-8 text-center"><span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-sage text-forest"><Leaf className="size-6" aria-hidden="true" /></span><h1 className="mb-0 mt-5 text-xl font-black text-forest">{isError ? m.projectLoadError : t.exportNotFoundTitle}</h1>{!isError && <p className="mb-0 mt-2 text-sm leading-7 text-muted">{t.exportNotFoundDescription}</p>}<div className="mt-6 flex flex-wrap justify-center gap-3">{isError && <button type="button" onClick={() => setAttempt((current) => current + 1)} className="min-h-11 rounded-full bg-forest px-5 text-sm font-extrabold text-white">{m.retry}</button>}<Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-extrabold text-forest">{t.exportBackToProjects}</Link></div></section></main>;
  }

  return (
    <main className="min-h-screen bg-cream">
      <header className="border-b border-line bg-paper"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"><Link href="/dashboard" className="inline-flex items-center gap-3"><BrandMark /></Link><div className="flex items-center gap-2 sm:gap-3"><LanguageToggle /><button type="button" onClick={() => void signOut()} aria-label={t.logout} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-muted transition hover:bg-cream hover:text-forest"><LogOut className="size-4" aria-hidden="true" /><span className="hidden sm:inline">{t.logout}</span></button></div></div></header>
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-extrabold text-forest"><ArrowRight className={`size-4 ${locale === "en" ? "rotate-180" : ""}`} aria-hidden="true" />{t.exportBackToProjects}</Link>
        {demoMode && <div className="mt-5 rounded-2xl border border-amber/30 bg-amber-soft/80 px-4 py-3 text-xs font-semibold leading-6 text-forest sm:text-sm">{t.demoBanner}</div>}
        {logoutError && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{accountMessages[locale].logoutError}</div>}
        {projectSaved && <div role="status" className="mt-5 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{m.projectSaved}</div>}
        <section className="mt-5 rounded-[28px] bg-forest p-6 text-white shadow-xl shadow-forest/10 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><span className="grid size-11 place-items-center rounded-[15px] bg-white/10 text-amber-light"><Leaf className="size-5" aria-hidden="true" /></span><span dir="ltr" className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-xs font-black">{project.code}</span><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{m.projectStatus[project.status]}</span></div><p className="mb-0 mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-amber-light">{t.exportDashboardKicker}</p><h1 className="mb-0 mt-2 break-words text-3xl font-black tracking-tight sm:text-4xl">{project.name}</h1><p className="mb-0 mt-3 max-w-2xl text-sm leading-7 text-white/70">{m.description}</p><button type="button" onClick={() => { setEditError(false); setModal("details"); }} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 px-4 text-xs font-bold text-white transition hover:bg-white/10"><ScrollText className="size-4" aria-hidden="true" />{m.projectDetails}</button></div><dl className="m-0 grid grid-cols-2 gap-3 text-sm sm:min-w-[310px]">{[[m.location, project.location], [m.destination, project.destination], [m.manager, project.manager], [m.accountant, project.accountant]].map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl bg-white/10 p-4"><dt className="text-xs text-white/60">{label}</dt><dd className="mb-0 ms-0 mt-2 break-words font-extrabold">{value || "—"}</dd></div>)}</dl></div>
        </section>
        <ExportWorkspace key={project.code} code={project.code} />
        <aside className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-paper px-5 py-4"><ScrollText className="mt-0.5 size-5 shrink-0 text-amber" aria-hidden="true" /><div><h2 className="m-0 text-sm font-black text-forest">{m.financialTitle}</h2><p className="mb-0 mt-1 text-xs leading-6 text-muted">{m.financialDescription}</p></div></aside>
      </div>
      {modal && <ProjectModal title={modal === "details" ? t.projectDetails : t.editProjectTitle} onClose={closeModal}>{modal === "details" ? <ProjectDetails project={project} onEdit={() => { setEditError(false); setModal("edit"); }} /> : <ProjectForm initial={project} isEdit busy={editBusy} error={editError ? m.projectSaveError : ""} currencyNote={m.currencyNote} onSubmit={(input) => void saveProject(input)} onCancel={closeModal} />}</ProjectModal>}
    </main>
  );
}
