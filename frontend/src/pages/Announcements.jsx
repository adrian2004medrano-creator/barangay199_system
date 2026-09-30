import { useEffect, useState } from "react";
import { Megaphone, Plus, Trash2, X } from "lucide-react";
import api from "../services/api.js";

const CATEGORIES = ["general", "health", "disaster", "event"];
const CATEGORY_STYLES = {
  general: "bg-primary-light text-primary-dark",
  health: "bg-amber-light text-amber",
  disaster: "bg-risk-light text-risk",
  event: "bg-surface text-muted",
};

const inputClass = "w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";

export default function Announcements() {
  const role = localStorage.getItem("barangay199_role") || "user";
  const canManage = ["superadmin", "admin"].includes(role);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", category: "general" });

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/announcements");
      setAnnouncements(data);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load announcements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/announcements", form);
      setForm({ title: "", content: "", category: "general" });
      setShowForm(false);
      setSuccess("Announcement posted successfully.");
      await loadAnnouncements();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not post the announcement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (announcement) => {
    if (!window.confirm(`Delete the announcement "${announcement.title}"?`)) return;
    try {
      await api.delete(`/announcements/${announcement.id}`);
      setAnnouncements((current) => current.filter((item) => item.id !== announcement.id));
    } catch (err) {
      setError(err?.response?.data?.message || "Could not delete the announcement.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl2 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-ink900">Announcements</h2>
          <p className="mt-1 text-sm text-muted">{announcements.length} announcement(s)</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            {showForm ? <X size={17} /> : <Plus size={17} />}
            {showForm ? "Close form" : "Post Announcement"}
          </button>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{success}</p>}

      {showForm && (
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <form onSubmit={handleSubmit} className="grid gap-4">
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Title</span>
              <input required maxLength={255} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Category</span>
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className={inputClass}>
                {CATEGORIES.map((category) => <option key={category} value={category} className="capitalize">{category}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Content</span>
              <textarea required rows={4} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} className={inputClass} />
            </label>
            <div>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
                {saving ? "Posting..." : "Post Announcement"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="space-y-4">
        {loading ? (
          <p className="rounded-xl2 bg-white p-6 text-center text-sm text-muted shadow-card">Loading announcements...</p>
        ) : announcements.length === 0 ? (
          <div className="rounded-xl2 bg-white p-10 text-center shadow-card">
            <Megaphone size={24} className="mx-auto text-muted/60" />
            <p className="mt-2 text-sm text-muted">No announcements posted yet.</p>
          </div>
        ) : announcements.map((announcement) => (
          <article key={announcement.id} className="rounded-xl2 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-bold text-ink900">{announcement.title}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${CATEGORY_STYLES[announcement.category] || CATEGORY_STYLES.general}`}>{announcement.category}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Posted by {[announcement.first_name, announcement.last_name].filter(Boolean).join(" ")} on {new Date(announcement.created_at).toLocaleString()}
                </p>
              </div>
              {canManage && (
                <button type="button" onClick={() => handleDelete(announcement)} aria-label={`Delete ${announcement.title}`} title="Delete" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-risk-light hover:text-risk">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink900/80">{announcement.content}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
