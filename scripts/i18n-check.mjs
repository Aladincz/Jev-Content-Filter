#!/usr/bin/env node
// Compare every locale against the default locale (manifest.json default_locale).
//
// Exit code 1 when a locale is missing keys, has extra keys or empty values.
// Values identical to the default locale are reported as "untranslated" but do
// not fail the check - that is the normal state of a work-in-progress locale.

import { readdir, readFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "locales");
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

function list(items) {
  return items.length > 0 ? items.join(", ") : "-";
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const defaultLocale = manifest.default_locale;

  const locales = await listLocales();
  const reference = await readJson(join(SOURCE_DIR, `${defaultLocale}.json`));
  const referenceKeys = Object.keys(reference);

  let failures = 0;
  let warnings = 0;

  for (const locale of locales) {
    const data = await readJson(join(SOURCE_DIR, `${locale}.json`));
    const keys = Object.keys(data);

    const missing = referenceKeys.filter((key) => !(key in data));
    const extra = keys.filter((key) => !(key in reference));
    const empty = keys.filter((key) => typeof data[key] !== "string" || data[key].trim() === "");
    const untranslated =
      locale === defaultLocale
        ? []
        : keys.filter((key) => key in reference && data[key] === reference[key]);

    const problems = missing.length + extra.length + empty.length;
    const label = locale === defaultLocale ? `${locale} (default)` : locale;

    if (problems === 0) {
      console.log(`  OK    ${label}: ${keys.length} keys`);
    } else {
      failures += problems;
      console.log(`  FAIL  ${label}`);
      if (missing.length) console.log(`          missing : ${list(missing)}`);
      if (extra.length) console.log(`          extra   : ${list(extra)}`);
      if (empty.length) console.log(`          empty   : ${list(empty)}`);
    }

    if (untranslated.length) {
      warnings += untranslated.length;
      console.log(`          untranslated (same as ${defaultLocale}): ${list(untranslated)}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} problem(s) found.`);
    process.exit(1);
  }

  console.log(`\nAll ${locales.length} locale(s) are in sync.`);
  if (warnings > 0) {
    console.log(`${warnings} value(s) still identical to "${defaultLocale}" (fine for WIP locales).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
