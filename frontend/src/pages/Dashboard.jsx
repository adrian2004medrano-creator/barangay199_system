import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, FileText, BookOpenText, MapPinned, UserRoundCog, BarChart3 } from "lucide-react";
import StatCard from "../components/StatCard.jsx";
import api from "../services/api.js";

const ROLE_NAMES = {
  superadmin: "Barangay Captain",
  admin: "Barangay Officials",
  user: "Residents",
};

export default function Dashboard() {
  const role = localStorage.getItem("barangay199_role") || "user";
  const isSuperadmin = role === "superadmin";
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    api.get("/dashboard")
      .then((response) => {
        if (!cancelled) setSummary(response.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || "Could not load live dashboard data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = summary ? [
    { label: "Registered residents", value: summary.totals.residents, tone: "primary", icon: Users },
    { label: "Puroks with residents", value: summary.totals.puroks, tone: "amber", icon: MapPinned },
    { label: "Pending certificate requests", value: summary.totals.pendingCertificates, tone: "primary", icon: FileText },
    { label: "Open blotter cases", value: summary.totals.openBlotterCases, tone: "risk", icon: BookOpenText },
    ...(isSuperadmin ? [{ label: "Total accounts", value: summary.totals.accounts, tone: "amber", icon: UserRoundCog }] : []),
  ] : [];

  return (
    <div className="space-y-7">
      <section>
        <h2 className="font-display text-[25px] font-semibold uppercase leading-tight text-[#262b30]">
          Barangay 199 dashboard
        </h2>
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#7f8992]">
          Live resident, certificate, and blotter overview
        </p>
      </section>

      {error && <div role="alert" className="rounded-lg border border-risk/20 bg-risk-light px-4 py-3 text-sm text-risk">{error}</div>}

      {loading ? (
        <p className="rounded-lg border border-[#e3e6e9] bg-white p-6 text-sm text-muted">Loading live dashboard data...</p>
      ) : summary ? (
        <>
          <section className={`grid grid-cols-2 gap-4 ${stats.length >= 4 ? "lg:grid-cols-3 xl:grid-cols-5" : stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
          </section>

          {isSuperadmin && summary.usersByRole?.length > 0 && (
            <section className="rounded-lg border border-[#e3e6e9] bg-white p-5 shadow-[0_1px_2px_rgba(22,28,33,0.04)]">
              <div className="mb-4 flex items-center gap-3 border-b border-ink/5 pb-4">
                <UserRoundCog size={19} className="text-primary" />
                <h3 className="font-display text-lg font-bold text-ink900">Accounts by role</h3>
              </div>
              <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                {summary.usersByRole.map((item) => (
                  <div key={item.role} className="flex items-center justify-between border-b border-ink/5 py-3 text-sm">
                    <span className="capitalize text-muted">{ROLE_NAMES[item.role] || item.role.replaceAll("_", " ")}</span>
                    <span className="font-semibold text-ink900">{item.account_count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border border-[#e3e6e9] bg-white p-5 shadow-[0_1px_2px_rgba(22,28,33,0.04)]">
            <div className="mb-4 flex items-center gap-3 border-b border-ink/5 pb-4">
              <BarChart3 size={19} className="text-primary" />
              <div>
                <h3 className="font-display text-lg font-bold text-ink900">Residents by purok</h3>
                <p className="text-sm text-muted">Counts are read directly from current database records.</p>
              </div>
            </div>
            {summary.residentsByPurok.length === 0 ? (
              <p className="py-5 text-center text-sm text-muted">No resident records are in the database yet.</p>
            ) : (
              <div className="divide-y divide-ink/5">
                {summary.residentsByPurok.map((purok) => (
                  <div key={purok.purok} className="flex items-center justify-between gap-4 py-3">
                    <Link to={`/residents?purok=${encodeURIComponent(purok.purok)}`} className="text-sm font-medium text-primary hover:text-primary-dark">
                      {purok.purok}
                    </Link>
                    <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary-dark">
                      {purok.resident_count} resident(s)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
