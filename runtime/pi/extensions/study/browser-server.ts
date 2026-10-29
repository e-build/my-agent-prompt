import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

const MAX_PAYLOAD = 5 * 1024 * 1024;
export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

/** Lazy loopback transport. Study routes own the application protocol. */
export function createBrowserServer(
  handleRequest: RequestHandler,
  onStarted: (port: number) => void = () => {},
) {
  let server: Server | null = null;
  let port: number | null = null;

  function start(): Promise<number> {
    if (server && port) return Promise.resolve(port);
    return new Promise((resolve, reject) => {
      const srv = createServer((req, res) => {
        handleRequest(req, res).catch((error: unknown) => {
          sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        });
      });
      srv.on("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        const address = srv.address();
        if (address && typeof address === "object") {
          server = srv;
          port = address.port;
          onStarted(port);
          resolve(port);
        } else {
          reject(new Error("Failed to bind diagnosis server"));
        }
      });
    });
  }

  async function close(): Promise<void> {
    const current = server;
    server = null;
    port = null;
    if (current) await new Promise<void>((resolve) => current.close(() => resolve()));
  }

  return {
    start,
    close,
    get port() {
      return port;
    },
  };
}

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(),
  });
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_PAYLOAD) reject(new Error("payload too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
