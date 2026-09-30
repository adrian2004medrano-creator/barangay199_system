import { useEffect, useState } from "react";
import { Database, Download, HardDriveDownload, RefreshCw, Trash2, Upload } from "lucide-react";
import api from "../services/api.js";

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupDatabase() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [deleting, setDeleting] = useState("");
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBackups = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/database-backups");
      setBackups(data);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not load database backups.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const downloadBackupFile = async (backup) => {
    const { data } = await api.get(`/database-backups/${encodeURIComponent(backup.filename)}/download`, {
      responseType: "blob",
    });
    const downloadUrl = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = backup.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.post("/database-backups");
      await loadBackups();
      try {
        await downloadBackupFile(data);
        setSuccess(`Database backup saved in backend/backups/ and exported: ${data.filename}`);
      } catch (downloadError) {
        setError(downloadError?.response?.data?.message || `Backup saved on the server, but could not export ${data.filename}.`);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not create the database backup.");
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (backup) => {
    setDownloading(backup.filename);
    setError("");
    try {
      await downloadBackupFile(backup);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not download the database backup.");
    } finally {
      setDownloading("");
    }
  };

  const handleDelete = async (backup) => {
    if (!window.confirm(`Permanently delete ${backup.filename}? This cannot be undone.`)) return;

    setDeleting(backup.filename);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/database-backups/${encodeURIComponent(backup.filename)}`);
      setBackups((current) => current.filter((item) => item.filename !== backup.filename));
      setSuccess(`Deleted ${backup.filename}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not delete the database backup.");
    } finally {
      setDeleting("");
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    const confirmed = window.confirm(
      "Importing this backup will replace database tables and data. The current database will first be saved as a safety backup. Continue?"
    );
    if (!confirmed) return;

    setImporting(true);
    setError("");
    setSuccess("");
    const payload = new FormData();
    payload.append("backup", importFile);
    try {
      const { data } = await api.post("/database-backups/import", payload);
      setImportFile(null);
      setFileInputKey((key) => key + 1);
      await loadBackups();
      setSuccess(`Database restored. Previous data was saved in backend/backups/import-safety/${data.safety_backup}.`);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not import the database backup.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark">
              <Database size={20} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-ink900">Backup Database</h2>
              <p className="mt-1 text-sm text-muted">SQL backups are stored in backend/backups/ on the server.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={creating}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
          >
            <HardDriveDownload size={17} />
            {creating ? "Creating and exporting..." : "Create & Export Backup"}
          </button>
        </div>

        {error && <p role="alert" className="mt-5 rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
        {success && <p role="status" className="mt-5 break-all rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{success}</p>}
      </section>

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-risk-light text-risk">
            <Upload size={19} />
          </span>
          <div>
            <h3 className="font-display text-lg font-bold text-ink900">Import Database Backup</h3>
            <p className="mt-1 text-sm text-muted">The source database name can differ. A valid app-exported .sql backup restores into the database configured in the backend, after saving a safety copy.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            key={fileInputKey}
            type="file"
            accept=".sql,application/sql,text/plain"
            onChange={(event) => setImportFile(event.target.files?.[0] || null)}
            aria-label="Choose database backup SQL file"
            className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={!importFile || importing}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-risk/25 bg-risk-light px-4 py-2 text-sm font-semibold text-risk transition-colors hover:bg-risk hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload size={16} />
            {importing ? "Restoring database..." : "Import Backup"}
          </button>
        </div>
      </section>

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="mb-4 flex flex-col gap-3 border-b border-ink/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-ink900">Saved Backups</h3>
            <p className="text-sm text-muted">{backups.length} backup{backups.length === 1 ? "" : "s"} stored on this server</p>
          </div>
          <button
            type="button"
            onClick={loadBackups}
            disabled={loading}
            title="Refresh backup list"
            aria-label="Refresh backup list"
            className="inline-flex h-9 w-9 items-center justify-center self-end rounded-lg border border-ink/10 text-muted transition-colors hover:bg-surface hover:text-ink900 disabled:opacity-50 sm:self-auto"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted">Loading saved backups...</p>
        ) : backups.length === 0 ? (
          <div className="py-10 text-center">
            <Database size={24} className="mx-auto text-muted/60" />
            <p className="mt-3 text-sm font-medium text-ink900">No database backups yet</p>
            <p className="mt-1 text-sm text-muted">Create a backup to save a copy of the database on the server.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">Backup file</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Size</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {backups.map((backup) => (
                  <tr key={backup.filename}>
                    <td className="max-w-64 break-all px-3 py-3 font-medium text-ink900">{backup.filename}</td>
                    <td className="whitespace-nowrap px-3 py-3">{new Date(backup.created_at).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-3">{formatFileSize(backup.size)}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleDownload(backup)}
                          disabled={downloading === backup.filename || deleting === backup.filename}
                          aria-label={`Download ${backup.filename}`}
                          title="Download backup"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary-light disabled:opacity-50"
                        >
                          <Download size={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(backup)}
                          disabled={deleting === backup.filename || downloading === backup.filename}
                          aria-label={`Delete ${backup.filename}`}
                          title="Delete backup"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-risk transition-colors hover:bg-risk-light disabled:opacity-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
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