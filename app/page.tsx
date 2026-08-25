import StoreFooter from "./components/StoreFooter";
import HomeExperienceV10, {
  type HomeColorway,
} from "./components/HomeExperienceV10";
import { getProducts } from "../lib/products";

export default function Home() {
  const products = getProducts();

  const keys = {
    "rose-pale": "sequence.color.rose",
    "lilas-bleu-clair": "sequence.color.lilac",
    pourpre: "sequence.color.purple",
  } as const;

  const colorways: HomeColorway[] = products.flatMap((product) => {
    if (!(product.slug in keys)) return [];
    const slug = product.slug as HomeColorway["slug"];
    return [{
      slug,
      nameKey: keys[slug],
      image: product.image,
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
