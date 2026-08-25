import { CommerceError } from "./backend-domain.ts";
import type {
  VerifiedPaymentEvent,
  VerifiedPaymentEventClaims,
} from "./verified-payment-event.ts";

const verifiedPaymentEvents = new WeakSet<object>();
const preprodWorkerRegistrars = new WeakSet<object>();

type NodeTestProcess = Readonly<{
  env?: Readonly<Record<string, string | undefined>>;
  release?: Readonly<{ name?: string }>;
  versions?: Readonly<{ node?: string }>;
}>;

function assertNodeTestRuntime(): void {
  const runtimeProcess = (
    globalThis as typeof globalThis & { process?: NodeTestProcess }
  ).process;
  const testContext = runtimeProcess?.env?.NODE_TEST_CONTEXT;

  if (
    runtimeProcess?.release?.name !== "node" ||
    typeof runtimeProcess.versions?.node !== "string" ||
    typeof testContext !== "string" ||
    testContext.length === 0
  ) {
    throw new CommerceError(
      "PAYMENT_VERIFICATION_REQUIRED",
      "The internal payment registration seam is restricted to the Node test runner.",
    );
  }
}

/**
 * Node-test-only seam used by the approved local verification adapter.
 *
 * It is intentionally absent from every public commerce surface. Production
 * adapters must expose verified claims through their own audited verifier.
 */
export function registerVerifiedPaymentEventForNodeTest(
  claims: VerifiedPaymentEventClaims,
): VerifiedPaymentEvent {
  assertNodeTestRuntime();
  const event = Object.freeze({ ...claims });
  verifiedPaymentEvents.add(event);
  return event as VerifiedPaymentEvent;
}

/**
 * Issues a request-local registrar for the private Worker test-payment adapter.
 *
 * The opaque capability never crosses the closure boundary. Application code
 * receives only `register`, and that function remains fail-closed unless both
 * the issuer and every call observe the exact preproduction environment.
 */
export function issuePreprodWorkerPaymentRegistrar(
  environment: unknown,
): Readonly<{
  register(
    currentEnvironment: unknown,
    claims: VerifiedPaymentEventClaims,
  ): VerifiedPaymentEvent;
}> {
  if (environment !== "preproduction") {
    throw new CommerceError(
      "PAYMENT_VERIFICATION_REQUIRED",
      "The test payment registrar is restricted to preproduction.",
    );
  }
  const capability = Object.freeze({});
  preprodWorkerRegistrars.add(capability);
  return Object.freeze({
    register(currentEnvironment, claims) {
      if (
        currentEnvironment !== "preproduction" ||
        !preprodWorkerRegistrars.has(capability) ||
        claims.provider !== "test" ||
        claims.verificationMethod !== "test_adapter" ||
        claims.eventType !== "payment.succeeded"
      ) {
        throw new CommerceError(
          "PAYMENT_VERIFICATION_REQUIRED",
          "The test payment event lacks trusted preproduction provenance.",
        );
      }
      const event = Object.freeze({ ...claims });
      verifiedPaymentEvents.add(event);
      return event as VerifiedPaymentEvent;
    },
  });
}

export function isRegisteredVerifiedPaymentEvent(
  event: unknown,
): event is VerifiedPaymentEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    verifiedPaymentEvents.has(event)
  );
}
