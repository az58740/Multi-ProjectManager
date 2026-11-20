export type LedgerAccountScope = "project" | "shared";
export type LedgerAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type LedgerAccount = {
  id: string;
  scope: LedgerAccountScope;
  projectId: string;
  code: string;
  name: string;
  accountType: LedgerAccountType;
  currency: string;
  isActive: boolean;
  createdAt: string;
};

export type JournalLine = {
  id: string;
  accountId: string;
  currency: string;
  debitAmount: string;
  creditAmount: string;
  functionalDebit: string;
  functionalCredit: string;
  exchangeRate: string;
  memo: string;
};

export type JournalEntry = {
  id: string;
  projectId: string;
  entryDate: string;
  description: string;
  idempotencyKey: string;
  createdBy?: string;
  createdAt: string;
  lines: JournalLine[];
};

const accountTypes = ["asset", "liability", "equity", "revenue", "expense"] as const;
const accountScopes = ["project", "shared"] as const;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function isLedgerAccount(value: unknown): value is LedgerAccount {
  if (!record(value)) return false;
  return typeof value.id === "string" && accountScopes.includes(value.scope as LedgerAccountScope)
    && typeof value.projectId === "string" && typeof value.code === "string" && typeof value.name === "string"
    && accountTypes.includes(value.accountType as LedgerAccountType) && typeof value.currency === "string"
    && typeof value.isActive === "boolean" && typeof value.createdAt === "string";
}

function isJournalLine(value: unknown): value is JournalLine {
  if (!record(value)) return false;
  return ["id", "accountId", "currency", "debitAmount", "creditAmount", "functionalDebit", "functionalCredit", "exchangeRate", "memo"]
    .every((key) => typeof value[key] === "string");
}

export function isJournalEntry(value: unknown): value is JournalEntry {
  if (!record(value) || !Array.isArray(value.lines)) return false;
  return typeof value.id === "string" && typeof value.projectId === "string" && typeof value.entryDate === "string"
    && typeof value.description === "string" && typeof value.idempotencyKey === "string" && typeof value.createdAt === "string"
    && value.lines.every(isJournalLine);
}

export function isLedgerAccountList(value: unknown): value is { items: LedgerAccount[] } {
  return record(value) && Array.isArray(value.items) && value.items.every(isLedgerAccount);
}

export function isJournalEntryList(value: unknown): value is { items: JournalEntry[] } {
  return record(value) && Array.isArray(value.items) && value.items.every(isJournalEntry);
}
