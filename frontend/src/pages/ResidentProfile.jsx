import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, UserRound } from "lucide-react";
import api from "../services/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
const photoUrl = (value) => (value?.startsWith("http") ? value : `${API_ORIGIN}${value}`);

const FIELDS = [
  ["age", "Age"],
  ["sex", "Sex"],
  ["civil_status", "Civil Status"],
  ["birthdate", "Birthdate"],
  ["birthplace", "Birthplace"],
  ["purok", "Purok"],
  ["contact_number", "Contact Number"],
  ["occupation", "Occupation"],
  ["voter_status", "Voter Status"],
  ["household_no", "Household No."],
  ["date_registered", "Date Registered"],
  ["status", "Status"],
];

export default function ResidentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [resident, setResident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get(`/residents/${id}`)
      .then(({ data }) => { if (!cancelled) setResident(data); })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.message || "Could not load this resident."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <p className="rounded-lg border border-[#e3e6e9] bg-white p-6 text-sm text-muted">Loading resident profile...</p>;
  if (error) return <p role="alert" className="rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>;
  if (!resident) return null;

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink900">
        <ArrowLeft size={15} /> Back
      </button>

      <section className="flex flex-col items-center gap-4 rounded-xl2 bg-white p-6 text-center shadow-card sm:flex-row sm:text-left">
        {resident.photo ? (
          <img src={photoUrl(resident.photo)} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-primary-light text-primary-dark"><UserRound size={36} /></span>
        )}
        <div>
          <h2 className="font-display text-xl font-bold text-ink900">{resident.name}</h2>
          <p className="mt-1 text-sm text-muted">{resident.address}</p>
        </div>
      </section>

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <h3 className="mb-4 font-display text-lg font-bold text-ink900">Resident Details</h3>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map(([key, label]) => (
            <div key={key}>
              <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-1 text-sm font-medium text-ink900">{resident[key] || "\u2014"}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
