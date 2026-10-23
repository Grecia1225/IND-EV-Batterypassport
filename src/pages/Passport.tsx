import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  fetchBatteryById, fetchCellsForBattery, fetchReadingsForCell, fetchLatestPackReading, fetchUsageHistory,
  fetchCellProvenance, verifyBatteryIntegrity, transferOwnership, type CellProvenanceEntry, type IntegrityReport,
} from "../lib/dataAccess";
import { demoBatteries, demoCells, demoReadings, demoPackReadings, demoUsageHistory } from "../data/demoData";
import { evaluatePackHealth, checkMarketplaceClearance, computeDegradationForecast, computeRoutingRecommendation } from "../lib/calculations";
import { StatusBadge } from "../components/StatusBadge";
import { CellGrid } from "../components/CellGrid";
import { CellDetailPanel } from "../components/CellDetailPanel";
import { Sparkline } from "../components/Sparkline";
import { ListenButton } from "../components/ListenButton";
import { useLang } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import type { Battery, Cell, CellReading, PackReading, UsageEvent } from "../lib/types";

export function Passport() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLang();
  const { user, role, approved } = useAuth();
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDb, setFromDb] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const [battery, setBattery] = useState<Battery | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [readingsByCell, setReadingsByCell] = useState<Record<string, CellReading[]>>({});
  const [packReading, setPackReading] = useState<PackReading | null>(null);
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [provenance, setProvenance] = useState<CellProvenanceEntry[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true); setIntegrity(null); setSelectedCellId(null);
      if (isSupabaseConfigured) {
        const b = await fetchBatteryById(id);
        if (b) {
          const c = await fetchCellsForBattery(id);
          const rbc: Record<string, CellReading[]> = {};
          for (const cell of c) rbc[cell.id] = await fetchReadingsForCell(cell.id);
          setBattery(b); setCells(c); setReadingsByCell(rbc); setFromDb(true);
          setPackReading((await fetchLatestPackReading(id)) as PackReading | null);
          setUsageEvents((await fetchUsageHistory(id)) as UsageEvent[]);
          setLoading(false);
          setIntegrity(await verifyBatteryIntegrity(id));
          return;
        }
      }
      const demoB = demoBatteries.find((b) => b.id === id) ?? null;
      setFromDb(false);
      if (demoB) {
        const c = demoCells.filter((cell) => cell.current_battery_id === demoB.id);
        const rbc: Record<string, CellReading[]> = {};
        for (const cell of c) rbc[cell.id] = demoReadings.filter((r) => r.cell_id === cell.id);
        setBattery(demoB); setCells(c); setReadingsByCell(rbc);
        setPackReading(demoPackReadings.filter((p) => p.battery_id === demoB.id).sort((a, b2) => b2.recorded_at.localeCompare(a.recorded_at))[0] ?? null);
        setUsageEvents(demoUsageHistory.filter((e) => e.battery_id === demoB.id).sort((a, b2) => a.event_at.localeCompare(b2.event_at)));
      } else setBattery(null);
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!fromDb || !selectedCellId) { setProvenance([]); return; }
    fetchCellProvenance(selectedCellId).then(setProvenance);
  }, [fromDb, selectedCellId]);

  async function handleTransfer() {
    if (!battery || !newOwnerName.trim()) return;
    setTransferring(true);
    const result = await transferOwnership(battery.id, newOwnerName.trim());
    setTransferring(false);
    if (result.error) { setTransferStatus(result.error); return; }
    setTransferStatus("Ownership transferred.");
    const fresh = await fetchBatteryById(battery.id);
    if (fresh) setBattery(fresh);
    setUsageEvents((await fetchUsageHistory(battery.id)) as UsageEvent[]);
    setIntegrity(await verifyBatteryIntegrity(battery.id));
    setNewOwnerName(""); setShowTransfer(false);
  }

  if (loading) return <div className="min-h-screen bg-[var(--color-graphite-950)] flex items-center justify-center"><p className="text-sm text-[var(--color-ink-700)]">Loading…</p></div>;
  if (!battery) {
    return (
      <div className="min-h-screen bg-[var(--color-graphite-950)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--color-ink-100)] font-medium">No passport found for "{id}"</p>
          <Link to="/" className="text-[var(--color-accent-400)] text-sm mt-2 inline-block">← Back to registered batteries</Link>
        </div>
      </div>
    );
  }

  const health = evaluatePackHealth(cells, readingsByCell, battery.chemistry, battery.capacity_ah, battery.nominal_voltage, packReading);
  const selectedCell = cells.find((c) => c.id === selectedCellId);
  const selectedHealth = health.cellHealths.find((c) => c.cellId === selectedCellId);
  const priorPackReadings = selectedCell && selectedCell.original_battery_id !== selectedCell.current_battery_id
    ? { batteryId: selectedCell.original_battery_id, readings: (readingsByCell[selectedCell.id] ?? []).filter((r) => r.battery_id !== selectedCell.current_battery_id) }
    : null;
  const clearance = checkMarketplaceClearance(health);
  const forecast = computeDegradationForecast(health.weakestCell?.cellId ?? null, readingsByCell, battery.chemistry);
  const routing = computeRoutingRecommendation(health);
  const sixTemps = packReading ? [packReading.temp_sensor_1, packReading.temp_sensor_2, packReading.temp_sensor_3, packReading.temp_sensor_4, packReading.temp_sensor_5, packReading.temp_sensor_6] : null;
  const canTransfer = Boolean(fromDb && user && approved && (role === "admin" || battery.created_by === user.id));
  const missing = battery.cell_count - cells.length;

  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] pb-16">
      <div className="px-6 py-4 border-b border-[var(--color-graphite-800)]">
        <Link to="/" className="text-xs text-[var(--color-ink-500)] hover:text-[var(--color-accent-400)]">← {t("allBatteries")}</Link>
      </div>

      <div className="px-6 py-6 border-b border-[var(--color-graphite-800)] bg-[var(--color-graphite-900)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            {battery.photo_url && <img src={battery.photo_url} alt={`${battery.maker} ${battery.model}`} className="w-20 h-20 rounded-lg object-cover border border-[var(--color-graphite-700)]" />}
            <div>
              <p className="font-mono text-xs text-[var(--color-ink-500)]">{battery.id}</p>
              <h1 className="text-xl font-semibold text-[var(--color-ink-100)] mt-1">{battery.maker} {battery.model}</h1>
              <p className="text-sm text-[var(--color-ink-500)] mt-1">Made in {battery.place_of_manufacture} · {new Date(battery.manufacture_date).toLocaleDateString()} · {battery.chemistry}</p>
              <p className="text-sm text-[var(--color-ink-500)]">
                Owner: {battery.owner_name}
                {canTransfer && <button onClick={() => setShowTransfer((s) => !s)} className="ml-2 text-xs text-[var(--color-accent-400)] no-print">Transfer</button>}
              </p>
              {showTransfer && (
                <div className="mt-2 flex items-center gap-2 no-print">
                  <input placeholder="New owner's name" value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)}
                    className="rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-2 py-1 text-xs text-[var(--color-ink-100)]" />
                  <button onClick={handleTransfer} disabled={transferring || !newOwnerName.trim()} className="text-xs rounded-lg bg-[var(--color-accent-500)] text-[var(--color-graphite-950)] px-2 py-1 disabled:opacity-50">{transferring ? "…" : "Confirm"}</button>
                </div>
              )}
              {transferStatus && <p className="text-xs text-[var(--color-ink-500)] mt-1 no-print">{transferStatus}</p>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge stage={health.stage} />
            <div className="flex gap-2 no-print">
              <ListenButton battery={battery} health={health} routing={routing} />
              <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-full border border-[var(--color-graphite-700)] text-[var(--color-ink-300)] hover:text-[var(--color-ink-100)] px-3 py-2 text-xs"><Download size={14} /> Certificate</button>
            </div>
          </div>
        </div>

        {battery.is_retro_registration && (
          <div className="mt-4 rounded-lg border border-[var(--color-status-warn)]/30 bg-[var(--color-status-warn-dim)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--color-status-warn)]">{t("retroRegistered")}</p>
            <p className="text-xs text-[var(--color-ink-300)] mt-1">{battery.retro_note}</p>
          </div>
        )}
        {missing > 0 && (
          <div className="mt-3 rounded-lg border border-[var(--color-status-warn)]/30 bg-[var(--color-status-warn-dim)] px-4 py-3">
            <p className="text-xs text-[var(--color-ink-300)]">Only {cells.length} of {battery.cell_count} cells are in this pack now — {missing} moved to another pack. See the usage history for where.</p>
          </div>
        )}

        <div className="mt-4">
          {!fromDb ? <span className="text-xs text-[var(--color-ink-500)]">Demo data — no integrity check</span>
           : integrity === null ? <span className="text-xs text-[var(--color-ink-500)]">Checking history integrity…</span>
           : integrity.ok ? <span className="inline-block rounded-full border border-[var(--color-status-good)]/30 bg-[var(--color-status-good-dim)] text-[var(--color-status-good)] text-xs px-3 py-1">History integrity verified · {integrity.readings_checked} readings · {integrity.events_checked} events, hash-chained</span>
           : <span className="inline-block rounded-lg border border-[var(--color-status-bad)]/40 bg-[var(--color-status-bad-dim)] text-[var(--color-status-bad)] text-xs px-3 py-1.5">History integrity check FAILED — {integrity.first_problem}. Do not trust this passport.</span>}
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><p className="text-xs text-[var(--color-ink-500)]">{t("stateOfHealth")}</p><p className="font-mono text-2xl text-[var(--color-ink-100)]">{Math.round(health.sohPct)}%</p></div>
          <div><p className="text-xs text-[var(--color-ink-500)]">{t("stateOfCharge")}</p><p className="font-mono text-2xl text-[var(--color-ink-100)]">{health.socPct !== null ? `${Math.round(health.socPct)}%` : "—"}</p></div>
          <div><p className="text-xs text-[var(--color-ink-500)]">{t("confidence")}</p><p className="font-mono text-2xl text-[var(--color-ink-100)]">{health.confidencePct}%</p></div>
          <div><p className="text-xs text-[var(--color-ink-500)]">{t("fairPriceEstimate")}</p><p className="font-mono text-lg text-[var(--color-ink-100)]">₹{health.fairPriceLow.toLocaleString("en-IN")}–{health.fairPriceHigh.toLocaleString("en-IN")}</p></div>
        </div>
      </div>

      <div className="px-6 py-6 grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-[var(--color-ink-100)] mb-1">{t("cells")}</h2>
            <p className="text-xs text-[var(--color-ink-500)] mb-3">{t("cellsHint")}</p>
            {cells.length === 0 ? <p className="text-sm text-[var(--color-ink-700)] italic">No cells in this pack.</p>
             : <CellGrid cellHealths={health.cellHealths} selectedCellId={selectedCellId} onSelect={setSelectedCellId} />}
          </div>
          {selectedCell && selectedHealth
            ? <CellDetailPanel cell={selectedCell} health={selectedHealth} positionLabel={`Position ${selectedCell.position_in_pack} of ${battery.cell_count}`} priorPackReadings={priorPackReadings} provenance={provenance} />
            : <p className="text-sm text-[var(--color-ink-700)] italic">{t("selectCellHint")}</p>}
          <div>
            <h2 className="text-sm font-medium text-[var(--color-ink-100)] mb-3">{t("usageHistory")}</h2>
            {usageEvents.length === 0 ? <p className="text-sm text-[var(--color-ink-700)] italic">{t("noUsageHistory")}</p> : (
              <div>{usageEvents.map((event) => (
                <div key={event.id} className="flex gap-3 py-2 border-l border-[var(--color-graphite-700)] pl-4 relative">
                  <span className="absolute -left-[3px] top-3 h-1.5 w-1.5 rounded-full bg-[var(--color-accent-500)]" />
                  <div><p className="text-xs text-[var(--color-ink-500)]">{new Date(event.event_at).toLocaleDateString()}</p><p className="text-sm text-[var(--color-ink-300)]">{event.detail}</p></div>
                </div>))}</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-4">
            <h3 className="text-xs font-medium text-[var(--color-ink-500)] mb-3">{t("degradationForecast")}</h3>
            <Sparkline points={forecast.trendPoints} />
            <p className="text-xs text-[var(--color-ink-300)] mt-2">{forecast.note}</p>
            {forecast.monthsTo80 !== null && <p className="text-xs text-[var(--color-status-warn)] mt-1">~{forecast.monthsTo80} {forecast.monthsTo80 === 1 ? "month" : "months"} to 80% (vehicle-use line)</p>}
            {forecast.monthsTo60 !== null && <p className="text-xs text-[var(--color-status-bad)]">~{forecast.monthsTo60} {forecast.monthsTo60 === 1 ? "month" : "months"} to 60% (storage line)</p>}
            <p className="text-[10px] text-[var(--color-ink-700)] mt-2">{t("forecastDisclaimer")}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-accent-500)]/30 bg-[var(--color-accent-500)]/5 p-4">
            <h3 className="text-xs font-medium text-[var(--color-accent-400)] mb-1">{t("recommendation")}</h3>
            <p className="text-sm font-medium text-[var(--color-ink-100)] mb-1">{routing.title}</p>
            <p className="text-xs text-[var(--color-ink-300)] mb-2">{routing.description}</p>
            <ul className="space-y-1">{routing.actionItems.map((item, i) => <li key={i} className="text-xs text-[var(--color-ink-500)] flex gap-1.5"><span className="text-[var(--color-accent-400)]">→</span>{item}</li>)}</ul>
          </div>
          <div className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-4">
            <h3 className="text-xs font-medium text-[var(--color-ink-500)] mb-3">{t("packTemperatureSensors")}</h3>
            {sixTemps ? (
              <div className="grid grid-cols-3 gap-2">{sixTemps.map((tv, i) => (
                <div key={i} className="rounded-lg bg-[var(--color-graphite-800)] p-2 text-center"><p className="text-[10px] text-[var(--color-ink-500)]">S{i + 1}</p><p className="font-mono text-sm text-[var(--color-ink-100)]">{tv === null ? "—" : `${tv}°C`}</p></div>))}</div>
            ) : <p className="text-xs text-[var(--color-ink-700)]">{t("noPackReading")}</p>}
          </div>
          <div className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-4">
            <h3 className="text-xs font-medium text-[var(--color-ink-500)] mb-2">{t("marketplaceClearance")}</h3>
            <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium border ${clearance.passed ? "bg-[var(--color-status-good-dim)] text-[var(--color-status-good)] border-[var(--color-status-good)]/30" : "bg-[var(--color-status-bad-dim)] text-[var(--color-status-bad)] border-[var(--color-status-bad)]/30"}`}>
              {clearance.passed ? t("clearedForListing") : t("notCleared")}</span>
            <p className="text-xs text-[var(--color-ink-500)] mt-2">{clearance.reason}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-4 text-xs text-[var(--color-ink-500)] leading-relaxed">{t("priceDisclaimer")}</div>
        </div>
      </div>
    </div>
  );
}
