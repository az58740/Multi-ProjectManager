export const PROJECT_TYPES = ["export", "cold-storage", "sorting", "construction", "rental", "personal-account", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = ["planning", "active", "paused", "completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const CURRENCY_CODES = ["IRR", "USD", "EUR", "RUB", "AZN", "TRY", "AED"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** Fields accepted by POST / PUT /api/v1/projects. Keep this shape aligned with the API contract. */
export type ProjectWritePayload = {
  name: string;
  type: ProjectType;
  location: string;
  destination: string;
  manager: string;
  accountant: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  description: string;
  defaultCostCurrency: string;
  defaultSalesCurrency: string;
};

export type Project = ProjectWritePayload & {
  id: string;
  code: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDataMode = "demo" | "database";

export function isProjectType(value: unknown): value is ProjectType {
  return typeof value === "string" && (PROJECT_TYPES as readonly string[]).includes(value);
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isProjectRecord(value: unknown): value is Project {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return isString(item.id) && isString(item.code) && isString(item.name) &&
    isProjectType(item.type) && isString(item.location) && isString(item.destination) &&
    isString(item.manager) && isString(item.accountant) && isProjectStatus(item.status) &&
    isString(item.startDate) && isString(item.endDate) && isString(item.description) &&
    isString(item.defaultCostCurrency) && isString(item.defaultSalesCurrency) &&
    isString(item.createdAt) && !Number.isNaN(Date.parse(item.createdAt)) &&
    isString(item.updatedAt) && !Number.isNaN(Date.parse(item.updatedAt));
}

export function isProjectPayload(value: unknown): value is ProjectWritePayload {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return isString(item.name) && isProjectType(item.type) &&
    isString(item.location) && isString(item.destination) && isString(item.manager) &&
    isString(item.accountant) && isProjectStatus(item.status) && isString(item.startDate) &&
    isString(item.endDate) && isString(item.description) &&
    isString(item.defaultCostCurrency) && isString(item.defaultSalesCurrency);
}

export function isProjectListPayload(value: unknown): value is { items: Project[]; dataMode: ProjectDataMode } {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return Array.isArray(payload.items) && payload.items.every(isProjectRecord) &&
    (payload.dataMode === "demo" || payload.dataMode === "database");
}
