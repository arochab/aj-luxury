/** Recursively freezes an object graph, including repeated references/cycles. */
export function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();

  function freeze(candidate: unknown): void {
    if (
      (typeof candidate !== "object" && typeof candidate !== "function") ||
      candidate === null ||
      seen.has(candidate)
    ) {
      return;
    }

    seen.add(candidate);
    for (const key of Reflect.ownKeys(candidate)) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor && "value" in descriptor) {
        freeze(descriptor.value);
      }
    }
    Object.freeze(candidate);
  }

  freeze(value);
  return value;
}
