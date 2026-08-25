import StoreFooter from "./components/StoreFooter";
import HomeExperienceV10, {
  type HomeColorway,
} from "./components/HomeExperienceV10";
import { getProducts } from "../lib/products";

export default function Home() {
  const products = getProducts();

  const productionOrder = [
    {
      slug: "pourpre",
      nameKey: "sequence.color.purple",
      image: "/images/client/raw/product-card-pourpre.webp",
    },
    {
      slug: "rose-pale",
      nameKey: "sequence.color.rose",
      image: "/images/client/raw/product-rose-profile.webp",
    },
    {
      slug: "lilas-bleu-clair",
      nameKey: "sequence.color.lilac",
      image: "/images/client/raw/product-lilas-model.webp",
    },
  ] as const;

  const colorways: HomeColorway[] = productionOrder.flatMap((entry) => {
    const product = products.find(({ slug }) => slug === entry.slug);
    if (!product) return [];

    return [{
      slug: entry.slug,
      nameKey: entry.nameKey,
      image: entry.image,
      width: 1731,
      height: 2600,
      position: "center top",
      swatch: product.swatch,
    }];
  });

  return (
    <main className="aj-home aj-home-v10">
      <HomeExperienceV10 colorways={colorways} />
      <StoreFooter />
    </main>
  );
}
