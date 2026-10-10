#!/data/data/com.termux/files/usr/bin/node

import http from "node:http";
import net from "node:net";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.CODEX_DNS_PROXY_PORT || "5903", 10);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("invalid CODEX_DNS_PROXY_PORT");
}

const server = http.createServer((_request, response) => {
  response.writeHead(405, { Connection: "close" });
  response.end("CONNECT only\n");
});

server.on("connect", (request, clientSocket, head) => {
  const separator = request.url.lastIndexOf(":");
  const destinationHost = separator > 0 ? request.url.slice(0, separator) : "";
  const destinationPort = Number.parseInt(request.url.slice(separator + 1), 10);

  if (!destinationHost || destinationPort !== 443) {
    clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }

  const upstream = net.connect({ host: destinationHost, port: destinationPort });
  upstream.setTimeout(30_000);

  upstream.once("connect", () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  const closeBoth = () => {
    upstream.destroy();
    clientSocket.destroy();
  };
  upstream.once("error", closeBoth);
  upstream.once("timeout", closeBoth);
  clientSocket.once("error", closeBoth);
});

server.listen(port, host, () => {
  process.stdout.write(`CODEX_DNS_PROXY_READY ${host}:${port}\n`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
