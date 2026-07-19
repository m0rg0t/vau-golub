import type { Metadata } from "next";
import { Radio } from "lucide-react";

export const metadata: Metadata = {
  title: "Завтракаст СДВГ",
  description:
    "Случайные темы и законченные минуты из разных эпох Завтракаста.",
};

export default function Home() {
  return (
    <main className="setup-shell">
      <div className="setup-signal" aria-hidden="true">
        <Radio className="setup-radio" strokeWidth={1.6} />
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="setup-eyebrow">Настраиваем волну</p>
      <h1>
        Завтракаст <span>СДВГ</span>
      </h1>
      <p className="setup-subtitle">Синдром Дефицита Где Голубь</p>
      <p className="setup-status" role="status">
        Радиоприёмник собирается. Скоро здесь зазвучат темы из разных лет.
      </p>
    </main>
  );
}
