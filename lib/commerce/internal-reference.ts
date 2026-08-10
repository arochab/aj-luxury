export type InternalReferenceSize = "S" | "M" | "L" | "XL";

const colorReferenceCodes = {
  pourpre: "POU",
  "rose-pale": "ROS",
  "lilas-bleu-clair": "LIL",
} as const;

export function createApollonInternalReference(
  colorSlug: string,
  size: InternalReferenceSize,
): string {
  const code =
    colorSlug === "pourpre"
      ? colorReferenceCodes.pourpre
      : colorSlug === "rose-pale"
        ? colorReferenceCodes["rose-pale"]
        : colorSlug === "lilas-bleu-clair"
          ? colorReferenceCodes["lilas-bleu-clair"]
          : null;

  if (!code) {
    throw new Error(`Unknown Apollon color slug: ${colorSlug}`);
  }

  return `AJ-APO-${code}-${size}`;
}
