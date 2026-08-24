import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import HomeExperienceV9, {
  type HomeColorway,
} from "./components/HomeExperienceV9";
import { HOME_V9_COLORWAYS } from "./components/HomeExperienceV9.content";
import { getProducts } from "../lib/products";
import { getServerCommerceRuntimeMode } from "../lib/commerce/commerce-runtime.server";

export default function Home() {
  const products = getProducts();
  const commerceOpen = getServerCommerceRuntimeMode() === "production";

  const colorways: HomeColorway[] = HOME_V9_COLORWAYS.map((entry) => {
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
