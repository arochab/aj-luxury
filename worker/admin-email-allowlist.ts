export type AdminEmailAllowlistEnvironment = Readonly<{
  COMMERCE_ADMIN_ALLOWED_EMAILS_JSON?: string;
}>;

export const REQUIRED_ADMIN_EMAILS = Object.freeze([
  "adam.chabbi94@gmail.com",
  "jeremy@ajluxurystore.com",
  "jeremyajluxurystore@gmail.com",
] as const);

const EMAIL = /^[^@\s]+@[^@\s]+$/;

function exactText(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function configuredAdminEmails(
  env: AdminEmailAllowlistEnvironment,
): readonly string[] | null {
  const raw = env.COMMERCE_ADMIN_ALLOWED_EMAILS_JSON?.trim() ?? "";
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== REQUIRED_ADMIN_EMAILS.length) return null;
    const values: string[] = [];
    for (const value of parsed) {
      if (typeof value !== "string") return null;
      values.push(value.trim().toLowerCase());
    }
    const unique = [...new Set(values)];
    if (unique.length !== REQUIRED_ADMIN_EMAILS.length ||
      !unique.every((email) => email.length <= 320 && EMAIL.test(email))) return null;
    const actual = [...unique].sort();
    const expected = [...REQUIRED_ADMIN_EMAILS].sort();
    return actual.every((email, index) => exactText(email, expected[index]))
      ? REQUIRED_ADMIN_EMAILS
      : null;
  } catch {
    return null;
  }
}

export function adminEmailAllowed(
  rawEmail: unknown,
  env: AdminEmailAllowlistEnvironment,
): rawEmail is string {
  if (typeof rawEmail !== "string") return false;
  const email = rawEmail.trim().toLowerCase();
  const configured = configuredAdminEmails(env);
  if (!configured) return false;
  let allowed = false;
  for (const candidate of configured) allowed = exactText(email, candidate) || allowed;
  return allowed;
}
