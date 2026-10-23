import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { Battery, PackHealth } from "../lib/types";
import type { RoutingRecommendation } from "../lib/calculations";
import { useLang } from "../lib/i18n";
import { isSpeechSupported, speakBatterySummary, stopSpeaking } from "../lib/speech";

export function ListenButton({
  battery,
  health,
  routing,
}: {
  battery: Battery;
  health: PackHealth;
  routing: RoutingRecommendation;
}) {
  const { lang, t } = useLang();
  const [speaking, setSpeaking] = useState(false);

  if (!isSpeechSupported) return null;

  function handleClick() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      speakBatterySummary(battery, health, routing, lang, () => setSpeaking(false));
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition ${
        speaking
          ? "bg-[var(--color-status-bad-dim)] text-[var(--color-status-bad)] border border-[var(--color-status-bad)]/30"
          : "bg-[var(--color-accent-500)] text-[var(--color-graphite-950)] hover:bg-[var(--color-accent-600)]"
      }`}
      aria-label={speaking ? t("stopListening") : t("listen")}
    >
      {speaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
      {speaking ? t("stopListening") : t("listen")}
    </button>
  );
}