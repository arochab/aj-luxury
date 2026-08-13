const TOKEN_BYTES = 32;
const ACCESS_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 30 * 60_000;
const canonicalUtcTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const safeId = /^[a-z0-9][a-z0-9_.:-]{0,127}$/i;
const opaqueToken = /^[A-Za-z0-9_-]{43}$/;
const demoMailbox = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)*demo\.invalid$/i;

export const PREPROD_DEMO_MODE = "PREPROD_DEMO" as const;
export type PreprodDemoMode = typeof PREPROD_DEMO_MODE;

export class PreprodDemoError extends Error {
  readonly code:
    | "PREPROD_ONLY"
    | "INVALID_INPUT"
    | "IDEMPOTENCY_CONFLICT"
    | "CAPTURE_FAILURE";

  constructor(
    code:
      | "PREPROD_ONLY"
      | "INVALID_INPUT"
      | "IDEMPOTENCY_CONFLICT"
      | "CAPTURE_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "PreprodDemoError";
    this.code = code;
  }
}

export function assertPreprodDemoMode(
  mode: unknown,
): asserts mode is PreprodDemoMode {
  if (mode !== PREPROD_DEMO_MODE) {
    throw new PreprodDemoError(
      "PREPROD_ONLY",
      "This service is available only in PREPROD_DEMO mode.",
    );
  }
}

export const passwordlessDemoAcknowledgement = Object.freeze({
  accepted: true,
  message: "If this demo account is available, its access link is in the captured mailbox.",
} as const);

export type DemoAccount = Readonly<{
  id: string;
  email: string;
  displayName: string;
}>;

export type CapturedPasswordlessMessage = Readonly<{
  id: string;
  challengeId: string;
  idempotencyKey: string;
  recipientEmail: string;
  purpose: "passwordless_demo_access";
  accessPath: string;
  createdAt: string;
  expiresAt: string;
}>;

export interface PreprodCapturedMailboxPort {
  capture(message: CapturedPasswordlessMessage): Promise<void>;
  removeChallenge(challengeId: string): Promise<void>;
  purgeExpired(now: string): Promise<number>;
  list(): Promise<readonly CapturedPasswordlessMessage[]>;
}

type ChallengeEvidence = {
  id: string;
  accountId: string;
  emailFingerprint: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

type SessionEvidence = {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

type RequestEvidence = {
  emailFingerprint: string;
  challengeId: string | null;
};

export type PasswordlessDemoSession = Readonly<{
  sessionToken: string;
  expiresAt: string;
  account: DemoAccount;
}>;

function isCanonicalUtc(value: unknown): value is string {
  if (typeof value !== "string" || !canonicalUtcTimestamp.test(value)) {
    return false;
  }
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function requireTimestamp(value: unknown, field: string): string {
  if (!isCanonicalUtc(value)) {
    throw new PreprodDemoError("INVALID_INPUT", `${field} must be canonical UTC.`);
  }
  return value;
}

function requireSafeId(value: unknown, field: string): string {
  if (typeof value !== "string" || !safeId.test(value)) {
    throw new PreprodDemoError("INVALID_INPUT", `${field} is invalid.`);
  }
  return value;
}

function normalizeDemoEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new PreprodDemoError("INVALID_INPUT", "Demo email is invalid.");
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !demoMailbox.test(normalized)) {
    throw new PreprodDemoError(
      "INVALID_INPUT",
      "Only reserved @demo.invalid addresses are accepted.",
    );
  }
  return normalized;
}

function requireOpaqueToken(value: unknown, field: string): string {
  if (typeof value !== "string" || !opaqueToken.test(value)) {
    throw new PreprodDemoError("INVALID_INPUT", `${field} is invalid.`);
  }
  return value;
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function contextualHash(
  context: "access" | "session" | "email-fingerprint",
  value: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`aj-luxury.preprod-demo.v1\0${context}\0${value}`),
  );
  return bytesToHex(new Uint8Array(digest));
}

function ownDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      if (!("value" in descriptor) || !descriptor.enumerable) return null;
      snapshot[key] = descriptor.value;
    }
    structuredClone(value);
    return snapshot;
  } catch {
    return null;
  }
}

function freezeMessage(
  message: CapturedPasswordlessMessage,
): CapturedPasswordlessMessage {
  return Object.freeze({ ...message });
}

export class InMemoryPreprodCapturedMailbox
  implements PreprodCapturedMailboxPort
{
  readonly #mode: PreprodDemoMode;
  readonly #messagesByKey = new Map<string, CapturedPasswordlessMessage>();

  constructor(mode: unknown) {
    assertPreprodDemoMode(mode);
    this.#mode = mode;
  }

  async capture(message: CapturedPasswordlessMessage): Promise<void> {
    assertPreprodDemoMode(this.#mode);
    if (
      !safeId.test(message.id) ||
      !safeId.test(message.challengeId) ||
      !safeId.test(message.idempotencyKey) ||
      !demoMailbox.test(message.recipientEmail) ||
      message.purpose !== "passwordless_demo_access" ||
      !message.accessPath.startsWith("/account/demo/consume?token=") ||
      !isCanonicalUtc(message.createdAt) ||
      !isCanonicalUtc(message.expiresAt) ||
      message.expiresAt <= message.createdAt
    ) {
      throw new PreprodDemoError("INVALID_INPUT", "Captured message is invalid.");
    }
    const existing = this.#messagesByKey.get(message.idempotencyKey);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(message)) {
        throw new PreprodDemoError(
          "IDEMPOTENCY_CONFLICT",
          "Mailbox key was reused for another message.",
        );
      }
      return;
    }
    this.#messagesByKey.set(message.idempotencyKey, freezeMessage(message));
  }

  async removeChallenge(challengeId: string): Promise<void> {
    assertPreprodDemoMode(this.#mode);
    requireSafeId(challengeId, "Challenge id");
    for (const [key, message] of this.#messagesByKey) {
      if (message.challengeId === challengeId) this.#messagesByKey.delete(key);
    }
  }

  async purgeExpired(now: string): Promise<number> {
    assertPreprodDemoMode(this.#mode);
    requireTimestamp(now, "Now");
    let purged = 0;
    for (const [key, message] of this.#messagesByKey) {
      if (message.expiresAt <= now) {
        this.#messagesByKey.delete(key);
        purged += 1;
      }
    }
    return purged;
  }

  async list(): Promise<readonly CapturedPasswordlessMessage[]> {
    assertPreprodDemoMode(this.#mode);
    return Object.freeze(
      [...this.#messagesByKey.values()]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(freezeMessage),
    );
  }
}

export class PasswordlessPreprodIdentityService {
  readonly #mode: PreprodDemoMode;
  readonly #mailbox: PreprodCapturedMailboxPort;
  readonly #accountsByEmail = new Map<string, DemoAccount>();
  readonly #accountsById = new Map<string, DemoAccount>();
  readonly #requests = new Map<string, RequestEvidence>();
  readonly #challengesByHash = new Map<string, ChallengeEvidence>();
  readonly #sessionsByHash = new Map<string, SessionEvidence>();

  constructor(input: Readonly<{
    mode: unknown;
    mailbox: PreprodCapturedMailboxPort;
    accounts: readonly DemoAccount[];
  }>) {
    assertPreprodDemoMode(input.mode);
    this.#mode = input.mode;
    this.#mailbox = input.mailbox;
    if (!Array.isArray(input.accounts) || input.accounts.length === 0) {
      throw new PreprodDemoError("INVALID_INPUT", "At least one demo account is required.");
    }
    for (const candidate of input.accounts) {
      const id = requireSafeId(candidate.id, "Account id");
      const email = normalizeDemoEmail(candidate.email);
      if (
        typeof candidate.displayName !== "string" ||
        candidate.displayName.trim().length < 1 ||
        candidate.displayName.length > 80 ||
        this.#accountsByEmail.has(email) ||
        this.#accountsById.has(id)
      ) {
        throw new PreprodDemoError("INVALID_INPUT", "Demo account is invalid or duplicated.");
      }
      const account = Object.freeze({
        id,
        email,
        displayName: candidate.displayName.trim(),
      });
      this.#accountsByEmail.set(email, account);
      this.#accountsById.set(id, account);
    }
  }

  async requestAccess(input: unknown): Promise<typeof passwordlessDemoAcknowledgement> {
    assertPreprodDemoMode(this.#mode);
    const snapshot = ownDataRecord(input, ["requestId", "email", "now"]);
    if (!snapshot) {
      throw new PreprodDemoError("INVALID_INPUT", "Access request is invalid.");
    }
    const requestId = requireSafeId(snapshot.requestId, "Request id");
    const email = normalizeDemoEmail(snapshot.email);
    const now = requireTimestamp(snapshot.now, "Now");
    const emailFingerprint = await contextualHash("email-fingerprint", email);
    const existing = this.#requests.get(requestId);
    if (existing) {
      if (existing.emailFingerprint !== emailFingerprint) {
        throw new PreprodDemoError(
          "IDEMPOTENCY_CONFLICT",
          "Request id was reused for another demo account.",
        );
      }
      return passwordlessDemoAcknowledgement;
    }

    const account = this.#accountsByEmail.get(email);
    if (!account) {
      this.#requests.set(requestId, { emailFingerprint, challengeId: null });
      return passwordlessDemoAcknowledgement;
    }

    const rawToken = createToken();
    const tokenHash = await contextualHash("access", rawToken);
    const challengeId = `challenge_${requestId}`;
    const expiresAt = addMilliseconds(now, ACCESS_TTL_MS);
    const challenge: ChallengeEvidence = {
      id: challengeId,
      accountId: account.id,
      emailFingerprint,
      tokenHash,
      createdAt: now,
      expiresAt,
      consumedAt: null,
    };
    const message: CapturedPasswordlessMessage = {
      id: `mail_${requestId}`,
      challengeId,
      idempotencyKey: `passwordless:${requestId}`,
      recipientEmail: account.email,
      purpose: "passwordless_demo_access",
      accessPath: `/account/demo/consume?token=${encodeURIComponent(rawToken)}`,
      createdAt: now,
      expiresAt,
    };

    try {
      await this.#mailbox.capture(message);
    } catch (error) {
      if (error instanceof PreprodDemoError) throw error;
      throw new PreprodDemoError("CAPTURE_FAILURE", "Demo mailbox capture failed.");
    }
    this.#challengesByHash.set(tokenHash, challenge);
    this.#requests.set(requestId, { emailFingerprint, challengeId });
    return passwordlessDemoAcknowledgement;
  }

  async consumeAccess(input: unknown): Promise<PasswordlessDemoSession | null> {
    assertPreprodDemoMode(this.#mode);
    const snapshot = ownDataRecord(input, ["token", "now"]);
    if (!snapshot) return null;
    let rawToken: string;
    let now: string;
    try {
      rawToken = requireOpaqueToken(snapshot.token, "Access token");
      now = requireTimestamp(snapshot.now, "Now");
    } catch {
      return null;
    }
    const tokenHash = await contextualHash("access", rawToken);
    const challenge = this.#challengesByHash.get(tokenHash);
    if (
      !challenge ||
      challenge.consumedAt !== null ||
      challenge.expiresAt <= now
    ) {
      return null;
    }
    const account = this.#accountsById.get(challenge.accountId);
    if (!account) return null;

    const sessionToken = createToken();
    const sessionHash = await contextualHash("session", sessionToken);
    const sessionId = `session_${createToken()}`;
    const expiresAt = addMilliseconds(now, SESSION_TTL_MS);
    challenge.consumedAt = now;
    this.#sessionsByHash.set(sessionHash, {
      id: sessionId,
      accountId: account.id,
      tokenHash: sessionHash,
      createdAt: now,
      expiresAt,
      revokedAt: null,
    });
    await this.#mailbox.removeChallenge(challenge.id);
    return Object.freeze({ sessionToken, expiresAt, account });
  }

  async authenticateSession(input: unknown): Promise<DemoAccount | null> {
    assertPreprodDemoMode(this.#mode);
    const snapshot = ownDataRecord(input, ["sessionToken", "now"]);
    if (!snapshot) return null;
    let sessionToken: string;
    let now: string;
    try {
      sessionToken = requireOpaqueToken(snapshot.sessionToken, "Session token");
      now = requireTimestamp(snapshot.now, "Now");
    } catch {
      return null;
    }
    const sessionHash = await contextualHash("session", sessionToken);
    const session = this.#sessionsByHash.get(sessionHash);
    if (!session || session.revokedAt !== null || session.expiresAt <= now) {
      return null;
    }
    return this.#accountsById.get(session.accountId) ?? null;
  }

  async signOut(input: unknown): Promise<boolean> {
    assertPreprodDemoMode(this.#mode);
    const snapshot = ownDataRecord(input, ["sessionToken", "now"]);
    if (!snapshot) return false;
    let sessionToken: string;
    let now: string;
    try {
      sessionToken = requireOpaqueToken(snapshot.sessionToken, "Session token");
      now = requireTimestamp(snapshot.now, "Now");
    } catch {
      return false;
    }
    const sessionHash = await contextualHash("session", sessionToken);
    const session = this.#sessionsByHash.get(sessionHash);
    if (!session || session.revokedAt !== null) return false;
    session.revokedAt = now;
    return true;
  }

  async readAdminSummary(now: string): Promise<Readonly<{
    demoAccounts: number;
    activeChallenges: number;
    activeSessions: number;
    capturedMessages: number;
  }>> {
    assertPreprodDemoMode(this.#mode);
    requireTimestamp(now, "Now");
    const capturedMessages = (await this.#mailbox.list()).filter(
      (message) => message.expiresAt > now,
    ).length;
    return Object.freeze({
      demoAccounts: this.#accountsById.size,
      activeChallenges: [...this.#challengesByHash.values()].filter(
        (challenge) => challenge.consumedAt === null && challenge.expiresAt > now,
      ).length,
      activeSessions: [...this.#sessionsByHash.values()].filter(
        (session) => session.revokedAt === null && session.expiresAt > now,
      ).length,
      capturedMessages,
    });
  }

  challengeEvidence(): readonly Readonly<ChallengeEvidence>[] {
    assertPreprodDemoMode(this.#mode);
    return Object.freeze(
      [...this.#challengesByHash.values()].map((challenge) =>
        Object.freeze({ ...challenge }),
      ),
    );
  }
}
