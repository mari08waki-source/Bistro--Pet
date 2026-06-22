import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url));
const text = file => read(file).toString("utf8");

function pngDimensions(file) {
  const bytes = read(file);
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", `${file} must be a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("manifest defines an installable standalone BistroPet app", () => {
  const manifest = JSON.parse(text("manifest.json"));
  assert.equal(manifest.name, "BistroPet");
  assert.equal(manifest.short_name, "BistroPet");
  assert.equal(manifest.start_url, "/index.html");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#0b0906");
  assert.ok(manifest.icons.some(icon => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "192x192" && icon.purpose === "maskable"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512" && icon.purpose === "maskable"));
  manifest.icons.forEach(icon => {
    const file = icon.src.replace(/^\//, "");
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} must exist`);
    const [expectedWidth, expectedHeight] = icon.sizes.split("x").map(Number);
    assert.deepEqual(pngDimensions(file), { width: expectedWidth, height: expectedHeight });
  });
});

test("app pages reference the manifest, official icon and PWA registration", () => {
  ["index.html", "terms.html", "privacy.html", "session-2-pet-profile.html", "session-3-meal.html", "session-4-weekly-plan.html"].forEach(file => {
    const source = text(file);
    assert.match(source, /rel="manifest" href="\.\/manifest\.json"/i, file);
    assert.match(source, /apple-touch-icon" href="\.\/icons\/bistropet-180\.png"/i, file);
    assert.match(source, /src="\.\/pwa\.js"/i, file);
  });
});

test("service worker caches the app shell without intercepting APIs or Supabase", () => {
  const worker = text("service-worker.js");
  const registration = text("pwa.js");
  assert.match(registration, /register\("\/service-worker\.js", \{ scope: "\/" \}\)/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(worker, /supabase\.co|auth\/v1/);
  assert.match(worker, /request\.method !== "GET"/);
});
