/**
 * Minimal port-43 WHOIS TCP client. No external deps — uses node:net only.
 *
 * Vercel's Node.js runtime allows outbound TCP, so this works on serverless.
 * Edge runtime does NOT — routes that call this must `export const runtime = "nodejs"`.
 */

import net from "node:net";

export interface WhoisQueryOptions {
  server: string;
  query: string;
  /** Total budget for connect + write + read. Default 4000ms. */
  timeoutMs?: number;
  /** WHOIS uses port 43 by convention. Some registries support 4343 too. */
  port?: number;
}

/**
 * Connects to a WHOIS server, sends the query, and returns the full response.
 * Resolves with whatever bytes the server sent before closing. Rejects on
 * timeout or socket error.
 */
export function whoisQuery({
  server,
  query,
  timeoutMs = 4000,
  port = 43,
}: WhoisQueryOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const socket = net.createConnection({ host: server, port });
    socket.setNoDelay(true);

    const finish = (err: Error | null, data?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(data ?? "");
    };

    const timer = setTimeout(() => {
      finish(new Error(`whois timeout after ${timeoutMs}ms (${server})`));
    }, timeoutMs);

    socket.on("connect", () => {
      // Standard WHOIS protocol: write query + CRLF, then wait for the
      // server to send its response and FIN. We do NOT half-close — some
      // servers (whois.nic.sh) interpret early FIN as a client abort and
      // hang up without responding.
      socket.write(`${query}\r\n`);
    });

    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // Use `close` (always fires) rather than `end` (depends on clean FIN).
    // Some servers half-close their side without sending FIN cleanly — by
    // resolving on `close` we capture all data regardless.
    socket.on("close", () => {
      finish(null, Buffer.concat(chunks).toString("utf8"));
    });

    socket.on("error", (err) => {
      finish(err);
    });
  });
}
