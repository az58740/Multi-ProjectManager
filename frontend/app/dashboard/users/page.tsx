"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CirclePlus, Pencil, ShieldCheck, Users } from "lucide-react";
import { useLocale } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { ProjectModal } from "@/components/project-modal";
import { UserForm } from "@/components/user-form";
import { accountMessages } from "@/lib/account-i18n";
import { isUserList, jsonHeaders, responseError, type AccountUser, type CreateUser, type Session, type UpdateUser, type UserStatus } from "@/lib/accounts";
import { fetchWithTimeout } from "@/lib/http";

type View = "loading" | "ready" | "denied" | "error";

export default function UsersPage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const m = accountMessages[locale];
  const BackArrow = locale === "fa" ? ArrowRight : ArrowLeft;
  const [view, setView] = useState<View>("loading");
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [selfId, setSelfId] = useState<string>("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<"list" | "afterSave" | "">("");
  const [target, setTarget] = useState<AccountUser | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const loadUsers = useCallback(async (afterSave = false) => {
    setListLoading(true);
    setListError("");
    try {
      const response = await fetchWithTimeout("/api/v1/users", { cache: "no-store" }, 10_000);
      if (response.status === 401) { router.replace(afterSave ? "/login?reason=session-ended" : "/login"); return; }
      if (response.status === 403) { setUsers([]); setView("denied"); return; }
      if (!response.ok) throw new Error("users unavailable");
      const payload: unknown = await response.json();
      if (!isUserList(payload)) throw new Error("invalid users response");
      setUsers(payload.items);
    } catch {
      setListError(afterSave ? "afterSave" : "list");
    } finally {
      setListLoading(false);
    }
  }, [router]);

  const checkAccess = useCallback(async () => {
    setView("loading");
    try {
      const response = await fetchWithTimeout("/api/v1/auth/session", { cache: "no-store" }, 8_000);
      if (response.status === 401) { router.replace("/login"); return; }
      if (response.status === 403) { setView("denied"); return; }
      if (!response.ok) throw new Error("session unavailable");
      const session = await response.json() as Session;
      if (!session.authenticated) { router.replace("/login"); return; }
      if (session.authorized !== true || session.user?.role !== "admin") { setView("denied"); return; }
      setSelfId(String(session.user.id));
      setView("ready");
      await loadUsers();
    } catch {
      setView("error");
    }
  }, [loadUsers, router]);

  useEffect(() => { void checkAccess(); }, [checkAccess]);

  const closeForm = useCallback(() => {
    if (!busy) { setTarget(undefined); setFormError(""); }
  }, [busy]);

  async function saveUser(payload: CreateUser | UpdateUser) {
    if (busy || target === undefined) return;
    const editing = target !== null;
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      const response = await fetchWithTimeout(editing ? `/api/v1/users/${encodeURIComponent(String(target.id))}` : "/api/v1/users", {
        method: editing ? "PATCH" : "POST", headers: jsonHeaders(), body: JSON.stringify(payload),
      }, 10_000);
      if (response.status === 401) { router.replace("/login?reason=session-ended"); return; }
      if (!response.ok) { setFormError(await responseError(response, locale, editing ? "update" : "other")); return; }
      setTarget(undefined);
      setNotice(editing ? m.userUpdated : m.userCreated);
      await loadUsers(true);
    } catch {
      setFormError(m.connectionError);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(user: AccountUser, status: UserStatus) {
    const prompt = status === "active" ? m.confirmActivate : m.confirmSuspend;
    const ownWarning = String(user.id) === selfId ? `\n${m.ownAccountWarning}` : "";
    if (busy || !window.confirm(prompt + ownWarning)) return;
    setBusy(true);
    setNotice("");
    setActionError("");
    try {
      const response = await fetchWithTimeout(`/api/v1/users/${encodeURIComponent(String(user.id))}`, {
        method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ status }),
      }, 10_000);
      if (response.status === 401) { router.replace("/login?reason=session-ended"); return; }
      if (!response.ok) { setActionError(await responseError(response, locale, "update")); return; }
      setNotice(m.statusUpdated);
      await loadUsers(true);
    } catch {
      setActionError(m.connectionError);
    } finally {
      setBusy(false);
    }
  }

  if (view === "loading") return <main className="grid min-h-screen place-items-center bg-cream text-sm font-semibold text-muted"><p role="status">{m.loadingSession}</p></main>;
  if (view === "error" || view === "denied") return (
    <main className="grid min-h-screen place-items-center bg-cream p-6">
      <section className="w-full max-w-lg rounded-[28px] border border-line bg-paper p-7 text-center shadow-xl shadow-forest/5 sm:p-10">
        <div className="flex justify-end"><LanguageToggle /></div>
        <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-sage text-forest"><ShieldCheck className="size-6" aria-hidden="true" /></span>
        <h1 className="mb-0 mt-5 text-xl font-black leading-8 text-forest">{view === "denied" ? m.deniedTitle : m.sessionError}</h1>
        {view === "error" && <button type="button" onClick={() => void checkAccess()} className="mt-6 min-h-12 rounded-full bg-forest px-6 text-sm font-extrabold text-white">{m.retry}</button>}
        <Link href="/dashboard" className="mt-5 block text-sm font-bold text-forest underline underline-offset-4">{m.backDashboard}</Link>
      </section>
    </main>
  );

  return (
    <main className="min-h-screen bg-cream">
      <header className="border-b border-line bg-paper"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"><Link href="/" aria-label={t.brand}><BrandMark /></Link><LanguageToggle /></div></header>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-muted transition hover:text-forest"><BackArrow className="size-4" aria-hidden="true" />{m.backDashboard}</Link>
        <div className="mt-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="mb-3 grid size-12 place-items-center rounded-[17px] bg-sage text-forest"><Users className="size-6" aria-hidden="true" /></div><h1 className="m-0 text-3xl font-black tracking-tight text-forest sm:text-4xl">{m.users}</h1><p className="mb-0 mt-2 text-sm leading-7 text-muted">{m.usersSubtitle}</p></div>
          <button type="button" disabled={busy} onClick={() => { setTarget(null); setFormError(""); setNotice(""); setActionError(""); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:opacity-60"><CirclePlus className="size-5" aria-hidden="true" />{m.addUser}</button>
        </div>
        {notice && <p role="status" className="mt-6 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-semibold text-forest">{notice}</p>}
        {actionError && <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{actionError}</p>}
        {busy && target === undefined && <p role="status" className="mt-6 text-sm font-semibold text-muted">{m.saving}</p>}
        {listError && <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{listError === "afterSave" ? m.refreshAfterSaveError : m.listError} <button type="button" onClick={() => void loadUsers()} className="ms-2 font-bold underline underline-offset-4">{m.retry}</button></div>}
        <div className="mt-7 flex items-center justify-between border-b border-line pb-3"><h2 className="m-0 text-lg font-black text-forest">{m.userList}</h2><span className="text-xs font-semibold text-muted">{m.userCount}: {users.length.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</span></div>
        {listLoading ? <p role="status" className="py-12 text-center text-sm font-semibold text-muted">{m.loadingUsers}</p> : !listError && users.length === 0 ? <p className="rounded-[26px] border border-dashed border-sage-dark bg-paper px-6 py-12 text-center text-sm font-semibold text-muted">{m.noUsers}</p> : (
          <div className="mt-4 grid gap-3">
            {users.map((user) => {
              const date = new Date(user.createdAt);
              const dateLabel = Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US");
              return (
                <article key={String(user.id)} className="rounded-[24px] border border-line bg-paper p-5 sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0"><h3 className="m-0 break-words text-base font-extrabold text-forest">{user.name}</h3><p dir="ltr" className="mb-0 mt-1 break-all text-start text-sm text-muted">{user.email}</p></div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold"><span className="rounded-full bg-cream px-3 py-2 text-forest">{user.role === "admin" ? m.administrator : m.user}</span><span className={`rounded-full px-3 py-2 ${user.status === "active" ? "bg-sage text-forest" : user.status === "pending" ? "bg-amber-soft text-[#87652a]" : "bg-stone-100 text-stone-700"}`}>{user.status === "active" ? m.active : user.status === "pending" ? m.pending : m.disabled}</span><span className="px-1 text-muted">{m.createdAt}: {dateLabel}</span></div>
                    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} aria-label={`${m.edit}: ${user.name}`} onClick={() => { setTarget(user); setFormError(""); setNotice(""); setActionError(""); }} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-bold text-forest hover:bg-sage disabled:opacity-60"><Pencil className="size-4" aria-hidden="true" />{m.edit}</button><button type="button" disabled={busy} aria-label={`${user.status === "active" ? m.suspend : m.activate}: ${user.name}`} onClick={() => void changeStatus(user, user.status === "active" ? "disabled" : "active")} className="min-h-10 rounded-full border border-line px-4 text-sm font-bold text-muted hover:bg-cream disabled:opacity-60">{user.status === "active" ? m.suspend : m.activate}</button></div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {target !== undefined && <ProjectModal title={target ? m.editUser : m.addUser} onClose={closeForm}><UserForm user={target} ownAccount={!!target && String(target.id) === selfId} busy={busy} error={formError} onSave={(payload) => void saveUser(payload)} onCancel={closeForm} /></ProjectModal>}
    </main>
  );
}
