import type { Metadata } from "next";
import { preload } from "react-dom";
import "./globals.css";

import { BRAND } from "@/src/app/brand";

export const metadata: Metadata = {
  title: BRAND.full,
  description:
    "Случайные темы и законченные минуты из разных эпох Завтракаста.",
  manifest: "/manifest.webmanifest",
  themeColor: "#111313",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Start the data downloads while the JS bundle is still loading. The item
  // paths mirror what scripts/build-playback-index.ts emits.
  preload("/data/catalog.json", { as: "fetch", crossOrigin: "anonymous" });
  preload("/data/items-topics.json", { as: "fetch", crossOrigin: "anonymous" });
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
