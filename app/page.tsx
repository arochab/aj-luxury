import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import HomeExperienceV9, {
  type HomeColorway,
} from "./components/HomeExperienceV9";
import { getProducts } from "../lib/products";
import { getServerCommerceRuntimeMode } from "../lib/commerce/commerce-runtime.server";

const HOME_COLORWAYS = [
  {
    slug: "rose-pale",
    nameKey: "sequence.color.rose",
    descriptionKey: "product.description.rose-pale",
    still: "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-rose-model-color-v2.webp",
  },
  {
    slug: "lilas-bleu-clair",
    nameKey: "sequence.color.lilac",
    descriptionKey: "product.description.lilas-bleu-clair",
    still: "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-lilas-model-color-v2.webp",
  },
  {
    slug: "pourpre",
    nameKey: "sequence.color.purple",
    descriptionKey: "product.description.pourpre",
    still: "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-pourpre-model-color-v2.webp",
  },
] as const;

export default function Home() {
  const products = getProducts();
  const commerceOpen = getServerCommerceRuntimeMode() === "production";

  const colorways: HomeColorway[] = HOME_COLORWAYS.map((entry) => {
    const product = products.find((candidate) => candidate.slug === entry.slug);
    if (!product) {
      throw new Error(`Missing homepage product: ${entry.slug}`);
    }

    return {
      ...entry,
      priceCents: product.priceCents,
      swatch: product.swatch,
    };
  });

  return (
    <main className="aj-home aj-home-v9">
      <StoreHeader />
      <HomeExperienceV9 colorways={colorways} commerceOpen={commerceOpen} />
      <StoreFooter />
    </main>
  );
}
