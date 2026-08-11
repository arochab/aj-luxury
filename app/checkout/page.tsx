import DemoCheckoutJourney from "../components/demo/DemoCheckoutJourney";
import DemoPageFrame from "../components/demo/DemoPageFrame";
import { syntheticCustomerJourneySource } from "@/lib/demo/customer-journey-source";

export const metadata = {
  title: "Livraison et paiement simulés | AJ Luxury",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckoutPage() {
  const journey = await syntheticCustomerJourneySource.read();

  return (
    <DemoPageFrame step="02 · Livraison et paiement" hideFooter>
      <DemoCheckoutJourney journey={journey} />
    </DemoPageFrame>
  );
}
