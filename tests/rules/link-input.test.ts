import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forwardingInputSchema, sourceUrlSchema } from "../../src/shared/source-contracts";
import { parseSingleBotLink } from "../../src/main/integrations/bots/link-parser";
import { ForwardingStore } from "../../src/main/services/forwarding/store";
import { ForwardingPipelineService } from "../../src/main/services/forwarding/service";

test("link intake completes domain addresses and retains source locators", () => {
  for (const [input, output] of [
    ["github.com/example/project#readme", "https://github.com/example/project#readme"],
    ["  www.bilibili.com/video/BV1ab411c7mD?p=2&t=35  ", "https://www.bilibili.com/video/BV1ab411c7mD?p=2&t=35"],
    ["//example.org/article?q=a%2Fb&next=x+y#section", "https://example.org/article?q=a%2Fb&next=x+y#section"],
    ["example.org:8443/article", "https://example.org:8443/article"],
    ["例子.中国/资料", "https://例子.中国/资料"],
    ["HTTPS://Example.org/Article?Token=A%2FB#Part", "HTTPS://Example.org/Article?Token=A%2FB#Part"],
  ]) assert.equal(forwardingInputSchema.parse(input), output);
  // Saved source evidence still requires the completed, explicit address.
  assert.throws(() => sourceUrlSchema.parse("example.org/article"));
});

test("link intake rejects other protocols, credentials, local paths and mixed text", () => {
  for (const input of [
    "", "a question", "http://example.org/article", "ftp://example.org/file",
    "javascript:alert(1)", "data:text/html,example.org", "file:///tmp/article.md", "custom.scheme://example.org/article",
    "https:/example.org/article", "https:///example.org/article", "///example.org/article",
    "/tmp/article.md", "C:\\docs\\article.md", "localhost/article", "127.0.0.1/article",
    "example..org/article", "-example.org/article", "example.org./article",
    "user:password@example.org/article", "https://user:password@example.org/article",
    "https://example.org/first https://example.org/second",
    "example.org/first\nexample.org/second", "example.org\\article", "example.org/with space",
    "read example.org/article", "example.org/article\u0000",
  ]) assert.equal(forwardingInputSchema.safeParse(input).success, false, input);
});

test("bot single-link intake shares completion and retains Xiaohongshu access parameters", () => {
  const input = "www.xiaohongshu.com/explore/0123456789abcdef01234567?xsec_token=fixture%2Ftoken&xsec_source=pc_share";
  const expected = {
    ok: true,
    sourceUrl: `https://${input}`,
    xhsAccessToken: "fixture/token",
  };
  assert.deepEqual(parseSingleBotLink({ text: ` ${input} ` }), expected);
  assert.deepEqual(parseSingleBotLink({
    text: input,
    entities: [{ type: "url", offset: 0, length: input.length }],
  }), expected);
  assert.deepEqual(parseSingleBotLink({
    text: "Source", entities: [{ type: "text_link", offset: 0, length: 6, url: input }],
  }), expected);
  for (const text of [
    "read example.org/article", "example.org/one example.org/two",
    "https://example.org/one https://example.org/two", "http://example.org/article",
  ]) assert.equal(parseSingleBotLink({ text }).ok, false, text);
});

test("Main saves completed addresses and protects retained note access tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-link-input-"));
  let service: ForwardingPipelineService | undefined;
  try {
    const store = new ForwardingStore(join(root, "forwarding.json"));
    await store.open();
    service = new ForwardingPipelineService({
      store,
      acquire: async () => { throw new Error("Fixture model unavailable"); },
      spawn: () => { throw new Error("Unexpected worker"); },
      changed: () => {},
      protectSensitive: async (value) => `protected:${value}`,
      revealSensitive: async (value) => value.replace(/^protected:/, ""),
    });
    const web = await service.submit(" example.org/article?q=a%2Fb#part ");
    assert.equal(service.read(web).task.target.sourceUrl, "https://example.org/article?q=a%2Fb#part");
    const note = await service.submit("www.xiaohongshu.com/explore/0123456789abcdef01234567?xsec_token=fixture%2Ftoken&xsec_source=pc_share");
    assert.equal(service.read(note).task.target.sourceUrl, "https://www.xiaohongshu.com/explore/0123456789abcdef01234567");
    assert.equal(store.snapshot().tasks.find((item) => item.taskId === note)?.xhsAccessTokenCiphertext, "protected:fixture/token");
    assert.equal("xhsAccessTokenCiphertext" in service.read(note).task, false);
  } finally {
    await service?.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
