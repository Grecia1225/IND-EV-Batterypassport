import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/i18n";
import { LanguageToggle } from "./LanguageToggle";

export function NavBar() {
  const { user, role, signOut } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-[var(--color-graphite-800)] bg-[var(--color-graphite-900)]">
      <Link to="/" className="text-sm font-semibold text-[var(--color-ink-100)]">
        {t("appName")}
      </Link>
      <div className="flex flex-wrap items-center gap-5 text-sm">
        <Link to="/" className="text-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]">
          {t("navHome")}
        </Link>
        <Link to="/marketplace" className="text-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]">
          {t("navMarketplace")}
        </Link>
        <Link to="/scan" className="text-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]">
          {t("navScan")}
        </Link>
        <Link to="/compare" className="text-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]">
          Compare
        </Link>
        {user && (
          <>
            <Link to="/register" className="text-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]">
              {t("navRegister")}
            </Link>
            <Link to="/add-reading" className="text-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]">
              {t("navAddReading")}
            </Link>
            <Link to="/dashboard" className="text-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]">
              {t("navDashboard")}
            </Link>
            <Link to="/activity" className="text-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]">
              Activity
            </Link>
          </>
        )}
        <LanguageToggle />
        {user ? (
          <div className="flex items-center gap-3 pl-3 border-l border-[var(--color-graphite-700)]">
            <span className="text-xs text-[var(--color-ink-700)] font-mono">{role}</span>
            <button onClick={handleSignOut} className="text-[var(--color-accent-400)] hover:text-[var(--color-accent-500)]">
              {t("navSignOut")}
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="pl-3 border-l border-[var(--color-graphite-700)] text-[var(--color-accent-400)] hover:text-[var(--color-accent-500)]"
          >
            {t("navSignIn")}
          </Link>
        )}
      </div>
    </nav>
  );
}