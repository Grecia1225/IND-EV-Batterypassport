import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import { fetchAllBatteries, fetchActiveListings, fetchBatteryClearance, createListing, withdrawListing, type ClearanceResult } from "../lib/dataAccess";
import { loadFleet, type FleetRow } from "../lib/fleet";
import { StatusBadge } from "../components/StatusBadge";
import type { Battery } from "../lib/types";

interface ListingRow { listingId: string; sellerId: string | null; price: number; row: FleetRow | undefined; battery: Battery }

export function Marketplace() {
  const { user, role, approved } = useAuth();
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [mine, setMine] = useState<Battery[]>([]);
  const [selected, setSelected] = useState(""); const [price, setPrice] = useState("");
  const [clearance, setClearance] = useState<ClearanceResult | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const raw = (await fetchActiveListings()) as any[];
    const ids = raw.map((l) => l.battery_id as string);
    const fleet = ids.length ? await loadFleet({ batteryIds: ids }) : [];
    setListings(raw.filter((l) => l.batteries).map((l) => ({ listingId: l.id, sellerId: l.seller_id, price: Number(l.asking_price),
      battery: l.batteries as Battery, row: fleet.find((f) => f.battery.id === l.battery_id) })));
    if (user && approved) {
      const all = await fetchAllBatteries();
      setMine(all.filter((b) => role === "admin" || b.created_by === user.id));
    }
    setLoading(false);
  }, [user, role, approved]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setClearance(null);
    if (selected) fetchBatteryClearance(selected).then(setClearance);
  }, [selected]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setStatus(null);
    const { error } = await createListing(selected, parseFloat(price));
    if (error) setStatus({ type: "error", text: error });
    else { setStatus({ type: "success", text: "Listing published." }); setSelected(""); setPrice(""); await load(); }
  }
  async function withdraw(id: string) {
    const { error } = await withdrawListing(id);
    setStatus(error ? { type: "error", text: error } : { type: "success", text: "Listing withdrawn." });
    await load();
  }

  const input = "rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)]";
  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] px-6 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-ink-100)]">Marketplace</h1>
          <p className="text-xs text-[var(--color-ink-500)] mt-1">Every listing links to its full passport. Clearance is checked by the server before a listing can go live.</p>
        </div>
        {!isSupabaseConfigured ? <p className="text-sm text-[var(--color-ink-300)]">Connect Supabase first — see the README.</p> : (<>
          {user && approved && mine.length > 0 && (
            <form onSubmit={create} className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-5 space-y-3">
              <h2 className="text-sm font-medium text-[var(--color-ink-100)]">List one of your batteries</h2>
              <div className="grid grid-cols-2 gap-3">
                <select required value={selected} onChange={(e) => setSelected(e.target.value)} className={input}>
                  <option value="">Select a battery…</option>
                  {mine.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.maker} {b.model}</option>)}
                </select>
                <input required type="number" min="1" placeholder="Asking price (₹)" value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
              </div>
              {clearance && (
                <p className={`text-xs ${clearance.passed ? "text-[var(--color-status-good)]" : "text-[var(--color-status-bad)]"}`}>
                  {clearance.passed ? "Cleared: " : "Not cleared: "}{clearance.reason} (health {Math.round(clearance.soh)}%, evidence {clearance.confidence}%)
                </p>
              )}
              <button type="submit" disabled={!clearance?.passed} className="rounded-lg bg-[var(--color-accent-500)] text-[var(--color-graphite-950)] font-medium text-sm px-4 py-2 disabled:opacity-40">Create listing</button>
            </form>
          )}
          {status && <p className={`text-xs ${status.type === "success" ? "text-[var(--color-status-good)]" : "text-[var(--color-status-bad)]"}`}>{status.text}</p>}
          <div>
            <h2 className="text-sm font-medium text-[var(--color-ink-100)] mb-3">Active listings</h2>
            {loading ? <p className="text-sm text-[var(--color-ink-700)]">Loading…</p>
             : listings.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No active listings yet.</p>
             : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((l) => (
                  <div key={l.listingId} className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-4">
                    <Link to={`/p/${l.battery.id}`} className="block hover:opacity-80">
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-mono text-xs text-[var(--color-ink-500)]">{l.battery.id}</span>
                        {l.row && <StatusBadge stage={l.row.health.stage} />}
                      </div>
                      <p className="font-semibold text-[var(--color-ink-100)]">{l.battery.maker} {l.battery.model}</p>
                      {l.row && <p className="text-xs text-[var(--color-ink-500)] mt-1">SoH {Math.round(l.row.health.sohPct)}%</p>}
                      <p className="font-mono text-lg text-[var(--color-ink-100)] mt-2">₹{l.price.toLocaleString("en-IN")}</p>
                    </Link>
                    {user && (l.sellerId === user.id || role === "admin") && (
                      <button onClick={() => withdraw(l.listingId)} className="mt-3 text-xs text-[var(--color-status-bad)]">Withdraw listing</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
      </div>
    </div>
  );
}
