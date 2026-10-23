import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";

function Box({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] flex items-center justify-center px-6">
      <div className="max-w-md text-center text-sm text-[var(--color-ink-300)] space-y-2">{children}</div>
    </div>
  );
}

/** Wraps a page that needs a signed-in AND admin-approved technician account. */
export function ApprovalGate({ what, children }: { what: string; children: ReactNode }) {
  const { user, approved, loading } = useAuth();
  if (!isSupabaseConfigured) return <Box><p>Connect Supabase first — see the README.</p></Box>;
  if (loading) return <Box><p>Loading…</p></Box>;
  if (!user) return <Box><p>Sign in as a technician to {what}.</p><Link className="text-[var(--color-accent-400)]" to="/login">Sign in</Link></Box>;
  if (!approved) {
    return (
      <Box>
        <p className="text-[var(--color-status-warn)] font-medium">Your account is waiting for approval</p>
        <p>An admin must approve it before you can {what}. Viewing passports works in the meantime.</p>
      </Box>
    );
  }
  return <>{children}</>;
}
