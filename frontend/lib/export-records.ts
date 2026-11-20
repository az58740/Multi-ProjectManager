export const COUNTERPARTY_ROLES = ["supplier", "customer", "intermediary"] as const;
export type CounterpartyRole = (typeof COUNTERPARTY_ROLES)[number];
export const SHIPMENT_STATUSES = ["planning", "in_transit", "delivered", "sold"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export type CounterpartyInput = { name: string; roles: CounterpartyRole[]; phone: string; country: string; notes: string };
export type Counterparty = CounterpartyInput & { id: string; projectId: string; createdAt: string };
export type ShipmentInput = { reference: string; supplierId: string; palletCount: number; weightKg: string; destination: string; status: ShipmentStatus; notes: string };
export type Shipment = ShipmentInput & { id: string; projectId: string; createdAt: string };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCounterparty(value: unknown): value is Counterparty {
  if (!object(value)) return false;
  return typeof value.id === "string" && typeof value.projectId === "string" && typeof value.name === "string" &&
    Array.isArray(value.roles) && value.roles.every((role: unknown) => typeof role === "string" && (COUNTERPARTY_ROLES as readonly string[]).includes(role)) &&
    typeof value.phone === "string" && typeof value.country === "string" && typeof value.notes === "string" && typeof value.createdAt === "string";
}

export function isShipment(value: unknown): value is Shipment {
  if (!object(value)) return false;
  return typeof value.id === "string" && typeof value.projectId === "string" && typeof value.reference === "string" &&
    typeof value.supplierId === "string" && typeof value.palletCount === "number" && typeof value.weightKg === "string" &&
    typeof value.destination === "string" && typeof value.status === "string" && (SHIPMENT_STATUSES as readonly string[]).includes(value.status) &&
    typeof value.notes === "string" && typeof value.createdAt === "string";
}

export function isListOf<T>(value: unknown, guard: (item: unknown) => item is T): value is { items: T[] } {
  return object(value) && Array.isArray(value.items) && value.items.every(guard);
}

/** Accept Persian and Arabic digits in numeric fields while preserving decimal precision. */
export function asciiNumber(value: string): string {
  return value.trim().replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) - (digit >= "۰" && digit <= "۹" ? 0x06f0 : 0x0660))).replace(/٫/g, ".");
}
