import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "_site");
const index = readFileSync(resolve(root, "index.html"), "utf8");
const references = [...index.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map((match) => match[1]);
const releaseEntrypoints = ["index.html", ...references, "service-worker.js"];
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
for (const reference of releaseEntrypoints) {
  if (/^[a-z]+:/i.test(reference)) continue;
  const localPath = reference.split(/[?#]/, 1)[0];
  if (!localPath || localPath === "./") continue;
  const source = resolve(root, localPath);
  assert.ok(source.startsWith(`${root}\\`) || source.startsWith(`${root}/`), `unsafe site reference: ${reference}`);
  assert.ok(existsSync(source), `missing site reference: ${reference}`);
  const target = resolve(destination, localPath);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target);
}
cpSync(resolve(root, "assets"), resolve(destination, "assets"), { recursive: true });
writeFileSync(resolve(destination, ".nojekyll"), "");
for (const required of ["index.html", "service-worker.js", "manifest.webmanifest"]) {
  assert.ok(existsSync(resolve(destination, required)), `assembled site missing ${required}`);
}
console.log(`assemble-site: OK (${references.length} HTML references + service worker)`);
