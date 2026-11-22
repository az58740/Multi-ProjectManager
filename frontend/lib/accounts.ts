import type { Locale } from "@/lib/i18n";
import { accountMessages } from "@/lib/account-i18n";

export type UserRole = "admin" | "user";
export type UserStatus = "active" | "pending" | "disabled";
export type AccountUser = {
  id: string | number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
};
export type Session = {
  authenticated?: boolean;
  authorized?: boolean;
  user?: Omit<AccountUser, "createdAt">;
};
export type CreateUser = { name: string; email: string; password: string; role: UserRole; status: UserStatus };
export type UpdateUser = { name?: string; role?: UserRole; status?: UserStatus; password?: string };

export function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "user";
}
export function isUserStatus(value: unknown): value is UserStatus {
  return value === "active" || value === "pending" || value === "disabled";
}
export function isValidNewPassword(value: string): boolean {
  const byteLength = new TextEncoder().encode(value).length;
  return byteLength >= 4 && byteLength <= 72 && !value.includes("\0");
}
export function isUserList(value: unknown): value is { items: AccountUser[] } {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) return false;
  return value.items.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const user = item as Record<string, unknown>;
    return (typeof user.id === "string" || typeof user.id === "number") && typeof user.name === "string"
      && typeof user.email === "string" && isUserRole(user.role) && isUserStatus(user.status)
      && typeof user.createdAt === "string";
  });
}

export async function responseError(response: Response, locale: Locale, context: "login" | "update" | "other" = "other"): Promise<string> {
  const m = accountMessages[locale];
  let code = "";
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string") code = payload.code;
  } catch { /* Error responses may not have a JSON body. */ }
  if (response.status === 403 && code === "pending") return m.pendingLogin;
  if (response.status === 403 && code === "disabled") return m.disabledAccount;
  if ((response.status === 400 || response.status === 401 || response.status === 422) && context === "login") return m.invalidCredentials;
  if (response.status === 401) return m.sessionEnded;
  if (response.status === 403) return m.forbidden;
  if (response.status === 409) return context === "update" ? m.lastAdmin : m.duplicate;
  if (response.status === 404) return m.notFound;
  if (response.status === 429) return m.rateLimited;
  if (response.status === 400 || response.status === 422) return m.invalidInput;
  return m.serviceError;
}

export function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json", "X-App-Origin": window.location.origin };
}
