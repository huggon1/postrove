import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadSpeechArtifact } from "../../scripts/app-build/download-speech-artifact.mjs";

process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1"]
  .filter(Boolean)
  .join(",");
process.env.no_proxy = process.env.NO_PROXY;
const bytes = Buffer.from("Complete pinned source archive bytes.");
const sha256 = createHash("sha256").update(bytes).digest("hex");

async function fixture(handler, run) {
  const root = await mkdtemp(join(tmpdir(), "postrove-speech-download-"));
  let requests = 0;
  const server = createServer((req, res) => handler(req, res, ++requests));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run({
      pin: { url: `http://127.0.0.1:${server.address().port}/archive`, sha256 },
      path: join(root, "archive"),
      requests: () => requests,
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
}
function interruptedThen(body) {
  return (_req, res, request) => {
    if (request === 1) {
      res.writeHead(200, { "Content-Length": 200 });
      res.write("Partial bytes from interrupted transport.");
      setTimeout(() => res.destroy(), 20);
    } else res.end(body);
  };
}

test("a real body reset recovers through curl and replaces partial archive bytes", async () => {
  await fixture(interruptedThen(bytes), async ({ pin, path, requests }) => {
    assert.equal(await downloadSpeechArtifact(pin, path), path);
    assert.deepEqual(await readFile(path), bytes);
    assert.ok(requests() >= 2);
    if (process.platform !== "win32")
      assert.equal((await stat(path)).mode & 0o777, 0o600);
  });
});
test("fallback bytes still require the pinned digest and failed output is retired", async () => {
  await fixture(interruptedThen("Altered archive"), async ({ pin, path }) => {
    await assert.rejects(
      downloadSpeechArtifact(pin, path),
      /checksum mismatch/,
    );
    await assert.rejects(stat(path), { code: "ENOENT" });
  });
});
test("native checksum failures reject the archive before any alternate transfer", async () => {
  await fixture(
    (_req, res) => res.end("Altered archive"),
    async ({ pin, path, requests }) => {
      await assert.rejects(
        downloadSpeechArtifact(pin, path),
        /checksum mismatch/,
      );
      assert.equal(requests(), 1);
      await assert.rejects(stat(path), { code: "ENOENT" });
    },
  );
});
test("HTTP access errors retain their status and stop archive transfer", async () => {
  await fixture(
    (_req, res) => {
      res.writeHead(403);
      res.end("Forbidden");
    },
    async ({ pin, path, requests }) => {
      await assert.rejects(
        downloadSpeechArtifact(pin, path),
        /download failed: 403/,
      );
      assert.equal(requests(), 1);
      await assert.rejects(stat(path), { code: "ENOENT" });
    },
  );
});
test("a streamed byte-budget failure removes the partial file", async () => {
  await fixture(
    (_req, res) => res.end(bytes),
    async ({ pin, path, requests }) => {
      await assert.rejects(
        downloadSpeechArtifact(pin, path, { maxBytes: 8 }),
        /exceeds build budget/,
      );
      assert.equal(requests(), 1);
      await assert.rejects(stat(path), { code: "ENOENT" });
    },
  );
});

test("transport recovery preserves a destination owned by an earlier operation", async () => {
  await fixture(
    (_req, res) => res.destroy(),
    async ({ pin, path }) => {
      const previous = Buffer.from("Previously retained archive");
      await writeFile(path, previous);
      await assert.rejects(downloadSpeechArtifact(pin, path), {
        code: "EEXIST",
      });
      assert.deepEqual(await readFile(path), previous);
    },
  );
});

for (const valid of [true, false]) {
  test(`an unavailable origin uses a manifest mirror with checksum enforcement (valid=${valid})`, async () => {
    await fixture(
      (req, res) => {
        if (req.url === "/mirror")
          res.end(valid ? bytes : "Changed mirror bytes");
        else res.destroy();
      },
      async ({ pin, path }) => {
        pin.mirrors = [pin.url.replace("/archive", "/mirror")];
        if (valid) {
          await downloadSpeechArtifact(pin, path);
          assert.deepEqual(await readFile(path), bytes);
        } else {
          await assert.rejects(
            downloadSpeechArtifact(pin, path),
            /checksum mismatch/,
          );
          await assert.rejects(stat(path), { code: "ENOENT" });
        }
      },
    );
  });
}
