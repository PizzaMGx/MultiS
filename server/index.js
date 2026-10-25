import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { chromium } from "playwright";
import { browserNetworkArgs } from "./network.js";
import { vaultRoutes } from "./vault-routes.js";
import { installNativeSelectBridge } from "./native-select.js";
import {
  COLORS,
  MAX_SESSIONS,
  normalizeUrl,
  validateSession,
} from "./config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(process.env.DATA_DIR || "data");
const port = Number(process.env.PORT || 3000);
mkdirSync(dataDir, { recursive: true });
const configPath = path.join(dataDir, "sessions.json");
let sessions;
try {
  sessions = JSON.parse(readFileSync(configPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  sessions = [
    { name: "Alex · Customer", width: 390, height: 844, isMobile: true },
    { name: "Sam · Admin", width: 1440, height: 900, isMobile: false },
    { name: "Jamie · Guest", width: 768, height: 1024, isMobile: false },
  ].map((session, i) => ({
    id: randomUUID(),
    ...validateSession({
      ...session,
      color: COLORS[i],
      url: `http://127.0.0.1:${port}/demo`,
    }),
  }));
}
function persist() {
  writeFileSync(`${configPath}.tmp`, JSON.stringify(sessions, null, 2));
  renameSync(`${configPath}.tmp`, configPath);
}
persist();
const runtimes = new Map();
const locks = new Map();
let stopping = false;
function exclusive(id, action) {
  const next = (locks.get(id) || Promise.resolve())
    .catch(() => {})
    .then(action);
  locks.set(id, next);
  next
    .finally(() => {
      if (locks.get(id) === next) locks.delete(id);
    })
    .catch(() => {});
  return next;
}
const findSession = (id) => sessions.find((s) => s.id === id);
function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 2_000_000)
    ws.send(JSON.stringify(message));
}
function broadcast(rt, message) {
  for (const ws of rt.clients) send(ws, message);
}
function state(rt) {
  return {
    type: "state",
    url: rt.page.url(),
    title: rt.title || "",
    loading: rt.loading,
    tabs: rt.context
      .pages()
      .map((page, i) => ({ id: i, url: page.url(), active: page === rt.page })),
  };
}
function report(rt) {
  if (rt.page && !rt.page.isClosed()) broadcast(rt, state(rt));
}

async function activate(rt, page) {
  rt.nativeSelect?.cancel();
  if (rt.cdp) {
    await rt.cdp.detach().catch(() => {});
    rt.cdp = null;
  }
  rt.page = page;
  rt.title = await page.title().catch(() => "");
  await page.bringToFront();
  const cdp = await rt.context.newCDPSession(page);
  rt.cdp = cdp;
  rt.frame = null;
  cdp.on("Page.screencastFrame", (event) => {
    cdp
      .send("Page.screencastFrameAck", { sessionId: event.sessionId })
      .catch(() => {});
    rt.frame = { type: "frame", data: event.data };
    broadcast(rt, rt.frame);
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 80,
    maxWidth: 1920,
    maxHeight: 1920,
    everyNthFrame: 1,
  });
  report(rt);
  // A static page may not generate another screencast frame when a viewer reconnects.
  const shot = await page
    .screenshot({ type: "jpeg", quality: 80, timeout: 5000 })
    .catch(() => null);
  if (shot && rt.page === page) {
    rt.frame = { type: "frame", data: shot.toString("base64") };
    broadcast(rt, rt.frame);
  }
}

function watchPage(rt, page) {
  page.setDefaultTimeout(8000);
  page.on("framenavigated", async (frame) => {
    rt.nativeSelect?.cancelForFrame(frame);
    if (frame !== page.mainFrame() || page !== rt.page) return;
    const session = findSession(rt.id);
    if (session && /^https?:/.test(page.url())) {
      session.url = page.url();
      persist();
    }
    rt.title = await page.title().catch(() => "");
    report(rt);
  });
  page.on("load", async () => {
    if (page === rt.page) {
      rt.title = await page.title().catch(() => "");
      report(rt);
    }
  });
  page.on("dialog", (dialog) => {
    rt.dialog = dialog;
    broadcast(rt, {
      type: "dialog",
      kind: dialog.type(),
      message: dialog.message(),
      defaultValue: dialog.defaultValue(),
    });
  });
  page.on("download", async (download) => {
    try {
      const name = `${randomUUID()}-${path.basename(download.suggestedFilename()).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await download.saveAs(path.join(dataDir, rt.id, "downloads", name));
      broadcast(rt, {
        type: "download",
        url: `/api/sessions/${rt.id}/downloads/${encodeURIComponent(name)}`,
        name: download.suggestedFilename(),
      });
    } catch {
      broadcast(rt, {
        type: "error",
        message: "The download could not be saved.",
      });
    }
  });
  page.on("close", () => {
    if (page === rt.page) rt.nativeSelect?.cancel();
    if (rt.closing) return;
    if (page === rt.page) {
      const next = rt.context.pages().at(-1);
      if (next) exclusive(rt.id, () => activate(rt, next)).catch(() => {});
      else
        rt.context
          .newPage()
          .then((nextPage) => exclusive(rt.id, () => activate(rt, nextPage)))
          .catch(() => {});
    } else report(rt);
  });
}

async function launch(session) {
  const context = await chromium.launchPersistentContext(
    path.join(dataDir, session.id, "profile"),
    {
      headless: true,
      viewport: { width: session.width, height: session.height },
      isMobile: session.isMobile,
      hasTouch: session.isMobile,
      ...(session.isMobile
        ? {
            userAgent:
              "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
          }
        : {}),
      acceptDownloads: true,
      args: ["--disable-dev-shm-usage", ...(await browserNetworkArgs())],
    },
  );
  const rt = {
    id: session.id,
    context,
    clients: new Set(),
    page: context.pages()[0] || (await context.newPage()),
    loading: false,
    frame: null,
    closing: false,
    queue: Promise.resolve(),
  };
  runtimes.set(session.id, rt);
  for (const page of context.pages()) watchPage(rt, page);
  context.on("page", (page) => {
    watchPage(rt, page);
    exclusive(rt.id, () => activate(rt, page)).catch(() => {});
  });
  context.on("close", () => {
    if (!rt.closing) {
      runtimes.delete(rt.id);
      for (const ws of rt.clients)
        ws.close(1011, "Browser stopped. Reconnect to restart.");
    }
  });
  try {
    rt.nativeSelect = await installNativeSelectBridge(context, {
      isActive: (page) => page === rt.page && !rt.closing,
      send: (message) => broadcast(rt, message),
    });
    await activate(rt, rt.page);
  } catch (error) {
    rt.closing = true;
    runtimes.delete(rt.id);
    await context.close();
    throw error;
  }
  navigate(rt, session.url).catch(() => {});
  return rt;
}

async function navigate(rt, url, action) {
  rt.nativeSelect?.cancel();
  rt.loading = true;
  report(rt);
  try {
    if (action === "reload")
      await rt.page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    else if (action === "back")
      await rt.page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 });
    else if (action === "forward")
      await rt.page.goForward({
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    else
      await rt.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
  } catch (error) {
    const failedUrl = url || rt.page.url();
    let hint = "";
    if (process.env.BROWSER_LOCALHOST_HOST) {
      try {
        const target = new URL(failedUrl);
        if (["127.0.0.1", "[::1]"].includes(target.hostname)) {
          target.hostname = "localhost";
          hint = ` This IP points inside the container. To reach your computer, use ${target.href}.`;
        } else if (
          target.hostname === "localhost" ||
          target.hostname.endsWith(".localhost")
        ) {
          hint =
            " Localhost is routed to your computer. Check that the dev server is running and listening on 0.0.0.0, and that its port is reachable from Docker.";
        }
      } catch {
        /* Keep the original error for malformed browser URLs. */
      }
    }
    broadcast(rt, {
      type: "error",
      message: `Navigation: ${error.message.split("\n")[0]}${hint}`,
    });
  } finally {
    rt.loading = false;
    report(rt);
  }
}

const app = express();
app.disable("x-powered-by");
app.use("/api", (req, res, next) => {
  const origin = req.get("origin");
  if (
    origin &&
    origin !== `http://${req.get("host")}` &&
    origin !== `https://${req.get("host")}`
  )
    return res
      .status(403)
      .json({ error: "Requests must come from this playground." });
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "32kb" }));
const { router: credentialRouter, vault } = vaultRoutes({
  dataDir,
  runtimes,
  report,
});
app.use("/api", credentialRouter);
app.get("/api/health", (_req, res) =>
  res.json({ status: stopping ? "stopping" : "ok" }),
);
app.get("/api/sessions", (_req, res) =>
  res.json({ sessions, maxSessions: MAX_SESSIONS }),
);
app.post("/api/sessions", (req, res) => {
  if (sessions.length >= MAX_SESSIONS)
    return res
      .status(400)
      .json({ error: `You can have up to ${MAX_SESSIONS} sessions.` });
  const session = { id: randomUUID(), ...validateSession(req.body) };
  sessions.push(session);
  persist();
  res.status(201).json(session);
});
app.patch("/api/sessions/:id", async (req, res) => {
  await exclusive(req.params.id, async () => {
    const session = findSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    const next = validateSession(req.body, session);
    const rt = runtimes.get(session.id);
    if (rt && next.isMobile !== session.isMobile) {
      rt.closing = true;
      await rt.context.close();
      runtimes.delete(session.id);
      for (const ws of rt.clients) ws.close(1012, "Emulation changed");
    } else if (
      rt &&
      (next.width !== session.width || next.height !== session.height)
    ) {
      for (const page of rt.context.pages())
        await page.setViewportSize({ width: next.width, height: next.height });
    }
    const changedUrl = next.url !== session.url;
    Object.assign(session, next);
    persist();
    if (changedUrl && rt && !rt.closing) navigate(rt, next.url).catch(() => {});
    res.json(session);
  });
});
app.delete("/api/sessions/:id", async (req, res) => {
  await exclusive(req.params.id, async () => {
    const session = findSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found." });
    const rt = runtimes.get(session.id);
    if (rt) {
      rt.closing = true;
      for (const ws of rt.clients) ws.close(1000, "Session deleted");
      await rt.context.close();
      runtimes.delete(session.id);
    }
    await rm(path.join(dataDir, session.id), { recursive: true, force: true });
    sessions = sessions.filter((s) => s.id !== session.id);
    persist();
    res.status(204).end();
  });
});
app.get("/api/sessions/:id/downloads/:name", (req, res) => {
  if (
    !findSession(req.params.id) ||
    path.basename(req.params.name) !== req.params.name
  )
    return res.sendStatus(404);
  res.download(path.join(dataDir, req.params.id, "downloads", req.params.name));
});
app.get("/api/sessions/:id/screenshot", async (req, res) => {
  const rt = runtimes.get(req.params.id);
  if (!rt)
    return res.status(409).json({ error: "Connect to the session first." });
  const image = await rt.page.screenshot({ type: "png", timeout: 10000 });
  res
    .type("png")
    .attachment(
      `${findSession(req.params.id).name.replace(/[^a-zA-Z0-9_-]/g, "-")}.png`,
    )
    .send(image);
});
app.get("/demo", (_req, res) =>
  res.sendFile(path.join(root, "server/demo.html")),
);
app.use(express.static(path.join(root, "dist")));
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.join(root, "dist/index.html")),
);
app.use((error, _req, res, _next) => {
  console.error(error.message);
  if (!res.headersSent) res.status(400).json({ error: error.message });
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
server.on("upgrade", (req, socket, head) => {
  const match = /^\/ws\/sessions\/([a-f\d-]+)$/.exec(req.url);
  const origin = req.headers.origin;
  if (
    stopping ||
    !match ||
    !findSession(match[1]) ||
    (origin &&
      ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(
        origin,
      ))
  ) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) =>
    wss.emit("connection", ws, match[1]),
  );
});

const finite = (value) => typeof value === "number" && Number.isFinite(value);
async function input(rt, message) {
  const page = rt.page;
  if (
    (message.type === "pointer" && message.action === "down") ||
    (message.type === "key" && message.action === "down") ||
    message.type === "tab"
  )
    rt.nativeSelect?.cancel();
  switch (message.type) {
    case "select":
      await rt.nativeSelect?.choose(message.id, message.value ?? message.index);
      break;
    case "navigate":
      navigate(rt, normalizeUrl(message.url)).catch(() => {});
      break;
    case "reload":
    case "back":
    case "forward":
      navigate(rt, null, message.type).catch(() => {});
      break;
    case "pointer": {
      const session = findSession(rt.id);
      if (
        !finite(message.x) ||
        !finite(message.y) ||
        !["move", "down", "up"].includes(message.action)
      )
        return;
      await page.mouse.move(
        Math.max(0, Math.min(session.width - 1, message.x)),
        Math.max(0, Math.min(session.height - 1, message.y)),
      );
      const button = ["left", "middle", "right"].includes(message.button)
        ? message.button
        : "left";
      if (message.action === "down")
        await page.mouse.down({
          button,
          clickCount: message.clickCount === 2 ? 2 : 1,
        });
      if (message.action === "up")
        await page.mouse.up({
          button,
          clickCount: message.clickCount === 2 ? 2 : 1,
        });
      break;
    }
    case "wheel":
      if (finite(message.dx) && finite(message.dy))
        await page.mouse.wheel(
          Math.max(-3000, Math.min(3000, message.dx)),
          Math.max(-3000, Math.min(3000, message.dy)),
        );
      break;
    case "key": {
      if (
        typeof message.key !== "string" ||
        message.key.length > 40 ||
        !["down", "up"].includes(message.action)
      )
        return;
      await page.keyboard[message.action](message.key);
      break;
    }
    case "text":
      if (typeof message.text === "string" && message.text.length <= 16000)
        await page.keyboard.insertText(message.text);
      break;
    case "release":
      for (const key of ["Control", "Alt", "Shift", "Meta"])
        await page.keyboard.up(key);
      for (const button of ["left", "middle", "right"])
        await page.mouse.up({ button });
      break;
    case "tab": {
      const target = rt.context.pages()[message.id];
      if (target) await activate(rt, target);
      break;
    }
    case "dialog":
      if (rt.dialog) {
        const dialog = rt.dialog;
        rt.dialog = null;
        if (message.accept)
          await dialog.accept(String(message.text || "").slice(0, 16000));
        else await dialog.dismiss();
      }
      break;
  }
}
wss.on("connection", async (ws, id) => {
  send(ws, { type: "status", status: "starting" });
  try {
    const rt = await exclusive(id, async () => {
      const session = findSession(id);
      if (!session || stopping)
        throw new Error("Session is no longer available.");
      return runtimes.get(id) || (await launch(session));
    });
    if (ws.readyState !== WebSocket.OPEN) return;
    rt.clients.add(ws);
    send(ws, { type: "status", status: "connected" });
    send(ws, state(rt));
    if (rt.frame) send(ws, rt.frame);
    if (rt.nativeSelect?.message) send(ws, rt.nativeSelect.message);
    if (rt.dialog)
      send(ws, {
        type: "dialog",
        kind: rt.dialog.type(),
        message: rt.dialog.message(),
        defaultValue: rt.dialog.defaultValue(),
      });
    let pending = 0;
    ws.on("message", (raw) => {
      if (pending > 150 || rt.closing) return;
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!message || typeof message !== "object") return;
      // A native JavaScript dialog can block a pending input command. Its response
      // must bypass the input queue so that command can finish.
      if (message.type === "dialog") {
        input(rt, message).catch((error) =>
          send(ws, { type: "error", message: error.message }),
        );
        return;
      }
      pending++;
      rt.queue = rt.queue
        .then(() => input(rt, message))
        .catch((error) =>
          send(ws, { type: "error", message: error.message.split("\n")[0] }),
        )
        .finally(() => {
          pending--;
        });
    });
    ws.on("close", () => rt.clients.delete(ws));
  } catch (error) {
    console.error(error);
    send(ws, {
      type: "error",
      message:
        "Could not start Chromium. Check the server logs and available memory.",
    });
    ws.close(1011);
  }
});

server.listen(port, "0.0.0.0", () =>
  console.log(`multiS is ready on http://localhost:${port}`),
);
async function shutdown() {
  if (stopping) return;
  stopping = true;
  vault.dispose();
  persist();
  for (const ws of wss.clients) ws.close(1001, "Server stopping");
  await Promise.allSettled(
    [...runtimes.values()].map(async (rt) => {
      rt.closing = true;
      await rt.context.close();
    }),
  );
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2500).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
