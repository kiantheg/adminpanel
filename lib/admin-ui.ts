import type { GenericRow } from "@/lib/supabase-rest";
import type { ResourceField, ResourceFieldType } from "@/lib/admin-resources";

export function shortId(id: string | null | undefined) {
  if (!id) return "-";
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function inferFieldType(value: unknown): ResourceFieldType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "object" && value !== null) return "json";
  return "text";
}

export function inferFormFields(rows: GenericRow[], previewFields: string[], pkField: string): ResourceField[] {
  const ignored = new Set([
    pkField,
    "created_datetime_utc",
    "modified_datetime_utc",
    "created_at",
    "updated_at",
    "created_by_user_id",
    "modified_by_user_id",
  ]);

  const sample = rows[0] ?? {};
  const candidateFields = previewFields.filter((field) => !ignored.has(field));

  return candidateFields.map((field) => ({
    name: field,
    label: field.replaceAll("_", " "),
    type: inferFieldType(sample[field]),
  }));
}

export function parseFieldValue(raw: string, type: ResourceFieldType | undefined, allowNull: boolean) {
  if (raw === "") {
    return allowNull ? null : undefined;
  }

  if (type === "number") {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new Error("Expected a number.");
    }
    return parsed;
  }

  if (type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw new Error("Expected true or false.");
  }

  if (type === "json") {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("Expected valid JSON.");
    }
  }

  return raw;
}

export function buildPayload(
  fields: ResourceField[],
  values: Record<string, string>,
  allowNull: boolean,
): GenericRow {
  const payload: GenericRow = {};

  for (const field of fields) {
    const value = parseFieldValue(values[field.name] ?? "", field.type, allowNull);
    if (value !== undefined) {
      payload[field.name] = value;
    }
  }

  return payload;
}

export function validateRequiredFields(fields: ResourceField[], values: Record<string, string>) {
  for (const field of fields) {
    if (field.required && !(values[field.name] ?? "").trim()) {
      throw new Error(`${field.label} is required.`);
    }
  }
}

export function initFormState(fields: ResourceField[], source?: GenericRow | null) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = source?.[field.name];
      if (value === null || value === undefined) {
        return [field.name, ""];
      }
      if (typeof value === "object") {
        return [field.name, JSON.stringify(value, null, 2)];
      }
      return [field.name, String(value)];
    }),
  );
}

export function buildPageWindow(current: number, total: number) {
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  return [...pages].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);
}
