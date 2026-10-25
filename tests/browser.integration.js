// Run inside the built image: npm exec is not required (Playwright is a runtime dependency).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const base = process.env.TEST_URL || "http://127.0.0.1:3000";
const output = process.env.TEST_OUTPUT || "/tmp/multis-results";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const created = [];
const sockets = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reports = [];
const fixture = createServer((req, res) => {
  if (req.url === "/report") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      reports.push({ ...JSON.parse(body), cookie: req.headers.cookie || "" });
      res.end("ok");
    });
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolation fixture</title><form><input id="identity" aria-label="Identity" autofocus><button>Save</button></form><script>
    const opened = indexedDB.open('identity', 1);
    opened.onupgradeneeded = () => opened.result.createObjectStore('data');
    const database = new Promise(resolve => opened.onsuccess = () => resolve(opened.result));
    async function report() {
      const db = await database;
      const stored = await new Promise(resolve => { const request = db.transaction('data').objectStore('data').get('name'); request.onsuccess = () => resolve(request.result || ''); });
      await fetch('/report', { method: 'POST', body: JSON.stringify({ slot: new URLSearchParams(location.search).get('slot'), name: localStorage.getItem('name') || '', indexed: stored, width: innerWidth, mobile: navigator.userAgent.includes('Mobile') }) });
    }
    document.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const name = document.getElementById('identity').value;
      localStorage.setItem('name', name); document.cookie = 'identity=' + name + '; Path=/; Max-Age=3600';
      const db = await database; await new Promise(resolve => { const tx = db.transaction('data', 'readwrite'); tx.objectStore('data').put(name, 'name'); tx.oncomplete = resolve; });
      await report();
    }; report();
  </script>`);
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
async function waitForReport(predicate) {
  const deadline = Date.now() + 20000;
  while (!reports.some(predicate)) {
    if (Date.now() > deadline)
      throw new Error(
        `Expected browser storage report; received ${JSON.stringify(reports)}`,
      );
    await wait(100);
  }
  return reports.findLast(predicate);
}
async function request(route, method, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return;
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}
async function connect(id) {
  const ws = new WebSocket(`${base.replace("http", "ws")}/ws/sessions/${id}`);
  sockets.push(ws);
  const messages = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  const until = async (predicate) => {
    const deadline = Date.now() + 45000;
    while (!messages.some(predicate)) {
      if (Date.now() > deadline)
        throw new Error(
          `Timed out waiting for websocket: ${JSON.stringify(messages.filter((m) => m.type !== "frame"))}`,
        );
      await wait(100);
    }
  };
  await until((m) => m.type === "status" && m.status === "connected");
  await until((m) => m.type === "frame");
  return { ws, messages, until };
}

try {
  await page.goto(base);
  await page
    .getByRole("heading", { name: "One screen. Every perspective." })
    .waitFor();
  await page.locator(".remote-surface img").first().waitFor({ timeout: 60000 });
  await page
    .locator('.browser-tools input[value^="http"]')
    .first()
    .waitFor({ timeout: 30000 });
  await wait(800);
  await page.screenshot({
    path: `${output}/workspace-desktop.png`,
    fullPage: true,
  });
  console.log("PASS: workspace loads and remote frames render");

  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page
    .getByLabel("Session name", { exact: true })
    .fill("Integration · Customer");
  await page.getByLabel("Starting URL", { exact: true }).fill(`${base}/demo`);
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  let { sessions } = await request("/api/sessions");
  const session = sessions.find((s) => s.name === "Integration · Customer");
  assert.ok(session);
  created.push(session.id);
  const panel = page.getByRole("region", {
    name: "Integration · Customer session",
    exact: true,
  });
  await panel.locator("img").waitFor({ timeout: 60000 });
  await page.getByLabel("Viewport zoom").selectOption("0.5");
  console.log("PASS: creating a session launches an isolated browser");

  const enterFullScreen = () =>
    panel
      .getByRole("button", {
        name: `Full screen for ${session.name}`,
        exact: true,
      })
      .click();
  const exitFullScreen = () =>
    panel
      .getByRole("button", {
        name: `Exit full screen for ${session.name}`,
        exact: true,
      })
      .click();
  const waitExpanded = () =>
    panel
      .getByRole("button", {
        name: `Exit full screen for ${session.name}`,
        exact: true,
      })
      .waitFor();
  const waitRestored = () =>
    panel
      .getByRole("button", {
        name: `Full screen for ${session.name}`,
        exact: true,
      })
      .waitFor();
  await enterFullScreen();
  await waitExpanded();
  assert.equal(
    await panel.evaluate((node) => document.fullscreenElement === node),
    true,
  );
  const fullscreenLayout = await panel.evaluate((node) => {
    const panel = node.getBoundingClientRect();
    const stage = node.querySelector(".viewport-stage").getBoundingClientRect();
    const viewport = node
      .querySelector(".viewport-wrap")
      .getBoundingClientRect();
    return {
      fillsScreen:
        Math.abs(panel.width - innerWidth) < 2 &&
        Math.abs(panel.height - innerHeight) < 2,
      fits:
        viewport.width <= stage.width + 1 &&
        viewport.height <= stage.height + 1,
      ratio: viewport.width / viewport.height,
    };
  });
  assert.equal(fullscreenLayout.fillsScreen, true);
  assert.equal(fullscreenLayout.fits, true);
  assert.ok(
    Math.abs(fullscreenLayout.ratio - session.width / session.height) < 0.005,
  );
  const persistedViewport = (await request("/api/sessions")).sessions.find(
    (s) => s.id === session.id,
  );
  assert.equal(persistedViewport.width, session.width);
  assert.equal(persistedViewport.height, session.height);
  await page.screenshot({ path: `${output}/session-fullscreen.png` });
  await exitFullScreen();
  await waitRestored();
  assert.equal(await page.evaluate(() => document.fullscreenElement), null);
  await enterFullScreen();
  await waitExpanded();
  await page.keyboard.press("Escape");
  await waitRestored();
  console.log(
    "PASS: native fullscreen fits the preview, preserves viewport dimensions, and exits by button or Escape",
  );

  await panel.evaluate((node) => {
    node.requestFullscreen = () =>
      Promise.reject(new Error("Fullscreen denied for fallback test"));
  });
  await enterFullScreen();
  await waitExpanded();
  assert.equal(await page.evaluate(() => document.fullscreenElement), null);
  await page.keyboard.press("Escape");
  await waitRestored();
  await enterFullScreen();
  await waitExpanded();

  await page
    .getByRole("button", { name: `Settings for ${session.name}`, exact: true })
    .click();
  await waitRestored();
  await panel.evaluate((node) => {
    delete node.requestFullscreen;
  });
  console.log(
    "PASS: denied fullscreen uses an expanded view and settings return to the workspace",
  );
  await page
    .getByLabel("Device preset", { exact: true })
    .selectOption({ label: "Desktop · 1440 × 900" });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await panel.getByText("1440 × 900", { exact: false }).waitFor();
  ({ sessions } = await request("/api/sessions"));
  assert.equal(sessions.find((s) => s.id === session.id).width, 1440);
  assert.equal(sessions.find((s) => s.id === session.id).isMobile, false);
  const stream = await connect(session.id);
  assert.ok(stream.messages.find((m) => m.type === "frame").data.length > 1000);
  console.log(
    "PASS: changing dimensions and mobile emulation reconnects to a live browser",
  );

  // Exercise the actual input protocol, using the demo's desktop viewport coordinates.
  stream.ws.send(JSON.stringify({ type: "navigate", url: `${base}/demo` }));
  await wait(1500);
  stream.ws.send(
    JSON.stringify({ type: "pointer", action: "down", x: 1377, y: 38 }),
  );
  stream.ws.send(
    JSON.stringify({ type: "pointer", action: "up", x: 1377, y: 38 }),
  );
  await wait(400);
  stream.ws.send(JSON.stringify({ type: "text", text: "Alice Integration" }));
  stream.ws.send(JSON.stringify({ type: "key", action: "down", key: "Tab" }));
  stream.ws.send(JSON.stringify({ type: "key", action: "up", key: "Tab" }));
  stream.ws.send(JSON.stringify({ type: "text", text: "alice@example.com" }));
  stream.ws.send(JSON.stringify({ type: "key", action: "down", key: "Enter" }));
  stream.ws.send(JSON.stringify({ type: "key", action: "up", key: "Enter" }));
  await wait(1000);
  const screenshot = await fetch(
    `${base}/api/sessions/${session.id}/screenshot`,
  );
  assert.equal(screenshot.headers.get("content-type"), "image/png");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    `${output}/remote-input.png`,
    Buffer.from(await screenshot.arrayBuffer()),
  );
  console.log(
    "PASS: remote pointer, keyboard, paste and screenshot endpoints respond",
  );

  // Persisted profiles are opened only after deleting their API session (which would remove
  // data), so use a dedicated profile pair to test Chromium storage isolation and restart.
  const profileRoot = await mkdtemp(path.join(tmpdir(), "multis-isolation-"));
  let alice;
  let bob;
  try {
    alice = await chromium.launchPersistentContext(
      path.join(profileRoot, "alice"),
      { headless: true },
    );
    bob = await chromium.launchPersistentContext(
      path.join(profileRoot, "bob"),
      { headless: true },
    );
    const a = alice.pages()[0];
    const b = bob.pages()[0];
    await Promise.all([a.goto(`${base}/demo`), b.goto(`${base}/demo`)]);
    await a.getByRole("button", { name: "Sign in", exact: true }).click();
    await a.getByLabel("Your name", { exact: true }).fill("Alice");
    await a
      .getByLabel("Email address", { exact: true })
      .fill("alice@example.com");
    await a.getByRole("button", { name: "Enter workspace →" }).click();
    assert.equal(await a.locator("#accountName").textContent(), "Alice");
    assert.equal(await b.locator("#accountName").textContent(), "Guest");
    assert.ok(
      (await alice.cookies()).some(
        (c) => c.name === "orbit-user" && c.value.includes("alice"),
      ),
    );
    assert.ok(!(await bob.cookies()).some((c) => c.name === "orbit-user"));
    await a.locator("#task1").check();
    assert.equal(await b.locator("#task1").isChecked(), false);
    await alice.close();
    alice = await chromium.launchPersistentContext(
      path.join(profileRoot, "alice"),
      { headless: true },
    );
    await alice.pages()[0].goto(`${base}/demo`);
    assert.equal(
      await alice.pages()[0].locator("#accountName").textContent(),
      "Alice",
    );
    assert.equal(await alice.pages()[0].locator("#task1").isChecked(), true);
    console.log(
      "PASS: same-origin cookies and localStorage are isolated; login and tasks survive browser restart",
    );
  } finally {
    await Promise.allSettled([alice?.close(), bob?.close()]);
    await rm(profileRoot, { recursive: true, force: true });
  }

  await page
    .getByRole("button", {
      name: `Duplicate ${session.name} with a fresh login`,
      exact: true,
    })
    .click();
  await page
    .getByRole("region", { name: "Integration · Copy session", exact: true })
    .waitFor();
  ({ sessions } = await request("/api/sessions"));
  const copy = sessions.find((s) => s.name === "Integration · Copy");
  created.push(copy.id);
  assert.notEqual(copy.id, session.id);
  console.log("PASS: duplicate creates a different profile identity");

  // Drive two real API sessions through their streamed input connections. The fixture
  // reports its own same-origin storage to verify isolation across all three stores.
  const secondStream = await connect(copy.id);
  stream.ws.send(
    JSON.stringify({ type: "navigate", url: `${fixtureUrl}/?slot=alice` }),
  );
  secondStream.ws.send(
    JSON.stringify({ type: "navigate", url: `${fixtureUrl}/?slot=bob` }),
  );
  await waitForReport((r) => r.slot === "alice");
  await waitForReport((r) => r.slot === "bob");
  const remoteSurface = panel.getByRole("application");
  await enterFullScreen();
  await waitExpanded();
  await remoteSurface.click({ position: { x: 35, y: 10 } });
  await remoteSurface.pressSequentially("Alice");
  await remoteSurface.press("Enter");
  const aliceReport = await waitForReport(
    (r) => r.slot === "alice" && r.name === "Alice",
  );
  await exitFullScreen();
  await waitRestored();
  console.log("PASS: pointer and keyboard input map correctly in fullscreen");
  assert.equal(aliceReport.indexed, "Alice");
  assert.ok(aliceReport.cookie.split("; ").includes("identity=Alice"));
  secondStream.ws.send(JSON.stringify({ type: "reload" }));
  await wait(700);
  const bobReport = reports.findLast((r) => r.slot === "bob");
  assert.equal(bobReport.name, "");
  assert.equal(bobReport.indexed, "");
  assert.equal(bobReport.cookie, "");
  reports.length = 0;
  await request(`/api/sessions/${session.id}`, "PATCH", {
    isMobile: true,
    width: 390,
    height: 844,
  });
  await connect(session.id);
  const restored = await waitForReport(
    (r) => r.slot === "alice" && r.name === "Alice",
  );
  assert.equal(restored.indexed, "Alice");
  assert.ok(restored.cookie.split("; ").includes("identity=Alice"));
  assert.equal(restored.width, 390);
  assert.equal(restored.mobile, true);
  console.log(
    "PASS: actual API sessions isolate cookies, localStorage and IndexedDB; all persist through a browser restart and resizing",
  );

  const invalid = await fetch(`${base}/api/sessions/${session.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ width: -1 }),
  });
  assert.equal(invalid.status, 400);
  const forbidden = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(forbidden.status, 403);
  const blockedSocket = new WebSocket(
    `${base.replace("http", "ws")}/ws/sessions/${session.id}`,
    { origin: "https://untrusted.example" },
  );
  await new Promise((resolve, reject) => {
    blockedSocket.on("error", resolve);
    blockedSocket.on("open", () => {
      blockedSocket.close();
      reject(new Error("Untrusted WebSocket origin was accepted"));
    });
  });
  console.log(
    "PASS: invalid settings and cross-origin control requests are rejected",
  );

  if (process.env.TEST_HOST_URL) {
    secondStream.ws.send(
      JSON.stringify({ type: "navigate", url: process.env.TEST_HOST_URL }),
    );
    await secondStream.until(
      (m) =>
        m.type === "state" &&
        m.url === process.env.TEST_HOST_URL &&
        !m.loading &&
        m.title.includes(process.env.TEST_HOST_TITLE || ""),
    );
    assert.ok(
      !secondStream.messages.some(
        (m) => m.type === "error" && /ERR_CONNECTION_REFUSED/.test(m.message),
      ),
    );
    console.log(
      "PASS: localhost website on Docker host loads without changing its URL",
    );
  }

  const beforeClose = (await request("/api/sessions")).sessions.map(
    (s) => s.id,
  );
  await page
    .getByRole("button", { name: `Close ${copy.name}`, exact: true })
    .click();
  await page
    .getByRole("heading", { name: `Close ${copy.name}?`, exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Keep session", exact: true }).click();
  assert.ok(
    (await request("/api/sessions")).sessions.some((s) => s.id === copy.id),
  );
  await page
    .getByRole("button", { name: `Close ${copy.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close session", exact: true })
    .click();
  await page
    .getByRole("region", { name: `${copy.name} session`, exact: true })
    .waitFor({ state: "detached" });
  assert.deepEqual(
    (await request("/api/sessions")).sessions.map((s) => s.id),
    beforeClose.filter((id) => id !== copy.id),
  );
  created.splice(created.indexOf(copy.id), 1);
  console.log(
    "PASS: panel close button supports cancellation and removes only the selected session",
  );

  await page.getByRole("button", { name: "Quick guide", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your testing space, explained." })
    .waitFor();
  await page.getByRole("button", { name: "Got it", exact: false }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${output}/workspace-mobile.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log("PASS: guide, mobile layout, and browser console checks");
} finally {
  for (const ws of sockets) ws.close();
  await browser.close();
  for (const id of created)
    await request(`/api/sessions/${id}`, "DELETE").catch(console.error);
  await new Promise((resolve) => fixture.close(resolve));
}
