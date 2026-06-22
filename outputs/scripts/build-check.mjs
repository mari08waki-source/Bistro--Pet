import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import vm from "node:vm";

const root = new URL("../", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const javascriptFiles = [
  "bistropet-supabase.js",
  "bistropet-storage.js",
  "bistropet-accessibility.js",
  "pwa.js",
  "service-worker.js",
  "admin/admin.js",
  "api/supabase-config.js",
  "api/generate-recipe-image.js"
];
const htmlFiles = [
  "index.html",
  "session-2-pet-profile.html",
  "session-3-meal.html",
  "session-4-weekly-plan.html",
  "admin/index.html"
];

javascriptFiles.forEach(file => {
  const source = readFileSync(join(root, file), "utf8");
  if (!file.startsWith("api/")) new vm.Script(source, { filename: file });
});

htmlFiles.forEach(file => {
  const source = readFileSync(join(root, file), "utf8");
  assert.match(source, /@supabase\/supabase-js@2/, `${file} must load supabase-js`);
  assert.match(source, /bistropet-supabase\.js/, `${file} must load the BistroPet Supabase client`);
  const inlineScripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1].trim())
    .filter(Boolean);
  inlineScripts.forEach((script, index) => new vm.Script(script, { filename: `${file}:inline-${index + 1}` }));
});

function walk(directory) {
  return readdirSync(directory).flatMap(name => {
    if (["node_modules", "tests", "scripts"].includes(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const activeSources = walk(root).filter(path => /\.(?:html|js)$/.test(path));
const localStorageReferences = activeSources.filter(path => readFileSync(path, "utf8").includes("localStorage"));
assert.deepEqual(localStorageReferences.map(path => relative(root, path)), [], "Active frontend must not use localStorage");

console.log("Production build validation passed.");
