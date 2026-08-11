import DemoPageFrame from "../components/demo/DemoPageFrame";
import DemoReturnRefund from "../components/demo/DemoReturnRefund";
import { demoDestinationFrom } from "@/lib/demo/customer-journey";
import { syntheticCustomerJourneySource } from "@/lib/demo/customer-journey-source";

export const metadata = {
  title: "Retour simulé | AJ Luxury",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DemoReturnPageProps = {
  searchParams: Promise<{ destination?: string }>;
};

export default async function DemoReturnPage({ searchParams }: DemoReturnPageProps) {
  const journey = await syntheticCustomerJourneySource.read();
  const destination = demoDestinationFrom((await searchParams).destination);

  return (
    <DemoPageFrame step="06 · Retour">
      <DemoReturnRefund journey={journey} destination={destination} />
    </DemoPageFrame>
  );
}
