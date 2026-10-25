import { VaultError } from "./vault.js";

const usernameAuto =
  'input[autocomplete="username"], input[type="email"], input[autocomplete="email"], input[name*="email" i], input[name*="username" i], input[id*="email" i], input[id*="username" i], input[name="login" i]';
const passwordAuto =
  'input[autocomplete="current-password"], input[type="password"]:not([autocomplete="new-password"])';
const visibleInput = (selector) =>
  `:is(${selector}):visible:not([disabled]):not([readonly]):not([type="hidden"])`;

// Check the origin inside the same browser execution that writes the value. A
// redirect between discovery and filling cannot leak a credential to another site.
async function put(locator, value, origin) {
  return locator.evaluate(
    (element, data) => {
      if (
        element.ownerDocument.location.origin !== data.origin ||
        !(element instanceof HTMLInputElement) ||
        element.type === "hidden" ||
        element.disabled ||
        element.readOnly ||
        !element.getClientRects().length
      )
        throw new Error(
          "Credential field is no longer available on the saved website.",
        );
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(element, data.value);
      element.dispatchEvent(
        new Event("input", { bubbles: true, composed: true }),
      );
      element.dispatchEvent(
        new Event("change", { bubbles: true, composed: true }),
      );
    },
    { value, origin },
  );
}

export async function fillCredential(
  page,
  entry,
  { submit = false, authorize = () => {} } = {},
) {
  if (new URL(page.url()).origin !== entry.origin)
    throw new VaultError(
      "Open the saved login page first. Credentials can only be filled on their exact saved origin.",
      409,
    );
  // Wait briefly for client-rendered login forms, considering only same-origin frames.
  const deadline = Date.now() + 5000;
  let fields;
  while (!fields && Date.now() < deadline) {
    authorize();
    let usernameOnly;
    for (const frame of page.frames()) {
      if (new URL(frame.url() || "about:blank").origin !== entry.origin)
        continue;
      try {
        const password = frame
          .locator(visibleInput(entry.passwordSelector || passwordAuto))
          .first();
        const scope = (await password.count())
          ? password.locator("xpath=ancestor::form[1]")
          : null;
        const root = scope && (await scope.count()) ? scope : frame;
        let username = root
          .locator(visibleInput(entry.usernameSelector || usernameAuto))
          .first();
        if (!(await username.count()) && !entry.usernameSelector)
          username = root
            .locator(
              'input[type="text"]:visible:not([disabled]):not([readonly]):not([autocomplete="one-time-code"])',
            )
            .first();
        if (await password.count()) {
          fields = { username, password, root };
          break;
        }
        if (await username.count()) usernameOnly = { username, password, root };
      } catch {
        throw new VaultError(
          "Check the CSS selectors in this credential’s advanced settings.",
        );
      }
    }
    fields ||= usernameOnly;
    if (!fields) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!fields)
    throw new VaultError(
      "No visible login fields found. Open the login form or set custom CSS selectors in the vault.",
      409,
    );
  let hasPassword = false;
  authorize();
  try {
    if (await fields.username.count()) {
      await put(fields.username, entry.username, entry.origin);
    }
    if (await fields.password.count()) {
      await put(fields.password, entry.password, entry.origin);
      hasPassword = true;
    }
  } catch {
    throw new VaultError(
      "The login form changed while filling. Check the saved website and try again.",
      409,
    );
  }
  if (submit && hasPassword) {
    authorize();
    let button;
    try {
      button = entry.submitSelector
        ? fields.root
            .locator(entry.submitSelector)
            .filter({ visible: true })
            .first()
        : fields.root
            .locator(
              'button[type="submit"]:visible, input[type="submit"]:visible',
            )
            .first();
      if (!(await button.count()))
        button = fields.root
          .getByRole("button", {
            name: /^(sign in|log in|login|continue|submit)\b/i,
          })
          .first();
      if (!(await button.count()))
        if (!entry.submitSelector) {
          const defaults = fields.root.locator("button:not([type]):visible");
          if ((await defaults.count()) === 1) button = defaults.first();
        }
      if (!(await button.count()))
        return {
          submitted: false,
          message:
            "Credentials filled. Click your website’s sign-in button to continue.",
        };
      if (new URL(page.url()).origin !== entry.origin) throw new Error();
      await button.click({ timeout: 5000 });
      return {
        submitted: true,
        message: "Credentials filled and sign-in submitted.",
      };
    } catch {
      throw new VaultError(
        "Credentials filled, but the sign-in button could not be clicked. Submit the form manually.",
        409,
      );
    }
  }
  return {
    submitted: false,
    message: hasPassword
      ? "Credentials filled. Ready to sign in."
      : "Username filled. Continue to the password step, then use quick login again.",
  };
}
