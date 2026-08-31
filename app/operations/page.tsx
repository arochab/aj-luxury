import type { Metadata } from "next";
import OperatorConsole from "./OperatorConsole";

export const metadata: Metadata = {
  title: "Opérations | AJ Luxury",
  robots: { index: false, follow: false },
};

export default function OperationsPage() {
  return <OperatorConsole />;
}
