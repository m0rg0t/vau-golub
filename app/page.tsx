import type { Metadata } from "next";

import { App } from "@/src/app/App";
import { ServiceWorkerRegistration } from "@/src/app/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Завтракаст СДВГ",
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
