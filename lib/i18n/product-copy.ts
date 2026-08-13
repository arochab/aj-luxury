import type { TranslationKey } from "./dictionaries";

type Translate = (key: TranslationKey) => string;

const productCopyKeys = {
  pourpre: {
    tone: "product.tone.pourpre",
    description: "product.description.pourpre",
    details: [
      "product.detail.pourpre.1",
      "product.detail.pourpre.2",
      "product.detail.pourpre.3",
    ],
  },
  "rose-pale": {
    tone: "product.tone.rose-pale",
    description: "product.description.rose-pale",
    details: [
      "product.detail.rose-pale.1",
      "product.detail.rose-pale.2",
      "product.detail.rose-pale.3",
    ],
  },
  "lilas-bleu-clair": {
    tone: "product.tone.lilas-bleu-clair",
    description: "product.description.lilas-bleu-clair",
    details: [
      "product.detail.lilas-bleu-clair.1",
      "product.detail.lilas-bleu-clair.2",
      "product.detail.lilas-bleu-clair.3",
    ],
  },
} as const satisfies Record<
  string,
  {
    tone: TranslationKey;
    description: TranslationKey;
    details: readonly TranslationKey[];
  }
>;

const featureKeys = [
  "product.feature.1",
  "product.feature.2",
  "product.feature.3",
  "product.feature.4",
  "product.feature.5",
  "product.feature.6",
  "product.feature.7",
] as const satisfies readonly TranslationKey[];

export function getLocalizedProductCopy(t: Translate, slug: string) {
  const copy = productCopyKeys[slug as keyof typeof productCopyKeys];

  if (!copy) {
    throw new Error(`Missing localized product copy for ${slug}`);
  }

  return {
    tone: t(copy.tone),
    description: t(copy.description),
    details: copy.details.map((key) => t(key)),
    features: featureKeys.map((key) => t(key)),
  };
}
