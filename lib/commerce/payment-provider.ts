export type PaymentCurrency = "EUR";

export type CheckoutLine = Readonly<{
  internalReference: string;
  displayName: string;
  unitAmountCents: number;
  quantity: number;
}>;

export type CheckoutSessionRequest = Readonly<{
  idempotencyKey: string;
  orderId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  locale: "fr" | "en";
  currency: PaymentCurrency;
  lines: readonly CheckoutLine[];
}>;

export type CheckoutSessionReceipt = Readonly<{
  provider: "stripe";
  providerSessionId: string;
  providerPaymentId: string | null;
  checkoutUrl: string;
  state: "open";
  amountTotalCents: number;
  currency: PaymentCurrency;
  livemode: boolean;
  providerRequestId: string | null;
}>;

export type RefundReason = "duplicate" | "fraudulent" | "requested_by_customer";
export type RefundState =
  | "pending"
  | "action_required"
  | "succeeded"
  | "failed"
  | "canceled"
  | "unknown";

export type RefundRequest = Readonly<{
  idempotencyKey: string;
  orderId: string;
  providerPaymentId: string;
  amountCents: number;
  currency: PaymentCurrency;
  reason: RefundReason;
}>;

export type RefundReconciliationRequest = Readonly<{
  orderId: string;
  providerPaymentId: string;
  providerRefundId: string;
  amountCents: number;
  currency: PaymentCurrency;
}>;

export type RefundReceipt = Readonly<{
  provider: "stripe";
  providerRefundId: string;
  providerPaymentId: string;
  amountCents: number;
  currency: PaymentCurrency;
  state: RefundState;
  providerRequestId: string | null;
}>;

export type PaymentState =
  | "pending"
  | "action_required"
  | "failed"
  | "paid"
  | "canceled";

type VerifiedProviderEventBase = Readonly<{
  provider: "stripe";
  providerEventId: string;
  eventType: string;
  occurredAt: string;
  livemode: boolean;
}>;

export type VerifiedPaymentProviderEvent = VerifiedProviderEventBase &
  Readonly<{
    kind: "payment";
    orderId: string;
    providerPaymentId: string;
    providerCheckoutSessionId: string | null;
    state: PaymentState;
    amountCents: number;
    currency: PaymentCurrency;
    providerFailureCode: string | null;
    /**
     * Stable across distinct Stripe Event objects that express the same
     * payment transition. Persist this together with providerEventId.
     */
    semanticKey: string;
  }>;

export type VerifiedRefundProviderEvent = VerifiedProviderEventBase &
  Readonly<{
    kind: "refund";
    orderId: string;
    providerPaymentId: string;
    providerRefundId: string;
    state: RefundState;
    amountCents: number;
    currency: PaymentCurrency;
    semanticKey: string;
  }>;

export type VerifiedIgnoredProviderEvent = VerifiedProviderEventBase &
  Readonly<{
    kind: "ignored";
    reason: "event-type-not-required" | "provider-state-not-actionable";
  }>;

export type VerifiedPaymentWebhookEvent =
  | VerifiedPaymentProviderEvent
  | VerifiedRefundProviderEvent
  | VerifiedIgnoredProviderEvent;

export type PaymentWebhookInput = Readonly<{
  /** Exact bytes received from Stripe. Never pass parsed or reserialized JSON. */
  rawBody: Uint8Array;
  stripeSignature: string;
  receivedAtEpochSeconds: number;
}>;

export interface CheckoutPaymentProviderPort {
  createSession(request: CheckoutSessionRequest): Promise<CheckoutSessionReceipt>;
}

export interface RefundPaymentProviderPort {
  createRefund(request: RefundRequest): Promise<RefundReceipt>;
  retrieveRefund(request: RefundReconciliationRequest): Promise<RefundReceipt>;
}

export interface PaymentWebhookVerifierPort {
  verify(input: PaymentWebhookInput): Promise<VerifiedPaymentWebhookEvent>;
}

export type PaymentProviderPorts = Readonly<{
  checkout: CheckoutPaymentProviderPort;
  refunds: RefundPaymentProviderPort;
  webhooks: PaymentWebhookVerifierPort;
}>;

export type PaymentWebhookApplyDisposition = "applied" | "duplicate" | "stale";

/**
 * The implementation must atomically register providerEventId and semanticKey
 * with the state mutation. It must never downgrade a paid payment because an
 * older failed, pending, action-required or canceled event arrived later. It
 * must load the immutable order server-side and reject the effect unless
 * orderId, amountCents and currency match exactly; webhook metadata is a lookup
 * reference, never authority for the amount due.
 */
export interface PaymentWebhookEffectsPort {
  applyVerified(
    event: VerifiedPaymentProviderEvent | VerifiedRefundProviderEvent,
  ): Promise<PaymentWebhookApplyDisposition>;
}

export type PaymentWebhookDeliveryResult = Readonly<{
  disposition: PaymentWebhookApplyDisposition | "ignored";
  event: VerifiedPaymentWebhookEvent;
}>;

/**
 * Keeps the security boundary explicit: no side-effect port is called until
 * signature, timestamp, mode and payload validation have all succeeded.
 */
export async function verifyAndDeliverPaymentWebhook(
  verifier: PaymentWebhookVerifierPort,
  input: PaymentWebhookInput,
  effects: PaymentWebhookEffectsPort,
): Promise<PaymentWebhookDeliveryResult> {
  const event = await verifier.verify(input);
  if (event.kind === "ignored") {
    return Object.freeze({ disposition: "ignored", event });
  }
  const disposition = await effects.applyVerified(event);
  return Object.freeze({ disposition, event });
}

export type PaymentProjection = Readonly<{
  providerPaymentId: string;
  state: PaymentState;
  semanticKey: string;
  occurredAt: string;
}>;

export type PaymentTransitionDisposition = "apply" | "duplicate" | "stale" | "conflict";

/** Pure guard for stores implementing PaymentWebhookEffectsPort. */
export function classifyPaymentTransition(
  current: PaymentProjection | null,
  incoming: VerifiedPaymentProviderEvent,
): PaymentTransitionDisposition {
  if (!current) return "apply";
  if (current.providerPaymentId !== incoming.providerPaymentId) return "conflict";
  if (current.semanticKey === incoming.semanticKey) return "duplicate";
  if (current.state === "paid" && incoming.state !== "paid") return "stale";
  if (
    current.state === "canceled" &&
    ["pending", "action_required", "failed"].includes(incoming.state)
  ) return "stale";
  if (incoming.state !== "paid" && incoming.occurredAt < current.occurredAt) return "stale";
  return "apply";
}

export class PaymentProviderError extends Error {
  readonly code:
    | "NOT_CONFIGURED"
    | "INVALID_REQUEST"
    | "TIMEOUT"
    | "MALFORMED_RESPONSE"
    | "REJECTED"
    | "OUTCOME_UNKNOWN"
    | "INVALID_SIGNATURE"
    | "STALE_SIGNATURE";

  constructor(
    code:
      | "NOT_CONFIGURED"
      | "INVALID_REQUEST"
      | "TIMEOUT"
      | "MALFORMED_RESPONSE"
      | "REJECTED"
      | "OUTCOME_UNKNOWN"
      | "INVALID_SIGNATURE"
      | "STALE_SIGNATURE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PaymentProviderError";
    this.code = code;
  }
}
