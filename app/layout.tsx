import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { headers } from "next/headers";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = new URL(host ? `${protocol}://${host}` : "http://localhost:3000");

  return {
    metadataBase,
    title: "AJ Luxury | Reveal Your Inner Beauty",
    description:
      "Chez AJ Luxury, nous sommes convaincus que le véritable luxe commence par ce que l’on porte au plus près de soi.",
    openGraph: {
      title: "AJ Luxury | Reveal Your Inner Beauty",
      description:
        "Chez AJ Luxury, nous sommes convaincus que le véritable luxe commence par ce que l’on porte au plus près de soi.",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "AJ Luxury" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "AJ Luxury | Reveal Your Inner Beauty",
      description:
        "Chez AJ Luxury, nous sommes convaincus que le véritable luxe commence par ce que l’on porte au plus près de soi.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${manrope.variable} antialiased`}>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
