import { useCallback, useEffect, useState } from "react";
import {
  deviceAdminService,
  type Release,
  type ReleaseDetail,
} from "../services/deviceAdminService";
import "../styles/Version_Management.css";

/**
 * Version Management — CRUD over the existing devices_app_release table.
 *
 * This page edits version POLICY only. It does not implement force-update
 * behaviour: `is_force_update` / `min_supported_build` are stored here for a
 * later phase to consume, and nothing on this screen enforces them.
 *
 * The backend owns the safety rules (one latest per platform+app_type, unique
 * build numbers, semver format) and returns field-level errors, which this form
 * surfaces inline rather than duplicating the validation client-side.
 */

const PLATFORMS = ["ANDROID", "IOS", "WEB", "DESKTOP"];
const APP_TYPES = ["MOBILE", "TABLET", "WEB", "ADMIN_WEB", "PARTNER_WEB", "DESKTOP"];

type FormState = {
  platform: string;
  app_type: string;
  version: string;
  build_number: string;
  release_notes: string;
  is_latest: boolean;
  is_force_update: boolean;
  min_supported_version: string;
  min_supported_build: string;
  store_url: string;
  released_at: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  platform: "ANDROID",
  app_type: "MOBILE",
  version: "",
  build_number: "",
  release_notes: "",
  is_latest: false,
  is_force_update: false,
  min_supported_version: "",
  min_supported_build: "",
  store_url: "",
  released_at: new Date().toISOString().slice(0, 16),
  is_active: true,
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
};

const toForm = (release: Release): FormState => ({
  platform: release.platform,
  app_type: release.app_type,
  version: release.version,
  build_number: String(release.build_number),
  release_notes: release.release_notes || "",
  is_latest: release.is_latest,
  is_force_update: release.is_force_update,
  min_supported_version: release.min_supported_version || "",
  min_supported_build: release.min_supported_build == null ? "" : String(release.min_supported_build),
  store_url: release.store_url || "",
  released_at: release.released_at ? new Date(release.released_at).toISOString().slice(0, 16) : "",
  is_active: release.is_active,
});

/** Turn a DRF `{field: [msg]}` error body into flat field -> message. */
const extractErrors = (err: unknown): Record<string, string> => {
  const body = (err as { response?: { data?: { errors?: Record<string, unknown>; message?: string } } })?.response?.data;
  const out: Record<string, string> = {};
  const errors = body?.errors;
  if (errors && typeof errors === "object") {
    Object.entries(errors).forEach(([key, value]) => {
      out[key] = Array.isArray(value) ? String(value[0]) : String(value);
    });
  }
  if (!Object.keys(out).length) {
    out.__all__ = body?.message || "Could not save the release. Please try again.";
  }
  return out;
};

export default function Version_Management() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState("");
  const [appType, setAppType] = useState("");

  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<ReleaseDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await deviceAdminService.listReleases({
        platform,
        app_type: appType,
        page_size: 100,
      });
      setReleases(data.results);
    } catch (err) {
      console.error("Failed to load releases", err);
    } finally {
      setLoading(false);
    }
  }, [platform, appType]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setErrors({});
    setForm({ ...EMPTY_FORM });
  };

  const openEdit = (release: Release) => {
    setEditingId(release.id);
    setErrors({});
    setForm(toForm(release));
  };

  const closeForm = () => {
    setForm(null);
    setEditingId(null);
    setErrors({});
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const submit = async () => {
    if (!form) return;
    setSaving(true);
    setErrors({});
    const payload: Partial<Release> = {
      platform: form.platform,
      app_type: form.app_type,
      version: form.version.trim(),
      build_number: Number(form.build_number),
      release_notes: form.release_notes,
      is_latest: form.is_latest,
      is_force_update: form.is_force_update,
      min_supported_version: form.min_supported_version.trim(),
      min_supported_build: form.min_supported_build ? Number(form.min_supported_build) : null,
      store_url: form.store_url.trim(),
      released_at: form.released_at ? new Date(form.released_at).toISOString() : undefined,
      is_active: form.is_active,
    };
    try {
      if (editingId) {
        await deviceAdminService.updateRelease(editingId, payload);
      } else {
        await deviceAdminService.createRelease(payload);
      }
      closeForm();
      load();
    } catch (err) {
      setErrors(extractErrors(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (release: Release) => {
    try {
      await deviceAdminService.setReleaseActive(release.id, !release.is_active);
      load();
    } catch (err) {
      console.error("Failed to archive release", err);
    }
  };

  const openDetail = async (release: Release) => {
    try {
      setDetail(await deviceAdminService.getRelease(release.id));
    } catch (err) {
      console.error("Failed to load release detail", err);
    }
  };

  return (
    <div className="vm-page">
      <header className="vm-head">
        <div>
          <h1>Version Management</h1>
          <p>Release policy per platform and app type. Editing policy here does not push updates to clients.</p>
        </div>
        <button type="button" className="vm-btn vm-btn-primary" onClick={openCreate}>+ New Release</button>
      </header>

      <section className="vm-filters">
        <select className="vm-input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="vm-input" value={appType} onChange={(e) => setAppType(e.target.value)}>
          <option value="">All app types</option>
          {APP_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </section>

      <div className="vm-table-wrap">
        <table className="vm-table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>App Type</th>
              <th>Version</th>
              <th>Build</th>
              <th>Min Supported Build</th>
              <th>Latest</th>
              <th>Force Update</th>
              <th>Store URL</th>
              <th>Released</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="vm-empty">Loading releases…</td></tr>
            ) : releases.length === 0 ? (
              <tr><td colSpan={11} className="vm-empty">No releases yet. Create one to start tracking version policy.</td></tr>
            ) : (
              releases.map((release) => (
                <tr key={release.id}>
                  <td>{release.platform}</td>
                  <td>{release.app_type}</td>
                  <td>{release.version}</td>
                  <td>{release.build_number}</td>
                  <td>{release.min_supported_build ?? "-"}</td>
                  <td>{release.is_latest ? <span className="vm-badge-ok">Latest</span> : "-"}</td>
                  <td>{release.is_force_update ? <span className="vm-badge-warn">Force</span> : "-"}</td>
                  <td className="vm-url">{release.store_url ? <a href={release.store_url} target="_blank" rel="noreferrer">Link</a> : "-"}</td>
                  <td>{formatDateTime(release.released_at)}</td>
                  <td>
                    <span className={release.is_active ? "vm-badge-ok" : "vm-badge-off"}>
                      {release.is_active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="vm-actions">
                    <button type="button" className="vm-link" onClick={() => openDetail(release)}>Details</button>
                    <button type="button" className="vm-link" onClick={() => openEdit(release)}>Edit</button>
                    <button type="button" className="vm-link" onClick={() => toggleArchive(release)}>
                      {release.is_active ? "Archive" : "Restore"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ---- create / edit form ---- */}
      {form && (
        <div className="vm-modal-backdrop" onClick={closeForm}>
          <div className="vm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="vm-modal-head">
              <h2>{editingId ? "Edit Release" : "New Release"}</h2>
              <button type="button" className="vm-btn" onClick={closeForm}>Close</button>
            </div>
            <div className="vm-modal-body">
              {errors.__all__ && <p className="vm-error">{errors.__all__}</p>}

              <div className="vm-grid">
                <label className="vm-field">
                  Platform
                  <select className="vm-input" value={form.platform} onChange={(e) => setField("platform", e.target.value)}>
                    {PLATFORMS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  {errors.platform && <span className="vm-field-error">{errors.platform}</span>}
                </label>

                <label className="vm-field">
                  App Type
                  <select className="vm-input" value={form.app_type} onChange={(e) => setField("app_type", e.target.value)}>
                    {APP_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  {errors.app_type && <span className="vm-field-error">{errors.app_type}</span>}
                </label>

                <label className="vm-field">
                  Version (Major.Minor.Patch)
                  <input className="vm-input" placeholder="1.2.0" value={form.version} onChange={(e) => setField("version", e.target.value)} />
                  {errors.version && <span className="vm-field-error">{errors.version}</span>}
                </label>

                <label className="vm-field">
                  Build Number
                  <input className="vm-input" inputMode="numeric" placeholder="58" value={form.build_number} onChange={(e) => setField("build_number", e.target.value)} />
                  {errors.build_number && <span className="vm-field-error">{errors.build_number}</span>}
                </label>

                <label className="vm-field">
                  Minimum Supported Version
                  <input className="vm-input" placeholder="1.1.0" value={form.min_supported_version} onChange={(e) => setField("min_supported_version", e.target.value)} />
                  {errors.min_supported_version && <span className="vm-field-error">{errors.min_supported_version}</span>}
                </label>

                <label className="vm-field">
                  Minimum Supported Build
                  <input className="vm-input" inputMode="numeric" placeholder="50" value={form.min_supported_build} onChange={(e) => setField("min_supported_build", e.target.value)} />
                  {errors.min_supported_build && <span className="vm-field-error">{errors.min_supported_build}</span>}
                </label>

                <label className="vm-field">
                  Store URL
                  <input className="vm-input" placeholder="https://play.google.com/…" value={form.store_url} onChange={(e) => setField("store_url", e.target.value)} />
                  {errors.store_url && <span className="vm-field-error">{errors.store_url}</span>}
                </label>

                <label className="vm-field">
                  Release Date
                  <input type="datetime-local" className="vm-input" value={form.released_at} onChange={(e) => setField("released_at", e.target.value)} />
                  {errors.released_at && <span className="vm-field-error">{errors.released_at}</span>}
                </label>
              </div>

              <label className="vm-field vm-field-full">
                Release Notes
                <textarea className="vm-input vm-textarea" rows={4} value={form.release_notes} onChange={(e) => setField("release_notes", e.target.value)} />
              </label>

              <div className="vm-checks">
                <label className="vm-check">
                  <input type="checkbox" checked={form.is_latest} onChange={(e) => setField("is_latest", e.target.checked)} />
                  Mark as Latest
                  <span className="vm-hint">Any other release marked latest for this platform + app type is demoted automatically.</span>
                </label>
                <label className="vm-check">
                  <input type="checkbox" checked={form.is_force_update} onChange={(e) => setField("is_force_update", e.target.checked)} />
                  Force Update
                  <span className="vm-hint">Stored as policy only — no update is enforced in this phase.</span>
                </label>
                <label className="vm-check">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setField("is_active", e.target.checked)} />
                  Active
                </label>
              </div>
            </div>
            <div className="vm-modal-foot">
              <button type="button" className="vm-btn" onClick={closeForm}>Cancel</button>
              <button type="button" className="vm-btn vm-btn-primary" onClick={submit} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Release"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- release details + adoption ---- */}
      {detail && (
        <div className="vm-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="vm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="vm-modal-head">
              <h2>
                {detail.release.platform}/{detail.release.app_type} v{detail.release.version}
              </h2>
              <button type="button" className="vm-btn" onClick={() => setDetail(null)}>Close</button>
            </div>
            <div className="vm-modal-body">
              <div className="vm-stats">
                <div className="vm-stat">
                  <span className="vm-stat-num">{detail.adoption.device_count}</span>
                  <span className="vm-stat-lbl">Devices on this build</span>
                </div>
                <div className="vm-stat">
                  <span className="vm-stat-num">{detail.adoption.user_count}</span>
                  <span className="vm-stat-lbl">Users on this build</span>
                </div>
                <div className="vm-stat">
                  <span className="vm-stat-num">{detail.adoption.adoption_percent}%</span>
                  <span className="vm-stat-lbl">Adoption</span>
                </div>
                <div className="vm-stat">
                  <span className="vm-stat-num">{detail.adoption.total_devices_for_product}</span>
                  <span className="vm-stat-lbl">Total devices for product</span>
                </div>
              </div>

              <h4>Release Notes</h4>
              <p className="vm-notes">{detail.release.release_notes || "No release notes."}</p>

              <h4>Neighbouring Releases</h4>
              <dl className="vm-dl">
                <dt>Previous</dt>
                <dd>
                  {detail.previous_release
                    ? `v${detail.previous_release.version} (build ${detail.previous_release.build_number})`
                    : "None — this is the earliest release"}
                </dd>
                <dt>Next</dt>
                <dd>
                  {detail.next_release
                    ? `v${detail.next_release.version} (build ${detail.next_release.build_number})`
                    : "None — this is the newest release"}
                </dd>
              </dl>

              <h4>Policy</h4>
              <dl className="vm-dl">
                <dt>Build Number</dt><dd>{detail.release.build_number}</dd>
                <dt>Minimum Supported Build</dt><dd>{detail.release.min_supported_build ?? "-"}</dd>
                <dt>Latest</dt><dd>{detail.release.is_latest ? "Yes" : "No"}</dd>
                <dt>Force Update</dt><dd>{detail.release.is_force_update ? "Yes" : "No"}</dd>
                <dt>Released</dt><dd>{formatDateTime(detail.release.released_at)}</dd>
                <dt>Status</dt><dd>{detail.release.is_active ? "Active" : "Archived"}</dd>
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
