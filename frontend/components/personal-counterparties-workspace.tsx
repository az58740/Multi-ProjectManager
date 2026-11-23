"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CirclePlus, LoaderCircle, Pencil, RefreshCw, UsersRound } from "lucide-react";
import { useLocale } from "@/app/providers";
import { jsonHeaders } from "@/lib/accounts";
import { fetchJsonWithTimeout, fetchWithTimeout } from "@/lib/http";
import { isPersonalCounterpartyList, type PersonalCounterparty, type PersonalCounterpartyInput, type PersonalEntityType } from "@/lib/personal";
import { ProjectModal } from "@/components/project-modal";

const inputClass = "mt-2 min-h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-not-allowed disabled:opacity-60";
type FormMode = "new" | PersonalCounterparty;
const blank: PersonalCounterpartyInput = { entityType: "individual", name: "", identityNumber: "", phone: "", address: "", notes: "" };

export function PersonalCounterpartiesWorkspace({ code }: { code: string }) {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const path = `/api/v1/projects/${encodeURIComponent(code)}/personal/counterparties`;
  const [items, setItems] = useState<PersonalCounterparty[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [mode, setMode] = useState<FormMode | null>(null);
  const [draft, setDraft] = useState<PersonalCounterpartyInput>(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const { response, payload } = await fetchJsonWithTimeout(path, { cache: "no-store" });
      if (!response.ok || !isPersonalCounterpartyList(payload)) throw new Error("load");
      setItems(payload.items); setState("ready");
    } catch { setState("error"); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);

  function openNew() { setDraft(blank); setMode("new"); setMessage(""); }
  function openEdit(item: PersonalCounterparty) { setDraft({ entityType: item.entityType, name: item.name, identityNumber: item.identityNumber, phone: item.phone, address: item.address, notes: item.notes }); setMode(item); setMessage(""); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
    const id = mode && mode !== "new" ? mode.id : null;
    try {
      const response = await fetchWithTimeout(id ? `${path}/${encodeURIComponent(id)}` : path, { method: id ? "PUT" : "POST", headers: jsonHeaders(), body: JSON.stringify(draft) });
      if (response.status === 409) throw new Error("conflict");
      if (!response.ok) throw new Error("save");
      setMode(null); await load(); setMessage(fa ? (id ? "طرف‌حساب ویرایش شد." : "طرف‌حساب ثبت شد.") : (id ? "Counterparty updated." : "Counterparty saved."));
    } catch (error) { setMessage(error instanceof Error && error.message === "conflict" ? (fa ? "این شماره شناسایی قبلاً برای این پروژه ثبت شده است." : "This identity number is already used in this project.") : (fa ? "ذخیره طرف‌حساب انجام نشد." : "Could not save counterparty.")); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 rounded-[28px] border border-line bg-paper p-5 shadow-sm sm:p-7" aria-labelledby="personal-counterparties-title">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-teal-700"><UsersRound className="size-4" />{fa ? "دفتر طرف‌حساب‌ها" : "Counterparty directory"}</div><h2 id="personal-counterparties-title" className="mb-0 mt-2 text-2xl font-black text-forest">{fa ? "اشخاص حقیقی و حقوقی" : "Individuals and legal entities"}</h2><p className="mb-0 mt-2 text-sm leading-7 text-muted">{fa ? "طرف‌حساب‌های این شخص را جدا از پروژه‌های صادراتی ثبت و مدیریت کنید." : "Manage this person's counterparties separately from export projects."}</p></div><button type="button" onClick={openNew} className={buttonClass}><CirclePlus className="size-4" />{fa ? "طرف‌حساب جدید" : "New counterparty"}</button></div>
    {message && <p role="status" className="mt-4 rounded-2xl border border-sage-dark bg-sage px-4 py-3 text-sm font-bold text-forest">{message}</p>}
    {state === "loading" ? <div role="status" className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted"><LoaderCircle className="size-5 animate-spin" />{fa ? "در حال دریافت…" : "Loading…"}</div> : state === "error" ? <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{fa ? "فهرست طرف‌حساب‌ها دریافت نشد." : "Could not load counterparties."}<button type="button" onClick={() => void load()} className="ms-2 font-bold underline"><RefreshCw className="me-1 inline size-3.5" />{fa ? "تلاش دوباره" : "Retry"}</button></div> : items.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-sage-dark p-6 text-sm text-muted">{fa ? "هنوز طرف‌حساب شخصی ثبت نشده است." : "No personal counterparties yet."}</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-2xl border border-line bg-white p-4"><div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-teal-100 px-2.5 py-1 text-[10px] font-bold text-teal-900">{item.entityType === "individual" ? (fa ? "شخص حقیقی" : "Individual") : (fa ? "شخص حقوقی" : "Legal entity")}</span><h3 className="mb-0 mt-3 text-base font-black text-forest">{item.name}</h3></div><button type="button" onClick={() => openEdit(item)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-sage-dark px-3 text-xs font-bold text-forest"><Pencil className="size-3.5" />{fa ? "ویرایش" : "Edit"}</button></div><dl className="mt-4 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted">{fa ? "شناسه / کد ملی" : "Identity number"}</dt><dd dir="ltr" className="m-0 font-semibold text-ink">{item.identityNumber || "—"}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">{fa ? "تلفن" : "Phone"}</dt><dd dir="ltr" className="m-0 font-semibold text-ink">{item.phone || "—"}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">{fa ? "نشانی" : "Address"}</dt><dd className="m-0 max-w-[65%] text-end font-semibold text-ink">{item.address || "—"}</dd></div></dl>{item.notes && <p className="mb-0 mt-3 border-t border-line pt-3 text-xs leading-6 text-muted">{item.notes}</p>}</article>)}</div>}
    {mode && <ProjectModal title={mode === "new" ? (fa ? "ثبت طرف‌حساب جدید" : "New counterparty") : (fa ? "ویرایش طرف‌حساب" : "Edit counterparty")} onClose={() => { if (!busy) setMode(null); }}><form onSubmit={(event) => void save(event)} className="space-y-4"><label className="block text-xs font-bold">{fa ? "نوع طرف‌حساب" : "Entity type"}<select value={draft.entityType} onChange={(event) => setDraft({ ...draft, entityType: event.target.value as PersonalEntityType })} className={inputClass}><option value="individual">{fa ? "شخص حقیقی" : "Individual"}</option><option value="legal">{fa ? "شخص حقوقی" : "Legal entity"}</option></select></label><label className="block text-xs font-bold">{fa ? "نام و نام خانوادگی / نام شرکت" : "Full name / company name"}<input required maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{fa ? "کد ملی / شناسه ملی" : "National / registration ID"}<input maxLength={80} value={draft.identityNumber} onChange={(event) => setDraft({ ...draft, identityNumber: event.target.value })} className={inputClass} dir="ltr" /></label><label className="text-xs font-bold">{fa ? "شماره تماس" : "Phone"}<input maxLength={80} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className={inputClass} dir="ltr" /></label></div><label className="block text-xs font-bold">{fa ? "نشانی" : "Address"}<textarea maxLength={300} rows={3} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} className={`${inputClass} min-h-24 resize-y py-3`} /></label><label className="block text-xs font-bold">{fa ? "توضیحات" : "Notes"}<textarea maxLength={1000} rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className={`${inputClass} min-h-24 resize-y py-3`} /></label><div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setMode(null)} className="min-h-11 rounded-full border border-line px-5 text-sm font-bold text-muted">{fa ? "انصراف" : "Cancel"}</button><button disabled={busy} className={buttonClass}>{busy && <LoaderCircle className="size-4 animate-spin" />}{fa ? "ذخیره طرف‌حساب" : "Save counterparty"}</button></div></form></ProjectModal>}
  </section>;
}
