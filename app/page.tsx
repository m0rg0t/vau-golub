import type { Metadata } from "next";

import { App } from "@/src/app/App";
import { BRAND } from "@/src/app/brand";
import { ServiceWorkerRegistration } from "@/src/app/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: BRAND.full,
  description:
    "Случайные темы и законченные минуты из разных эпох Завтракаста.",
};

export default function Home() {
  return (
    <>
      <ServiceWorkerRegistration />
      <App />
    </>
  );
}
