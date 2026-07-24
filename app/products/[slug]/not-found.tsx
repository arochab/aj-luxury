import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p>AJ Luxury · Collection 01</p>
      <h1>Cette pièce n’existe pas dans la maquette.</h1>
      <Link href="/#collection">Revenir à la collection</Link>
    </main>
  );
}
