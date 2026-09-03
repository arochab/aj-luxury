import type { Metadata } from "next";
import OperatorConsole from "../operations/OperatorConsole";

export const metadata: Metadata = {
  title: "Administration | AJ Luxury",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <OperatorConsole />;
}
