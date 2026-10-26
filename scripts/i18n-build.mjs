#!/usr/bin/env node
// Build _locales/<locale>/messages.json from locales/<locale>.json.
//
// locales/*.json is the single source of truth (flat key -> string).
// _locales is generated output: never edit it by hand.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "locales");
const OUTPUT_DIR = join(ROOT, "_locales");
const MANIFEST_PATH = join(ROOT, "manifest.json");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listLocales() {
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("_"))
    .map((entry) => basename(entry.name, ".json"))
    .sort();
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const defaultLocale = manifest.default_locale;

  if (!defaultLocale) {
    console.error("manifest.json is missing default_locale.");
    process.exit(1);
  }

  const locales = await listLocales();
  if (locales.length === 0) {
    console.error("No locale files found in locales/.");
    process.exit(1);
  }
  if (!locales.includes(defaultLocale)) {
    console.error(`locales/${defaultLocale}.json is missing but manifest.json sets default_locale="${defaultLocale}".`);
    process.exit(1);
  }

  let problems = 0;

  for (const locale of locales) {
    const source = await readJson(join(SOURCE_DIR, `${locale}.json`));
    const messages = {};

    for (const [key, value] of Object.entries(source)) {
      if (typeof value !== "string") {
        console.warn(`  ! ${locale}.${key}: value is not a string, skipped`);
        problems += 1;
        continue;
      }
      if (value.trim() === "") {
        console.warn(`  ! ${locale}.${key}: empty value`);
        problems += 1;
      }
      messages[key] = { message: value };
    }

    await mkdir(join(OUTPUT_DIR, locale), { recursive: true });
    await writeFile(
      join(OUTPUT_DIR, locale, "messages.json"),
      `${JSON.stringify(messages, null, 2)}\n`,
      "utf8"
    );

    console.log(`  ${locale}: ${Object.keys(messages).length} messages -> _locales/${locale}/messages.json`);
  }

  console.log(`\nBuilt ${locales.length} locale(s); default is "${defaultLocale}".`);
  if (problems > 0) {
    console.warn(`${problems} warning(s) above. Run "npm run i18n:check" for details.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
