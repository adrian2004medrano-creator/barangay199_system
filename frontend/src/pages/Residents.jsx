import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Plus, Search, Trash2, UserRound, X } from "lucide-react";
import api from "../services/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
const photoUrl = (value) => (value?.startsWith("http") ? value : `${API_ORIGIN}${value}`);

const EMPTY_FORM = {
  first_name: "",
  middle_initial: "",
  last_name: "",
  age: "",
  sex: "",
  civil_status: "",
  birthdate: "",
  birthplace: "",
  address: "",
  purok: "",
  contact_number: "",
  occupation: "",
  voter_status: "",
  household_no: "",
};

const inputClass = "w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";

export default function Residents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const purokFilter = searchParams.get("purok") || "";
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const loadResidents = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/residents", { params: purokFilter ? { purok: purokFilter } : {} });
      setResidents(data);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load resident records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResidents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purokFilter]);

  const filteredResidents = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return residents;
    return residents.filter((resident) => resident.name.toLowerCase().includes(search));
  }, [residents, query]);

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    if (photo) payload.append("photo", photo);

    try {
      await api.post("/residents", payload);
      setForm(EMPTY_FORM);
      setPhoto(null);
      setShowForm(false);
      setSuccess("Resident registered successfully.");
      await loadResidents();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not register the resident.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (resident) => {
    if (!window.confirm(`Delete the record for ${resident.name}?`)) return;
    try {
      await api.delete(`/residents/${resident.id}`);
      setResidents((current) => current.filter((item) => item.id !== resident.id));
      setSuccess(`${resident.name}'s record was deleted.`);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not delete the resident record.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl2 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-ink900">Residents{purokFilter ? ` \u2014 ${purokFilter}` : ""}</h2>
          <p className="mt-1 text-sm text-muted">{residents.length} resident(s) registered{purokFilter ? " in this purok" : ""}</p>
          {purokFilter && (
            <button type="button" onClick={() => setSearchParams({})} className="mt-2 text-xs font-semibold text-primary hover:text-primary-dark">
              Clear purok filter
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          {showForm ? <X size={17} /> : <Plus size={17} />}
          {showForm ? "Close form" : "Register Resident"}
        </button>
      </section>

      {error && <p role="alert" className="rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{success}</p>}

      {showForm && (
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">First Name</span>
              <input name="first_name" value={form.first_name} onChange={handleChange} required maxLength={100} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Middle Initial</span>
              <input name="middle_initial" value={form.middle_initial} onChange={handleChange} maxLength={30} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Last Name</span>
              <input name="last_name" value={form.last_name} onChange={handleChange} required maxLength={150} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Age</span>
              <input name="age" type="number" min="0" max="130" value={form.age} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Sex</span>
              <select name="sex" value={form.sex} onChange={handleChange} className={inputClass}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Civil Status</span>
              <input name="civil_status" value={form.civil_status} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Birthdate</span>
              <input name="birthdate" type="date" value={form.birthdate} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Birthplace</span>
              <input name="birthplace" value={form.birthplace} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Purok</span>
              <input name="purok" value={form.purok} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium text-ink900">Complete Address</span>
              <input name="address" value={form.address} onChange={handleChange} required className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Contact Number</span>
              <input name="contact_number" value={form.contact_number} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Occupation</span>
              <input name="occupation" value={form.occupation} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Voter Status</span>
              <select name="voter_status" value={form.voter_status} onChange={handleChange} className={inputClass}>
                <option value="">Select</option>
                <option value="Registered">Registered</option>
                <option value="Not registered">Not registered</option>
              </select>
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Household No.</span>
              <input name="household_no" value={form.household_no} onChange={handleChange} className={inputClass} />
            </label>
            <label className="space-y-1"><span className="text-sm font-medium text-ink900">Photo</span>
              <input type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] || null)} className={inputClass} />
            </label>
            <div className="md:col-span-2 xl:col-span-3">
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
                {saving ? "Saving..." : "Save Resident"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-ink/10 bg-surface px-3.5 py-2">
          <Search size={16} className="text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by name..." className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted">Loading residents...</p>
        ) : filteredResidents.length === 0 ? (
          <div className="py-10 text-center">
            <UserRound size={24} className="mx-auto text-muted/60" />
            <p className="mt-2 text-sm text-muted">No resident records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Age</th>
                  <th className="px-3 py-3">Purok</th>
                  <th className="px-3 py-3">Address</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filteredResidents.map((resident) => (
                  <tr key={resident.id}>
                    <td className="px-3 py-3">
                      <Link to={`/residents/${resident.id}`} className="flex items-center gap-3 font-medium text-ink900 hover:text-primary">
                        {resident.photo ? (
                          <img src={photoUrl(resident.photo)} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary-dark">
                            {resident.name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}
                          </span>
                        )}
                        {resident.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{resident.age ?? "\u2014"}</td>
                    <td className="px-3 py-3">{resident.purok || "\u2014"}</td>
                    <td className="px-3 py-3 max-w-xs truncate">{resident.address}</td>
                    <td className="px-3 py-3 capitalize">{resident.status}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(resident)}
                        aria-label={`Delete ${resident.name}`}
                        title="Delete resident"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-risk-light hover:text-risk"
                      >
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
