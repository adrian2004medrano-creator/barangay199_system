import { useEffect, useState } from "react";
import { FileText, Plus, Trash2, X } from "lucide-react";
import api from "../services/api.js";

const CERTIFICATE_TYPES = [
  "Barangay Clearance",
  "Certificate of Indigency",
  "Certificate of Residency",
  "Business Permit Endorsement",
  "Good Moral Certificate",
];
const STATUS_OPTIONS = ["pending", "approved", "released", "rejected"];
const STATUS_STYLES = {
  pending: "bg-amber-light text-amber",
  approved: "bg-primary-light text-primary-dark",
  released: "bg-primary-light text-primary-dark",
  rejected: "bg-risk-light text-risk",
};

const inputClass = "w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";

export default function Certificates() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ requestor_name: "", certificate_type: CERTIFICATE_TYPES[0], purpose: "" });
  const [statusFilter, setStatusFilter] = useState("");

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/certificates", { params: statusFilter ? { status: statusFilter } : {} });
      setRequests(data);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load certificate requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/certificates", form);
      setForm({ requestor_name: "", certificate_type: CERTIFICATE_TYPES[0], purpose: "" });
      setShowForm(false);
      setSuccess("Certificate request filed successfully.");
      await loadRequests();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not file the certificate request.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (request, status) => {
    try {
      await api.put(`/certificates/${request.id}`, { status, remarks: request.remarks || null });
      setRequests((current) => current.map((item) => (item.id === request.id ? { ...item, status } : item)));
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update the certificate request.");
    }
  };

  const handleDelete = async (request) => {
    if (!window.confirm(`Delete the ${request.certificate_type} request for ${request.requestor_name}?`)) return;
    try {
      await api.delete(`/certificates/${request.id}`);
      setRequests((current) => current.filter((item) => item.id !== request.id));
    } catch (err) {
      setError(err?.response?.data?.message || "Could not delete the certificate request.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl2 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-ink900">Certificate Requests</h2>
          <p className="mt-1 text-sm text-muted">{requests.length} request(s)</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          {showForm ? <X size={17} /> : <Plus size={17} />}
          {showForm ? "Close form" : "New Request"}
        </button>
      </section>

      {error && <p role="alert" className="rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{success}</p>}

      {showForm && (
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Requestor Name</span>
              <input required maxLength={255} value={form.requestor_name} onChange={(event) => setForm((current) => ({ ...current, requestor_name: event.target.value }))} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Certificate Type</span>
              <select value={form.certificate_type} onChange={(event) => setForm((current) => ({ ...current, certificate_type: event.target.value }))} className={inputClass}>
                {CERTIFICATE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium text-ink900">Purpose</span>
              <input required maxLength={255} value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} className={inputClass} />
            </label>
            <div className="md:col-span-2">
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
                {saving ? "Saving..." : "File Request"}
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
          <p className="py-8 text-center text-sm text-muted">Loading certificate requests...</p>
        ) : requests.length === 0 ? (
          <div className="py-10 text-center">
            <FileText size={24} className="mx-auto text-muted/60" />
            <p className="mt-2 text-sm text-muted">No certificate requests found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">Requestor</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Purpose</th>
                  <th className="px-3 py-3">Requested</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-3 py-3 font-medium text-ink900">{request.requestor_name}</td>
                    <td className="px-3 py-3">{request.certificate_type}</td>
                    <td className="px-3 py-3 max-w-xs truncate">{request.purpose}</td>
                    <td className="px-3 py-3">{new Date(request.requested_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3">
                      <select
                        value={request.status}
                        onChange={(event) => handleStatusChange(request, event.target.value)}
                        className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[request.status]}`}
                      >
                        {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" onClick={() => handleDelete(request)} aria-label={`Delete request from ${request.requestor_name}`} title="Delete" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-risk-light hover:text-risk">
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
