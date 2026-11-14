import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { buildHomepage } from "./build.mjs";
import { legacyLanguageURL } from "../../website/routes.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
let port = 4317;
let pageDirectory = path.join(repositoryRoot, "dist/homepage");
let suppliedDirectory = false;

for (let index = 2; index < process.argv.length; index += 1) {
  const option = process.argv[index];
  const value = process.argv[index + 1];
  if (option === "--port" && value && /^\d+$/.test(value)) {
    port = Number(value);
    if (port < 1 || port > 65535)
      throw new Error("--port must be between 1 and 65535");
  } else if (option === "--dir" && value && !value.startsWith("--")) {
    pageDirectory = path.resolve(repositoryRoot, value);
    suppliedDirectory = true;
  } else {
    throw new Error(
      "Usage: npm run homepage:dev -- [--port 4317] [--dir dist/homepage]",
    );
  }
  index += 1;
}

if (!suppliedDirectory) await buildHomepage();
const pageRoot = await realpath(pageDirectory);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".vtt": "text/vtt; charset=utf-8",
  ".zip": "application/zip",
};

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function respond(response, status, message) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

function redirect(response, location, status = 301) {
  response.writeHead(status, { Location: location });
  response.end();
}

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    respond(response, 405, "Method not allowed");
    return;
  }

  try {
    const pathname = decodeURIComponent((request.url || "/").split("?")[0]);
    if (
      !pathname.startsWith("/") ||
      pathname.includes("\0") ||
      pathname.includes("\\")
    ) {
      respond(response, 400, "Bad request");
      return;
    }
    if (pathname.split("/").includes("..")) {
      respond(response, 403, "Forbidden");
      return;
    }

    const url = new URL(request.url, "http://localhost");
    if (pathname === "/postrove") {
      redirect(response, `/postrove/${url.search}`);
      return;
    }
    const relativePath = pathname.startsWith("/postrove/")
      ? pathname.slice("/postrove/".length)
      : pathname.slice(1);
    if (
      ["", "index.html", "zh-CN/", "zh-CN/index.html"].includes(relativePath)
    ) {
      const legacy = legacyLanguageURL(url.href);
      if (legacy) {
        const destination = new URL(legacy);
        redirect(response, `${destination.pathname}${destination.search}`, 302);
        return;
      }
    }
    const root = pageRoot;
    const requestedFile = path.resolve(root, relativePath);
    if (!isContained(root, requestedFile)) {
      respond(response, 403, "Forbidden");
      return;
    }

    let file = await realpath(requestedFile);
    if (!isContained(root, file)) {
      respond(response, 403, "Forbidden");
      return;
    }
    let details = await stat(file);
    if (details.isDirectory()) {
      if (!pathname.endsWith("/")) {
        redirect(response, `${url.pathname}/${url.search}`);
        return;
      }
      file = await realpath(path.join(file, "index.html"));
      if (!isContained(root, file)) {
        respond(response, 403, "Forbidden");
        return;
      }
      details = await stat(file);
    }
    if (!details.isFile()) {
      respond(response, 404, "Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type":
        mimeTypes[path.extname(file).toLowerCase()] ||
        "application/octet-stream",
      "Content-Length": details.size,
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    await pipeline(createReadStream(file), response);
  } catch (error) {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    if (error instanceof URIError) respond(response, 400, "Bad request");
    else if (error.code === "ENOENT" || error.code === "ENOTDIR")
      respond(response, 404, "Not found");
    else {
      console.error(error);
      respond(response, 500, "Internal server error");
    }
  }
});

server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Homepage preview: http://127.0.0.1:${port}`);
});
