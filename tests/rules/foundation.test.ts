import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareProfile } from "../../src/main/runtime/profile";
import { installedStorage } from "../../src/main/runtime/storage-identity";
import { sourceSchema } from "../../src/shared/source-contracts";

test("installed storage selects Postrove and rejects a redirected profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-storage-"));
  try {
    const other = join(root, "OtherProduct/profiles/default");
    await mkdir(other, { recursive: true });
    const selected = join(root, "Postrove/profiles/default");
    assert.equal(installedStorage(root), selected);
    await mkdir(join(root, "Postrove/profiles"), { recursive: true });
    await symlink(
      other,
      selected,
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(() => installedStorage(root), /regular directory/);
    await rm(selected);
    await writeFile(selected, "invalid-profile");
    assert.throws(() => installedStorage(root), /regular directory/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source images accept only the Postrove cache scheme", () => {
  const imageId = "a".repeat(64);
  const source = {
    sourceUrl: "https://example.com/post",
    platform: "web",
    sourceIdentity: "fictional-source",
    fetchedAt: "2026-10-22T00:00:00.000Z",
    contentBlocks: [{ type: "image", imageId }],
    images: [
      {
        imageId,
        url: "https://example.com/image.png",
        alt: "",
        cachedUrl: `postrove-image://${imageId}`,
      },
    ],
    completeness: "complete",
    completenessNote: "Fictional source",
  };
  assert.equal(sourceSchema.safeParse(source).success, true);
  for (const cachedUrl of [
    `other-product-image://${imageId}`,
    "postrove-image://invalid",
  ]) {
    assert.equal(
      sourceSchema.safeParse({
        ...source,
        images: [{ ...source.images[0], cachedUrl }],
      }).success,
      false,
    );
  }
});

test("profile rejects active writers, existing destinations, malformed records and implicit credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-rule-"));
  try {
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(
      join(source, ".postrove-owner.json"),
      JSON.stringify({ pid: process.pid }),
    );
    await assert.rejects(prepareProfile(join(root, "copy"), source), /in use/);
    await rm(join(source, ".postrove-owner.json"));
    await writeFile(join(source, "tasks.json"), "{bad");
    await assert.rejects(prepareProfile(join(root, "copy"), source));
    await rm(join(source, "tasks.json"));
    await writeFile(
      join(source, "model-connection.json"),
      JSON.stringify({ secret: "fictional" }),
    );
    await prepareProfile(join(root, "copy"), source);
    await assert.rejects(readFile(join(root, "copy", "model-connection.json")));
    await assert.rejects(prepareProfile(join(root, "copy"), source), /exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
