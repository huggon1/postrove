import test from "node:test";
import assert from "node:assert/strict";
import { BrowserTaskQueue } from "../../src/main/services/browser-task-queue";
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

test("connection lanes overlap and maintenance forms a fair global barrier", async () => {
  const queue = new BrowserTaskQueue();
  const x = Promise.withResolvers<void>(),
    reddit = Promise.withResolvers<void>(),
    maintenance = Promise.withResolvers<void>();
  const entered: string[] = [];
  const first = queue.run(
    async () => {
      entered.push("x-zh");
      await x.promise;
    },
    undefined,
    "x",
  );
  const second = queue.run(
    async () => {
      entered.push("x-en");
    },
    undefined,
    "x",
  );
  const peer = queue.run(
    async () => {
      entered.push("reddit");
      await reddit.promise;
    },
    undefined,
    "reddit",
  );
  const barrier = queue.run(async () => {
    entered.push("maintenance");
    await maintenance.promise;
  });
  const later = queue.run(
    async () => {
      entered.push("gemini");
    },
    undefined,
    "gemini",
  );
  await turn();
  assert.deepEqual(entered, ["x-zh", "reddit"]);
  x.resolve();
  await second;
  assert.deepEqual(entered, ["x-zh", "reddit", "x-en"]);
  reddit.resolve();
  await turn();
  assert.equal(entered.at(-1), "maintenance");
  maintenance.resolve();
  await Promise.all([first, second, peer, barrier, later]);
  assert.equal(entered.at(-1), "gemini");
  await queue.close();
});

test("queued cancellation removes a barrier immediately and failure releases its connection", async () => {
  const queue = new BrowserTaskQueue();
  const held = Promise.withResolvers<void>(),
    controller = new AbortController();
  const first = queue.run(async () => held.promise, undefined, "x");
  let maintenanceEntered = false,
    peerEntered = false;
  const barrier = queue.run(async () => {
    maintenanceEntered = true;
  }, controller.signal);
  const rejected = assert.rejects(barrier, /Cancelled/);
  const peer = queue.run(
    async () => {
      peerEntered = true;
    },
    undefined,
    "reddit",
  );
  controller.abort();
  await rejected;
  await peer;
  assert.equal(maintenanceEntered, false);
  assert.equal(peerEntered, true);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    queue.run(
      async () => {
        throw new Error("unexpected entry");
      },
      cancelled.signal,
      "x",
    ),
  );
  held.resolve();
  await first;
  await assert.rejects(
    queue.run(
      async () => {
        throw new Error("fixture failure");
      },
      undefined,
      "x",
    ),
    /fixture failure/,
  );
  await queue.run(async () => {}, undefined, "x");
  await queue.close();
});

test("shutdown rejects pending jobs and new admission while draining every active connection", async () => {
  const queue = new BrowserTaskQueue();
  const first = Promise.withResolvers<void>(),
    second = Promise.withResolvers<void>();
  const active = queue.run(async () => first.promise, undefined, "x");
  const peer = queue.run(async () => second.promise, undefined, "reddit");
  const queued = queue.run(async () => {}, undefined, "x");
  const rejection = assert.rejects(queued, /shutting down/);
  let closed = false;
  const close = queue.close().then(() => {
    closed = true;
  });
  await rejection;
  await assert.rejects(
    queue.run(async () => {}),
    /shutting down/,
  );
  first.resolve();
  await active;
  assert.equal(closed, false);
  second.resolve();
  await Promise.all([peer, close]);
  assert.equal(closed, true);
});
