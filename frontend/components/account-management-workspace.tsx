"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { useLocale } from "@/app/providers";
import { LedgerWorkspace } from "@/components/ledger-workspace";
import type { Project } from "@/lib/projects";

const inputClass = "mt-2 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";

export function AccountManagementWorkspace({ projects }: { projects: Project[] }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [projectCode, setProjectCode] = useState(projects[0]?.code ?? "");

  return <div className="mt-6">
    <div className="rounded-[28px] border border-line bg-paper p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-amber"><Landmark className="size-4" aria-hidden="true" />{fa ? "مدیریت حساب‌ها" : "Account management"}</div>
          <h2 className="mb-0 mt-2 text-2xl font-black text-forest">{fa ? "حساب‌ها و تراکنش‌های مالی" : "Accounts and financial entries"}</h2>
          <p className="mb-0 mt-2 max-w-2xl text-sm leading-7 text-muted">{fa ? "حساب‌های بانکی و پروژه‌ای را تعریف کنید و سندهای متوازن را با چند خط بدهکار و بستانکار ثبت کنید." : "Create bank and project accounts, then record balanced entries with multiple debit and credit lines."}</p>
        </div>
        <label className="text-xs font-bold text-muted">{fa ? "پروژهٔ مرجع" : "Reference project"}
          <select value={projectCode} onChange={(event) => setProjectCode(event.target.value)} className={`${inputClass} mt-1 min-w-52`} dir="ltr">
            {projects.map((project) => <option key={project.id} value={project.code}>{project.code} — {project.name}</option>)}
          </select>
        </label>
      </div>
    </div>
    {projectCode ? <LedgerWorkspace code={projectCode} /> : <p className="mt-6 rounded-2xl border border-dashed border-sage-dark p-6 text-sm text-muted">{fa ? "برای مدیریت حساب‌ها ابتدا یک پروژه انتخاب کنید." : "Select a project to manage accounts."}</p>}
  </div>;
}
