import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import { fetchFlagEvents, fetchTechnicianStats } from "../lib/dataAccess";
import type { CellFlagEvent, TechnicianStats } from "../lib/types";

export function ActivityLog() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CellFlagEvent[]>([]);
  const [techStats, setTechStats] = useState<(TechnicianStats & { email: string | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }
    (async () => {
      const [ev, stats] = await Promise.all([fetchFlagEvents(), fetchTechnicianStats()]);
      setEvents(ev);
      setTechStats(stats);
      setLoading(false);
    })();
  }, [user]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-[var(--color-graphite-950)] flex items-center justify-center px-6">
        <p className="text-sm text-[var(--color-ink-300)]">Connect Supabase first — see the README.</p>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--color-graphite-950)] flex items-center justify-center px-6">
        <p className="text-sm text-[var(--color-ink-300)]">Sign in as a technician or admin to view activity.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-ink-100)]">Activity log</h1>
          <p className="text-xs text-[var(--color-ink-500)] mt-1">
            Every moment a cell newly crossed into needing attention, plus who's been logging readings.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-ink-700)]">Loading…</p>
        ) : (
          <>
            <div>
              <h2 className="text-sm font-medium text-[var(--color-ink-100)] mb-3">Flag events</h2>
              {events.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-700)] italic">No cells have been newly flagged yet.</p>
              ) : (
                <div className="rounded-xl border border-[var(--color-graphite-700)] divide-y divide-[var(--color-graphite-800)]">
                  {events.map((ev) => (
                    <div key={ev.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-[var(--color-ink-100)]">
                          <span className="font-mono text-xs text-[var(--color-ink-500)]">{ev.cell_id}</span> — {ev.reason}
                        </p>
                        <p className="text-xs text-[var(--color-ink-500)] mt-0.5">
                          {new Date(ev.flagged_at).toLocaleString()}
                        </p>
                      </div>
                      <Link to={`/p/${ev.battery_id}`} className="text-xs text-[var(--color-accent-400)] whitespace-nowrap ml-3">
                        View {ev.battery_id} →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-sm font-medium text-[var(--color-ink-100)] mb-3">Technician activity</h2>
              <p className="text-xs text-[var(--color-ink-500)] mb-3">
                A simple trust signal: more consistent readings over time means more verified history behind a passport.
              </p>
              {techStats.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-700)] italic">No readings logged yet.</p>
              ) : (
                <div className="rounded-xl border border-[var(--color-graphite-700)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-graphite-900)] text-[var(--color-ink-500)] text-xs">
                      <tr>
                        <th className="text-left px-4 py-2">Technician</th>
                        <th className="text-left px-4 py-2">Readings logged</th>
                        <th className="text-left px-4 py-2">Via CSV</th>
                        <th className="text-left px-4 py-2">Last active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {techStats.map((t) => (
                        <tr key={t.technician_id} className="border-t border-[var(--color-graphite-800)]">
                          <td className="px-4 py-2 text-[var(--color-ink-100)]">{t.email ?? t.technician_id}</td>
                          <td className="px-4 py-2 font-mono text-[var(--color-ink-300)]">{t.readings_logged}</td>
                          <td className="px-4 py-2 font-mono text-[var(--color-ink-300)]">{t.csv_readings}</td>
                          <td className="px-4 py-2 text-[var(--color-ink-500)]">{new Date(t.last_reading_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}