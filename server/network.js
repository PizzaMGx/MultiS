import { lookup } from "node:dns/promises";

// Preserve the URL, origin, Host header and WebSocket URLs while routing localhost
// to Docker's host. Internal pages use 127.0.0.1 and remain container-local.
export async function browserNetworkArgs(
  host = process.env.BROWSER_LOCALHOST_HOST,
) {
  if (!host) return [];
  const { address } = await lookup(host, { family: 4 });
  return [
    `--host-resolver-rules=MAP localhost ${address}, MAP *.localhost ${address}`,
  ];
}
