import { useEffect, useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import api from "../services/api.js";

const INITIAL_FORM = {
  first_name: "",
  middle_initial: "",
  last_name: "",
  age: "",
  email: "",
  password: "",
  role: "admin",
};

const ROLES = [
  ["admin", "Barangay Official (Admin)"],
  ["user", "Resident (User)"],
];

const inputClass = "w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const currentUser = JSON.parse(localStorage.getItem("barangay199_user") || "null");

  const loadUsers = async () => {
    try {
      const response = await api.get("/users");
      setUsers(response.data || []);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load user accounts.");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.post("/auth/register", { ...form, age: Number(form.age) });
      setForm(INITIAL_FORM);
      setSuccess("Account created successfully.");
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not create the account.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    const fullName = [user.first_name, user.middle_initial, user.last_name].filter(Boolean).join(" ");
    if (!window.confirm(`Permanently delete ${fullName}'s account? They will no longer be able to sign in.`)) return;

    setDeletingId(user.id);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/users/${user.id}`);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setSuccess(`${fullName}'s account was deleted.`);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not delete the account.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="mb-5 flex items-center gap-3">
          <UserPlus size={20} className="text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-ink900">Create Account</h2>
            <p className="text-sm text-muted">Create a barangay official or resident account.</p>
          </div>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
        {success && <p role="status" className="mb-4 rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{success}</p>}

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1">
            <span className="text-sm font-medium text-ink900">First Name</span>
            <input name="first_name" value={form.first_name} onChange={handleChange} required maxLength={100} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-ink900">Middle Initial</span>
            <input name="middle_initial" value={form.middle_initial} onChange={handleChange} maxLength={30} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-ink900">Last Name</span>
            <input name="last_name" value={form.last_name} onChange={handleChange} required maxLength={100} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-ink900">Age</span>
            <input name="age" type="number" min="1" max="120" value={form.age} onChange={handleChange} required className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-ink900">Email</span>
            <input name="email" type="email" value={form.email} onChange={handleChange} required maxLength={150} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-ink900">Temporary Password</span>
            <input name="password" type="text" value={form.password} onChange={handleChange} required minLength={8} autoComplete="new-password" className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-ink900">Role</span>
            <select name="role" value={form.role} onChange={handleChange} className={inputClass}>
              {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="md:col-span-2 xl:col-span-3">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
              <UserPlus size={16} />
              {saving ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center gap-3 border-b border-ink/5 pb-4">
          <Users size={20} className="text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-ink900">User Accounts</h2>
            <p className="text-sm text-muted">{users.length} account(s)</p>
          </div>
        </div>

        {loadingUsers ? (
          <p className="py-6 text-center text-sm text-muted">Loading accounts...</p>
        ) : users.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No user accounts found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Age</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-3 font-medium text-ink900">{[user.first_name, user.middle_initial, user.last_name].filter(Boolean).join(" ")}</td>
                    <td className="px-3 py-3">{user.email}</td>
                    <td className="px-3 py-3">{user.age}</td>
                    <td className="px-3 py-3">{ROLES.find(([value]) => value === user.role)?.[1] || user.role}</td>
                    <td className="px-3 py-3">{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-right">
                      {user.id === currentUser?.id ? (
                        <span className="text-xs text-muted">Current account</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDelete(user)}
                          disabled={deletingId === user.id}
                          aria-label={`Delete ${[user.first_name, user.middle_initial, user.last_name].filter(Boolean).join(" ")}`}
                          title="Delete account"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-risk-light hover:text-risk disabled:opacity-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
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
