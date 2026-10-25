import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, validateSession, COLORS } from "../server/config.js";

test("normalizes local targets and preserves HTTPS", () => {
  assert.equal(
    normalizeUrl("host.docker.internal:5173/login"),
    "http://host.docker.internal:5173/login",
  );
  assert.equal(normalizeUrl(" https://example.com "), "https://example.com/");
  assert.equal(normalizeUrl("localhost:8080"), "http://localhost:8080/");
});
test("rejects unsafe URL schemes and credentials", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:secret@example.com",
    "",
    "javascript:alert(1)",
  ])
    assert.throws(() => normalizeUrl(url));
});
test("validates viewport dimensions and session settings", () => {
  const previous = validateSession({
    name: "Alex",
    width: 390,
    height: 844,
    isMobile: true,
  });
  assert.deepEqual(
    validateSession(
      { width: "1440", height: "900", isMobile: false },
      previous,
    ),
    { ...previous, width: 1440, height: 900, isMobile: false },
  );
  for (const input of [
    { width: 0 },
    { width: 3000 },
    { height: 1.5 },
    { width: "bad" },
    { name: " " },
    { isMobile: "false" },
    { color: "red" },
  ])
    assert.throws(() => validateSession(input, previous));
  assert.equal(
    validateSession({ name: "Sam", color: COLORS[1] }).color,
    COLORS[1],
  );
});
