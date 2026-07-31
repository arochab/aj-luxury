import Link from "next/link";
import { T } from "../../../lib/i18n/TranslatedText";

export default function NotFound() {
  return (
    <main className="not-found">
      <p>AJ Luxury · Collection 01</p>
      <h1><T id="common.notFoundTitle" /></h1>
      <Link href="/#collection"><T id="common.backToCollection" /></Link>
    </main>
  );
}
