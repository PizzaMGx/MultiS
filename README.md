# multiS

**Test one website as several users, all on one screen.**

multiS is a local workspace with up to eight independent Chromium sessions. Open your app once, sign in as a different user in each panel, and watch how their experiences interact—without switching profiles or juggling browser windows.

Use it to compare customer and admin views, test permissions, try a multi-user workflow, or inspect phone, tablet, and desktop layouts together.

## Quick start

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine with the Compose plugin, then run:

```sh
git clone https://github.com/PizzaMGx/MultiS.git
cd MultiS
docker compose up --build -d
```

Open **[localhost:3000](http://localhost:3000)**.

Three sessions start with the included Orbit demo. Click **Sign in** inside each panel and enter different names and emails. No real account is needed.

To use a different port:

```sh
PORT=3100 docker compose up --build -d
```

In PowerShell, set `$env:PORT=3100` before running Compose.

## Test your app in a minute

1. Enter your website URL in the address bar above the sessions.
2. Click **Open in all** to load it in every session.
3. Click inside a panel and sign in as a test user. Repeat with a different user in another panel.
4. Use each session independently: clicks, typing, scrolling, navigation, and logins stay separate.
5. Add more sessions or change their device sizes as needed.

### Find the right control

| What you want to do | Where to go |
| --- | --- |
| Add another user | **New session** or **Add session** in the sidebar |
| Change a session’s name, URL, size, or mobile mode | Settings icon above that session |
| Start another session with the same settings and a fresh login | Duplicate icon above the session |
| Show more of the sessions | **Collapse top** beside Zoom; **Show top** restores the header. On mobile, use the chevron. |
| Hide the session sidebar | Collapse icon at the top of the sidebar |
| Change preview size | **Zoom → Fit to screen** or a percentage |
| Arrange panels | Side-by-side or wrapped layout icons beside Zoom |
| Focus on one session | Fullscreen icon above the session; press **Esc** to return |
| Capture a page | Camera icon in the session controls |
| Fill a saved test account | Key icon above the session |
| Remove a session and its saved browser data | **×** above the session, then confirm |

Collapsing the top keeps the shared address bar and session controls available. A **+** button beside the collapse control lets you create sessions while the top is hidden.

**Zoom changes the preview, not the website’s viewport.** Change actual viewport dimensions in session settings. If panels cannot fit side by side, scroll horizontally or select wrapped layout.

## Test a website running on your computer

Use your usual local URL, such as **`http://localhost:5173`**.

With Docker Compose, multiS routes `localhost` and `*.localhost` inside session browsers to your computer. The website’s URL, origin, Host header, and WebSocket addresses stay intact.

Your development server must accept connections from Docker. For Vite:

```sh
npm run dev -- --host 0.0.0.0
```

- Use **`localhost`** to reach your computer. Literal `127.0.0.1` and `::1` still point to the multiS container.
- For an app in another Docker stack, publish its port on the host and use `http://localhost:PORT`, or join the same Docker network and use its service name.
- For OAuth, use a callback hostname that resolves from the container and is allowed by the identity provider.

The mapping uses `BROWSER_LOCALHOST_HOST=host.docker.internal` in `compose.yaml`. When multiS runs directly on your computer without this variable, localhost behaves normally.

## Save test accounts in the vault

1. Open **Vault** in the top bar.
2. Create a master password of at least 12 characters. Keep it safe: it cannot be recovered.
3. Choose **Add credential** and save the account label, login page URL, username/email, and password.
4. Click a session’s **key icon**, select the account, and choose **Fill** or **Sign in**.

**Fill** populates the form so you can submit it yourself. **Sign in** also clicks the submit button. The browser opens the saved login page first when needed. Optional CSS selectors support unusual forms.

Credentials fill only on the exact saved origin: scheme, hostname, and port. For multi-step forms, fill the username, continue manually, then fill again at the password step. MFA, CAPTCHA, passkeys, and OAuth provider steps still need manual interaction.

The vault is encrypted on disk with AES-256-GCM and a key derived from your master password using scrypt. It locks after 15 minutes without vault activity; refreshing requires unlocking again. **Lock vault** revokes active vault tokens immediately. It does not sign out websites.

Deleting a session keeps shared vault entries. Deleting a credential keeps existing website logins. To recover the vault on another machine, retain both the data volume and master password.

## What is saved?

Docker stores session settings, Chromium profiles, downloads, and the encrypted vault in the `playground-data` named volume, mounted at `/app/data`.

| Action | Result |
| --- | --- |
| Refresh the workspace | Sessions remain; unlock the vault again if needed |
| Stop or recreate the container | Saved profiles and vault remain in the volume |
| Duplicate a session | Copies settings and the current URL; starts with a fresh profile |
| Delete a session | Permanently removes its profile and downloads |
| Run `docker compose down -v` | **Permanently deletes all saved sessions, logins, and vault entries** |

Cookies follow the website’s expiration rules. Session cookies and sessionStorage may expire when Chromium restarts. Changing mobile emulation restarts that session’s browser with its existing profile.

## Run, update, and troubleshoot

```sh
# Start or rebuild after pulling changes
docker compose up --build -d

# View logs
docker compose logs -f

# Stop while keeping saved data
docker compose stop

# Remove the container while keeping saved data
docker compose down
```

To update an existing installation:

```sh
git pull
docker compose up --build -d
```

Refresh the browser after updating. Source changes require a rebuild when using Docker.

| Problem | Try this |
| --- | --- |
| Port 3000 is already in use | Set `PORT` to a free port before starting Compose |
| Your local website will not load | Use `localhost`, verify the port, and bind your dev server to `0.0.0.0` |
| A Vite app rejects `host.docker.internal` | Use `localhost` instead, or explicitly allow that hostname in your app |
| Sessions feel slow | Close unused sessions or reduce their viewport dimensions |
| A new UI change is missing | Rebuild the container, then refresh the page |

## Supported behavior and limits

- Up to eight isolated Chromium sessions with separate cookies, localStorage, IndexedDB, cache, and authentication.
- Phone, tablet, and desktop presets, plus custom dimensions from 240 to 2560 CSS pixels.
- Keyboard input, paste into a page, scrolling, navigation, popup/tab switching, JavaScript dialogs, PNG screenshots, and download links.
- Native select menus and date/time inputs appear in pickers inside the session panel. Website-rendered custom controls retain their own behavior.
- Fullscreen fits the configured viewport to the screen. If native fullscreen is unavailable, the session expands within the page.

Mobile mode uses **Chromium emulation**, including a generic Android mobile user agent. An iPhone-sized viewport does not run Safari or iOS. Physical multi-touch, audio/video streaming, file uploads, clipboard copy out of remote pages, browser extensions, native permission prompts, passkeys, and DevTools are outside this version. Some identity providers and anti-bot systems may reject headless Chromium.

**Keep multiS local.** Compose binds the published port to `127.0.0.1`. The workspace has no multi-user authentication: anyone who can reach it can operate its saved sessions and access services reachable from the container. Same-origin protections on API writes and WebSocket connections do not replace access control.

## Development

Use **Node.js 22+**. Vite also supports Node.js 20.19+.

```sh
npm ci
npx playwright install --with-deps chromium
npm run build
npm start
```

Open [localhost:3000](http://localhost:3000). Without Docker, saved data lives in `./data` by default. Set `DATA_DIR` to change that directory and `PORT` to change the backend port.

For frontend hot reload, keep the backend running on port 3000 and run `npm run dev` in another terminal. Vite proxies `/api`, `/demo`, and `/ws` to the backend. Use the built production app when testing origin restrictions.

### Tests

```sh
npm test

# With the Compose app running:
docker compose exec playground node tests/browser.integration.js
docker compose exec playground node tests/vault.integration.js
docker compose exec playground node tests/native-select.integration.js
```

Unit tests cover URL/session validation and vault encryption and lifecycle behavior. The browser integration suite uses the running app and temporarily creates and deletes test sessions; run it with at most six existing sessions. It covers streaming, input, settings, screenshots, profile isolation, persistence, and responsive layout.

The vault and native-select integration suites start disposable workspaces. They exercise synthetic accounts, credential filling, origin checks, locking, dropdowns, date/time inputs, keyboard behavior, iframes, fullscreen, and stale selections. Integration screenshots are written under `/tmp/multis-results`, `/tmp/multis-vault-results`, and `/tmp/multis-select-results` inside the container.

### Project layout

```text
src/          React workspace, session controls, and credential vault UI
server/       Express API, WebSocket streaming, Chromium sessions, and vault
tests/        Unit tests and browser integration suites
compose.yaml  Local Docker setup with persistent storage
Dockerfile    Production build using the Playwright runtime image
```

React and Vite render the workspace. Express manages a persistent Playwright Chromium context for each session. Chromium screencast frames reach the UI over WebSocket, and user input travels back to the session browser. Target websites do not need iframe support or changes to their framing policies.
