import { app, BrowserWindow } from "electron";
import { ContentService } from "../../src/main/services/content-service";
import type { ContentRequest } from "../../src/shared/content-contracts";
import type { ModelExecutionConfig } from "../../src/shared/model-contracts";
const root = process.env.POSTROVE_CONTENT_FIXTURE_ROOT!;
app.setPath("userData", root);
let released = 0;
const controllers = new Map<string, AbortController>();
Object.assign(globalThis, {
  async contentFixture(input: {
    request: ContentRequest;
    endpoint: string;
    id: string;
  }) {
    const config: ModelExecutionConfig = {
      method: "generic_api",
      modelId: "fixture",
      api: "openai-completions",
      baseUrl: input.endpoint,
      credential: "fictional",
    };
    const service: ContentService = ((globalThis as any).__contentService ??=
      new ContentService(
        async () => ({
          config,
          release: async () => {
            released++;
          },
        }),
        root + "/traces",
      ));
    const controller = new AbortController();
    controllers.set(input.id, controller);
    try {
      return {
        value: await service.execute(
          input.request,
          controller.signal,
          undefined,
          input.id,
        ),
        released,
      };
    } catch (error) {
      return { error: (error as Error).message, released };
    } finally {
      controllers.delete(input.id);
    }
  },
  cancelContentFixture(id: string) {
    controllers.get(id)?.abort();
  },
});
void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL("about:blank");
});
