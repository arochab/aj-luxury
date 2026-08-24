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
    image: "/images/client/editorial-rose-profile.webp",
    width: 1731,
    height: 2600,
    position: "center 30%",
  },
  {
    slug: "lilas-bleu-clair",
    nameKey: "sequence.color.lilac",
    descriptionKey: "product.description.lilas-bleu-clair",
    image: "/images/client/editorial-lilas-chair.webp",
    width: 1731,
    height: 2600,
    position: "center 29%",
  },
  {
    slug: "pourpre",
    nameKey: "sequence.color.purple",
    descriptionKey: "product.description.pourpre",
    image: "/images/client/editorial-pourpre-chair.webp",
    width: 1864,
    height: 2600,
    position: "center 31%",
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
