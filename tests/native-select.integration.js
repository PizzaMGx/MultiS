// A disposable playground and fixture site; no existing sessions or form data are used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const dataDir = await mkdtemp(path.join(tmpdir(), "multis-select-e2e-"));
const output = process.env.TEST_OUTPUT || "/tmp/multis-select-results";
await mkdir(output, { recursive: true });
const reports = new Map();
const fixture = createServer((req, res) => {
  if (req.url === "/report") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const data = JSON.parse(body);
      if ((data.sequence ?? 0) >= (reports.get(data.slot)?.sequence ?? 0))
        reports.set(data.slot, data);
      res.end("ok");
    });
    return;
  }
  const url = new URL(req.url, "http://fixture");
  const slot = url.searchParams.get("slot") || "test";
  res.setHeader("Content-Type", "text/html");
  if (url.pathname === "/temporal") {
    res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>dialog{position:fixed;left:20px;top:20px;margin:0;width:300px;height:450px;padding:0}input,button{position:absolute;left:20px;width:260px;height:40px;box-sizing:border-box}#date{top:60px}#time{top:140px}#combined{top:220px}#readonly{top:300px}#programmatic{top:380px}</style>
      <dialog><h2>Date/time modal</h2>
      <input id="date" aria-label="Appointment date" type="date" value="2026-10-23" min="2026-10-20" max="2026-11-20">
      <input id="time" aria-label="Appointment time" type="time" value="09:00" min="08:00" max="18:00" step="900" required>
      <input id="combined" aria-label="Appointment date and time" type="datetime-local" value="2026-10-23T09:00" step="60">
      <input id="readonly" aria-label="Read only date" type="date" value="2026-10-23" readonly>
      <button id="programmatic" type="button">Open calendar programmatically</button></dialog>
      <script>
      const dialog=document.querySelector('dialog');let sequence=0,inputs=0,changes=0,startedInside=false;
      const report=()=>fetch('/report',{method:'POST',body:JSON.stringify({slot:${JSON.stringify(slot)},sequence:++sequence,open:dialog.open,date:document.getElementById('date').value,time:document.getElementById('time').value,combined:document.getElementById('combined').value,inputs,changes})});
      document.addEventListener('mousedown',e=>startedInside=dialog.contains(e.target));
      document.addEventListener('click',()=>{if(!startedInside)dialog.close();report()});
      document.addEventListener('input',()=>{inputs++;report()});document.addEventListener('change',()=>{changes++;report()});
      document.getElementById('programmatic').onclick=()=>document.getElementById('date').showPicker();
      if(new URLSearchParams(location.search).has('mutate'))document.getElementById('date').addEventListener('focus',()=>setTimeout(()=>{document.getElementById('date').min='2026-11-01'},300));
      dialog.showModal();report();
      </script>`);
    return;
  }
  if (url.pathname === "/modal") {
    res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{margin:0}dialog{position:fixed;left:20px;top:20px;margin:0;width:300px;height:300px;padding:0}select{position:absolute;left:20px;top:60px;width:260px;height:40px}</style>
      <dialog><h2>Modal form</h2><select aria-label="Modal choice"><option>First choice</option><option>Second choice</option></select></dialog>
      <script>
      const dialog=document.querySelector('dialog'),select=document.querySelector('select');let startedInside=false,downs=0,changes=0,sequence=0;
      const report=()=>fetch('/report',{method:'POST',body:JSON.stringify({slot:${JSON.stringify(slot)},sequence:++sequence,open:dialog.open,value:select.value,downs,changes})});
      document.addEventListener('mousedown',e=>{const r=dialog.getBoundingClientRect();startedInside=dialog.contains(e.target)&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;downs++});
      document.addEventListener('click',()=>{if(!startedInside)dialog.close();report()});
      select.addEventListener('change',()=>{changes++;report()});
      dialog.addEventListener('close',report);dialog.showModal();report();
      </script>`);
    return;
  }
  if (url.pathname === "/frame") {
    res.end(
      `<!doctype html><meta name="viewport" content="width=device-width"><select aria-label="Frame choice" style="position:absolute;left:16px;top:16px;width:260px;height:40px"><option>Frame first</option><option>Frame second</option></select><script>document.querySelector('select').onchange=e=>fetch('/report',{method:'POST',body:JSON.stringify({slot:${JSON.stringify(slot)},frameValue:e.target.value})});</script>`,
    );
    return;
  }
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dropdown fixture</title><style>body{margin:0;background:#f2f5ee;font:14px sans-serif;color:#24351c}h1{font-size:19px;position:absolute;left:24px;top:6px}label{position:absolute;left:24px;font-size:12px}select,button{font:14px sans-serif}#event,#step,#custom{position:absolute;left:24px;width:300px;height:40px}#event{top:60px}#step{top:140px}#custom{top:220px}#custom-options{position:absolute;left:24px;top:260px;z-index:2;background:white;border:1px solid #718561;width:300px}#custom-options button{display:block;height:35px;width:100%}textarea{position:absolute;left:24px;top:325px;width:300px;height:60px}#inline{position:absolute;left:24px;top:410px;width:300px;height:95px}iframe{position:absolute;left:24px;top:550px;width:320px;height:120px;background:#fff;border:1px solid #abc}</style>
  <h1>Contact venue · test fixture</h1><label style="top:40px">Event</label><select id="event" aria-label="Event"><optgroup label="Active"><option value="a">Anniversary</option><option value="b">Birthday</option><option value="disabled" disabled>Unavailable event</option><option value="hidden" hidden>Hidden event</option><option value="same">First duplicate</option><option value="same">Second duplicate</option></optgroup><optgroup label="Archived" disabled><option value="old">Past event</option></optgroup></select>
  <label style="top:120px">Planning step</label><select id="step" aria-label="Planning step"></select>
  <button id="custom" type="button">Custom dropdown</button><div id="custom-options" hidden><button type="button">Custom one</button><button type="button">Custom two</button></div>
  <textarea readonly aria-label="Generated message"></textarea><select id="inline" size="3" aria-label="Inline list"><option>Inline first</option><option>Inline second</option><option>Inline third</option></select>
  <iframe src="http://127.0.0.2:${fixture.address().port}/frame?slot=${slot}-frame"></iframe>
  <script>
  const slot=${JSON.stringify(slot)};const eventSelect=document.getElementById('event'),step=document.getElementById('step');let changes=0,inputs=0,custom='',sequence=0;
  const report=()=>fetch('/report',{method:'POST',body:JSON.stringify({slot,sequence:++sequence,eventIndex:eventSelect.selectedIndex,eventValue:eventSelect.value,stepValue:step.value,changes,inputs,custom,inline:document.getElementById('inline').value})});
  function update(){step.innerHTML='<option value="">No step</option>'+Array.from({length:20},(_,i)=>'<option value="'+eventSelect.value+i+'" '+(i===2?'disabled':'')+'>'+ (eventSelect.value==='b'?'Birthday phase ':'Planning phase ')+i+'</option>').join('');document.querySelector('textarea').value='Planning '+eventSelect.selectedOptions[0].label;}
  eventSelect.oninput=()=>{inputs++;report()};eventSelect.onchange=()=>{changes++;update();report()};step.onchange=()=>{changes++;document.querySelector('textarea').value=step.selectedOptions[0].label;report()};
  document.getElementById('custom').onclick=()=>document.getElementById('custom-options').hidden=false;document.querySelectorAll('#custom-options button').forEach((b,i)=>b.onclick=()=>{custom=String(i+1);document.getElementById('custom-options').hidden=true;report()});document.getElementById('inline').onchange=report;
  if(new URLSearchParams(location.search).has('mutate'))eventSelect.addEventListener('focus',()=>setTimeout(()=>eventSelect.options[1].value='changed',300));
  update();report();</script>`);
});
await new Promise((resolve) => fixture.listen(0, "0.0.0.0", resolve));
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
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
child.stdout.resume();
child.stderr.resume();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message) {
  const deadline = Date.now() + 20000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(message);
    await wait(100);
  }
}
async function request(route, method = "GET", body) {
  const response = await fetch(`${base}/api${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}
let browser;
try {
  await until(async () => {
    try {
      return (await fetch(`${base}/api/health`)).ok;
    } catch {
      return false;
    }
  }, "Disposable playground did not start");
  const phone = await request("/sessions", "POST", {
    name: "Dropdown phone",
    url: `${fixtureUrl}/?slot=phone`,
    width: 390,
    height: 844,
    isMobile: true,
  });
  const desktop = await request("/sessions", "POST", {
    name: "Dropdown desktop",
    url: `${fixtureUrl}/?slot=desktop`,
    width: 1440,
    height: 900,
    isMobile: false,
  });
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByLabel("Viewport zoom").selectOption("0.5");
  const panel = (session) =>
    page.getByRole("region", { name: `${session.name} session`, exact: true });
  const click = async (session, x, y) => {
    const surface = panel(session).getByRole("application");
    const rect = await surface.boundingBox();
    await surface.click({
      position: {
        x: (x * rect.width) / session.width,
        y: (y * rect.height) / session.height,
      },
    });
  };
  const picker = (session, label) =>
    panel(session).getByRole("dialog", {
      name: `Choose ${label}`,
      exact: true,
    });
  await until(
    () => reports.has("phone") && reports.has("desktop"),
    "Fixture pages did not load",
  );
  await click(phone, 140, 80);
  await picker(phone, "Event").waitFor();
  assert.equal(await picker(desktop, "Event").count(), 0);
  assert.equal(
    await picker(phone, "Event")
      .getByRole("option", { name: "Unavailable event", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await picker(phone, "Event")
      .getByRole("option", { name: "Past event", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await picker(phone, "Event")
      .getByRole("option", { name: "Hidden event", exact: true })
      .count(),
    0,
  );
  await picker(phone, "Event")
    .getByRole("option", { name: "Birthday", exact: true })
    .click();
  await until(
    () =>
      reports.get("phone")?.eventValue === "b" &&
      reports.get("phone")?.changes === 1,
    "Selected event did not reach the website",
  );
  assert.equal(reports.get("phone").changes, 1);
  assert.equal(reports.get("phone").inputs, 1);
  assert.equal(reports.get("desktop").eventValue, "a");
  await click(phone, 140, 80);
  await picker(phone, "Event")
    .getByRole("option", { name: "Birthday", exact: true })
    .click();
  await wait(200);
  assert.equal(reports.get("phone").changes, 1);
  assert.equal(reports.get("phone").inputs, 1);
  console.log(
    "PASS: phone dropdown opens, disabled/hidden options are respected, and selection sends input/change only to its session",
  );

  await click(phone, 140, 160);
  await picker(phone, "Planning step").waitFor();
  await picker(phone, "Planning step")
    .getByRole("textbox", { name: "Filter Planning step options", exact: true })
    .fill("Birthday phase 12");
  await picker(phone, "Planning step")
    .getByRole("option", { name: "Birthday phase 12", exact: true })
    .click();
  await until(
    () => reports.get("phone")?.stepValue === "b12",
    "Dependent planning options did not update",
  );
  console.log(
    "PASS: dependent dropdown options refresh after event changes and long lists can be searched",
  );

  await click(phone, 140, 80);
  await picker(phone, "Event").waitFor();
  await page.keyboard.press("Escape");
  await picker(phone, "Event").waitFor({ state: "detached" });
  assert.equal(reports.get("phone").eventValue, "b");
  await panel(phone).getByRole("application").press("Space");
  await picker(phone, "Event").waitFor();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await until(
    () => reports.get("phone")?.eventValue === "a",
    "Keyboard selection did not reach the website",
  );
  await click(phone, 140, 80);
  await picker(phone, "Event")
    .getByRole("option", { name: "Second duplicate", exact: true })
    .click();
  await until(
    () => reports.get("phone")?.eventIndex === 5,
    "Options with duplicate values did not preserve their index",
  );
  console.log(
    "PASS: Escape cancels without changing values; keyboard opening/selection and duplicate option values work",
  );

  await click(desktop, 140, 80);
  await picker(desktop, "Event")
    .getByRole("option", { name: "Birthday", exact: true })
    .click();
  await until(
    () => reports.get("desktop")?.eventValue === "b",
    "Desktop dropdown did not update",
  );
  await click(phone, 140, 240);
  assert.equal(await panel(phone).locator(".native-select-sheet").count(), 0);
  await click(phone, 140, 312);
  await until(
    () => reports.get("phone")?.custom === "2",
    "Custom dropdown stopped receiving normal clicks",
  );
  await click(phone, 140, 444);
  assert.equal(await panel(phone).locator(".native-select-sheet").count(), 0);
  await click(phone, 90, 585);
  await picker(phone, "Frame choice")
    .getByRole("option", { name: "Frame second", exact: true })
    .click();
  await until(
    () => reports.get("phone-frame")?.frameValue === "Frame second",
    "Dropdown inside a cross-origin iframe did not update",
  );
  console.log(
    "PASS: desktop and iframe selects work; custom dropdowns and inline listboxes retain their normal input path",
  );

  await panel(phone)
    .getByRole("button", { name: `Full screen for ${phone.name}`, exact: true })
    .click();
  await panel(phone)
    .getByRole("button", {
      name: `Exit full screen for ${phone.name}`,
      exact: true,
    })
    .waitFor();
  await click(phone, 140, 80);
  await picker(phone, "Event").waitFor();
  await page.screenshot({ path: `${output}/dropdown-fullscreen.png` });
  await page.keyboard.press("Escape");
  await picker(phone, "Event").waitFor({ state: "detached" });
  assert.equal(
    await panel(phone).evaluate((node) => document.fullscreenElement === node),
    true,
  );
  await page.keyboard.press("Escape");
  await panel(phone)
    .getByRole("button", { name: `Full screen for ${phone.name}`, exact: true })
    .waitFor();
  console.log(
    "PASS: dropdowns work in fullscreen and Escape closes the picker before exiting fullscreen",
  );

  for (const session of [phone, desktop]) {
    const slot = `modal-${session.id}`;
    await request(`/sessions/${session.id}`, "PATCH", {
      url: `${fixtureUrl}/modal?slot=${slot}`,
    });
    await until(() => reports.has(slot), "Modal fixture did not load");
    await click(session, 140, 100);
    await picker(session, "Modal choice").waitFor();
    await until(() => reports.get(slot)?.downs > 0, "Modal lost mousedown");
    assert.equal(reports.get(slot).open, true);
    await picker(session, "Modal choice")
      .getByRole("option", { name: "Second choice", exact: true })
      .click();
    await until(
      () => reports.get(slot)?.changes === 1,
      "Modal selection failed",
    );
    assert.equal(reports.get(slot).open, true);
    assert.equal(reports.get(slot).value, "Second choice");
    await click(session, 140, 100);
    await picker(session, "Modal choice").waitFor();
    await page.keyboard.press("Escape");
    await picker(session, "Modal choice").waitFor({ state: "detached" });
    await wait(200);
    assert.equal(reports.get(slot).open, true);
    assert.equal(reports.get(slot).changes, 1);
    // Actual outside clicks must still dismiss the modal normally.
    await click(session, 360, 400);
    await until(
      () => reports.get(slot)?.open === false,
      "Outside dismissal failed",
    );
  }
  console.log(
    "PASS: phone and desktop modal dropdowns preserve inside-click tracking, selection, cancellation, and outside dismissal",
  );

  for (const session of [phone, desktop]) {
    const slot = `temporal-${session.id}`;
    await request(`/sessions/${session.id}`, "PATCH", {
      url: `${fixtureUrl}/temporal?slot=${slot}`,
    });
    await until(() => reports.has(slot), "Date/time fixture did not load");
    await click(session, 140, 100);
    const calendar = picker(session, "Appointment date");
    await calendar.waitFor();
    assert.equal(
      await calendar
        .getByRole("button", { name: "2026-10-19", exact: true })
        .isDisabled(),
      true,
    );
    await calendar
      .getByRole("button", { name: "2026-10-26", exact: true })
      .click();
    await calendar.getByRole("button", { name: "Apply", exact: true }).click();
    await until(
      () => reports.get(slot)?.date === "2026-10-26",
      "Calendar did not set date",
    );
    assert.equal(reports.get(slot).changes, 1);
    assert.equal(reports.get(slot).inputs, 1);
    assert.equal(reports.get(slot).open, true);
    await click(session, 140, 180);
    const clock = picker(session, "Appointment time");
    await clock.waitFor();
    assert.equal(
      await clock
        .getByRole("button", { name: "Clear", exact: true })
        .isDisabled(),
      true,
    );
    await clock.getByLabel("Appointment time", { exact: true }).fill("07:00");
    await clock.getByRole("button", { name: "Apply", exact: true }).click();
    assert.equal(await clock.isVisible(), true);
    assert.equal(reports.get(slot).time, "09:00");
    await clock.getByLabel("Choose time", { exact: true }).fill("14:30");
    await clock.getByRole("button", { name: "Apply", exact: true }).click();
    await until(
      () => reports.get(slot)?.time === "14:30",
      "Time did not update",
    );
    await click(session, 140, 260);
    const combined = picker(session, "Appointment date and time");
    await combined.waitFor();
    await combined
      .getByRole("button", { name: "2026-10-28", exact: true })
      .click();
    await combined.getByLabel("Choose time", { exact: true }).fill("16:45");
    await combined.getByRole("button", { name: "Apply", exact: true }).click();
    await until(
      () => reports.get(slot)?.combined === "2026-10-28T16:45",
      "Combined date/time did not update",
    );
    await click(session, 140, 420);
    await calendar.waitFor();
    await page.keyboard.press("Escape");
    await calendar.waitFor({ state: "detached" });
    assert.equal(reports.get(slot).date, "2026-10-26");
    assert.equal(reports.get(slot).open, true);
    await click(session, 140, 340);
    await wait(150);
    assert.equal(
      await panel(session).locator(".native-select-sheet").count(),
      0,
    );
    await click(session, 140, 100);
    await calendar.getByRole("button", { name: "Clear", exact: true }).click();
    await until(
      () => reports.get(slot)?.date === "",
      "Optional date did not clear",
    );
    assert.equal(reports.get(slot).changes, 4);
    assert.equal(reports.get(slot).inputs, 4);
    assert.equal(reports.get(slot).open, true);
  }
  console.log(
    "PASS: calendar, time, combined date/time, limits, readonly, clear, showPicker and Escape work in phone/desktop modals",
  );

  await request(`/sessions/${phone.id}`, "PATCH", {
    url: `${fixtureUrl}/temporal?slot=temporal-stale&mutate=1`,
  });
  await until(
    () => reports.has("temporal-stale"),
    "Date mutation fixture did not load",
  );
  await click(phone, 140, 100);
  await picker(phone, "Appointment date").waitFor();
  await wait(500);
  await picker(phone, "Appointment date")
    .getByRole("button", { name: "2026-10-26", exact: true })
    .click();
  await picker(phone, "Appointment date")
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await panel(phone)
    .getByRole("alert")
    .filter({ hasText: "date/time field changed" })
    .waitFor();
  assert.equal(reports.get("temporal-stale").date, "2026-10-23");
  assert.equal(reports.get("temporal-stale").changes, 0);
  console.log(
    "PASS: date/time changes are rejected when the original field changes while its picker is open",
  );

  await request(`/sessions/${phone.id}`, "PATCH", {
    url: `${fixtureUrl}/?slot=stale&mutate=1`,
  });
  await until(() => reports.has("stale"), "Stale-option fixture did not load");
  await click(phone, 140, 80);
  await picker(phone, "Event").waitFor();
  await wait(500);
  await picker(phone, "Event")
    .getByRole("option", { name: "Birthday", exact: true })
    .click();
  await panel(phone)
    .getByRole("alert")
    .filter({ hasText: "dropdown options changed" })
    .waitFor();
  assert.equal(reports.get("stale").eventValue, "a");
  assert.equal(reports.get("stale").changes, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await click(phone, 140, 80);
  await picker(phone, "Event").waitFor();
  await page.screenshot({ path: `${output}/dropdown-mobile.png` });
  const mobilePicker = await picker(phone, "Event").boundingBox();
  assert.ok(mobilePicker.y >= 0 && mobilePicker.y + mobilePicker.height <= 844);
  assert.ok(mobilePicker.x >= 0 && mobilePicker.x + mobilePicker.width <= 390);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: stale options are rejected safely and the picker fits a mobile workspace",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 10000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await new Promise((resolve) => fixture.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
