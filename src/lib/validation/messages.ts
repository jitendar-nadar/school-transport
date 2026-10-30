const FIELD_LABELS: Record<string, string> = {
  password: "Password",
  email: "Email",
  name: "Name",
  phone: "Phone",
  role: "Role",
  schoolId: "School",
  studentCode: "Student code",
  className: "Class",
  division: "Division",
  schoolCode: "School code",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  vehicleNumber: "Vehicle number",
  routeCode: "Route code",
  tagIdentifier: "Card",
  parentIds: "Guardians",
  address: "Address",
};

type Flattened = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

function labelFor(field: string) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const words = field.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function rewrite(message: string) {
  const tooSmall = message.match(/^Too small: expected \w+ to have >=(\d+) characters$/);
  if (tooSmall) return `must be at least ${tooSmall[1]} characters`;
  const tooBig = message.match(/^Too big: expected \w+ to have <=(\d+) characters$/);
  if (tooBig) return `must be ${tooBig[1]} characters or fewer`;
  if (message === "Invalid email address") return "must be a valid email address";
  if (message.startsWith("Invalid input: expected string, received")) return "is required";
  if (message === "Invalid id") return "is not valid";
  if (message.startsWith("Invalid option:")) return "is not a valid choice";
  if (message.startsWith("Invalid string: must match pattern")) return "is not in the expected format";
  return message;
}

function ensurePeriod(text: string) {
  return text.endsWith(".") ? text : `${text}.`;
}

function sentence(field: string, message: string) {
  const label = labelFor(field);
  const text = rewrite(message).replace(/\.$/, "");
  if (text.toLowerCase().startsWith(label.toLowerCase())) return ensurePeriod(text);
  if (/^(must|is)\b/i.test(text)) return ensurePeriod(`${label} ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
  if (/^(enter|choose|use|select|give|write|password|confirm)\b/i.test(text)) return ensurePeriod(text);
  return ensurePeriod(`${label}: ${text}`);
}

function absorbField(field: string, value: unknown, into: Record<string, string>) {
  if (typeof value === "string" && value) {
    if (!into[field]) into[field] = sentence(field, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) absorbField(field, item, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record._errors)) absorbField(field, record._errors, into);
  for (const [key, nested] of Object.entries(record)) {
    if (key === "_errors") continue;
    absorbField(key, nested, into);
  }
}

export function fieldErrorMap(details: unknown) {
  const fields: Record<string, string> = {};
  if (!details || typeof details !== "object") return fields;
  const flattened = details as Flattened;
  for (const [field, messages] of Object.entries(flattened.fieldErrors || {})) absorbField(field, messages, fields);
  return fields;
}

export function formErrorText(details: unknown) {
  if (!details || typeof details !== "object") return "";
  const flattened = details as Flattened;
  return (flattened.formErrors || []).filter(Boolean).map((message) => (message.endsWith(".") ? message : `${message}.`)).join(" ");
}

export function formatValidationMessage(details: unknown) {
  const lines = [formErrorText(details), ...Object.values(fieldErrorMap(details))].filter(Boolean);
  return lines.join(" ");
}
