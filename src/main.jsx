import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Plus,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  Settings2,
  X,
  Smartphone,
  Monitor,
  Tablet,
  Layers3,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Camera,
  Trash2,
  Copy,
  Check,
  Grip,
  AlertCircle,
  LoaderCircle,
  Globe2,
  Keyboard,
  KeyRound,
  LockKeyhole,
  LockKeyholeOpen,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useCredentialVault, VaultDialog } from "./vault.jsx";
import { NativeSelectPicker } from "./native-select.jsx";
import "./style.css";

const COLORS = [
  "#baf279",
  "#bca4ff",
  "#78c9f5",
  "#ffbe7b",
  "#f58fbc",
  "#73d9c1",
];
const PRESETS = [
  { label: "iPhone 14 / 15", width: 390, height: 844, isMobile: true },
  { label: "iPhone Pro Max", width: 430, height: 932, isMobile: true },
  { label: "Pixel 7", width: 412, height: 915, isMobile: true },
  { label: "iPad", width: 768, height: 1024, isMobile: false },
  { label: "Laptop", width: 1366, height: 768, isMobile: false },
  { label: "Desktop", width: 1440, height: 900, isMobile: false },
];
const deviceIcon = (s) =>
  s.isMobile ? Smartphone : s.width < 1024 ? Tablet : Monitor;
const deviceLabel = (s) =>
  s.isMobile ? "Mobile" : s.width < 1024 ? "Tablet" : "Desktop";
const shortName = (s) => s.name.split(/[·\s]/)[0];
async function api(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (response.status === 204) return;
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "The request could not be completed.");
  return body;
}
function IconButton({ title, children, className = "", ...props }) {
  return (
    <button
      className={`icon-button ${className}`}
      title={title}
      aria-label={title}
      {...props}
    >
      {children}
    </button>
  );
}

function SessionDialog({ session, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(session);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="modal-top">
          <span className="eyebrow">YOUR OWN LITTLE BROWSER</span>
          <IconButton title="Close settings" onClick={onClose} type="button">
            <X size={18} />
          </IconButton>
        </div>
        <h2>{session.id ? "Session settings" : "A fresh perspective."}</h2>
        <p className="muted">
          A separate identity. A viewport that fits your test.
        </p>
        <label>
          Session name
          <input
            autoFocus
            value={form.name}
            maxLength={48}
            required
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Alex · Customer"
          />
        </label>
        <label>
          Starting URL
          <input
            value={form.url}
            required
            onChange={(e) => update("url", e.target.value)}
            placeholder="https://your-website.com"
          />
        </label>
        <label>
          Device preset
          <select
            aria-label="Device preset"
            value={PRESETS.findIndex(
              (p) =>
                p.width === Number(form.width) &&
                p.height === Number(form.height) &&
                p.isMobile === form.isMobile,
            )}
            onChange={(e) => {
              const preset = PRESETS[Number(e.target.value)];
              if (preset) setForm((f) => ({ ...f, ...preset }));
            }}
          >
            <option value={-1}>Custom dimensions</option>
            {PRESETS.map((p, i) => (
              <option value={i} key={p.label}>
                {p.label} · {p.width} × {p.height}
              </option>
            ))}
          </select>
        </label>
        <div className="dimension-row">
          <label>
            Width <span>px</span>
            <input
              type="number"
              min="240"
              max="2560"
              required
              value={form.width}
              onChange={(e) => update("width", e.target.value)}
            />
          </label>
          <span className="dimension-times">×</span>
          <label>
            Height <span>px</span>
            <input
              type="number"
              min="240"
              max="2560"
              required
              value={form.height}
              onChange={(e) => update("height", e.target.value)}
            />
          </label>
          <IconButton
            type="button"
            title="Rotate viewport"
            onClick={() =>
              setForm((f) => ({ ...f, width: f.height, height: f.width }))
            }
          >
            <RotateCw size={18} />
          </IconButton>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.isMobile}
            onChange={(e) => update("isMobile", e.target.checked)}
          />
          <span>
            Mobile browser emulation
            <small>
              Touch support, mobile user agent and viewport behavior
            </small>
          </span>
        </label>
        {session.id && session.isMobile !== form.isMobile && (
          <p className="inline-note">
            Changing emulation restarts this browser. Your saved login stays in
            its profile.
          </p>
        )}
        <label>Session color</label>
        <div className="color-row">
          {COLORS.map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`Color ${color}`}
              className={form.color === color ? "color selected" : "color"}
              style={{ background: color }}
              onClick={() => update("color", color)}
            >
              {form.color === color && <Check size={15} />}
            </button>
          ))}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {confirmDelete ? (
          <div className="delete-confirm">
            <p>
              Delete this session and its saved login? This cannot be undone.
            </p>
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete(session.id);
                  onClose();
                } catch (e) {
                  setError(e.message);
                  setBusy(false);
                }
              }}
            >
              Delete session
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setConfirmDelete(false)}
            >
              Keep session
            </button>
          </div>
        ) : (
          <div className="modal-actions">
            {session.id && (
              <IconButton
                title="Delete session"
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={18} />
              </IconButton>
            )}
            <div className="spacer" />
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Plus size={16} />
              )}
              {session.id ? "Save changes" : "Create session"}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}

function SessionPanel({
  session,
  scale,
  onSettings,
  onDuplicate,
  onClose,
  onQuickLogin,
  register,
  focused,
  setFocused,
  onConnection,
  onUrl,
}) {
  const [status, setStatus] = useState("starting");
  const [page, setPage] = useState({
    url: session.url,
    title: "",
    tabs: [],
    loading: true,
  });
  const [address, setAddress] = useState(session.url);
  const [frame, setFrame] = useState(null);
  const [error, setError] = useState("");
  const [remoteDialog, setRemoteDialog] = useState(null);
  const [promptText, setPromptText] = useState("");
  const [download, setDownload] = useState(null);
  const [selectPicker, setSelectPicker] = useState(null);
  const selectPickerRef = useRef(null);
  selectPickerRef.current = selectPicker;
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullscreenScale, setFullscreenScale] = useState(1);
  const panelRef = useRef(null);
  const stageRef = useRef(null);
  const fullscreen = nativeFullscreen || expanded;
  const previewScale = fullscreen ? fullscreenScale : scale;
  const socket = useRef(null);
  const surface = useRef(null);
  const active = useRef(false);
  const pointerDown = useRef(false);
  const lastMove = useRef(0);
  const connectStatus = useRef(onConnection);
  connectStatus.current = onConnection;
  const Device = deviceIcon(session);
  const send = (message) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(message));
  };
  function cancelSelect(restoreFocus = true) {
    const picker = selectPickerRef.current;
    if (!picker) return;
    send({ type: "select", id: picker.id, index: null });
    setSelectPicker(null);
    if (restoreFocus) surface.current?.focus({ preventScroll: true });
  }
  async function exitFullscreen() {
    if (document.fullscreenElement === panelRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        /* Browser may already be exiting. */
      }
    }
    setExpanded(false);
  }
  async function toggleFullscreen() {
    if (fullscreen) {
      await exitFullscreen();
      return;
    }
    setFocused(session.id);
    try {
      if (document.fullscreenEnabled && panelRef.current.requestFullscreen)
        await panelRef.current.requestFullscreen();
      else setExpanded(true);
    } catch {
      setExpanded(true);
    }
  }
  async function showWorkspaceAction(action) {
    cancelSelect(false);
    await exitFullscreen();
    action();
  }
  useEffect(() => {
    const changed = () =>
      setNativeFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (selectPickerRef.current) {
        cancelSelect();
        return;
      }
      exitFullscreen();
    };
    window.addEventListener("keydown", escape, true);
    const measure = () => {
      const stage = stageRef.current;
      if (stage)
        setFullscreenScale(
          Math.max(
            0.01,
            Math.min(
              stage.clientWidth / session.width,
              stage.clientHeight / session.height,
            ),
          ),
        );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stageRef.current);
    measure();
    return () => {
      window.removeEventListener("keydown", escape, true);
      observer.disconnect();
    };
  }, [fullscreen, session.width, session.height]);
  useEffect(() => {
    register(session.id, send);
    let disposed = false;
    let retry;
    let failures = 0;
    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/sessions/${session.id}`,
      );
      socket.current = ws;
      setStatus("starting");
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "frame")
          setFrame(`data:image/jpeg;base64,${message.data}`);
        if (message.type === "status") {
          setStatus(message.status);
          connectStatus.current(session.id, message.status === "connected");
          if (message.status === "connected") {
            failures = 0;
            setError("");
          }
        }
        if (message.type === "state") {
          setPage(message);
          if (message.loading) setError("");
          if (!active.current) setAddress(message.url);
          onUrl(session.id, message.url);
        }
        if (message.type === "error") setError(message.message);
        if (message.type === "dialog") {
          setRemoteDialog(message);
          setPromptText(message.defaultValue || "");
        }
        if (message.type === "download") setDownload(message);
        if (message.type === "select") setSelectPicker(message);
        if (message.type === "select-close")
          setSelectPicker((current) =>
            current?.id === message.id ? null : current,
          );
      };
      ws.onclose = () => {
        if (disposed) return;
        setStatus("disconnected");
        setSelectPicker(null);
        connectStatus.current(session.id, false);
        retry = setTimeout(connect, Math.min(1000 * 2 ** failures++, 15000));
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket.current?.close();
      register(session.id, null);
      connectStatus.current(session.id, false);
    };
  }, [session.id]);
  useEffect(() => {
    const node = surface.current;
    const wheel = (e) => {
      if (socket.current?.readyState !== WebSocket.OPEN) return;
      e.preventDefault();
      const factor =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? session.height : 1;
      send({ type: "wheel", dx: e.deltaX * factor, dy: e.deltaY * factor });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [session.height]);
  function pointer(e, action) {
    if (e.pointerType === "touch") e.preventDefault();
    if (action === "down") {
      surface.current.focus();
      setFocused(session.id);
      surface.current.setPointerCapture(e.pointerId);
      pointerDown.current = true;
    }
    if (action === "up") {
      pointerDown.current = false;
      if (surface.current.hasPointerCapture(e.pointerId))
        surface.current.releasePointerCapture(e.pointerId);
    }
    if (action === "move" && performance.now() - lastMove.current < 32) return;
    if (action === "move") lastMove.current = performance.now();
    const rect = surface.current.getBoundingClientRect();
    send({
      type: "pointer",
      action,
      x: ((e.clientX - rect.left) / rect.width) * session.width,
      y: ((e.clientY - rect.top) / rect.height) * session.height,
      button: ["left", "middle", "right"][e.button] || "left",
      clickCount: e.detail === 2 ? 2 : 1,
    });
  }
  function key(e, action) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return;
    e.preventDefault();
    if (e.isComposing || e.key === "Process" || e.key === "Dead") return;
    const key = e.key === " " ? "Space" : e.key;
    send({ type: "key", action, key });
  }
  return (
    <section
      ref={panelRef}
      className={`session-panel ${focused === session.id ? "focused" : ""} ${fullscreen ? "is-fullscreen" : ""}`}
      style={{
        "--session-color": session.color,
        width: Math.max(284, session.width * scale),
      }}
      aria-label={`${session.name} session`}
    >
      <div className="panel-heading">
        <span
          className="avatar"
          style={{ background: `${session.color}19`, color: session.color }}
        >
          {shortName(session).slice(0, 1)}
        </span>
        <div className="panel-identity">
          <strong>{session.name}</strong>
          <span>
            <Device size={11} />
            {deviceLabel(session)}
            <i />
            {session.width} × {session.height}
          </span>
        </div>
        <IconButton
          title={`Settings for ${session.name}`}
          onClick={() => showWorkspaceAction(() => onSettings(session))}
        >
          <Settings2 size={16} />
        </IconButton>
        <IconButton
          title={`Quick login for ${session.name}`}
          onClick={() =>
            showWorkspaceAction(() =>
              onQuickLogin({ ...session, url: page.url }),
            )
          }
          disabled={status !== "connected"}
        >
          <KeyRound size={15} />
        </IconButton>
        <IconButton
          title={`Duplicate ${session.name} with a fresh login`}
          onClick={() => showWorkspaceAction(() => onDuplicate(session))}
        >
          <Copy size={15} />
        </IconButton>
        <IconButton
          title={`${fullscreen ? "Exit full screen" : "Full screen"} for ${session.name}`}
          aria-pressed={fullscreen}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </IconButton>
        <IconButton
          title={`Close ${session.name}`}
          className="close-session-button"
          onClick={() => showWorkspaceAction(() => onClose(session))}
        >
          <X size={16} />
        </IconButton>
      </div>
      <div className="browser-shell">
        {selectPicker && (
          <NativeSelectPicker
            key={selectPicker.id}
            picker={selectPicker}
            onCancel={cancelSelect}
            onChoose={(index) => {
              send({
                type: "select",
                id: selectPicker.id,
                ...(selectPicker.kind === "temporal"
                  ? { value: index }
                  : { index }),
              });
              setSelectPicker(null);
              surface.current?.focus({ preventScroll: true });
            }}
          />
        )}
        <div className="browser-tools">
          <IconButton
            title={`Back in ${session.name}`}
            onClick={() => send({ type: "back" })}
          >
            <ArrowLeft size={13} />
          </IconButton>
          <IconButton
            title={`Forward in ${session.name}`}
            onClick={() => send({ type: "forward" })}
          >
            <ArrowRight size={13} />
          </IconButton>
          <IconButton
            title={`Reload ${session.name}`}
            onClick={() => {
              setError("");
              send({ type: "reload" });
            }}
          >
            <RotateCw size={13} className={page.loading ? "spin" : ""} />
          </IconButton>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              active.current = false;
              send({ type: "navigate", url: address });
              surface.current.focus();
            }}
          >
            <input
              aria-label={`URL for ${session.name}`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onFocus={() => {
                active.current = true;
              }}
              onBlur={() => {
                active.current = false;
              }}
              spellCheck="false"
            />
            <button title="Navigate" aria-label={`Navigate ${session.name}`}>
              <ArrowRight size={12} />
            </button>
          </form>
          <IconButton
            title={`Screenshot ${session.name}`}
            onClick={() => {
              const a = document.createElement("a");
              a.href = `/api/sessions/${session.id}/screenshot`;
              a.download = "";
              a.click();
            }}
            disabled={status !== "connected"}
          >
            <Camera size={14} />
          </IconButton>
        </div>
        {page.tabs.length > 1 && (
          <div className="remote-tabs">
            {page.tabs.map((tab) => (
              <button
                key={tab.id}
                className={tab.active ? "active" : ""}
                onClick={() => send({ type: "tab", id: tab.id })}
              >
                {tab.url === "about:blank"
                  ? "New tab"
                  : (() => {
                      try {
                        return new URL(tab.url).hostname;
                      } catch {
                        return "Tab";
                      }
                    })()}
              </button>
            ))}
          </div>
        )}
        {error && (
          <div className="panel-error" role="alert">
            <AlertCircle size={14} />
            <span>{error}</span>
            <IconButton title="Dismiss error" onClick={() => setError("")}>
              <X size={13} />
            </IconButton>
          </div>
        )}
        {download && (
          <div className="download-notice">
            <a href={download.url} download>
              {download.name}
            </a>
            <IconButton
              title="Dismiss download"
              onClick={() => setDownload(null)}
            >
              <X size={12} />
            </IconButton>
          </div>
        )}
        <div className="viewport-stage" ref={stageRef}>
          <div
            className="viewport-wrap"
            style={{
              width: session.width * previewScale,
              height: session.height * previewScale,
            }}
          >
            <div
              ref={surface}
              className="remote-surface"
              role="application"
              tabIndex={0}
              aria-label={`Interactive browser for ${session.name}`}
              style={{ width: "100%", height: "100%" }}
              onPointerDown={(e) => pointer(e, "down")}
              onPointerUp={(e) => pointer(e, "up")}
              onPointerMove={(e) => pointer(e, "move")}
              onPointerCancel={() => {
                pointerDown.current = false;
                send({ type: "release" });
              }}
              onKeyDown={(e) => key(e, "down")}
              onKeyUp={(e) => key(e, "up")}
              onBlur={() => {
                pointerDown.current = false;
                send({ type: "release" });
              }}
              onContextMenu={(e) => e.preventDefault()}
              onPaste={(e) => {
                e.preventDefault();
                send({
                  type: "text",
                  text: e.clipboardData.getData("text/plain"),
                });
              }}
              onCompositionEnd={(e) => send({ type: "text", text: e.data })}
            >
              {frame && (
                <img
                  src={frame}
                  draggable="false"
                  alt={`${session.name} browser viewport`}
                />
              )}
              {(!frame || status !== "connected") && (
                <div className="connecting">
                  <LoaderCircle size={23} className="spin" />
                  <strong>
                    {status === "disconnected"
                      ? "Reconnecting…"
                      : "Opening your session…"}
                  </strong>
                  <span>Preparing an isolated browser</span>
                </div>
              )}
            </div>
            {remoteDialog && (
              <div className="remote-dialog">
                <strong>
                  {remoteDialog.kind === "alert"
                    ? "Website message"
                    : "Website confirmation"}
                </strong>
                <p>{remoteDialog.message}</p>
                {remoteDialog.kind === "prompt" && (
                  <input
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    autoFocus
                  />
                )}
                <div>
                  <button
                    onClick={() => {
                      send({ type: "dialog", accept: false });
                      setRemoteDialog(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      send({ type: "dialog", accept: true, text: promptText });
                      setRemoteDialog(null);
                    }}
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="panel-footer">
        <span>
          <i className={`status-dot ${status}`} />
          {status === "connected"
            ? "Session isolated"
            : status === "starting"
              ? "Starting browser"
              : "Reconnecting"}
        </span>
        {fullscreen && (
          <span className="fullscreen-hint">
            Press Esc to return to the workspace
          </span>
        )}
        <span title={page.title}>{Math.round(previewScale * 100)}%</span>
      </div>
    </section>
  );
}

function CloseSessionDialog({ session, onClose, onDelete }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal close-session-modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="modal-top">
        <span className="eyebrow">CLOSE SESSION</span>
        <IconButton
          title="Cancel closing session"
          onClick={onClose}
          disabled={busy}
        >
          <X size={18} />
        </IconButton>
      </div>
      <h2>Close {session.name}?</h2>
      <p className="muted">
        This removes the session and permanently clears its saved login, browser
        data, and downloads.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <div className="spacer" />
        <button className="secondary-button" disabled={busy} onClick={onClose}>
          Keep session
        </button>
        <button
          className="danger-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onDelete(session.id);
              onClose();
            } catch (e) {
              setError(e.message);
              setBusy(false);
            }
          }}
        >
          {busy ? "Closing…" : "Close session"}
        </button>
      </div>
    </dialog>
  );
}

function App() {
  const vault = useCredentialVault();
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultTarget, setVaultTarget] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [maxSessions, setMaxSessions] = useState(8);
  const [globalUrl, setGlobalUrl] = useState("");
  const [globalDirty, setGlobalDirty] = useState(false);
  const [editing, setEditing] = useState(null);
  const [closing, setClosing] = useState(null);
  const [sidebar, setSidebar] = useState(true);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [scaleMode, setScaleMode] = useState("fit");
  const [fitScale, setFitScale] = useState(0.5);
  const [layout, setLayout] = useState("row");
  const [focused, setFocused] = useState(null);
  const [connections, setConnections] = useState({});
  const [toast, setToast] = useState("");
  const [help, setHelp] = useState(false);
  const area = useRef(null);
  const commands = useRef(new Map());
  const latestUrls = useRef(new Map());
  useEffect(() => {
    api("/api/sessions")
      .then((data) => {
        setSessions(data.sessions);
        setMaxSessions(data.maxSessions);
        setGlobalUrl(data.sessions[0]?.url || "");
        setLoaded(true);
      })
      .catch((e) => {
        setToast(e.message);
        setLoaded(true);
      });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const measure = () => {
      if (!area.current || !sessions.length) return;
      const width = area.current.clientWidth - 64;
      const height = area.current.clientHeight - 165;
      let low = 0;
      let high = 1;
      for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        const required =
          sessions.reduce((sum, s) => sum + Math.max(284, s.width * mid), 0) +
          (sessions.length - 1) * 24;
        if (required <= width) low = mid;
        else high = mid;
      }
      const candidate =
        layout === "row"
          ? low
          : (Math.min(width, 600) - 24) /
            Math.max(...sessions.map((s) => s.width));
      setFitScale(
        Math.max(
          0.18,
          Math.min(
            1,
            candidate,
            height / Math.max(...sessions.map((s) => s.height)),
          ),
        ),
      );
    };
    const observer = new ResizeObserver(measure);
    if (area.current) observer.observe(area.current);
    measure();
    return () => observer.disconnect();
  }, [sessions, sidebar, layout]);
  const scale = scaleMode === "fit" ? fitScale : Number(scaleMode);
  const online = sessions.filter((s) => connections[s.id]).length;
  const register = (id, handler) =>
    handler ? commands.current.set(id, handler) : commands.current.delete(id);
  const onConnection = (id, connected) =>
    setConnections((current) =>
      current[id] === connected ? current : { ...current, [id]: connected },
    );
  function addSession() {
    if (sessions.length >= maxSessions) {
      setToast(
        `You can have up to ${maxSessions} sessions. Delete one to make room.`,
      );
      return;
    }
    setEditing({
      name: `Session ${sessions.length + 1}`,
      width: 390,
      height: 844,
      isMobile: true,
      color: COLORS[sessions.length % COLORS.length],
      url: globalUrl || `http://127.0.0.1:3000/demo`,
    });
  }
  async function saveSession(form) {
    const saved = await api(`/api/sessions${form.id ? `/${form.id}` : ""}`, {
      method: form.id ? "PATCH" : "POST",
      body: JSON.stringify(form),
    });
    setSessions((current) =>
      form.id
        ? current.map((s) => (s.id === saved.id ? saved : s))
        : [...current, saved],
    );
    setToast(
      form.id
        ? "Session settings saved."
        : "Fresh session created. Ready for a different user.",
    );
  }
  async function duplicate(session) {
    if (sessions.length >= maxSessions) {
      setToast(`You can have up to ${maxSessions} sessions.`);
      return;
    }
    try {
      const saved = await api("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          ...session,
          name: `${shortName(session)} · Copy`,
          url: latestUrls.current.get(session.id) || session.url,
          color: COLORS[sessions.length % COLORS.length],
        }),
      });
      setSessions((current) => [...current, saved]);
      setToast("Duplicated the viewport with a fresh, isolated login.");
    } catch (e) {
      setToast(e.message);
    }
  }
  async function deleteSession(id) {
    await api(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((current) => current.filter((s) => s.id !== id));
    latestUrls.current.delete(id);
    setToast("Session and its saved browser data deleted.");
  }
  function navigateAll(e) {
    e.preventDefault();
    if (!globalUrl.trim()) return;
    for (const send of commands.current.values())
      send({ type: "navigate", url: globalUrl });
    setGlobalDirty(false);
  }
  return (
    <div className="app">
      <header className="topbar" id="workspace-topbar" hidden={topCollapsed}>
        <a className="brand" href="/" aria-label="multiS home">
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          multi<span>S</span>
          <span className="brand-tag">PLAYGROUND</span>
        </a>
        <div className="topbar-right">
          <button
            className={`vault-trigger ${vault.unlocked ? "unlocked" : ""}`}
            onClick={() => {
              setVaultTarget(null);
              setVaultOpen(true);
            }}
            aria-label="Credential vault"
          >
            {vault.unlocked ? (
              <LockKeyholeOpen size={15} />
            ) : (
              <LockKeyhole size={15} />
            )}
            <span>Vault</span>
          </button>
          <span className="local-badge">
            <i />
            LOCAL WORKSPACE
          </span>
          <button
            className="text-button help-trigger"
            onClick={() => setHelp(true)}
          >
            <Keyboard size={15} />
            Quick guide
          </button>
          <span className="version">v1.0</span>
        </div>
      </header>
      <div className="workspace">
        {sidebar && (
          <aside className="sidebar">
            <div className="sidebar-title">
              <span>WORKSPACE</span>
              <IconButton
                title="Collapse sidebar"
                onClick={() => setSidebar(false)}
              >
                <PanelLeftClose size={16} />
              </IconButton>
            </div>
            <div className="workspace-item">
              <span className="workspace-symbol">
                <Layers3 size={19} />
              </span>
              <div>
                <strong>Session playground</strong>
                <span>Your testing space</span>
              </div>
              <span className="workspace-check">
                <Check size={13} />
              </span>
            </div>
            <div className="sidebar-divider" />
            <div className="sessions-title">
              <span>SESSIONS</span>
              <span className="count">
                {sessions.length.toString().padStart(2, "0")}
              </span>
              <IconButton title="Add a session" onClick={addSession}>
                <Plus size={16} />
              </IconButton>
            </div>
            <nav className="session-list">
              {sessions.map((session) => {
                const Device = deviceIcon(session);
                return (
                  <button
                    key={session.id}
                    className={`session-item ${focused === session.id ? "active" : ""}`}
                    onClick={() => {
                      setFocused(session.id);
                      document
                        .querySelector(`[data-session="${session.id}"]`)
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                          inline: "center",
                        });
                    }}
                    onDoubleClick={() =>
                      setEditing({
                        ...session,
                        url: latestUrls.current.get(session.id) || session.url,
                      })
                    }
                  >
                    <span
                      className="session-square"
                      style={{
                        color: session.color,
                        background: `${session.color}15`,
                      }}
                    >
                      <Device size={16} />
                    </span>
                    <div>
                      <strong>{session.name}</strong>
                      <span>
                        {session.width} × {session.height}
                      </span>
                    </div>
                    <i
                      className={`tiny-dot ${connections[session.id] ? "online" : ""}`}
                    />
                  </button>
                );
              })}
            </nav>
            <button className="add-sidebar" onClick={addSession}>
              <Plus size={15} />
              Add session<span>+</span>
            </button>
            <div className="sidebar-bottom">
              <div className="isolation-card">
                <ShieldCheck size={19} />
                <strong>
                  Different users.
                  <br />
                  Same big picture.
                </strong>
                <p>
                  Cookies, storage, and logins stay separate in every session.
                </p>
                <span>
                  <i />
                  Isolation is always on
                </span>
              </div>
              <div className="sidebar-status">
                <span className="status-dot connected" />
                Browser engine<span>Chromium</span>
              </div>
            </div>
          </aside>
        )}
        <main className="main">
          <div className="page-heading" id="workspace-heading" hidden={topCollapsed}>
            <div className="heading-copy">
              <div className="eyebrow">
                <span className="small-green-line" />
                THE MULTI-SESSION WORKSPACE
              </div>
              <h1>
                One screen. Every perspective<span>.</span>
              </h1>
              <p>
                Test together. Stay separate. See your website through every
                user’s eyes.
              </p>
            </div>
            <button className="primary-button new-session" onClick={addSession}>
              <Plus size={17} />
              New session
            </button>
          </div>
          <div className="address-toolbar">
            {!sidebar && (
              <IconButton title="Show sidebar" onClick={() => setSidebar(true)}>
                <PanelLeftOpen size={18} />
              </IconButton>
            )}
            <span className="url-icon">
              <Globe2 size={18} />
            </span>
            <form onSubmit={navigateAll}>
              <input
                aria-label="Website URL for all sessions"
                placeholder="Enter a website URL to open in every session"
                value={globalUrl}
                onChange={(e) => {
                  setGlobalUrl(e.target.value);
                  setGlobalDirty(true);
                }}
                spellCheck="false"
              />
              <button
                type="submit"
                className={`open-all ${globalDirty ? "dirty" : ""}`}
                disabled={!sessions.length}
              >
                Open in all
                <ArrowRight size={15} />
              </button>
            </form>
            <div className="toolbar-divider" />
            <IconButton
              title="Reload all sessions"
              onClick={() => {
                for (const send of commands.current.values())
                  send({ type: "reload" });
              }}
            >
              <RotateCw size={17} />
            </IconButton>
          </div>
          <div className="canvas-toolbar">
            <div className="canvas-summary">
              <span className="live-dot" />
              {sessions.length} sessions<span className="summary-dot">·</span>
              <ShieldCheck size={13} />
              <span>Independent logins</span>
            </div>
            <div className="view-controls">
              {topCollapsed && (
                <IconButton title="New session" onClick={addSession}>
                  <Plus size={17} />
                </IconButton>
              )}
              <button
                type="button"
                className="text-button top-toggle"
                title={topCollapsed ? "Show top" : "Collapse top"}
                aria-expanded={!topCollapsed}
                aria-controls="workspace-topbar workspace-heading"
                onClick={() => setTopCollapsed((collapsed) => !collapsed)}
              >
                {topCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                <span>{topCollapsed ? "Show top" : "Collapse top"}</span>
              </button>
              <span className="zoom-label">Zoom</span>
              <select
                aria-label="Viewport zoom"
                value={scaleMode}
                onChange={(e) => setScaleMode(e.target.value)}
              >
                <option value="fit">Fit to screen</option>
                <option value="0.25">25%</option>
                <option value="0.5">50%</option>
                <option value="0.75">75%</option>
                <option value="1">100%</option>
              </select>
              <div className="view-toggle">
                <IconButton
                  title="Side by side layout"
                  className={layout === "row" ? "active" : ""}
                  onClick={() => setLayout("row")}
                >
                  <Layers3 size={15} />
                </IconButton>
                <IconButton
                  title="Wrapped layout"
                  className={layout === "wrap" ? "active" : ""}
                  onClick={() => setLayout("wrap")}
                >
                  <Grip size={15} />
                </IconButton>
              </div>
            </div>
          </div>
          <div className={`canvas ${layout}`} ref={area}>
            {loaded && sessions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Layers3 size={34} />
                </div>
                <span className="eyebrow">A CLEAN SLATE</span>
                <h2>Make room for another point of view.</h2>
                <p>
                  Create a session, open your website, and sign in as your first
                  test user.
                </p>
                <button className="primary-button" onClick={addSession}>
                  <Plus size={16} />
                  Create your first session
                </button>
              </div>
            ) : !loaded ? (
              <div className="empty-state">
                <LoaderCircle className="spin" />
                <p>Loading your workspace…</p>
                <button
                  className="text-button"
                  onClick={() => location.reload()}
                >
                  Retry connection
                </button>
              </div>
            ) : (
              <div className="panels">
                {sessions.map((session) => (
                  <div key={session.id} data-session={session.id}>
                    <SessionPanel
                      session={session}
                      scale={scale}
                      onSettings={(s) =>
                        setEditing({
                          ...s,
                          url: latestUrls.current.get(s.id) || s.url,
                        })
                      }
                      onDuplicate={duplicate}
                      onClose={setClosing}
                      onQuickLogin={(target) => {
                        setVaultTarget(target);
                        setVaultOpen(true);
                      }}
                      register={register}
                      focused={focused}
                      setFocused={setFocused}
                      onConnection={onConnection}
                      onUrl={(id, url) => latestUrls.current.set(id, url)}
                    />
                  </div>
                ))}
              </div>
            )}
            {sessions.length > 0 && (
              <div className="canvas-hint">
                <span className="hint-line" />
                <span>
                  <ShieldCheck size={13} />
                  Real browsers. Separate identities. Shared perspective.
                </span>
                <span className="hint-line" />
              </div>
            )}
          </div>
          <footer className="statusbar">
            <span>
              <i className={`status-dot ${online ? "connected" : ""}`} />
              {online
                ? `${online} browser${online === 1 ? "" : "s"} connected`
                : sessions.length
                  ? "Connecting browsers…"
                  : "No active browsers"}
              <span className="footer-divider">/</span>Saved locally
            </span>
            <span>
              <span className="keycap">click</span> a viewport to interact
              <span className="footer-divider">·</span>Session data persists
              between restarts
            </span>
          </footer>
        </main>
      </div>
      {editing && (
        <SessionDialog
          key={editing.id || "new"}
          session={editing}
          onClose={() => setEditing(null)}
          onSave={saveSession}
          onDelete={deleteSession}
        />
      )}
      {closing && (
        <CloseSessionDialog
          session={closing}
          onClose={() => setClosing(null)}
          onDelete={deleteSession}
        />
      )}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {vaultOpen && (
        <VaultDialog
          vault={vault}
          target={vaultTarget}
          sessions={sessions.map((s) => ({
            ...s,
            url: latestUrls.current.get(s.id) || s.url,
          }))}
          onClose={() => setVaultOpen(false)}
          onNotice={setToast}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <AlertCircle size={16} />
          {toast}
          <IconButton title="Dismiss notification" onClick={() => setToast("")}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
function HelpDialog({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal help-modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-top">
        <span className="eyebrow">A LITTLE FIELD GUIDE</span>
        <IconButton title="Close guide" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <h2>Your testing space, explained.</h2>
      <div className="guide-item">
        <Globe2 />
        <div>
          <strong>One URL, multiple users</strong>
          <p>
            Use “Open in all” to load the same site. Click each viewport and log
            in with a different account. The built-in Orbit demo lets you try
            this right away.
          </p>
        </div>
      </div>
      <div className="guide-item">
        <Settings2 />
        <div>
          <strong>Every size is welcome</strong>
          <p>
            Open session settings for device presets, custom dimensions,
            rotation, and mobile emulation. Zoom changes the preview size while
            preserving its real viewport.
          </p>
        </div>
      </div>
      <div className="guide-item">
        <Keyboard />
        <div>
          <strong>Click, type, scroll, paste</strong>
          <p>
            Click a viewport to focus it. Keyboard shortcuts go to that session;
            paste works with Ctrl/Cmd+V. Use screenshot to capture the full
            viewport. Browser tabs and login popups appear inside their session.
          </p>
        </div>
      </div>
      <div className="guide-item">
        <ShieldCheck />
        <div>
          <strong>Saved, and separate</strong>
          <p>
            Each session has a persistent Chromium profile. Duplicating creates
            a fresh login. Deleting permanently clears that session’s browser
            data.
          </p>
        </div>
      </div>
      <div className="guide-note">
        <strong>Testing a local website?</strong>
        <p>
          Use <code>http://localhost:PORT</code>. In Docker, the session browser
          routes localhost to your computer. Run your dev server with
          <code> --host 0.0.0.0</code> so Docker can reach it.
        </p>
      </div>
      <p className="muted guide-limit">
        Chromium emulation is not a physical device. File uploads, audio
        streaming, passkeys, browser extensions, and clipboard copy from a
        remote page are not supported in this version.
      </p>
      <button className="primary-button" onClick={onClose}>
        Got it
        <ArrowRight size={16} />
      </button>
    </dialog>
  );
}

createRoot(document.getElementById("root")).render(<App />);
