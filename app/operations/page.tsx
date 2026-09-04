import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Opérations | AJ Luxury",
  robots: { index: false, follow: false },
};

export default function OperationsPage() {
  permanentRedirect("/admin");
}
