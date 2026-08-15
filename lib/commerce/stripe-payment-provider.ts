import {
  PaymentProviderError,
  type CheckoutSessionReceipt,
  type CheckoutSessionRequest,
  type PaymentProviderPorts,
  type PaymentState,
  type PaymentWebhookInput,
  type RefundReceipt,
  type RefundRequest,
  type RefundState,
  type VerifiedIgnoredProviderEvent,
  type VerifiedPaymentProviderEvent,
  type VerifiedPaymentWebhookEvent,
  type VerifiedRefundProviderEvent,
} from "./payment-provider.ts";

const STRIPE_ORIGIN = "https://api.stripe.com";
export const STRIPE_API_VERSION = "2026-07-29.dahlia";
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_WEBHOOK_BYTES = 64 * 1024;
const MAX_SIGNATURE_HEADER_BYTES = 4 * 1024;
const MAX_SIGNATURE_PARTS = 12;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;
const SAFE_INTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_PROVIDER_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,254}$/;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type StripePaymentConfiguration = Readonly<{
  apiKey?: string;
  webhookSecret?: string;
  mode: "test" | "live";
  allowedCheckoutHosts?: readonly string[];
  requestTimeoutMs?: number;
  signatureToleranceSeconds?: number;
}>;

type StripeRuntimeConfiguration = Readonly<{
  apiKey: string;
  webhookSecret: string;
  livemode: boolean;
  allowedCheckoutHosts: ReadonlySet<string>;
  requestTimeoutMs: number;
  signatureToleranceSeconds: number;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, maximum = 255): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function safeInteger(value: unknown, minimum = 0, maximum = 100_000_000): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function invalidRequest(message: string): never {
  throw new PaymentProviderError("INVALID_REQUEST", message);
}

function configuration(input: StripePaymentConfiguration): StripeRuntimeConfiguration {
  const apiKey = input.apiKey ?? "";
  const webhookSecret = input.webhookSecret ?? "";
  const key = /^(?:sk|rk)_(test|live)_[A-Za-z0-9_-]{16,256}$/.exec(apiKey);
  if (!key || key[1] !== input.mode || !/^whsec_[A-Za-z0-9_-]{16,256}$/.test(webhookSecret)) {
    throw new PaymentProviderError("NOT_CONFIGURED", "Stripe credentials are not configured for this mode.");
  }
  const requestTimeoutMs = input.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signatureToleranceSeconds = input.signatureToleranceSeconds ??
    DEFAULT_SIGNATURE_TOLERANCE_SECONDS;
  if (!safeInteger(requestTimeoutMs, 1_000, 30_000) ||
    !safeInteger(signatureToleranceSeconds, 60, 900)) {
    throw new PaymentProviderError("NOT_CONFIGURED", "Stripe runtime limits are invalid.");
  }
  const allowedCheckoutHosts = input.allowedCheckoutHosts ?? ["checkout.stripe.com"];
  if (allowedCheckoutHosts.length < 1 || allowedCheckoutHosts.length > 8) {
    throw new PaymentProviderError("NOT_CONFIGURED", "Stripe checkout hosts are not configured.");
  }
  const hosts = new Set<string>();
  for (const host of allowedCheckoutHosts) {
    if (typeof host !== "string" || host !== host.toLowerCase() ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) {
      throw new PaymentProviderError("NOT_CONFIGURED", "Stripe checkout host is invalid.");
    }
    hosts.add(host);
  }
  return Object.freeze({
    apiKey,
    webhookSecret,
    livemode: input.mode === "live",
    allowedCheckoutHosts: hosts,
    requestTimeoutMs,
    signatureToleranceSeconds,
  });
}

function validateInternalId(value: string, label: string): void {
  if (!SAFE_INTERNAL_ID.test(value)) invalidRequest(`${label} is invalid.`);
}

function validateIdempotencyKey(value: string): void {
  if (!SAFE_IDEMPOTENCY_KEY.test(value)) invalidRequest("Payment idempotency key is invalid.");
}

function validateHttpsUrl(value: string, label: string): void {
  if (value.length > 2_048) invalidRequest(`${label} is invalid.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalidRequest(`${label} is invalid.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    invalidRequest(`${label} is invalid.`);
  }
}

function validateEmail(value: string): void {
  if (value.length > 254 || /[\u0000-\u0020\u007f]/.test(value) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(value)) {
    invalidRequest("Checkout customer email is invalid.");
  }
}

function checkoutAmount(request: CheckoutSessionRequest): number {
  validateIdempotencyKey(request.idempotencyKey);
  validateInternalId(request.orderId, "Order id");
  validateEmail(request.customerEmail);
  validateHttpsUrl(request.successUrl, "Checkout success URL");
  validateHttpsUrl(request.cancelUrl, "Checkout cancel URL");
  if (request.currency !== "EUR" || !["fr", "en"].includes(request.locale) ||
    request.lines.length < 1 || request.lines.length > 50) {
    invalidRequest("Checkout request is invalid.");
  }
  let amount = 0;
  for (const line of request.lines) {
    validateInternalId(line.internalReference, "Checkout line reference");
    if (!safeString(line.displayName, 120) ||
      !safeInteger(line.unitAmountCents, 1, 10_000_000) ||
      !safeInteger(line.quantity, 1, 10)) {
      invalidRequest("Checkout line is invalid.");
    }
    amount += line.unitAmountCents * line.quantity;
    if (!Number.isSafeInteger(amount) || amount > 100_000_000) {
      invalidRequest("Checkout total is invalid.");
    }
  }
  return amount;
}

function checkoutForm(request: CheckoutSessionRequest): URLSearchParams {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("payment_method_types[0]", "card");
  form.set("success_url", request.successUrl);
  form.set("cancel_url", request.cancelUrl);
  form.set("client_reference_id", request.orderId);
  form.set("customer_email", request.customerEmail);
  form.set("locale", request.locale);
  form.set("metadata[order_id]", request.orderId);
  form.set("payment_intent_data[metadata][order_id]", request.orderId);
  request.lines.forEach((line, index) => {
    const prefix = `line_items[${index}]`;
    form.set(`${prefix}[price_data][currency]`, request.currency.toLowerCase());
    form.set(`${prefix}[price_data][unit_amount]`, String(line.unitAmountCents));
    form.set(`${prefix}[price_data][product_data][name]`, line.displayName);
    form.set(`${prefix}[price_data][product_data][metadata][internal_reference]`, line.internalReference);
    form.set(`${prefix}[quantity]`, String(line.quantity));
  });
  return form;
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel();
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe response is too large.");
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe response is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe response JSON is invalid.", { cause: error });
  }
}

async function stripePost(
  runtime: StripeRuntimeConfiguration,
  fetchImpl: FetchLike,
  path: string,
  idempotencyKey: string,
  form: URLSearchParams,
): Promise<Readonly<{ value: unknown; requestId: string | null }>> {
  let response: Response;
  try {
    response = await fetchImpl(`${STRIPE_ORIGIN}${path}`, {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${runtime.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idempotencyKey,
        "Stripe-Version": STRIPE_API_VERSION,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(runtime.requestTimeoutMs),
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    throw new PaymentProviderError(
      timeout ? "TIMEOUT" : "OUTCOME_UNKNOWN",
      "Stripe request did not produce a confirmed outcome.",
      { cause: error },
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new PaymentProviderError(
      response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500
        ? "OUTCOME_UNKNOWN"
        : "REJECTED",
      "Stripe rejected the request.",
    );
  }
  const requestId = response.headers.get("Request-Id");
  if (requestId !== null && (!safeString(requestId, 255) || !SAFE_PROVIDER_CODE.test(requestId))) {
    await response.body?.cancel();
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe request id is invalid.");
  }
  return Object.freeze({ value: await boundedJson(response), requestId });
}

function providerId(value: unknown, prefix: string, label: string): string {
  if (!safeString(value) || !SAFE_PROVIDER_CODE.test(value) || !value.startsWith(`${prefix}_`)) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", `${label} is invalid.`);
  }
  return value;
}

function metadataOrderId(value: Record<string, unknown>): string {
  if (!record(value.metadata) || !safeString(value.metadata.order_id, 128) ||
    !SAFE_INTERNAL_ID.test(value.metadata.order_id)) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe order metadata is invalid.");
  }
  return value.metadata.order_id;
}

function checkoutReceipt(
  value: unknown,
  request: CheckoutSessionRequest,
  expectedAmount: number,
  runtime: StripeRuntimeConfiguration,
  requestId: string | null,
): CheckoutSessionReceipt {
  if (!record(value) || value.object !== "checkout.session" ||
    value.livemode !== runtime.livemode || value.status !== "open" ||
    value.payment_status !== "unpaid" || value.currency !== "eur" ||
    value.client_reference_id !== request.orderId || metadataOrderId(value) !== request.orderId ||
    !safeInteger(value.amount_total, 1, 100_000_000) || value.amount_total !== expectedAmount ||
    !safeString(value.url, 2_048)) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe Checkout Session is invalid.");
  }
  const providerSessionId = providerId(value.id, runtime.livemode ? "cs_live" : "cs_test", "Stripe session id");
  const providerPaymentId = value.payment_intent === null
    ? null
    : providerId(value.payment_intent, "pi", "Stripe payment id");
  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(value.url);
  } catch (error) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe checkout URL is invalid.", { cause: error });
  }
  if (checkoutUrl.protocol !== "https:" || checkoutUrl.username || checkoutUrl.password ||
    !runtime.allowedCheckoutHosts.has(checkoutUrl.hostname.toLowerCase())) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe checkout URL host is not allowed.");
  }
  return Object.freeze({
    provider: "stripe",
    providerSessionId,
    providerPaymentId,
    checkoutUrl: checkoutUrl.href,
    state: "open",
    amountTotalCents: expectedAmount,
    currency: "EUR",
    livemode: runtime.livemode,
    providerRequestId: requestId,
  });
}

function validateRefundRequest(request: RefundRequest): void {
  validateIdempotencyKey(request.idempotencyKey);
  validateInternalId(request.orderId, "Order id");
  providerId(request.providerPaymentId, "pi", "Stripe payment id");
  if (request.currency !== "EUR" || !safeInteger(request.amountCents, 1, 100_000_000) ||
    !["duplicate", "fraudulent", "requested_by_customer"].includes(request.reason)) {
    invalidRequest("Refund request is invalid.");
  }
}

function refundState(value: unknown): RefundState {
  switch (value) {
    case "pending": return "pending";
    case "requires_action": return "action_required";
    case "succeeded": return "succeeded";
    case "failed": return "failed";
    case "canceled": return "canceled";
    default: return "unknown";
  }
}

function refundReceipt(
  value: unknown,
  request: RefundRequest,
  requestId: string | null,
): RefundReceipt {
  if (!record(value) || value.object !== "refund" || value.currency !== "eur" ||
    value.payment_intent !== request.providerPaymentId || metadataOrderId(value) !== request.orderId ||
    value.amount !== request.amountCents || !safeInteger(value.amount, 1, 100_000_000)) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe refund is invalid.");
  }
  return Object.freeze({
    provider: "stripe",
    providerRefundId: providerId(value.id, "re", "Stripe refund id"),
    providerPaymentId: request.providerPaymentId,
    amountCents: request.amountCents,
    currency: "EUR",
    state: refundState(value.status),
    providerRequestId: requestId,
  });
}

function parseSignatureHeader(value: string): Readonly<{ timestamp: number; signatures: readonly Uint8Array[] }> {
  if (!safeString(value, MAX_SIGNATURE_HEADER_BYTES)) {
    throw new PaymentProviderError("INVALID_SIGNATURE", "Stripe signature is invalid.");
  }
  const parts = value.split(",");
  if (parts.length < 2 || parts.length > MAX_SIGNATURE_PARTS) {
    throw new PaymentProviderError("INVALID_SIGNATURE", "Stripe signature is invalid.");
  }
  let timestamp: number | null = null;
  const signatures: Uint8Array[] = [];
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator < 1 || separator === part.length - 1) {
      throw new PaymentProviderError("INVALID_SIGNATURE", "Stripe signature is invalid.");
    }
    const scheme = part.slice(0, separator);
    const encoded = part.slice(separator + 1);
    if (!/^[a-z][a-z0-9]{0,15}$/.test(scheme) || encoded.length > 256) {
      throw new PaymentProviderError("INVALID_SIGNATURE", "Stripe signature is invalid.");
    }
    if (scheme === "t") {
      if (timestamp !== null || !/^\d{1,12}$/.test(encoded)) {
        throw new PaymentProviderError("INVALID_SIGNATURE", "Stripe signature is invalid.");
      }
      timestamp = Number(encoded);
    } else if (scheme === "v1") {
      if (!/^[a-f0-9]{64}$/i.test(encoded) || signatures.length >= 4) {
        throw new PaymentProviderError("INVALID_SIGNATURE", "Stripe signature is invalid.");
      }
      const bytes = new Uint8Array(32);
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16);
      }
      signatures.push(bytes);
    }
  }
  if (!safeInteger(timestamp, 1, 9_999_999_999_999) || signatures.length === 0) {
    throw new PaymentProviderError("INVALID_SIGNATURE", "Stripe signature is invalid.");
  }
  return Object.freeze({ timestamp, signatures: Object.freeze(signatures) });
}

async function verifyStripeSignature(
  input: PaymentWebhookInput,
  runtime: StripeRuntimeConfiguration,
): Promise<void> {
  if (!(input.rawBody instanceof Uint8Array) || input.rawBody.byteLength < 2 ||
    input.rawBody.byteLength > MAX_WEBHOOK_BYTES ||
    !safeInteger(input.receivedAtEpochSeconds, 1, 9_999_999_999_999)) {
    throw new PaymentProviderError("INVALID_SIGNATURE", "Stripe webhook delivery is invalid.");
  }
  const header = parseSignatureHeader(input.stripeSignature);
  if (Math.abs(input.receivedAtEpochSeconds - header.timestamp) > runtime.signatureToleranceSeconds) {
    throw new PaymentProviderError("STALE_SIGNATURE", "Stripe webhook signature is outside the accepted window.");
  }
  const prefix = new TextEncoder().encode(`${header.timestamp}.`);
  const signed = new Uint8Array(prefix.byteLength + input.rawBody.byteLength);
  signed.set(prefix);
  signed.set(input.rawBody, prefix.byteLength);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(runtime.webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const matches = await Promise.all(header.signatures.map((signature) =>
    crypto.subtle.verify("HMAC", key, signature.slice().buffer, signed.buffer)
  ));
  if (!matches.some(Boolean)) {
    throw new PaymentProviderError("INVALID_SIGNATURE", "Stripe webhook signature is invalid.");
  }
}

function ignoredEvent(
  base: Omit<VerifiedIgnoredProviderEvent, "kind" | "reason">,
  reason: VerifiedIgnoredProviderEvent["reason"],
): VerifiedIgnoredProviderEvent {
  return Object.freeze({ ...base, kind: "ignored", reason });
}

function checkoutOrderId(object: Record<string, unknown>): string {
  const orderId = metadataOrderId(object);
  if (object.client_reference_id !== orderId) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe Checkout order reference is invalid.");
  }
  return orderId;
}

function parseCheckoutEvent(
  object: Record<string, unknown>,
  base: Omit<VerifiedPaymentProviderEvent, "kind" | "orderId" | "providerPaymentId" |
    "providerCheckoutSessionId" | "state" | "amountCents" | "currency" |
    "providerFailureCode" | "semanticKey">,
): VerifiedPaymentProviderEvent | VerifiedIgnoredProviderEvent {
  if (object.object !== "checkout.session" || object.currency !== "eur" ||
    !safeInteger(object.amount_total, 1, 100_000_000)) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe Checkout event is invalid.");
  }
  const providerCheckoutSessionId = providerId(object.id, base.livemode ? "cs_live" : "cs_test", "Stripe session id");
  const orderId = checkoutOrderId(object);
  const paymentId = object.payment_intent === null
    ? null
    : providerId(object.payment_intent, "pi", "Stripe payment id");
  let state: PaymentState;
  if (base.eventType === "checkout.session.expired") {
    state = "canceled";
  } else if (base.eventType === "checkout.session.async_payment_failed") {
    state = "failed";
  } else if (
    base.eventType === "checkout.session.completed" ||
    base.eventType === "checkout.session.async_payment_succeeded"
  ) {
    state = object.payment_status === "paid" ? "paid" : "pending";
  } else {
    return ignoredEvent(base, "event-type-not-required");
  }
  if (state === "paid" && paymentId === null) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Paid Checkout event has no PaymentIntent.");
  }
  const providerPaymentId = paymentId ?? `checkout:${providerCheckoutSessionId}`;
  return Object.freeze({
    ...base,
    kind: "payment",
    orderId,
    providerPaymentId,
    providerCheckoutSessionId,
    state,
    amountCents: object.amount_total,
    currency: "EUR",
    providerFailureCode: null,
    semanticKey: `stripe:payment:${providerPaymentId}:${state}`,
  });
}

function parseRefundEvent(
  object: Record<string, unknown>,
  base: Omit<VerifiedRefundProviderEvent, "kind" | "orderId" | "providerPaymentId" |
    "providerRefundId" | "state" | "amountCents" | "currency" | "semanticKey">,
): VerifiedRefundProviderEvent | VerifiedIgnoredProviderEvent {
  if (object.object !== "refund" || object.currency !== "eur" ||
    !safeInteger(object.amount, 1, 100_000_000)) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe refund event is invalid.");
  }
  const providerRefundId = providerId(object.id, "re", "Stripe refund id");
  const providerPaymentId = providerId(object.payment_intent, "pi", "Stripe payment id");
  const state = refundState(object.status);
  if (state === "unknown") return ignoredEvent(base, "provider-state-not-actionable");
  return Object.freeze({
    ...base,
    kind: "refund",
    orderId: metadataOrderId(object),
    providerPaymentId,
    providerRefundId,
    state,
    amountCents: object.amount,
    currency: "EUR",
    semanticKey: `stripe:refund:${providerRefundId}:${state}`,
  });
}

function parseVerifiedWebhook(
  rawBody: Uint8Array,
  runtime: StripeRuntimeConfiguration,
): VerifiedPaymentWebhookEvent {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch (error) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe webhook JSON is invalid.", { cause: error });
  }
  if (!record(value) || value.object !== "event" || value.livemode !== runtime.livemode ||
    !safeString(value.type, 200) || !/^[a-z0-9_.]+$/.test(value.type) ||
    !safeInteger(value.created, 1, 9_999_999_999) || !record(value.data) || !record(value.data.object)) {
    throw new PaymentProviderError("MALFORMED_RESPONSE", "Stripe webhook event is invalid.");
  }
  const providerEventId = providerId(value.id, "evt", "Stripe event id");
  const base = Object.freeze({
    provider: "stripe" as const,
    providerEventId,
    eventType: value.type,
    occurredAt: new Date(value.created * 1_000).toISOString(),
    livemode: runtime.livemode,
  });
  if (value.type.startsWith("payment_intent.")) {
    // AJ Luxury settles exclusively from Checkout Session events, which carry
    // the exact durable session binding. A standalone PaymentIntent event has
    // no Checkout Session id and must therefore be acknowledged as ignored,
    // never sent to the D1 effects port for endless retries.
    return ignoredEvent(base, "event-type-not-required");
  }
  if (value.type.startsWith("checkout.session.")) {
    return parseCheckoutEvent(value.data.object, base);
  }
  if (value.type.startsWith("refund.")) {
    return parseRefundEvent(value.data.object, base);
  }
  return ignoredEvent(base, "event-type-not-required");
}

export function createStripePaymentProviderPorts(
  input: StripePaymentConfiguration,
  fetchImpl: FetchLike = fetch,
): PaymentProviderPorts {
  const runtime = configuration(input);
  return Object.freeze({
    checkout: Object.freeze({
      async createSession(request: CheckoutSessionRequest) {
        const expectedAmount = checkoutAmount(request);
        const response = await stripePost(
          runtime,
          fetchImpl,
          "/v1/checkout/sessions",
          request.idempotencyKey,
          checkoutForm(request),
        );
        return checkoutReceipt(response.value, request, expectedAmount, runtime, response.requestId);
      },
    }),
    refunds: Object.freeze({
      async createRefund(request: RefundRequest) {
        validateRefundRequest(request);
        const form = new URLSearchParams();
        form.set("payment_intent", request.providerPaymentId);
        form.set("amount", String(request.amountCents));
        form.set("reason", request.reason);
        form.set("metadata[order_id]", request.orderId);
        const response = await stripePost(
          runtime,
          fetchImpl,
          "/v1/refunds",
          request.idempotencyKey,
          form,
        );
        return refundReceipt(response.value, request, response.requestId);
      },
    }),
    webhooks: Object.freeze({
      async verify(input: PaymentWebhookInput) {
        await verifyStripeSignature(input, runtime);
        return parseVerifiedWebhook(input.rawBody, runtime);
      },
    }),
  });
}
