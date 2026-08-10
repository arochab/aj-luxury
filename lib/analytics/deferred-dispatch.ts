function silenceCollectorResult(result: unknown): void {
  try {
    if (
      (typeof result === "object" && result !== null) ||
      typeof result === "function"
    ) {
      const then = (result as { then?: unknown }).then;
      if (typeof then === "function") {
        void Promise.resolve(result).catch(() => {});
      }
    }
  } catch {
    // A hostile or invalid collector must remain isolated from commerce.
  }
}

/**
 * Internal dispatch boundary. Collection always starts in a later microtask and
 * every synchronous or asynchronous collector failure is contained.
 */
export function deferAnalyticsEvent<Event>(
  collect: (event: Event) => unknown,
  event: Event,
): boolean {
  try {
    queueMicrotask(() => {
      try {
        silenceCollectorResult(collect(event));
      } catch {
        // Analytics must never break or delay the commerce interaction path.
      }
    });
    return true;
  } catch {
    return false;
  }
}
