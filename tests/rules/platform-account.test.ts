import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountSession,
  savedAccountsSchema,
} from "../../src/main/services/platform-account";

test("account session fingerprints follow only the selected platform authentication cookie", () => {
  const cookies = [
    { name: "auth_token", value: "fictional-first", domain: ".x.com" },
    { name: "ct0", value: "fictional-csrf", domain: ".x.com" },
    { name: "web_session", value: "fictional-xhs", domain: ".xiaohongshu.com" },
  ];
  const original = accountSession("x", cookies);
  assert.match(original, /^[a-f0-9]{64}$/);
  assert.equal(
    original,
    accountSession(
      "x",
      cookies.map((c) =>
        c.name === "web_session" ? { ...c, value: "other-account" } : c,
      ),
    ),
  );
  assert.notEqual(
    original,
    accountSession(
      "x",
      cookies.map((c) =>
        c.name === "auth_token" ? { ...c, value: "other-account" } : c,
      ),
    ),
  );
  assert.equal(
    savedAccountsSchema.safeParse({
      x: {
        session: original,
        account: { name: "Example", handle: "@example" },
      },
    }).success,
    true,
  );
  assert.equal(
    savedAccountsSchema.safeParse({
      x: { session: original, account: { name: "", token: "fictional" } },
    }).success,
    false,
  );
});
