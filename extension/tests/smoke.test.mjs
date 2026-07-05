import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const readText = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("manifest keeps required MV3 extension basics", async () => {
  const manifest = await readJson("../manifest.json");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, "src/popup/popup.html");
  assert.equal(manifest.background.service_worker, "assets/serviceWorker.js");
  assert.equal(manifest.background.type, "module");

  for (const permission of ["activeTab", "offscreen", "storage", "tabCapture", "unlimitedStorage"]) {
    assert.ok(manifest.permissions.includes(permission), `missing permission: ${permission}`);
  }
});

test("English and German locale files expose the same non-empty keys", async () => {
  const en = await readJson("../src/locales/en.json");
  const de = await readJson("../src/locales/de.json");

  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());

  for (const [key, value] of Object.entries(en)) {
    assert.equal(typeof value, "string", `English ${key} is not a string`);
    assert.ok(value.trim(), `English ${key} is empty`);
  }

  for (const [key, value] of Object.entries(de)) {
    assert.equal(typeof value, "string", `German ${key} is not a string`);
    assert.ok(value.trim(), `German ${key} is empty`);
  }
});

test("settings source defines localized default summary prompts", async () => {
  const settingsSource = await readText("../src/types/settings.ts");

  assert.match(settingsSource, /DEFAULT_SUMMARY_PROMPTS:\s*Record<Locale,\s*string>/);
  assert.match(settingsSource, /getDefaultSummaryPrompt/);
  assert.match(settingsSource, /en:\s*\[/);
  assert.match(settingsSource, /de:\s*\[/);
});

test("service worker exposes a visible recording badge", async () => {
  const serviceWorkerSource = await readText("../src/background/serviceWorker.ts");

  assert.match(serviceWorkerSource, /RECORDING_BADGE_TEXT\s*=\s*"REC"/);
  assert.match(serviceWorkerSource, /setBadgeBackgroundColor/);
  assert.match(serviceWorkerSource, /setBadgeText\(\{\s*text:\s*badgeText\s*\}\)/);
});
