import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyRound,
  LockKeyhole,
  LockKeyholeOpen,
  Plus,
  X,
  ArrowRight,
  Pencil,
  Trash2,
  ShieldCheck,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";
import "./vault.css";

export function useCredentialVault() {
  const token = useRef("");
  const lastActivity = useRef(0);
  const [state, setState] = useState({
    configured: null,
    unlocked: false,
    entries: [],
  });
  const clear = useCallback(() => {
    token.current = "";
    setState((s) => ({ ...s, unlocked: false, entries: [] }));
  }, []);
  const request = useCallback(
    async (route, options = {}) => {
      const response = await fetch(`/api${route}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token.current
            ? { Authorization: `Bearer ${token.current}` }
            : {}),
        },
      });
      if (response.status === 204) {
        lastActivity.current = Date.now();
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401) clear();
        throw new Error(body.error || "The vault request failed.");
      }
      lastActivity.current = Date.now();
      return body;
    },
    [clear],
  );
  const refresh = useCallback(async () => {
    const status = await request("/vault/status");
    setState((s) => ({ ...s, configured: status.configured }));
    if (token.current) {
      const { entries } = await request("/vault/entries");
      setState((s) => ({ ...s, entries, unlocked: true }));
    }
  }, [request]);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (token.current && Date.now() - lastActivity.current >= 15 * 60 * 1000)
        clear();
    }, 10000);
    return () => clearInterval(timer);
  }, [clear]);
  async function unlock(password, setup) {
    const result = await request(setup ? "/vault/setup" : "/vault/unlock", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    token.current = result.token;
    setState({ configured: true, unlocked: true, entries: result.entries });
  }
  async function save(entry) {
    await request(`/vault/entries${entry.id ? `/${entry.id}` : ""}`, {
      method: entry.id ? "PATCH" : "POST",
      body: JSON.stringify(entry),
    });
    await refresh();
  }
  async function remove(id) {
    await request(`/vault/entries/${id}`, { method: "DELETE" });
    await refresh();
  }
  async function lock() {
    try {
      await request("/vault/lock", { method: "POST", body: "{}" });
    } finally {
      clear();
    }
  }
  async function fill(sessionId, entryId, options) {
    return request(`/sessions/${sessionId}/credentials/${entryId}/fill`, {
      method: "POST",
      body: JSON.stringify(options),
    });
  }
  return { ...state, refresh, unlock, save, remove, lock, fill };
}

function CredentialForm({ entry, onSave, onCancel, busy }) {
  const [form, setForm] = useState({
    label: "",
    url: "",
    username: "",
    usernameSelector: "",
    passwordSelector: "",
    submitSelector: "",
    ...entry,
    password: "",
  });
  const [visible, setVisible] = useState(false);
  const update = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  return (
    <form
      className="credential-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form)
          .then(() => setForm((f) => ({ ...f, password: "" })))
          .catch(() => {});
      }}
    >
      <h3>{entry.id ? "Edit credential" : "Save a login"}</h3>
      <label>
        Credential label
        <input
          autoFocus
          value={form.label}
          maxLength={80}
          required
          onChange={(e) => update("label", e.target.value)}
          placeholder="Customer · Alex"
        />
      </label>
      <label>
        Login URL
        <input
          type="url"
          value={form.url}
          required
          maxLength={4096}
          onChange={(e) => update("url", e.target.value)}
          placeholder="http://localhost:5173/login"
        />
      </label>
      <label>
        Username or email
        <input
          value={form.username}
          autoComplete="off"
          maxLength={320}
          required
          onChange={(e) => update("username", e.target.value)}
          placeholder="alex@example.com"
        />
      </label>
      <label>
        Saved password
        <div className="vault-password-field">
          <input
            type={visible ? "text" : "password"}
            value={form.password}
            autoComplete="new-password"
            maxLength={4096}
            required={!entry.id}
            onChange={(e) => update("password", e.target.value)}
            placeholder={
              entry.id
                ? "Leave blank to keep the saved password"
                : "Password for this test account"
            }
          />
          <button
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      <details className="vault-advanced">
        <summary>Advanced · custom form selectors</summary>
        <p>
          Leave these empty for automatic detection. Use CSS selectors for forms
          with unusual fields.
        </p>
        <label>
          Username selector
          <input
            value={form.usernameSelector}
            maxLength={256}
            onChange={(e) => update("usernameSelector", e.target.value)}
            placeholder={'input[name="email"]'}
          />
        </label>
        <label>
          Password selector
          <input
            value={form.passwordSelector}
            maxLength={256}
            onChange={(e) => update("passwordSelector", e.target.value)}
            placeholder={'input[type="password"]'}
          />
        </label>
        <label>
          Sign-in button selector
          <input
            value={form.submitSelector}
            maxLength={256}
            onChange={(e) => update("submitSelector", e.target.value)}
            placeholder={'button[type="submit"]'}
          />
        </label>
      </details>
      <div className="modal-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <div className="spacer" />
        <button className="primary-button" disabled={busy}>
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <ShieldCheck size={15} />
          )}
          Save credential
        </button>
      </div>
    </form>
  );
}

export function VaultDialog({ vault, target, sessions, onClose, onNotice }) {
  const ref = useRef(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState(target?.id || "");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(null);
  const selected = sessions.find((s) => s.id === selectedId);
  useEffect(() => {
    ref.current.showModal();
    vault.refresh().catch((e) => setError(e.message));
  }, [vault.refresh]);
  useEffect(() => {
    if (!vault.unlocked) {
      setEditing(null);
      setRemoving(null);
      setSearch("");
    }
  }, [vault.unlocked]);
  async function run(action) {
    setBusy(true);
    setError("");
    try {
      return await action();
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function open(e) {
    e.preventDefault();
    if (!vault.configured && password !== confirmation) {
      setError("The master passwords do not match.");
      return;
    }
    try {
      await run(() => vault.unlock(password, !vault.configured));
    } catch {
    } finally {
      setPassword("");
      setConfirmation("");
    }
  }
  async function fill(entry, submit) {
    if (!selected) return;
    try {
      const result = await run(() =>
        vault.fill(selected.id, entry.id, {
          submit,
          navigate: selected.url !== entry.url,
        }),
      );
      onNotice(`${selected.name}: ${result.message}`);
      onClose();
    } catch {}
  }
  const entries = vault.entries.filter((e) =>
    `${e.label} ${e.username} ${e.url}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <dialog
      ref={ref}
      className="modal vault-modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="modal-top">
        <span className="eyebrow">
          <KeyRound size={12} />
          SHARED CREDENTIAL VAULT
        </span>
        <div className="vault-heading-actions">
          {vault.unlocked && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => run(() => vault.lock()).catch(() => {})}
            >
              <LockKeyhole size={13} />
              Lock vault
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Close vault"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
      </div>
      <h2>
        {target
          ? `Quick login · ${target.name}`
          : "Your test accounts, together."}
      </h2>
      <p className="muted">
        Save once. Use in any session. Each browser keeps its own login.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {vault.configured === null ? (
        <div className="vault-loading">
          <LoaderCircle className="spin" size={23} />
          <button
            className="text-button"
            onClick={() => vault.refresh().catch((e) => setError(e.message))}
          >
            Retry vault connection
          </button>
        </div>
      ) : !vault.unlocked ? (
        <form onSubmit={open} className="vault-unlock">
          <div className="vault-lock-icon">
            <LockKeyhole size={25} />
          </div>
          <h3>
            {vault.configured
              ? "Unlock your vault"
              : "Create your encrypted vault"}
          </h3>
          <p>
            {vault.configured
              ? "Enter your master password to access saved accounts."
              : "Choose a master password with at least 12 characters. You’ll need it after a refresh or restart; it cannot be recovered."}
          </p>
          <label>
            Master password
            <input
              type="password"
              autoFocus
              autoComplete={
                vault.configured ? "current-password" : "new-password"
              }
              value={password}
              minLength={vault.configured ? 1 : 12}
              maxLength={1024}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {!vault.configured && (
            <label>
              Confirm master password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                minLength={12}
                maxLength={1024}
                required
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          )}
          <button className="primary-button" disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <LockKeyholeOpen size={15} />
            )}
            {vault.configured ? "Unlock vault" : "Create vault"}
          </button>
          <span className="vault-footnote">
            Encrypted on disk · Automatically locks after 15 minutes without
            vault activity
          </span>
        </form>
      ) : editing ? (
        <CredentialForm
          key={editing.id || "new"}
          entry={editing}
          busy={busy}
          onCancel={() => {
            setEditing(null);
            setError("");
          }}
          onSave={(form) =>
            run(async () => {
              await vault.save(form);
              setEditing(null);
              onNotice("Credential saved in the encrypted vault.");
            })
          }
        />
      ) : (
        <>
          <div className="vault-controls">
            <input
              aria-label="Search credentials"
              placeholder="Search accounts or websites…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => {
                setError("");
                setEditing({
                  url: selected?.url?.startsWith("http") ? selected.url : "",
                });
              }}
            >
              <Plus size={15} />
              Add credential
            </button>
          </div>
          <label className="vault-session-picker">
            Use in session
            <select
              aria-label="Use credential in session"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Choose a session to fill…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="vault-entry-list">
            {entries.length ? (
              entries.map((entry) => (
                <article
                  className="vault-entry"
                  aria-label={entry.label}
                  key={entry.id}
                >
                  <div className="vault-entry-header">
                    <span className="vault-entry-icon">
                      <KeyRound size={17} />
                    </span>
                    <div>
                      <strong>{entry.label}</strong>
                      <span>{entry.username}</span>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Edit ${entry.label}`}
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setEditing(entry);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Delete ${entry.label}`}
                      disabled={busy}
                      onClick={() => setRemoving(entry.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="vault-entry-url" title={entry.url}>
                    {entry.url}
                  </div>
                  {removing === entry.id ? (
                    <div className="vault-entry-actions">
                      <span>Delete this saved login?</span>
                      <button
                        className="text-button"
                        onClick={() => setRemoving(null)}
                      >
                        Keep
                      </button>
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await vault.remove(entry.id);
                            setRemoving(null);
                          }).catch(() => {})
                        }
                      >
                        Delete credential
                      </button>
                    </div>
                  ) : (
                    selected && (
                      <div className="vault-entry-actions">
                        <span>
                          {selected.url !== entry.url
                            ? "Opens the saved login page"
                            : "Fills the current login form"}
                        </span>
                        <button
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => fill(entry, false)}
                        >
                          {selected.url !== entry.url ? "Open & fill" : "Fill"}
                        </button>
                        <button
                          className="primary-button"
                          disabled={busy}
                          onClick={() => fill(entry, true)}
                        >
                          Sign in
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    )
                  )}
                </article>
              ))
            ) : (
              <div className="vault-empty">
                <KeyRound size={28} />
                <strong>
                  {search
                    ? "No matching accounts"
                    : "A home for your test accounts."}
                </strong>
                <p>
                  {search
                    ? "Try another name, email, or website."
                    : "Save a login, then use the key button on any session to fill it."}
                </p>
              </div>
            )}
          </div>
          <div className="vault-bottom">
            <ShieldCheck size={13} />
            <span>
              Only fills the exact saved origin. Passwords stay out of the
              credential list.
            </span>
          </div>
        </>
      )}
    </dialog>
  );
}
