import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured } from "../lib/supabase";
import { loadFleet } from "../lib/fleet";
import { demoBatteries, demoCells, demoReadings } from "../data/demoData";
import { evaluatePackHealth } from "../lib/calculations";
import { StatusBadge } from "../components/StatusBadge";
import { useLang } from "../lib/i18n";
import type { Battery, CellReading, LifeStage } from "../lib/types";

interface CardData { battery: Battery; stage: LifeStage }

export function Home() {
  const { t } = useLang();
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (isSupabaseConfigured) {
          const rows = await loadFleet();
          setCards(rows.map((r) => ({ battery: r.battery, stage: r.health.stage })));
        } else {
          setCards(demoBatteries.map((battery) => {
            const cells = demoCells.filter((c) => c.current_battery_id === battery.id);
            const rbc: Record<string, CellReading[]> = {};
            for (const cell of cells) rbc[cell.id] = demoReadings.filter((r) => r.cell_id === cell.id);
            return { battery, stage: evaluatePackHealth(cells, rbc, battery.chemistry, battery.capacity_ah, battery.nominal_voltage, null).stage };
          }));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load batteries");
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)]">
      <header className="border-b border-[var(--color-graphite-800)] px-6 py-5">
        <p className="text-xs tracking-wide text-[var(--color-accent-400)] font-medium">{t("appName")}</p>
        <h1 className="text-2xl font-semibold text-[var(--color-ink-100)] mt-1">{t("tagline")}</h1>
        <p className="text-sm text-[var(--color-ink-500)] mt-2 max-w-xl">{t("heroDescription")}</p>
        {!isSupabaseConfigured && (
          <p className="text-xs text-[var(--color-status-warn)] mt-3">
            Showing built-in demo data — connect Supabase (see README) to see real registered batteries here.
          </p>
        )}
      </header>
      <main className="px-6 py-6">
        <h2 className="text-sm font-medium text-[var(--color-ink-500)] mb-3">{t("registeredBatteries")}</h2>
        {error && <p className="text-sm text-[var(--color-status-bad)] mb-3">{error}</p>}
        {loading ? (
          <p className="text-sm text-[var(--color-ink-700)]">Loading…</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-700)]">
            {t("noBatteries")} <Link to="/register" className="text-[var(--color-accent-400)]">{t("registerOne")}</Link>.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ battery, stage }) => (
              <Link key={battery.id} to={`/p/${battery.id}`}
                className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-4 hover:border-[var(--color-accent-500)]/50 transition">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-mono text-xs text-[var(--color-ink-500)]">{battery.id}</span>
                  <StatusBadge stage={stage} />
                </div>
                <p className="font-semibold text-[var(--color-ink-100)]">{battery.maker}</p>
                <p className="text-sm text-[var(--color-ink-500)]">{battery.model}</p>
                <p className="text-xs text-[var(--color-ink-500)] mt-2">{battery.cell_count} cells · {battery.chemistry} · {battery.vehicle_type}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
