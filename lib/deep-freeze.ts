/**
 * Recursively freezes data-only object graphs without invoking accessors.
 *
 * Catalogue constants are assembled locally from plain objects and arrays, so
 * freezing each own data property is enough to make every exported layer
 * immutable at runtime.
 */
export function deepFreeze<T>(value: T): T {
  const visited = new WeakSet<object>();

  const freezeDataGraph = (candidate: unknown): void => {
    if (
      (typeof candidate !== "object" && typeof candidate !== "function") ||
      candidate === null
    ) {
      return;
    }

    const objectCandidate = candidate as object;
    if (visited.has(objectCandidate)) return;
    visited.add(objectCandidate);

    let keys: PropertyKey[];
    try {
      // A shallow-frozen root may still contain mutable children, so traversal
      // must happen before deciding whether this node itself needs freezing.
      keys = Reflect.ownKeys(objectCandidate);
    } catch {
      // Revoked or hostile proxies are outside the data-graph contract. Deep
      // freezing remains best-effort and must not break catalogue creation.
      return;
    }

    for (const key of keys) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(objectCandidate, key);
        // Accessors are never invoked by a freezing operation.
        if (descriptor && "value" in descriptor) {
          freezeDataGraph(descriptor.value);
        }
      } catch {
        // Continue with other independently inspectable data properties.
      }
    }

    try {
      Object.freeze(objectCandidate);
    } catch {
      // Some exotic objects and hostile proxies cannot be frozen. Descendant
      // data already visited is still frozen wherever the runtime permits it.
    }
  };

  freezeDataGraph(value);
  return value;
}
