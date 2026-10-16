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

function sentence(field: string, message: string) {
  const label = labelFor(field);
  const text = rewrite(message).replace(/\.$/, "");
  if (text.toLowerCase().startsWith(label.toLowerCase())) return `${text}.`;
  if (/^(must|is|enter)\b/i.test(text)) {
    return `${label} ${text.charAt(0).toLowerCase()}${text.slice(1)}.`;
  }
  return `${label}: ${text}.`;
}

export function formatValidationMessage(details: unknown) {
  if (!details || typeof details !== "object") return "";
  const flattened = details as Flattened;
  const lines: string[] = [];
  for (const message of flattened.formErrors || []) {
    if (message) lines.push(message.endsWith(".") ? message : `${message}.`);
  }
  for (const [field, messages] of Object.entries(flattened.fieldErrors || {})) {
    for (const message of messages || []) {
      if (message) lines.push(sentence(field, message));
    }
  }
  return lines.join(" ");
}
