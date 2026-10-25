import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
} from "node:crypto";
import { readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { promisify } from "node:util";
import { normalizeUrl } from "./config.js";

const derive = promisify(scrypt);
const AAD = Buffer.from("multiS-vault:v1:aes-256-gcm:scrypt-32768-8-1");
const IDLE_MS = 15 * 60 * 1000;
export class VaultError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const digest = (token) => createHash("sha256").update(token).digest("hex");
const publicEntry = ({ password, ...entry }) => entry;

export class CredentialVault {
  #path;
  #envelope;
  #key;
  #entries = [];
  #tokens = new Map();
  #lastUsed = 0;
  #busy = false;
  #epoch = 0;
  #clock;
  #timer;
  constructor(file, { clock = Date.now } = {}) {
    this.#path = file;
    this.#clock = clock;
    try {
      this.#envelope = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT")
        throw new Error(
          "Cannot read the credential vault. Preserve the file and check its contents or permissions.",
        );
    }
    this.#timer = setInterval(() => this.#expire(), 30_000);
    this.#timer.unref();
  }
  get configured() {
    return Boolean(this.#envelope);
  }
  #expire() {
    if (this.#key && this.#clock() - this.#lastUsed >= IDLE_MS) this.lock();
  }
  #authorize(token) {
    this.#expire();
    if (
      typeof token !== "string" ||
      token.length > 256 ||
      !this.#key ||
      !this.#tokens.has(digest(token))
    )
      throw new VaultError("Unlock the credential vault to continue.", 401);
    const hash = digest(token);
    if (this.#clock() - this.#tokens.get(hash) >= IDLE_MS) {
      this.#tokens.delete(hash);
      throw new VaultError(
        "Your vault unlock has expired. Unlock it again.",
        401,
      );
    }
    this.#lastUsed = this.#clock();
    this.#tokens.set(hash, this.#lastUsed);
  }
  #issue() {
    const token = randomBytes(32).toString("base64url");
    if (this.#tokens.size >= 16)
      this.#tokens.delete(this.#tokens.keys().next().value);
    this.#lastUsed = this.#clock();
    this.#tokens.set(digest(token), this.#lastUsed);
    return { token, idleMinutes: 15, entries: this.#entries.map(publicEntry) };
  }
  #write(entries, key = this.#key, salt = this.#envelope.salt) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(AAD);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(entries), "utf8"),
      cipher.final(),
    ]);
    const envelope = {
      version: 1,
      salt,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    writeFileSync(`${this.#path}.tmp`, JSON.stringify(envelope), {
      mode: 0o600,
    });
    chmodSync(`${this.#path}.tmp`, 0o600);
    renameSync(`${this.#path}.tmp`, this.#path);
    this.#envelope = envelope;
    this.#entries = entries;
  }
  async open(password, setup = false) {
    if (this.#busy)
      throw new VaultError(
        "Another unlock is in progress. Try again in a moment.",
        429,
      );
    if (setup && this.configured)
      throw new VaultError(
        "The vault is already configured. Unlock it with your master password.",
        409,
      );
    if (!setup && !this.configured)
      throw new VaultError("Create your vault first.", 409);
    if (
      typeof password !== "string" ||
      password.length > 1024 ||
      (setup && password.length < 12) ||
      !password.length
    )
      throw new VaultError(
        "Use a master password with at least 12 characters.",
      );
    this.#busy = true;
    const epoch = this.#epoch;
    let key;
    try {
      const salt = setup
        ? randomBytes(16).toString("base64")
        : this.#envelope.salt;
      key = await derive(password, Buffer.from(salt, "base64"), 32, {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      });
      let entries = [];
      if (!setup) {
        try {
          if (this.#envelope.version !== 1) throw new Error();
          const decipher = createDecipheriv(
            "aes-256-gcm",
            key,
            Buffer.from(this.#envelope.iv, "base64"),
          );
          decipher.setAAD(AAD);
          decipher.setAuthTag(Buffer.from(this.#envelope.tag, "base64"));
          entries = JSON.parse(
            Buffer.concat([
              decipher.update(Buffer.from(this.#envelope.data, "base64")),
              decipher.final(),
            ]).toString("utf8"),
          );
          if (!Array.isArray(entries)) throw new Error();
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 750));
          throw new VaultError(
            "Incorrect master password or damaged vault file.",
            401,
          );
        }
      }
      if (epoch !== this.#epoch)
        throw new VaultError(
          "The vault was locked. Try unlocking it again.",
          401,
        );
      if (setup) this.#write([], key, salt);
      this.#key?.fill(0);
      this.#key = key;
      key = null;
      this.#entries = entries;
      return this.#issue();
    } finally {
      key?.fill(0);
      this.#busy = false;
    }
  }
  list(token) {
    this.#authorize(token);
    return this.#entries.map(publicEntry);
  }
  get(token, id) {
    this.#authorize(token);
    const entry = this.#entries.find((item) => item.id === id);
    if (!entry) throw new VaultError("Credential not found.", 404);
    return { ...entry };
  }
  save(token, input, id) {
    this.#authorize(token);
    const previous = id ? this.get(token, id) : null;
    const text = (name, max, fallback = "") => {
      const value = input[name] ?? previous?.[name] ?? fallback;
      if (typeof value !== "string" || value.length > max)
        throw new VaultError(`Invalid ${name}.`);
      return value.trim();
    };
    const label = text("label", 80);
    const username = text("username", 320);
    const url = normalizeUrl(input.url ?? previous?.url);
    const password =
      input.password === undefined || (previous && input.password === "")
        ? previous?.password
        : input.password;
    if (
      !label ||
      !username ||
      typeof password !== "string" ||
      !password ||
      password.length > 4096
    )
      throw new VaultError(
        "Enter a label, username/email, login URL, and password.",
      );
    if (!id && this.#entries.length >= 200)
      throw new VaultError("The vault supports up to 200 credentials.");
    const entry = {
      id: id || randomUUID(),
      label,
      username,
      password,
      url,
      origin: new URL(url).origin,
      usernameSelector: text("usernameSelector", 256),
      passwordSelector: text("passwordSelector", 256),
      submitSelector: text("submitSelector", 256),
      updatedAt: new Date(this.#clock()).toISOString(),
    };
    const entries = previous
      ? this.#entries.map((item) => (item.id === id ? entry : item))
      : [...this.#entries, entry];
    this.#write(entries);
    return publicEntry(entry);
  }
  delete(token, id) {
    this.get(token, id);
    this.#write(this.#entries.filter((entry) => entry.id !== id));
  }
  lock(token) {
    if (token !== undefined) this.#authorize(token);
    this.#epoch++;
    this.#key?.fill(0);
    this.#key = undefined;
    this.#entries = [];
    this.#tokens.clear();
  }
  dispose() {
    clearInterval(this.#timer);
    this.lock();
  }
}
