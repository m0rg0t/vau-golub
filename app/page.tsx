import { App } from "@/src/app/App";
import { BRAND } from "@/src/app/brand";
import { ServiceWorkerRegistration } from "@/src/app/ServiceWorkerRegistration";

export default function Home() {
  return (
    <>
      <ServiceWorkerRegistration />
      <App />
      {/*
        App server-renders only its loading shell, so the attribution and the
        "what is this" copy never reach crawlers that skip JavaScript. This
        noscript block carries that context in the initial HTML with no visual
        impact for JS clients (who see the App footer instead).
      */}
      <noscript>
        <p>
          {BRAND.full} — неофициальный плеер случайных тем и минутных
          фрагментов из архива подкаста «Завтракаст» (2015–2026). Аудио
          принадлежит авторам Завтракаста, первоисточник —{" "}
          <a href="https://zavtracast.ru" rel="noopener">
            zavtracast.ru
          </a>
          .
        </p>
      </noscript>
    </>
  );
}
