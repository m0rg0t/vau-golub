import type { Metadata } from "next";
import { preload } from "react-dom";
import "./globals.css";

import { BRAND } from "@/src/app/brand";
import episodesJsonLd from "@/src/app/episodes-jsonld.json";

// Deployed origin. Kept here (not in brand.ts) because it is only ever needed
// for SEO metadata and the structured data emitted below.
const SITE_ORIGIN = "https://vau-golub.ru";
const SERIES_ID = `${SITE_ORIGIN}/#zavtracast-series`;

// Shared between the meta description and the WebApplication structured data so
// search engines see one consistent summary.
const SEO_DESCRIPTION =
  "Случайные темы и минутные фрагменты из архива подкаста Завтракаст: перебираем выпуски разных лет, слушаем законченные минуты и читаем транскрипты.";

const SEO_TITLE = `${BRAND.full} — случайные темы из архива подкаста Завтракаст`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: SEO_TITLE,
  description: SEO_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  themeColor: "#111313",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    url: `${SITE_ORIGIN}/`,
    type: "website",
    locale: "ru_RU",
    siteName: BRAND.full,
    images: [
      {
        url: `${SITE_ORIGIN}/art/pigeon-radio.png`,
        width: 1254,
        height: 1254,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    images: [`${SITE_ORIGIN}/art/pigeon-radio.png`],
  },
};

// schema.org structured data. Built once at module scope so it is not
// recomputed per request.
const webApplicationLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: BRAND.full,
  alternateName: "СДВГ",
  url: `${SITE_ORIGIN}/`,
  description: SEO_DESCRIPTION,
  inLanguage: "ru",
  applicationCategory: "MultimediaApplication",
  isAccessibleForFree: true,
  about: { "@id": SERIES_ID },
};

const podcastSeriesLd = {
  "@context": "https://schema.org",
  "@type": "PodcastSeries",
  "@id": SERIES_ID,
  name: "Завтракаст",
  url: "https://zavtracast.ru",
  inLanguage: "ru",
  publisher: { "@type": "Organization", name: "Завтракаст" },
};

const episodesGraphLd = {
  "@context": "https://schema.org",
  "@graph": episodesJsonLd,
};

// Escape "<" so a stray "</script>" inside any episode summary cannot terminate
// the inline <script> block early.
function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

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
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLd(webApplicationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLd(podcastSeriesLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLd(episodesGraphLd) }}
        />
      </body>
    </html>
  );
}
