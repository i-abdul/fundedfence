import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "Read-only MT5 monitoring, explainable prop-firm risk calculations, and early warnings before an accidental account breach.";
  return {
    metadataBase: new URL(origin),
    title: { default: "PropShield — Prop account protection", template: "%s · PropShield" },
    description,
    applicationName: "PropShield",
    openGraph: {
      type: "website",
      title: "PropShield — Prop account protection",
      description,
      url: origin,
      siteName: "PropShield",
      images: [{ url: `${origin}/og.png`, width: 1734, height: 909, alt: "PropShield read-only MT5 account health monitoring" }],
    },
    twitter: { card: "summary_large_image", title: "PropShield — Prop account protection", description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
