import type { Metadata } from "next";
import { Inter, Bangers } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "./providers";
import "./globals.css";

// next/font preloads the woff2 in <head> and generates a size-matched
// fallback so the swap from system-ui to the web font doesn't shift layout.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

const bangers = Bangers({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-title",
});

export const metadata: Metadata = {
  title: "Donadomains",
  description: "Search domain availability and compare prices at GoDaddy, Namecheap, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${bangers.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
