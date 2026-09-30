import { useEffect, useState } from "react";
import { BookOpenText, Plus, Trash2, X } from "lucide-react";
import api from "../services/api.js";

const STATUS_OPTIONS = ["open", "settled", "endorsed", "closed"];
const STATUS_STYLES = {
  open: "bg-risk-light text-risk",
  settled: "bg-primary-light text-primary-dark",
  endorsed: "bg-amber-light text-amber",
  closed: "bg-surface text-muted",
};

const inputClass = "w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";

const EMPTY_FORM = {
  complainant_name: "",
  respondent_name: "",
  incident_type: "",
  incident_date: "",
  incident_location: "",
  narrative: "",
};

export default function Blotter() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState("");

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/blotter", { params: statusFilter ? { status: statusFilter } : {} });
      setReports(data);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load blotter reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.post("/blotter", form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSuccess(`Blotter case ${data.case_no} filed successfully.`);
      await loadReports();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not file the blotter report.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (report, status) => {
    try {
      await api.put(`/blotter/${report.id}`, { status });
      setReports((current) => current.map((item) => (item.id === report.id ? { ...item, status } : item)));
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update the blotter report.");
    }
  };

  const handleDelete = async (report) => {
    if (!window.confirm(`Delete blotter case ${report.case_no}?`)) return;
    try {
      await api.delete(`/blotter/${report.id}`);
      setReports((current) => current.filter((item) => item.id !== report.id));
    } catch (err) {
      setError(err?.response?.data?.message || "Could not delete the blotter report.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl2 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-ink900">Blotter Reports</h2>
          <p className="mt-1 text-sm text-muted">{reports.length} case(s) on record</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          {showForm ? <X size={17} /> : <Plus size={17} />}
          {showForm ? "Close form" : "File Report"}
        </button>
      </section>

      {error && <p role="alert" className="rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{success}</p>}

      {showForm && (
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Complainant Name</span>
              <input name="complainant_name" required maxLength={255} value={form.complainant_name} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Respondent Name</span>
              <input name="respondent_name" required maxLength={255} value={form.respondent_name} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Incident Type</span>
              <input name="incident_type" required maxLength={150} value={form.incident_type} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Incident Date</span>
              <input name="incident_date" type="date" value={form.incident_date} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium text-ink900">Incident Location</span>
              <input name="incident_location" value={form.incident_location} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium text-ink900">Narrative</span>
              <textarea name="narrative" rows={4} value={form.narrative} onChange={handleChange} className={inputClass} />
            </label>
            <div className="md:col-span-2">
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
                {saving ? "Saving..." : "File Blotter Report"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setStatusFilter("")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusFilter === "" ? "bg-primary text-white" : "bg-surface text-muted"}`}>All</button>
          {STATUS_OPTIONS.map((status) => (
            <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${statusFilter === status ? "bg-primary text-white" : "bg-surface text-muted"}`}>{status}</button>
          ))}
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted">Loading blotter reports...</p>
        ) : reports.length === 0 ? (
          <div className="py-10 text-center">
            <BookOpenText size={24} className="mx-auto text-muted/60" />
            <p className="mt-2 text-sm text-muted">No blotter reports found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">Case No.</th>
                  <th className="px-3 py-3">Complainant</th>
                  <th className="px-3 py-3">Respondent</th>
                  <th className="px-3 py-3">Incident</th>
                  <th className="px-3 py-3">Filed</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td className="px-3 py-3 font-medium text-ink900">{report.case_no}</td>
                    <td className="px-3 py-3">{report.complainant_name}</td>
                    <td className="px-3 py-3">{report.respondent_name}</td>
                    <td className="px-3 py-3">{report.incident_type}</td>
                    <td className="px-3 py-3">{new Date(report.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3">
                      <select
                        value={report.status}
                        onChange={(event) => handleStatusChange(report, event.target.value)}
                        className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[report.status]}`}
                      >
                        {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" onClick={() => handleDelete(report)} aria-label={`Delete case ${report.case_no}`} title="Delete" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-risk-light hover:text-risk">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
