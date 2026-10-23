import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";

export function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-[var(--color-graphite-950)] flex items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-[var(--color-status-warn)]/30 bg-[var(--color-status-warn-dim)] p-5">
          <p className="text-sm font-medium text-[var(--color-status-warn)]">Supabase isn't connected yet</p>
          <p className="text-xs text-[var(--color-ink-300)] mt-2">
            Sign-in needs a Supabase project. Follow the README's "Connecting a
            real database" section, fill in <code>.env</code>, then restart
            <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
    } else {
      navigate("/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-6"
      >
        <h1 className="text-lg font-semibold text-[var(--color-ink-100)] mb-1">
          {mode === "signin" ? "Sign in" : "Create technician account"}
        </h1>
        <p className="text-xs text-[var(--color-ink-500)] mb-5">
          {mode === "signin"
            ? "For technicians and admins registering batteries and readings."
            : "The very first account created becomes admin automatically."}
        </p>

        <label className="block text-xs text-[var(--color-ink-500)] mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-3 rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)] outline-none focus:border-[var(--color-accent-500)]"
        />

        <label className="block text-xs text-[var(--color-ink-500)] mb-1">Password</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)] outline-none focus:border-[var(--color-accent-500)]"
        />

        {error && <p className="text-xs text-[var(--color-status-bad)] mb-3">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[var(--color-accent-500)] hover:bg-[var(--color-accent-600)] text-[var(--color-graphite-950)] font-medium text-sm py-2 transition disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-xs text-[var(--color-accent-400)] mt-3"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}