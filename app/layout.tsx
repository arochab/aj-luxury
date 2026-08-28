import type { Metadata } from "next";
import { preload } from "react-dom";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ajluxurystore.com"),
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  preload("/fonts/manrope-latin-v1.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png" sizes="512x512" type="image/png" />
        <link rel="icon" href="/favicon-96x96.png" sizes="96x96" type="image/png" />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
