import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(root + sep)) throw new Error("Invalid path");
    // Normalize first so case changes and /./ segments cannot expose dev files on the LAN.
    const localPath = relative(root, filePath).replaceAll("\\", "/").toLowerCase();
    if (localPath.startsWith("dev/") && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) {
      throw new Error("Developer page is restricted to loopback");
    }
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": types[extname(filePath)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

function isPrivateIPv4(address) {
  return address.startsWith("10.") || address.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

const lanAddresses = Object.values(networkInterfaces()).flat()
  .filter((item) => item && item.family === "IPv4" && !item.internal && isPrivateIPv4(item.address))
  .map((item) => item.address);

const preferredPort = 8000;
const openPath = process.argv.includes("--open-dev-stage3") ? "/dev/stage3.html"
  : process.argv.includes("--open-dev") ? "/dev/stage2.html"
  : process.argv.includes("--open") ? "/index.html?new=1" : null;
let attemptedPort = preferredPort;

function openBrowser(url) {
  if (process.platform !== "win32" || !url) return;
  const browser = spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true });
  browser.unref();
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && attemptedPort === preferredPort) {
    attemptedPort = preferredPort + 1;
    console.log(`端口 ${preferredPort} 已被占用，改用端口 ${attemptedPort}。`);
    server.listen(attemptedPort, "0.0.0.0");
    return;
  }
  if (error.code === "EADDRINUSE" && attemptedPort === preferredPort + 1) {
    attemptedPort = 0;
    console.log(`端口 ${preferredPort + 1} 也已被占用，正在寻找空闲端口。`);
    server.listen(0, "0.0.0.0");
    return;
  }
  console.error("无法启动游戏服务器：", error.message);
  process.exitCode = 1;
});

server.on("listening", () => {
  const port = server.address().port;
  const localUrl = `http://127.0.0.1:${port}`;
  console.log(`Prototype ready at ${localUrl}`);
  if (lanAddresses.length) {
    console.log("Phone on the same Wi-Fi:");
    for (const address of lanAddresses) console.log(`  http://${address}:${port}`);
  } else {
    console.log("No private LAN IPv4 address found. Connect to Wi-Fi and restart the server.");
  }
  console.log("Press Ctrl+C to stop the server.");
  if (openPath) openBrowser(`${localUrl}${openPath}`);
});

server.listen(preferredPort, "0.0.0.0");
