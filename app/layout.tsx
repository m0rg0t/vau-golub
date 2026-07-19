import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Завтракаст СДВГ — Синдром Дефицита Где Голубь",
  description:
    "Случайные темы и законченные минуты из разных эпох Завтракаста.",
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
