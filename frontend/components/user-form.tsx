"use client";

import { useState, type FormEvent } from "react";
import { useLocale } from "@/app/providers";
import { accountMessages } from "@/lib/account-i18n";
import { isUserRole, isUserStatus, isValidNewPassword, type AccountUser, type CreateUser, type UpdateUser } from "@/lib/accounts";

const inputClass = "mt-2 min-h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm font-medium text-ink outline-none transition focus:border-forest/40 focus:ring-4 focus:ring-sage/70";

export function UserForm({ user, ownAccount, busy, error, onSave, onCancel }: {
  user: AccountUser | null;
  ownAccount: boolean;
  busy: boolean;
  error: string;
  onSave: (payload: CreateUser | UpdateUser) => void;
  onCancel: () => void;
}) {
  const { locale, t } = useLocale();
  const m = accountMessages[locale];
  const [validationError, setValidationError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name") ?? "").trim();
    const role = fields.get("role");
    const status = fields.get("status");
    const password = String(fields.get("password") ?? "");
    if (!name || !isUserRole(role) || !isUserStatus(status)) { setValidationError(m.invalidInput); return; }
    if ((!user || password) && !isValidNewPassword(password)) { setValidationError(m.passwordRule); return; }
    setValidationError("");
    if (user) onSave({ name, role, status, ...(password ? { password } : {}) });
    else onSave({ name, email: String(fields.get("email") ?? "").trim(), password, role, status });
  }
  return (
    <form onSubmit={submit} aria-busy={busy} className="space-y-5">
      {(validationError || error) && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{validationError || error}</p>}
      {ownAccount && <p className="rounded-2xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm leading-6 text-forest">{m.ownAccountWarning}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="user-name" className="block text-sm font-bold text-ink">{m.name}<input id="user-name" name="name" autoComplete="name" required defaultValue={user?.name ?? ""} className={inputClass} /></label>
        <label htmlFor="user-email" className="block text-sm font-bold text-ink">{m.email}<input id="user-email" name="email" type="email" autoComplete="email" required readOnly={!!user} defaultValue={user?.email ?? ""} dir="ltr" className={`${inputClass} ${user ? "bg-cream" : ""}`} />{user && <span className="mt-1 block text-xs font-normal text-muted">{m.emailFixed}</span>}</label>
        <label htmlFor="user-role" className="block text-sm font-bold text-ink">{m.role}<select id="user-role" name="role" defaultValue={user?.role ?? "user"} className={inputClass}><option value="user">{m.user}</option><option value="admin">{m.administrator}</option></select></label>
        <label htmlFor="user-status" className="block text-sm font-bold text-ink">{m.status}<select id="user-status" name="status" defaultValue={user?.status ?? "pending"} className={inputClass}><option value="pending">{m.pending}</option><option value="active">{m.active}</option><option value="disabled">{m.disabled}</option></select></label>
        <label htmlFor="user-password" className="block text-sm font-bold text-ink sm:col-span-2">{user ? m.newPassword : m.password}<input id="user-password" name="password" type="password" autoComplete="new-password" required={!user} dir="ltr" className={inputClass} />{user && <span className="mt-1 block text-xs font-normal text-muted">{m.passwordOptional}</span>}<span className="mt-1 block text-xs font-normal leading-6 text-muted">{m.passwordRule}</span></label>
      </div>
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-12 rounded-full border border-line px-5 text-sm font-bold text-muted hover:bg-cream disabled:opacity-60">{t.cancel}</button>
        <button type="submit" disabled={busy} className="min-h-12 rounded-full bg-forest px-6 text-sm font-extrabold text-white transition hover:bg-forest-light disabled:cursor-wait disabled:opacity-70">{busy ? m.saving : user ? m.save : m.create}</button>
      </div>
    </form>
  );
}
