import { useLang } from "../lib/i18n";

export function LanguageToggle() {
  const { lang, setLang } = useLang();

  return (
    <div className="flex rounded-full border border-[var(--color-graphite-700)] overflow-hidden text-xs">
      <button
        onClick={() => setLang("en")}
        className={`px-2.5 py-1 ${lang === "en" ? "bg-[var(--color-accent-500)] text-[var(--color-graphite-950)]" : "text-[var(--color-ink-500)]"}`}
      >
        EN
      </button>
      <button
        onClick={() => setLang("hi")}
        className={`px-2.5 py-1 ${lang === "hi" ? "bg-[var(--color-accent-500)] text-[var(--color-graphite-950)]" : "text-[var(--color-ink-500)]"}`}
      >
        हिं
      </button>
    </div>
  );
}