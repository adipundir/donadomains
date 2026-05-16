import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "./providers";
// Open Sauce Sans — the new body font. @fontsource self-hosts the woff2
// files so we don't depend on a CDN. Importing the index loads all weights
// from 300 to 900 (we currently use 400/600/700 around the app).
import "@fontsource/open-sauce-sans/400.css";
import "@fontsource/open-sauce-sans/500.css";
import "@fontsource/open-sauce-sans/600.css";
import "@fontsource/open-sauce-sans/700.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Donadomains",
  description: "Search domain availability and compare prices at GoDaddy, Namecheap, and more. Product of Donalabs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
