import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const themeScript = `(function(){var t=localStorage.getItem("theme");var d=!t&&window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="dark"||d)document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark");})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Donadomains — Search domains & compare registrar prices",
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
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
