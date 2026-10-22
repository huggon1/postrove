import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { join } from "node:path";
import { defaultPiOptions } from "../../src/shared/model-contracts";
import {
  writePrivateJson,
  type PiConnection,
} from "../../src/main/storage/pi-connection-store";

// Fictional native Pi connections; the endpoint is always a test-owned loopback server.
export async function seedModelSettings(
  root: string,
  endpoint = "http://127.0.0.1:1",
) {
  const connections: PiConnection[] = [];
  for (const [providerId, name] of [
    ["demo-primary", "Demo A"],
    ["demo-backup", "Demo B"],
  ]) {
    const id = randomUUID();
    const connection: PiConnection = {
      id,
      providerId,
      name,
      modelId: `${providerId}-standard`,
      options: defaultPiOptions(),
      useEnvironment: false,
    };
    connections.push(connection);
    const directory = join(root, "connections", id);
    await writePrivateJson(join(directory, "models.json"), {
      providers: {
        [providerId]: {
          name,
          baseUrl: `${endpoint}/v1`,
          api: "openai-completions",
          models: [
            {
              id: `${providerId}-standard`,
              name: "Demo · Standard",
              reasoning: true,
            },
            {
              id: `${providerId}-quick`,
              name: "Demo · Quick",
              reasoning: false,
            },
            {
              id: `${providerId}-offline`,
              name: "Demo · Unavailable",
              reasoning: true,
            },
          ].map((model) => ({
            ...model,
            input: ["text"],
            contextWindow: 32768,
            maxTokens: 8192,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          })),
        },
      },
    });
    await writePrivateJson(join(directory, "auth.json"), {
      [providerId]: { type: "api_key", key: "fictional-model-key" },
    });
  }
  await writePrivateJson(join(root, "connections.json"), {
    version: 2,
    activeId: connections[0].id,
    connections,
    retiredIds: [],
    legacyMigrated: true,
  });
  return connections;
}

export async function modelSettingsServer() {
  const calls: Array<{ model: string; authenticated: boolean }> = [];
  const controls = { hold: false };
  const held: Array<() => void> = [];
  const releaseHeld = () => {
    for (const release of held.splice(0)) release();
  };
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const input = JSON.parse(raw);
    calls.push({
      model: input.model,
      authenticated:
        request.headers.authorization === "Bearer fictional-model-key",
    });
    if (controls.hold) await new Promise<void>((resolve) => held.push(resolve));
    if (response.destroyed) return;
    if (input.model.endsWith("-offline")) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: "Fictional model unavailable" } }),
      );
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({
        id: "demo-check",
        object: "chat.completion.chunk",
        model: input.model,
        created: 1,
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "OK" },
            finish_reason: null,
          },
        ],
      })}\n\n`,
    );
    response.write(
      `data: ${JSON.stringify({
        id: "demo-check",
        object: "chat.completion.chunk",
        model: input.model,
        created: 1,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      })}\n\n`,
    );
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  return {
    endpoint,
    calls,
    controls,
    releaseHeld,
    close: async () => {
      releaseHeld();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
