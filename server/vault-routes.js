import { Router } from "express";
import { CredentialVault, VaultError } from "./vault.js";
import { fillCredential } from "./credential-fill.js";

export function vaultRoutes({ dataDir, runtimes, report }) {
  const vault = new CredentialVault(`${dataDir}/vault.json`);
  const router = Router();
  const token = (req) =>
    /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get("authorization") || "")?.[1];
  router.get("/vault/status", (_req, res) =>
    res.json({ configured: vault.configured, idleMinutes: 15 }),
  );
  router.post("/vault/setup", async (req, res) =>
    res.status(201).json(await vault.open(req.body?.password, true)),
  );
  router.post("/vault/unlock", async (req, res) =>
    res.json(await vault.open(req.body?.password)),
  );
  router.post("/vault/lock", (req, res) => {
    vault.list(token(req));
    vault.lock(token(req));
    res.status(204).end();
  });
  router.get("/vault/entries", (req, res) =>
    res.json({ entries: vault.list(token(req)) }),
  );
  router.post("/vault/entries", (req, res) =>
    res.status(201).json(vault.save(token(req), req.body)),
  );
  router.patch("/vault/entries/:id", (req, res) =>
    res.json(vault.save(token(req), req.body, req.params.id)),
  );
  router.delete("/vault/entries/:id", (req, res) => {
    vault.delete(token(req), req.params.id);
    res.status(204).end();
  });
  router.post(
    "/sessions/:id/credentials/:credentialId/fill",
    async (req, res) => {
      vault.get(token(req), req.params.credentialId);
      if (
        typeof req.body?.submit !== "boolean" ||
        typeof req.body?.navigate !== "boolean"
      )
        throw new VaultError(
          "Choose whether to open the page and submit the login.",
        );
      const rt = runtimes.get(req.params.id);
      if (!rt || rt.closing)
        throw new VaultError(
          "Connect to this session before using quick login.",
          409,
        );
      const action = rt.queue.then(async () => {
        if (rt.closing || rt.page.isClosed())
          throw new VaultError("This session has closed.", 409);
        const entry = vault.get(token(req), req.params.credentialId);
        rt.loading = true;
        report(rt);
        try {
          if (req.body.navigate) {
            try {
              await rt.page.goto(entry.url, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
              });
            } catch {
              throw new VaultError(
                "Could not open the saved login page. Check the URL and try again.",
                409,
              );
            }
          }
          // Re-authorize after navigation in case the user locked the vault while waiting.
          vault.get(token(req), entry.id);
          return await fillCredential(rt.page, entry, {
            submit: req.body.submit,
            authorize: () => vault.get(token(req), entry.id),
          });
        } finally {
          rt.loading = false;
          report(rt);
        }
      });
      rt.queue = action.catch(() => {});
      res.json(await action);
    },
  );
  router.use((error, _req, res, _next) => {
    const expected = error instanceof VaultError;
    res.status(expected ? error.status : 400).json({
      error: expected
        ? error.message
        : "The vault operation failed. Check your input and try again.",
    });
  });
  return { router, vault };
}
