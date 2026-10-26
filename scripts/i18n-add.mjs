#!/usr/bin/env node
// Scaffold a new locale file.
//
//   npm run i18n:add -- de
//   npm run i18n:add -- pt-BR --from en
//
// Creates locales/<code>.json with every key from the source locale, values
// empty. Fill it in and run `npm run i18n:build`.

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "locales");
const MANIFEST_PATH = join(ROOT, "manifest.json");

const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const code = args.find((arg) => !arg.startsWith("-"));
  const fromIndex = args.indexOf("--from");

  if (!code) {
    console.error("Usage: npm run i18n:add -- <locale> [--from <locale>]");
    console.error("Example: npm run i18n:add -- de");
    process.exit(1);
  }

  if (!LOCALE_PATTERN.test(code)) {
    console.error(`"${code}" does not look like a locale code (expected e.g. de, pt-BR, zh-CN).`);
    process.exit(1);
  }

  const manifest = await readJson(MANIFEST_PATH);
  const source = fromIndex >= 0 && args[fromIndex + 1] ? args[fromIndex + 1] : manifest.default_locale;

  const targetPath = join(SOURCE_DIR, `${code}.json`);
  if (await exists(targetPath)) {
    console.error(`locales/${code}.json already exists - edit it directly.`);
    process.exit(1);
  }

  const reference = await readJson(join(SOURCE_DIR, `${source}.json`));
  const scaffold = Object.fromEntries(Object.keys(reference).map((key) => [key, ""]));

  await writeFile(targetPath, `${JSON.stringify(scaffold, null, 2)}\n`, "utf8");

  console.log(`Created locales/${code}.json with ${Object.keys(scaffold).length} keys (copied from ${source}).`);
  console.log("Fill in the values, then run:");
  console.log("  npm run i18n:build && npm run i18n:check");
  console.log("Remember to mention the new language in README.md so contributors can find it.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
