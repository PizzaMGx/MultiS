// Uses a disposable server/data directory; never configures or reads the user's vault.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const dataDir = await mkdtemp(path.join(tmpdir(), "multis-vault-e2e-"));
const output = process.env.TEST_OUTPUT || "/tmp/multis-vault-results";
await mkdir(output, { recursive: true });
const observations = new Map();
const fixture = createServer((req, res) => {
  if (req.url === "/redirect") {
    res.writeHead(302, {
      Location: `http://localhost:${fixture.address().port}/login?slot=redirect`,
    });
    res.end();
    return;
  }
  if (req.url === "/observe") {
    let body = "";
    req.on("data", (data) => {
      body += data;
    });
    req.on("end", () => {
      const data = JSON.parse(body);
      observations.set(data.slot, data);
      res.end("ok");
    });
    return;
  }
  const slot =
    new URL(req.url, "http://fixture").searchParams.get("slot") || "default";
  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vault login fixture</title>
    <style>body{font:16px sans-serif;padding:30px;background:#f1f6ec}form{display:grid;gap:15px;max-width:320px}input,button{padding:10px}h1{font-size:22px}</style>
    <h1>Test account login</h1><form><input type="hidden" name="email" value="honeypot"><input name="email" type="email" autocomplete="username" aria-label="Email"><input name="password" type="password" autocomplete="current-password" aria-label="Password"><button onclick="event.preventDefault()">Show password</button><button type="submit">Sign in</button></form>
    <script>const slot=${JSON.stringify(slot)};let email='',password='';let signed=false;
    async function observe(){await fetch('/observe',{method:'POST',body:JSON.stringify({slot,email,password,signed,honeypot:document.querySelector('input[type=hidden]').value})});}
    document.querySelector('input[type=email]').addEventListener('input',e=>{email=e.target.value;observe()});
    document.querySelector('input[type=password]').addEventListener('input',e=>{password=e.target.value;observe()});
    document.querySelector('form').onsubmit=async e=>{e.preventDefault();signed=true;await observe();document.querySelector('h1').textContent='Welcome '+email;};observe();</script>`);
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const loginUrl = `http://127.0.0.1:${fixture.address().port}/login`;
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server/index.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    BROWSER_LOCALHOST_HOST: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (value) => {
  logs += value;
});
child.stderr.on("data", (value) => {
  logs += value;
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message) {
  const deadline = Date.now() + 20000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(message);
    await wait(100);
  }
}
let browser;
const master = `test-master-${randomUUID()}`;
const accountPassword = `test-password-${randomUUID()}`;
let token = "";
async function request(route, method = "GET", body, authorize = true) {
  const response = await fetch(`${base}/api${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authorize && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data };
}

try {
  await until(async () => {
    try {
      return (await fetch(`${base}/api/health`)).ok;
    } catch {
      return false;
    }
  }, "Test server did not start");
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page
    .getByRole("button", { name: "Credential vault", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Create your encrypted vault", exact: true })
    .waitFor();
  await page.getByLabel("Master password", { exact: true }).fill(master);
  await page
    .getByLabel("Confirm master password", { exact: true })
    .fill(master);
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await page
    .getByRole("button", { name: "Add credential", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Add credential", exact: true })
    .click();
  await page.getByLabel("Credential label", { exact: true }).fill("QA Admin");
  await page
    .getByLabel("Login URL", { exact: true })
    .fill(`${loginUrl}?slot=a`);
  await page
    .getByLabel("Username or email", { exact: true })
    .fill("admin@example.test");
  await page
    .getByLabel("Saved password", { exact: true })
    .fill(accountPassword);
  await page
    .getByRole("button", { name: "Save credential", exact: true })
    .click();
  await page.getByRole("article", { name: "QA Admin", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/vault-manager.png` });
  const documentText = await page.locator("body").textContent();
  assert.ok(!documentText.includes(accountPassword));
  console.log(
    "PASS: create vault and save credential through the UI; password absent from the account list",
  );

  const { data: opened } = await request(
    "/vault/unlock",
    "POST",
    { password: master },
    false,
  );
  token = opened.token;
  const saved = opened.entries[0];
  assert.ok(!("password" in saved));
  const encrypted = await readFile(path.join(dataDir, "vault.json"), "utf8");
  assert.ok(!encrypted.includes(accountPassword));
  assert.ok(!encrypted.includes("admin@example.test"));
  assert.ok(!encrypted.includes(master));
  assert.equal(
    (await request("/vault/entries", "GET", undefined, false)).response.status,
    401,
  );

  const { data: all } = await request("/sessions");
  const [a, b] = all.sessions;
  await page.getByLabel("Use credential in session").selectOption(a.id);
  await page
    .getByRole("article", { name: "QA Admin", exact: true })
    .getByRole("button", { name: "Open & fill", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await until(
    () => observations.get("a")?.password === accountPassword,
    "Quick fill did not populate the password",
  );
  assert.equal(observations.get("a").email, "admin@example.test");
  assert.equal(observations.get("a").signed, false);
  assert.equal(observations.get("a").honeypot, "honeypot");
  console.log(
    "PASS: quick fill forwards React-compatible input events, skips hidden fields and leaves submission to the user",
  );

  await page
    .getByRole("button", { name: `Quick login for ${b.name}`, exact: true })
    .click();
  await page
    .getByRole("article", { name: "QA Admin", exact: true })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await until(
    () => observations.get("a")?.signed === true,
    "Quick sign-in was not submitted",
  );
  const afterSessions = (await request("/sessions")).data.sessions;
  assert.equal(
    afterSessions.find((s) => s.id === a.id).url,
    `${loginUrl}?slot=a`,
  );
  assert.equal(
    afterSessions.find((s) => s.id === b.id).url,
    `${loginUrl}?slot=a`,
  );
  console.log(
    "PASS: the same saved credential can be filled and submitted from another isolated session",
  );

  const mismatched = (
    await request("/vault/entries", "POST", {
      label: "Other origin",
      username: "unrelated@example.test",
      password: "different-synthetic-secret",
      url: "https://example.invalid/login",
    })
  ).data;
  const wrongOrigin = await request(
    `/sessions/${a.id}/credentials/${mismatched.id}/fill`,
    "POST",
    { submit: false, navigate: false },
  );
  assert.equal(wrongOrigin.response.status, 409);
  assert.ok(
    !JSON.stringify(wrongOrigin.data).includes("different-synthetic-secret"),
  );
  const crossOrigin = await fetch(`${base}/api/vault/entries`, {
    headers: {
      Origin: "https://untrusted.example",
      Authorization: `Bearer ${token}`,
    },
  });
  assert.equal(crossOrigin.status, 403);
  console.log(
    "PASS: mismatched target origins and cross-origin API access are rejected",
  );

  const redirectEntry = (
    await request("/vault/entries", "POST", {
      label: "Redirect test",
      username: "redirect@example.test",
      password: "redirect-synthetic-secret",
      url: `${loginUrl.replace("/login", "")}/redirect`,
    })
  ).data;
  const redirected = await request(
    `/sessions/${a.id}/credentials/${redirectEntry.id}/fill`,
    "POST",
    { submit: false, navigate: true },
  );
  assert.equal(redirected.response.status, 409);
  await until(
    () => observations.has("redirect"),
    "Redirect fixture did not load",
  );
  assert.equal(observations.get("redirect").email, "");
  assert.equal(observations.get("redirect").password, "");
  console.log(
    "PASS: redirects to a different origin cannot receive a saved credential",
  );

  // Locking in the UI revokes the separate API token as well.
  await page
    .getByRole("button", { name: "Credential vault", exact: true })
    .click();
  await page.getByRole("button", { name: "Lock vault", exact: true }).click();
  await page
    .getByRole("heading", { name: "Unlock your vault", exact: true })
    .waitFor();
  assert.equal((await request("/vault/entries")).response.status, 401);
  assert.equal(
    (
      await request(`/sessions/${a.id}/credentials/${saved.id}/fill`, "POST", {
        submit: false,
        navigate: false,
      })
    ).response.status,
    401,
  );
  await page
    .getByLabel("Master password", { exact: true })
    .fill("wrong-test-master-password");
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Incorrect master password" })
    .waitFor();
  await page.getByLabel("Master password", { exact: true }).fill(master);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await page.getByRole("article", { name: "QA Admin", exact: true }).waitFor();
  console.log(
    "PASS: manual lock revokes all unlock tokens and blocks filling; wrong master password is rejected",
  );

  await page
    .getByRole("button", { name: "Edit QA Admin", exact: true })
    .click();
  await page
    .getByLabel("Credential label", { exact: true })
    .fill("QA Admin Updated");
  assert.equal(
    await page.getByLabel("Saved password", { exact: true }).inputValue(),
    "",
  );
  await page
    .getByText("Advanced · custom form selectors", { exact: true })
    .click();
  await page
    .getByLabel("Username selector", { exact: true })
    .fill('input[type="email"]');
  await page
    .getByLabel("Password selector", { exact: true })
    .fill('input[name="password"]');
  await page
    .getByLabel("Sign-in button selector", { exact: true })
    .fill('button[type="submit"]');
  await page
    .getByRole("button", { name: "Save credential", exact: true })
    .click();
  await page
    .getByRole("article", { name: "QA Admin Updated", exact: true })
    .waitFor();
  const reopened = (
    await request("/vault/unlock", "POST", { password: master }, false)
  ).data;
  token = reopened.token;
  const filledAgain = await request(
    `/sessions/${a.id}/credentials/${saved.id}/fill`,
    "POST",
    { submit: false, navigate: true },
  );
  assert.equal(filledAgain.response.status, 200);
  await until(
    () =>
      observations.get("a")?.password === accountPassword &&
      !observations.get("a")?.signed,
    "Edit did not retain saved password",
  );
  const customSubmit = await request(
    `/sessions/${a.id}/credentials/${saved.id}/fill`,
    "POST",
    { submit: true, navigate: false },
  );
  assert.equal(customSubmit.response.status, 200);
  await until(
    () => observations.get("a")?.signed,
    "Custom submit selector did not work",
  );
  console.log(
    "PASS: custom field and submit selectors work while editing preserves the encrypted password",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/vault-mobile.png` });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Delete QA Admin Updated", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete credential", exact: true })
    .click();
  await page
    .getByRole("article", { name: "QA Admin Updated", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    (await request("/vault/entries")).data.entries.some(
      (e) => e.id === saved.id,
    ),
    false,
  );
  await page.getByRole("button", { name: "Close vault", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Credential vault", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Unlock your vault", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.ok(!logs.includes(master) && !logs.includes(accountPassword));
  console.log(
    "PASS: edit preserves saved passwords, deletion works, mobile layout fits, and refresh requires unlocking",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    wait(10000).then(() => child.kill("SIGKILL")),
  ]);
  await new Promise((resolve) => fixture.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
