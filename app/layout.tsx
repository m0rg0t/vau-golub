import type { Metadata } from "next";
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
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
