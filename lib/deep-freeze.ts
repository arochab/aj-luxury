/**
 * Recursively freezes data-only object graphs without invoking accessors.
 *
 * Catalogue constants are assembled locally from plain objects and arrays, so
 * freezing each own data property is enough to make every exported layer
 * immutable at runtime.
 */
export function deepFreeze<T>(value: T): T {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }

  Object.freeze(value);
  return value;
}
