import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApprovalGate } from "../components/ApprovalGate";
import { loadFleet, type FleetRow } from "../lib/fleet";
import { StatusBadge } from "../components/StatusBadge";
import type { LifeStage } from "../lib/types";

function DashboardInner() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<FleetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<LifeStage | "all">("all");
  const [sortBy, setSortBy] = useState<"soh" | "flagged">("soh");
  const [scope, setScope] = useState<"mine" | "all">(role === "admin" ? "all" : "mine");

  useEffect(() => {
    loadFleet().then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Failed to load")).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    let r = scope === "mine" ? rows.filter((x) => x.battery.created_by === user?.id) : rows;
    if (filterStage !== "all") r = r.filter((x) => x.health.stage === filterStage);
    const flagged = (x: FleetRow) => x.health.cellHealths.filter((c) => c.flagged).length;
    return [...r].sort((a, b) => (sortBy === "soh" ? a.health.sohPct - b.health.sohPct : flagged(b) - flagged(a)));
  }, [rows, scope, filterStage, sortBy, user]);

  const sel = "rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-3 py-1.5 text-xs text-[var(--color-ink-100)]";
  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-ink-100)]">Fleet dashboard</h1>
            <p className="text-xs text-[var(--color-ink-500)] mt-1">80% SoH crossing = retire from vehicle. 60% = retire from storage too.</p>
          </div>
          <div className="flex gap-2">
            <select value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")} className={sel}>
              <option value="mine">My registrations</option><option value="all">All batteries</option>
            </select>
            <select value={filterStage} onChange={(e) => setFilterStage(e.target.value as LifeStage | "all")} className={sel}>
              <option value="all">All stages</option><option value="healthy">Healthy</option>
              <option value="second-life">Second-life</option><option value="retire">Retire</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "soh" | "flagged")} className={sel}>
              <option value="soh">Sort: worst health first</option><option value="flagged">Sort: most flagged cells first</option>
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-[var(--color-status-bad)] mb-3">{error}</p>}
        {loading ? <p className="text-sm text-[var(--color-ink-700)]">Loading…</p>
         : visible.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No batteries match this filter.</p>
         : (
          <div className="rounded-xl border border-[var(--color-graphite-700)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-graphite-900)] text-[var(--color-ink-500)] text-xs">
                <tr>{["Pack ID", "Maker / Model", "SoH", "SoC", "Cells present", "Flagged", "Stage"].map((h) => <th key={h} className="text-left px-4 py-2.5">{h}</th>)}</tr>
              </thead>
              <tbody>
                {visible.map(({ battery, cells, health }) => {
                  const soh = health.sohPct;
                  return (
                    <tr key={battery.id} onClick={() => navigate(`/p/${battery.id}`)} className="border-t border-[var(--color-graphite-800)] hover:bg-[var(--color-graphite-900)] cursor-pointer">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-ink-100)]">{battery.id}</td>
                      <td className="px-4 py-3 text-[var(--color-ink-300)]">{battery.maker} {battery.model}</td>
                      <td className={`px-4 py-3 font-mono ${soh < 60 ? "text-[var(--color-status-bad)]" : soh < 80 ? "text-[var(--color-status-warn)]" : "text-[var(--color-status-good)]"}`}>{Math.round(soh)}%</td>
                      <td className="px-4 py-3 font-mono text-[var(--color-ink-300)]">{health.socPct !== null ? `${Math.round(health.socPct)}%` : "—"}</td>
                      <td className={`px-4 py-3 font-mono ${cells.length < battery.cell_count ? "text-[var(--color-status-warn)]" : "text-[var(--color-ink-300)]"}`}>{cells.length}/{battery.cell_count}</td>
                      <td className="px-4 py-3 text-[var(--color-ink-300)]">{health.cellHealths.filter((c) => c.flagged).length}</td>
                      <td className="px-4 py-3"><StatusBadge stage={health.stage} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
export function Dashboard() { return <ApprovalGate what="view the fleet dashboard"><DashboardInner /></ApprovalGate>; }
