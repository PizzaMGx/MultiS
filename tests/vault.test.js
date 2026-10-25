import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CredentialVault } from "../server/vault.js";

const master = "a test master password, never a user secret";
const credential = {
  label: "QA admin",
  url: "http://localhost:5173/login",
  username: "qa@example.test",
  password: "synthetic-password-for-tests",
};
function fixture(t, options) {
  const dir = mkdtempSync(path.join(tmpdir(), "multis-vault-unit-"));
  const file = path.join(dir, "vault.json");
  const vault = new CredentialVault(file, options);
  t.after(() => {
    vault.dispose();
    rmSync(dir, { recursive: true, force: true });
  });
  return { vault, file };
}
test("encrypts all credential fields on disk and never returns passwords in metadata", async (t) => {
  const { vault, file } = fixture(t);
  const { token } = await vault.open(master, true);
  const saved = vault.save(token, credential);
  assert.ok(!("password" in saved));
  assert.ok(!("password" in vault.list(token)[0]));
  assert.equal(vault.get(token, saved.id).password, credential.password);
  const content = readFileSync(file, "utf8");
  for (const secret of [
    master,
    credential.label,
    credential.username,
    credential.password,
    credential.url,
  ])
    assert.ok(!content.includes(secret));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  vault.save(token, { ...credential, id: undefined }, saved.id);
  assert.notEqual(readFileSync(file, "utf8"), content);
});
test("requires a token, rejects invalid locks and revokes all tokens when locked", async (t) => {
  const { vault } = fixture(t);
  const first = await vault.open(master, true);
  const second = await vault.open(master);
  assert.throws(() => vault.list(), { status: 401 });
  assert.throws(() => vault.save("bad", credential), { status: 401 });
  assert.throws(() => vault.lock("bad"), { status: 401 });
  assert.deepEqual(vault.list(first.token), []);
  vault.lock(second.token);
  assert.throws(() => vault.list(first.token), { status: 401 });
  assert.throws(() => vault.list(second.token), { status: 401 });
});
test("preserves credentials through restart, rejects wrong passwords and prevents replacing an existing vault", async (t) => {
  const { vault, file } = fixture(t);
  const { token } = await vault.open(master, true);
  const entry = vault.save(token, credential);
  vault.dispose();
  const restored = new CredentialVault(file);
  t.after(() => restored.dispose());
  assert.equal(restored.configured, true);
  assert.throws(() => restored.get(token, entry.id), { status: 401 });
  await assert.rejects(restored.open("wrong master password"), { status: 401 });
  await assert.rejects(restored.open("a different master password", true), {
    status: 409,
  });
  const reopened = await restored.open(master);
  assert.equal(
    restored.get(reopened.token, entry.id).password,
    credential.password,
  );
});
test("keeps the old password on edit, validates entries, and deletes saved accounts", async (t) => {
  const { vault } = fixture(t);
  const { token } = await vault.open(master, true);
  const saved = vault.save(token, credential);
  vault.save(token, { label: "Renamed admin", password: "" }, saved.id);
  assert.equal(vault.get(token, saved.id).password, credential.password);
  vault.save(token, { password: "changed-test-password" }, saved.id);
  assert.equal(vault.get(token, saved.id).password, "changed-test-password");
  assert.throws(() =>
    vault.save(token, { ...credential, url: "file:///etc/passwd" }),
  );
  assert.throws(() => vault.save(token, { ...credential, label: "" }));
  assert.throws(() => vault.save(token, { ...credential, password: "" }));
  vault.delete(token, saved.id);
  assert.deepEqual(vault.list(token), []);
  assert.throws(() => vault.get(token, saved.id), { status: 404 });
});
test("locks after 15 minutes of vault inactivity and expires individual unlock tokens", async (t) => {
  let now = 1000;
  const { vault } = fixture(t, { clock: () => now });
  const first = await vault.open(master, true);
  now += 14 * 60 * 1000;
  const second = await vault.open(master);
  now += 2 * 60 * 1000;
  assert.throws(() => vault.list(first.token), { status: 401 });
  assert.deepEqual(vault.list(second.token), []);
  now += 15 * 60 * 1000;
  assert.throws(() => vault.list(second.token), { status: 401 });
});
test("detects ciphertext tampering without overwriting the damaged file", async (t) => {
  const { vault, file } = fixture(t);
  const { token } = await vault.open(master, true);
  vault.save(token, credential);
  vault.dispose();
  const envelope = JSON.parse(readFileSync(file, "utf8"));
  const bytes = Buffer.from(envelope.data, "base64");
  bytes[0] ^= 1;
  envelope.data = bytes.toString("base64");
  writeFileSync(file, JSON.stringify(envelope));
  const tampered = readFileSync(file, "utf8");
  const restored = new CredentialVault(file);
  t.after(() => restored.dispose());
  await assert.rejects(restored.open(master), { status: 401 });
  assert.equal(readFileSync(file, "utf8"), tampered);
});
