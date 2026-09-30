import { useEffect, useState } from "react";
import { Camera, Check, KeyRound, Save, Trash2, UserRound } from "lucide-react";
import api from "../services/api.js";

const inputClass = "w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink900 outline-none transition-colors placeholder:text-muted/70 focus:border-primary";

function getRoleLabel(profile) {
  const roleNames = { superadmin: "Barangay Captain", admin: "Barangay Official", user: "Resident" };
  return profile?.position || roleNames[profile?.role] || profile?.role?.replaceAll("_", " ") || "User";
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ first_name: "", middle_initial: "", last_name: "", email: "", age: "" });
  const [photo, setPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get("/auth/me")
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data);
        setForm({
          first_name: data.first_name || "",
          middle_initial: data.middle_initial || "",
          last_name: data.last_name || "",
          email: data.email || "",
          age: data.age ?? "",
        });
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.response?.data?.message || "Could not load your profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const imageUrl = previewUrl || (profile?.profile_picture
    ? new URL(profile.profile_picture, api.defaults.baseURL).href
    : "");

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError("");
    setSuccess("");
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The profile photo must be 5 MB or smaller.");
      return;
    }
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    if (photo) payload.append("profile_picture", photo);

    try {
      const { data } = await api.put("/auth/me", payload);
      setProfile(data);
      setForm({ first_name: data.first_name, middle_initial: data.middle_initial || "", last_name: data.last_name, email: data.email, age: data.age });
      setPhoto(null);
      setPreviewUrl("");
      localStorage.setItem("barangay199_user", JSON.stringify(data));
      window.dispatchEvent(new Event("profile-updated"));
      setSuccess("Profile updated.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!profile?.profile_picture || !window.confirm("Remove your profile photo?")) return;

    setRemovingPhoto(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.delete("/auth/me/profile-picture");
      setProfile(data);
      setPhoto(null);
      setPreviewUrl("");
      localStorage.setItem("barangay199_user", JSON.stringify(data));
      window.dispatchEvent(new Event("profile-updated"));
      setSuccess("Profile photo removed.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not remove your profile photo.");
    } finally {
      setRemovingPhoto(false);
    }
  };

  const handlePasswordChange = (event) => {
    setPasswordForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setPasswordError("");
    setPasswordSuccess("");
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError("The new password and confirmation do not match.");
      return;
    }

    setChangingPassword(true);
    try {
      const { data } = await api.put("/auth/password", {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setPasswordSuccess(data.message || "Password updated successfully.");
    } catch (requestError) {
      setPasswordError(requestError?.response?.data?.message || "Could not update your password.");
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) return <p className="text-sm text-muted">Loading profile...</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Account</p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-ink900">Your profile</h2>
      </section>

      {error && <p role="alert" className="rounded-lg border border-risk/20 bg-risk-light px-4 py-3 text-sm text-risk">{error}</p>}
      {success && <p role="status" className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary-light px-4 py-3 text-sm text-primary-dark"><Check size={16} />{success}</p>}

      {profile && (
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl2 border border-ink/[0.07] bg-white shadow-card">
          <div className="border-b border-ink/[0.07] px-5 py-5 sm:px-7">
            <h3 className="font-display text-base font-semibold text-ink900">Personal information</h3>
            <p className="mt-1 text-sm text-muted">Update the details shown on your account.</p>
          </div>

          <div className="grid gap-8 px-5 py-6 sm:px-7 lg:grid-cols-[220px_1fr]">
            <section className="space-y-3">
              <p className="text-xs font-semibold text-ink900">Profile photo</p>
              <div className="flex items-center gap-4 lg:flex-col lg:items-start">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink/10 bg-surface text-muted">
                  {imageUrl ? <img src={imageUrl} alt="Profile" className="h-full w-full object-cover" /> : <UserRound size={34} />}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <label htmlFor="profile-photo" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm font-medium text-ink900 transition-colors hover:bg-surface">
                      <Camera size={16} /> Change photo
                    </label>
                    {profile.profile_picture && (
                      <button type="button" onClick={handleRemovePhoto} disabled={removingPhoto || saving} className="inline-flex items-center gap-2 rounded-lg border border-risk/20 bg-white px-3 py-2 text-sm font-medium text-risk transition-colors hover:bg-risk-light disabled:cursor-not-allowed disabled:opacity-50">
                        <Trash2 size={15} /> {removingPhoto ? "Removing..." : "Remove photo"}
                      </button>
                    )}
                  </div>
                  <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handlePhotoChange} className="sr-only" />
                  <p className="text-xs text-muted">JPG, PNG, WebP, or GIF · up to 5 MB</p>
                </div>
              </div>
            </section>

            <div className="grid content-start gap-5 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-ink900">
                First name
                <input name="first_name" value={form.first_name} onChange={handleChange} required maxLength={100} autoComplete="given-name" className={`${inputClass} mt-1.5 font-normal`} />
              </label>
              <label className="block text-xs font-semibold text-ink900">
                Middle initial
                <input name="middle_initial" value={form.middle_initial} onChange={handleChange} maxLength={30} autoComplete="additional-name" className={`${inputClass} mt-1.5 font-normal`} />
              </label>
              <label className="block text-xs font-semibold text-ink900">
                Last name
                <input name="last_name" value={form.last_name} onChange={handleChange} required maxLength={100} autoComplete="family-name" className={`${inputClass} mt-1.5 font-normal`} />
              </label>
              <label className="block text-xs font-semibold text-ink900">
                Email address
                <input type="email" name="email" value={form.email} onChange={handleChange} required maxLength={150} autoComplete="email" className={`${inputClass} mt-1.5 font-normal`} />
              </label>
              <label className="block text-xs font-semibold text-ink900">
                Age
                <input type="number" name="age" value={form.age} onChange={handleChange} required min={18} max={120} className={`${inputClass} mt-1.5 font-normal`} />
              </label>
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-ink900">Position and access</p>
                <p className="mt-1.5 flex items-center gap-2 text-sm capitalize text-muted">
                  <span className="rounded-md bg-surface px-2.5 py-1">{getRoleLabel(profile)}</span>
                  <span>{profile.role?.replaceAll("_", " ")}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-ink/[0.07] px-5 py-4 sm:px-7">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60">
              <Save size={16} /> {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-xl2 border border-ink/[0.07] bg-white shadow-card">
        <div className="flex items-center gap-3 border-b border-ink/[0.07] px-5 py-5 sm:px-7">
          <KeyRound size={18} className="text-primary" />
          <div>
            <h3 className="font-display text-base font-semibold text-ink900">Change password</h3>
            <p className="mt-1 text-sm text-muted">Verify your current password before choosing a new one.</p>
          </div>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-5 px-5 py-6 sm:px-7">
          {passwordError && <p role="alert" className="rounded-lg border border-risk/20 bg-risk-light px-3 py-2 text-sm text-risk">{passwordError}</p>}
          {passwordSuccess && <p role="status" className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary-light px-3 py-2 text-sm text-primary-dark"><Check size={16} />{passwordSuccess}</p>}

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-ink900 sm:col-span-2">
              Current password
              <input type="password" name="current_password" value={passwordForm.current_password} onChange={handlePasswordChange} required autoComplete="current-password" className={`${inputClass} mt-1.5 font-normal`} />
            </label>
            <label className="block text-xs font-semibold text-ink900">
              New password
              <input type="password" name="new_password" value={passwordForm.new_password} onChange={handlePasswordChange} required minLength={8} maxLength={128} autoComplete="new-password" className={`${inputClass} mt-1.5 font-normal`} />
            </label>
            <label className="block text-xs font-semibold text-ink900">
              Confirm new password
              <input type="password" name="confirm_password" value={passwordForm.confirm_password} onChange={handlePasswordChange} required minLength={8} maxLength={128} autoComplete="new-password" className={`${inputClass} mt-1.5 font-normal`} />
            </label>
          </div>

          <div className="flex justify-end border-t border-ink/[0.07] pt-4">
            <button type="submit" disabled={changingPassword} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60">
              <KeyRound size={16} /> {changingPassword ? "Updating..." : "Update password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}