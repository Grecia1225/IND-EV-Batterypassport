import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApprovalGate } from "../components/ApprovalGate";
import { fetchFlagEvents, fetchTechnicianStats, fetchPendingTechnicians, approveTechnician, type PendingTechnician } from "../lib/dataAccess";
import type { CellFlagEvent, TechnicianStats } from "../lib/types";

function ActivityInner() {
  const { role } = useAuth();
  const [events, setEvents] = useState<CellFlagEvent[]>([]);
  const [stats, setStats] = useState<(TechnicianStats & { email: string | null })[]>([]);
  const [pending, setPending] = useState<PendingTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [ev, st, pd] = await Promise.all([fetchFlagEvents(), fetchTechnicianStats(), role === "admin" ? fetchPendingTechnicians() : Promise.resolve([])]);
    setEvents(ev); setStats(st); setPending(pd); setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [role]);

  async function approve(p: PendingTechnician) {
    const { error } = await approveTechnician(p.id);
    setMsg(error ? `Could not approve: ${error}` : `${p.email} approved.`);
    await load();
  }

  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-ink-100)]">Activity log</h1>
          <p className="text-xs text-[var(--color-ink-500)] mt-1">Cells that newly crossed the replace line, who is logging readings{role === "admin" ? ", and accounts waiting for approval" : ""}.</p>
        </div>
        {loading ? <p className="text-sm text-[var(--color-ink-700)]">Loading…</p> : (<>
          {role === "admin" && (
            <div>
              <h2 className="text-sm font-medium text-[var(--color-ink-100)] mb-3">Accounts waiting for approval</h2>
              {msg && <p className="text-xs text-[var(--color-ink-300)] mb-2">{msg}</p>}
              {pending.length === 0 ? <p className="text-sm text-[var(--color-ink-700)] italic">Nobody is waiting.</p> : (
                <div className="rounded-xl border border-[var(--color-graphite-700)] divide-y divide-[var(--color-graphite-800)]">
                  {pending.map((p) => (
                    <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                      <div><p className="text-sm text-[var(--color-ink-100)]">{p.email}</p><p className="text-xs text-[var(--color-ink-500)]">signed up {new Date(p.created_at).toLocaleString()}</p></div>
                      <button onClick={() => approve(p)} className="rounded-lg bg-[var(--color-accent-500)] text-[var(--color-graphite-950)] text-xs font-medium px-3 py-1.5">Approve</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <h2 className="text-sm font-medium text-[var(--color-ink-100)] mb-3">Flag events</h2>
            {events.length === 0 ? <p className="text-sm text-[var(--color-ink-700)] italic">No cells have been newly flagged yet.</p> : (
              <div className="rounded-xl border border-[var(--color-graphite-700)] divide-y divide-[var(--color-graphite-800)]">
                {events.map((ev) => (
                  <div key={ev.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--color-ink-100)]"><span className="font-mono text-xs text-[var(--color-ink-500)]">{ev.cell_id}</span> — {ev.reason}</p>
                      <p className="text-xs text-[var(--color-ink-500)] mt-0.5">{new Date(ev.flagged_at).toLocaleString()}</p>
                    </div>
                    <Link to={`/p/${ev.battery_id}`} className="text-xs text-[var(--color-accent-400)] whitespace-nowrap ml-3">View {ev.battery_id} →</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-sm font-medium text-[var(--color-ink-100)] mb-3">Technician activity</h2>
            {stats.length === 0 ? <p className="text-sm text-[var(--color-ink-700)] italic">No readings logged yet.</p> : (
              <div className="rounded-xl border border-[var(--color-graphite-700)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-graphite-900)] text-[var(--color-ink-500)] text-xs"><tr>
                    {["Technician", "Readings logged", "Via CSV", "Last active"].map((h) => <th key={h} className="text-left px-4 py-2">{h}</th>)}</tr></thead>
                  <tbody>{stats.map((t) => (
                    <tr key={t.technician_id} className="border-t border-[var(--color-graphite-800)]">
                      <td className="px-4 py-2 text-[var(--color-ink-100)]">{t.email ?? t.technician_id}</td>
                      <td className="px-4 py-2 font-mono text-[var(--color-ink-300)]">{t.readings_logged}</td>
                      <td className="px-4 py-2 font-mono text-[var(--color-ink-300)]">{t.csv_readings}</td>
                      <td className="px-4 py-2 text-[var(--color-ink-500)]">{new Date(t.last_reading_at).toLocaleDateString()}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
          </div>
        </>)}
      </div>
    </div>
  );
}
export function ActivityLog() { return <ApprovalGate what="view activity"><ActivityInner /></ApprovalGate>; }
