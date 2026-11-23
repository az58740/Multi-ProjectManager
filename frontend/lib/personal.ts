export const PERSONAL_ENTITY_TYPES = ["individual", "legal"] as const;
export type PersonalEntityType = (typeof PERSONAL_ENTITY_TYPES)[number];

export type PersonalCounterpartyInput = {
  entityType: PersonalEntityType;
  name: string;
  identityNumber: string;
  phone: string;
  address: string;
  notes: string;
};

export type PersonalCounterparty = PersonalCounterpartyInput & {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object"; }
export function isPersonalCounterparty(value: unknown): value is PersonalCounterparty {
  if (!record(value)) return false;
  return typeof value.id === "string" && typeof value.projectId === "string" && PERSONAL_ENTITY_TYPES.includes(value.entityType as PersonalEntityType)
    && typeof value.name === "string" && typeof value.identityNumber === "string" && typeof value.phone === "string" && typeof value.address === "string" && typeof value.notes === "string"
    && typeof value.createdAt === "string" && typeof value.updatedAt === "string";
}
export function isPersonalCounterpartyList(value: unknown): value is { items: PersonalCounterparty[] } {
  return record(value) && Array.isArray(value.items) && value.items.every(isPersonalCounterparty);
}
