import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import {
  ModelService,
  type ModelDependencies,
} from "../../src/main/services/model-service";
import { seedModelSettings } from "../support/model-settings";

async function eventually(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail("Model operation did not settle");
}
async function fixture(check: ModelDependencies["check"] = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), "postrove-model-controls-"));
  const [primary, backup] = await seedModelSettings(root);
  const service = new ModelService({
    root,
    storage: { load: async () => null, save: async () => {} },
    openLogin: async () => {},
    changed: () => {},
    check,
  });
  await service.open();
  const saved = async () =>
    JSON.parse(await readFile(join(root, "connections.json"), "utf8"));
  return {
    root,
    primary,
    backup,
    service,
    saved,
    cleanup: async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("switching saved connections and models preserves the editor, options, leases, and failed writes", async () => {
  const { root, primary, backup, service, saved, cleanup } = await fixture();
  try {
    const lease = await service.acquire();
    await service.select({
      providerId: backup.providerId,
      connectionId: backup.id,
    });
    await service.save({
      method: "pi",
      connectionId: backup.id,
      modelId: `${backup.providerId}-quick`,
      name: "Edited backup",
      options: { ...backup.options, temperature: 0.4 },
    });
    assert.equal(service.view().current?.connectionId, primary.id);
    assert.deepEqual(
      service.view().connections.map((item) => item.id),
      [primary.id, backup.id],
    );
    await service.select({
      providerId: primary.providerId,
      connectionId: primary.id,
    });
    await service.activate({ connectionId: backup.id });
    assert.equal(service.view().current?.modelId, `${backup.providerId}-quick`);
    assert.equal(service.view().current?.options.temperature, 0.4);
    assert.equal(service.view().selected?.id, primary.id);
    assert.ok(
      service
        .view()
        .models.every((model) => model.id.startsWith(primary.providerId)),
    );
    assert.ok(
      service
        .view()
        .currentModels.every((model) => model.id.startsWith(backup.providerId)),
    );
    assert.equal(lease.config.modelId, primary.modelId);
    await service.activate({
      connectionId: backup.id,
      modelId: backup.modelId,
    });
    assert.equal(
      (await saved()).connections.find((item: any) => item.id === backup.id)
        .modelId,
      backup.modelId,
    );
    await assert.rejects(
      service.activate({ connectionId: backup.id, modelId: "missing-model" }),
      /模型目录/,
    );
    assert.equal(service.view().current?.modelId, backup.modelId);

    const file = join(root, "connections.json");
    const retained = join(root, "connections-retained.json");
    await rename(file, retained);
    await mkdir(file);
    try {
      await assert.rejects(service.activate({ connectionId: primary.id }));
      assert.equal(service.view().current?.connectionId, backup.id);
    } finally {
      await rm(file, { recursive: true });
      await rename(retained, file);
    }
    assert.equal((await saved()).activeId, backup.id);
    await lease.release();
  } finally {
    await cleanup();
  }
});

test("checks remain scoped to active model/options through edits, late completion, cancellation, and removal", async () => {
  const calls: Array<{
    modelId: string;
    signal: AbortSignal;
    gate: ReturnType<typeof Promise.withResolvers<void>>;
  }> = [];
  const { primary, backup, service, cleanup } = await fixture(
    async (config, signal) => {
      const gate = Promise.withResolvers<void>();
      calls.push({ modelId: config.modelId, signal, gate });
      await gate.promise; // Deliberately allow completion after cancellation.
    },
  );
  try {
    await service.runCheck();
    await eventually(() => calls.length === 1);
    calls[0].gate.resolve();
    await eventually(() => service.view().check === "passed");
    await service.select({
      providerId: backup.providerId,
      connectionId: backup.id,
    });
    await service.save({
      method: "pi",
      connectionId: backup.id,
      modelId: backup.modelId,
      name: "Renamed backup",
      options: { ...backup.options, temperature: 0.2 },
    });
    assert.equal(service.view().check, "passed");
    await service.select({
      providerId: primary.providerId,
      connectionId: primary.id,
    });
    await service.save({
      method: "pi",
      connectionId: primary.id,
      modelId: primary.modelId,
      name: "Renamed primary",
      options: primary.options,
    });
    assert.equal(service.view().check, "passed");
    await service.runCheck();
    await eventually(() => calls.length === 2);
    calls[1].gate.reject(new Error("fixture request failed"));
    await eventually(() => service.view().check === "failed");
    await service.activate({
      connectionId: primary.id,
      modelId: `${primary.providerId}-quick`,
    });
    assert.equal(service.view().check, "idle");
    assert.equal(service.view().checkFailure, undefined);
    await service.runCheck();
    await eventually(() => calls.length === 3);
    assert.equal(calls[2].modelId, `${primary.providerId}-quick`);
    await service.activate({ connectionId: backup.id });
    assert.equal(calls[2].signal.aborted, true);
    assert.equal(service.view().check, "idle");
    const restart = service.runCheck();
    calls[2].gate.reject(new Error("late failure from previous model"));
    await restart;
    await eventually(() => calls.length === 4);
    assert.equal(service.view().check, "running");
    assert.equal(service.view().checkConnectionId, backup.id);
    assert.equal(service.view().checkModelId, backup.modelId);
    service.cancelCheck();
    calls[3].gate.resolve();
    await eventually(() => service.view().check === "cancelled");
    await service.runCheck();
    await eventually(() => calls.length === 5);
    calls[4].gate.resolve();
    await eventually(() => service.view().check === "passed");
    await service.remove({ connectionId: primary.id });
    assert.equal(service.view().check, "passed");
    await service.select({
      providerId: backup.providerId,
      connectionId: backup.id,
    });
    await service.save({
      method: "pi",
      connectionId: backup.id,
      modelId: backup.modelId,
      options: { ...backup.options, temperature: 0.6 },
    });
    assert.equal(service.view().check, "idle");
    await service.remove({ connectionId: backup.id });
    assert.equal(service.view().current, null);
    assert.deepEqual(service.view().currentModels, []);
  } finally {
    for (const call of calls) call.gate.resolve();
    await cleanup();
  }
});

test("inactive reauthorization and editing after removal retain the active selection", async () => {
  const { root, primary, backup, service, saved, cleanup } = await fixture();
  try {
    await service.activate({ connectionId: backup.id });
    const lease = await service.acquire();
    await service.activate({ connectionId: primary.id });
    await service.select({
      providerId: backup.providerId,
      connectionId: backup.id,
    });
    await service.login({ authType: "api_key" });
    await eventually(() => !!service.view().authPrompt);
    service.respond({
      id: service.view().authPrompt!.id,
      value: "fictional-replacement-key",
    });
    await eventually(() => service.view().auth === "signed_in");
    const replacement = service.view().selected!;
    await service.save({
      method: "pi",
      connectionId: replacement.id,
      name: backup.name,
      modelId: backup.modelId,
      options: backup.options,
    });
    assert.notEqual(replacement.id, backup.id);
    assert.equal((await saved()).activeId, primary.id);
    assert.equal((await saved()).connections.length, 2);
    assert.deepEqual(
      service.view().connections.map((item) => item.id),
      [primary.id, replacement.id],
    );
    const oldAuth = join(root, "connections", backup.id, "auth.json");
    assert.ok(await stat(oldAuth));
    await lease.release();
    await assert.rejects(stat(oldAuth), { code: "ENOENT" });
    await service.remove({ connectionId: primary.id });
    await service.save({
      method: "pi",
      connectionId: replacement.id,
      name: "Edited after removal",
      modelId: backup.modelId,
      options: backup.options,
    });
    assert.equal(service.view().current, null);
    await service.activate({ connectionId: replacement.id });
    assert.equal((await saved()).activeId, replacement.id);
  } finally {
    await cleanup();
  }
});

test("incompatible model reasoning retains the saved model until parameters are edited", async () => {
  const { primary, service, saved, cleanup } = await fixture();
  try {
    const options = { ...primary.options, browserThinking: "high" as const };
    await service.save({
      method: "pi",
      connectionId: primary.id,
      modelId: primary.modelId,
      options,
    });
    await assert.rejects(
      service.activate({
        connectionId: primary.id,
        modelId: `${primary.providerId}-quick`,
      }),
      /Reasoning/,
    );
    assert.equal(service.view().current?.modelId, primary.modelId);
    assert.equal(
      (await saved()).connections.find((item: any) => item.id === primary.id)
        .modelId,
      primary.modelId,
    );
    await service.save({
      method: "pi",
      connectionId: primary.id,
      modelId: `${primary.providerId}-quick`,
      options: primary.options,
    });
    assert.equal(
      service.view().current?.modelId,
      `${primary.providerId}-quick`,
    );
  } finally {
    await cleanup();
  }
});
