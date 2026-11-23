"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckSquare, Landmark, LoaderCircle, LogOut, UsersRound, WalletCards } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { LedgerWorkspace } from "@/components/ledger-workspace";
import { PersonalCounterpartiesWorkspace } from "@/components/personal-counterparties-workspace";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { jsonHeaders } from "@/lib/accounts";
import { isProjectListPayload, type Project } from "@/lib/projects";

export default function PersonalAccountDashboardPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const code = typeof params.code === "string" ? params.code : "";

  useEffect(() => {
    let active = true;
    void fetchJsonWithTimeout("/api/v1/projects", { cache: "no-store" }, 10_000).then(({ response, payload }) => {
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok || !isProjectListPayload(payload)) throw new Error("projects");
      const found = payload.items.find((item) => item.code === code && item.type === "personal-account") ?? null;
      if (active) { setProject(found); setState(found ? "ready" : "error"); }
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [code, router]);

  async function signOut() {
    await fetchWithTimeout("/api/v1/auth/logout", { method: "POST", headers: jsonHeaders() });
    router.replace("/");
  }

  if (state === "loading") return <main className="flex min-h-screen items-center justify-center gap-2 bg-cream text-sm font-semibold text-muted"><LoaderCircle className="size-5 animate-spin" />{fa ? "در حال بارگذاری…" : "Loading…"}</main>;
  if (state === "error" || !project) return <main className="grid min-h-screen place-items-center bg-cream p-6"><section className="rounded-[28px] border border-line bg-paper p-8 text-center"><p className="m-0 font-bold text-forest">{fa ? "داشبورد مدیریت حساب شخص پیدا نشد." : "Personal account dashboard not found."}</p><Link href="/dashboard" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-forest px-5 text-sm font-extrabold text-white">{fa ? "بازگشت به پروژه‌ها" : "Back to projects"}</Link></section></main>;

  return <main className="min-h-screen bg-cream pb-8">
    <header className="border-b border-line bg-paper"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"><Link href="/dashboard"><BrandMark /></Link><div className="flex items-center gap-2"><LanguageToggle /><button type="button" onClick={() => void signOut()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-3 text-sm font-semibold text-muted"><LogOut className="size-4" /><span className="hidden sm:inline">{fa ? "خروج" : "Sign out"}</span></button></div></div></header>
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8"><Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-extrabold text-forest"><ArrowRight className={`size-4 ${locale === "en" ? "rotate-180" : ""}`} />{fa ? "بازگشت به پروژه‌ها" : "Back to projects"}</Link>
      <section className="mt-4 rounded-[24px] border border-teal-200 bg-gradient-to-br from-teal-100 via-cyan-50 to-sky-100 p-5 text-teal-950 shadow-sm sm:p-7"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-teal-200 text-teal-950"><Landmark className="size-5" /></span><div><p className="m-0 text-[10px] font-extrabold uppercase tracking-[0.16em]">{fa ? "مدیریت مالی شخصی" : "Personal finance management"}</p><h1 className="mb-0 mt-1 text-2xl font-black">{project.name}</h1><p className="mb-0 mt-2 max-w-3xl text-sm leading-7 text-teal-950/75">{fa ? "حساب‌های بانکی، هزینه‌ها، طرف‌حساب‌ها و چک‌های این شخص در یک فضای مستقل مدیریت می‌شود." : "Manage this person's bank accounts, expenses, counterparties and checks in one focused workspace."}</p></div></div></section>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-line bg-paper p-4"><WalletCards className="size-5 text-teal-700" /><p className="mb-0 mt-3 text-sm font-black text-forest">{fa ? "حساب‌های بانکی شخص" : "Personal bank accounts"}</p><p className="mb-0 mt-1 text-xs text-muted">{fa ? "در دفترکل زیر تعریف و کنترل می‌شوند." : "Defined and controlled in the ledger below."}</p></div><div className="rounded-2xl border border-line bg-paper p-4"><UsersRound className="size-5 text-teal-700" /><p className="mb-0 mt-3 text-sm font-black text-forest">{fa ? "طرف‌حساب‌های حقیقی و حقوقی" : "Individual & legal counterparties"}</p><p className="mb-0 mt-1 text-xs text-muted">{fa ? "بخش اختصاصی طرف‌حساب‌های شخصی." : "A dedicated personal counterparty area."}</p></div><div className="rounded-2xl border border-line bg-paper p-4"><CheckSquare className="size-5 text-teal-700" /><p className="mb-0 mt-3 text-sm font-black text-forest">{fa ? "هزینه‌ها و چک‌ها" : "Expenses & checks"}</p><p className="mb-0 mt-1 text-xs text-muted">{fa ? "در ادامهٔ داشبورد با وضعیت و سررسید جداگانه مدیریت می‌شوند." : "Managed next with separate status and due-date tracking."}</p></div></div>
      <PersonalCounterpartiesWorkspace code={project.code} />
      <LedgerWorkspace code={project.code} />
      <section className="mt-5 rounded-2xl border border-dashed border-teal-300 bg-teal-50/70 p-4 text-sm leading-7 text-teal-950"><BookOpen className="mb-2 size-5" />{fa ? "ثبت هزینه‌های شخصی فعلاً از طریق ثبت سند در دفترکل انجام می‌شود. مدل اختصاصی طرف‌حساب و چک در مرحلهٔ بعد به همین داشبورد اضافه خواهد شد تا اطلاعات آن‌ها با صادرات و سایر پروژه‌ها مخلوط نشود." : "Personal expenses can currently be recorded as ledger entries. Dedicated counterparty and check records will be added next in this dashboard so they remain separate from export and other projects."}</section>
    </div>
  </main>;
}
