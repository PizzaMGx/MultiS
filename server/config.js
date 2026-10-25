export const COLORS = [
  "#baf279",
  "#bca4ff",
  "#78c9f5",
  "#ffbe7b",
  "#f58fbc",
  "#73d9c1",
];
export const MAX_SESSIONS = 8;

export function normalizeUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    throw new Error("Enter a website URL.");
  const raw = value.trim();
  const url = new URL(
    /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP or HTTPS URL without embedded credentials.");
  return url.href;
}

export function validateSession(input, previous = {}) {
  const width = Number(input.width ?? previous.width ?? 390);
  const height = Number(input.height ?? previous.height ?? 844);
  if (
    !Number.isInteger(width) ||
    width < 240 ||
    width > 2560 ||
    !Number.isInteger(height) ||
    height < 240 ||
    height > 2560
  ) {
    throw new Error(
      "Width and height must be whole numbers between 240 and 2560.",
    );
  }
  const name = String(input.name ?? previous.name ?? "New session").trim();
  if (!name || name.length > 48)
    throw new Error("Give the session a name with 1–48 characters.");
  const isMobile = input.isMobile ?? previous.isMobile ?? true;
  if (typeof isMobile !== "boolean")
    throw new Error("Mobile mode must be true or false.");
  const color = input.color ?? previous.color ?? COLORS[0];
  if (!COLORS.includes(color))
    throw new Error("Choose one of the session colors.");
  return {
    name,
    width,
    height,
    isMobile,
    color,
    url: normalizeUrl(
      input.url ?? previous.url ?? "http://127.0.0.1:3000/demo",
    ),
  };
}
