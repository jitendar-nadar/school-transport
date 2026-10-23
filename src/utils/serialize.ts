function isObjectId(value: object) {
  return (value as { _bsontype?: string })._bsontype === "ObjectId";
}

const HIDDEN_KEYS = new Set(["__v", "passwordHash", "refreshTokenSessions"]);

export function serialize(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => serialize(entry));
  if (typeof value === "object") {
    if (isObjectId(value)) return String(value);
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (HIDDEN_KEYS.has(key)) continue;
      output[key === "_id" ? "id" : key] = serialize(entry);
    }
    return output;
  }
  return value;
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function searchClause(fields: string[], search?: string) {
  const term = search?.trim();
  if (!term) return {};
  const pattern = escapeRegex(term);
  const clauses = fields.map((field) => ({ [field]: { $regex: pattern, $options: "i" } }));
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}
