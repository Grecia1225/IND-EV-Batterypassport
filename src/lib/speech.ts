import type { Battery, PackHealth } from "./types";
import type { RoutingRecommendation } from "./calculations";
import type { Lang } from "./i18n";
import { stageLabel } from "./calculations";

export const isSpeechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

/** Builds a short, natural spoken summary — deliberately plain language,
 *  since the whole point is reaching someone who can't read the screen. */
function buildSummaryText(battery: Battery, health: PackHealth, routing: RoutingRecommendation, lang: Lang): string {
  const stage = stageLabel(health.stage);

  if (lang === "hi") {
    return (
      `यह ${battery.maker} ${battery.model} बैटरी है। ` +
      `इसकी स्वास्थ्य स्थिति ${Math.round(health.sohPct)} प्रतिशत है, यानी यह "${stage}" श्रेणी में है। ` +
      (health.weakestCell?.flagged
        ? `इसमें एक सेल कमज़ोर है और उसे बदलने की सलाह दी जाती है। `
        : `सभी सेल ठीक हालत में हैं। `) +
      `सुझाव: ${routing.title}। ` +
      `अनुमानित उचित मूल्य ${Math.round(health.fairPriceLow)} से ${Math.round(health.fairPriceHigh)} रुपये के बीच है।`
    );
  }

  return (
    `This is a ${battery.maker} ${battery.model} battery. ` +
    `Its health is ${Math.round(health.sohPct)} percent, which puts it in the "${stage}" category. ` +
    (health.weakestCell?.flagged
      ? `One cell is weak and should be replaced. `
      : `All cells are in good condition. `) +
    `Recommendation: ${routing.title}. ` +
    `The estimated fair price is between ${Math.round(health.fairPriceLow)} and ${Math.round(health.fairPriceHigh)} rupees.`
  );
}

export function speakBatterySummary(
  battery: Battery,
  health: PackHealth,
  routing: RoutingRecommendation,
  lang: Lang,
  onEnd?: () => void
) {
  if (!isSpeechSupported) return;
  window.speechSynthesis.cancel();

  const text = buildSummaryText(battery, health, routing, lang);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang.toLowerCase().startsWith(lang === "hi" ? "hi" : "en"));
  if (match) utterance.voice = match;

  utterance.onend = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (!isSpeechSupported) return;
  window.speechSynthesis.cancel();
}