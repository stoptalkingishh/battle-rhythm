#!/usr/bin/env node
/**
 * Imports locally supplied, reviewed AI raster plates. This script never
 * contacts an image provider and intentionally keeps the source intake out of
 * deployable web assets.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'assets/plates/workout-cards.json');
const assetRoot = path.join(root, 'assets');
const outputDir = path.join(assetRoot, 'plates/ai');
const registryPath = path.join(outputDir, 'registry.js');
const defaultInputDir = path.resolve(root, '..', 'battle-rhythm-ai-intake');
const maxImageBytes = 25 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

function usage() {
  return `Usage: node scripts/import-ai-plates.mjs [--input /absolute/path]

Expected input directory: ${defaultInputDir}
See assets/plates/AI-ASSET-INTAKE.md for the required files and review process.`;
}

function inputDirectory() {
  const args = process.argv.slice(2);
  if (!args.length) return defaultInputDir;
  if (args.length !== 2 || args[0] !== '--input') fail(usage());
  if (!path.isAbsolute(args[1])) fail('--input must be an absolute path outside deployable assets.');
  return path.resolve(args[1]);
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function regularFile(filePath, label) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    fail(`${label} is missing: ${filePath}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} must be a regular file, not a symlink or directory: ${filePath}`);
  return stat;
}

function readJson(filePath, label) {
  regularFile(filePath, label);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} is not valid JSON: ${filePath}`);
    throw error;
  }
}

function requiredString(metadata, key, id) {
  if (typeof metadata[key] !== 'string' || !metadata[key].trim()) fail(`${id}.json requires a non-empty ${key} string.`);
  return metadata[key].trim();
}

function validateProvenance(metadata, id) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') fail(`${id}.json must contain a JSON object.`);
  const provenance = {
    generator: requiredString(metadata, 'generator', id),
    provider: requiredString(metadata, 'provider', id),
    date: requiredString(metadata, 'date', id),
    promptId: requiredString(metadata, 'promptId', id),
    licenseAssertion: requiredString(metadata, 'licenseAssertion', id)
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(provenance.date) || Number.isNaN(Date.parse(`${provenance.date}T00:00:00Z`))) {
    fail(`${id}.json date must be a real ISO date in YYYY-MM-DD form.`);
  }
  if (provenance.promptId !== id) fail(`${id}.json promptId must exactly match its manifest ID.`);
  return provenance;
}

function validateImage(filePath, extension) {
  const stat = regularFile(filePath, 'Image');
  if (stat.size === 0 || stat.size > maxImageBytes) fail(`Image must be between 1 byte and ${maxImageBytes} bytes: ${filePath}`);
  const header = fs.readFileSync(filePath).subarray(0, 12);
  const isPng = header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = header.length >= 12 && header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
  if ((extension === '.png' && !isPng) || (extension === '.webp' && !isWebp)) fail(`Image contents do not match its ${extension} extension: ${filePath}`);
}

function loadManifest() {
  const cards = readJson(manifestPath, 'Prompt manifest');
  if (!Array.isArray(cards) || !cards.length) fail('Prompt manifest must be a non-empty array of manifest cards.');
  const ids = cards.map(card => card?.id);
  if (ids.some(id => typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) || new Set(ids).size !== ids.length) fail('Prompt manifest has invalid or duplicate IDs.');
  return ids;
}

function collectInput(inputDir, ids) {
  let directory;
  try {
    directory = fs.lstatSync(inputDir);
  } catch {
    fail(`Input directory does not exist: ${inputDir}`);
  }
  if (directory.isSymbolicLink() || !directory.isDirectory()) fail(`Input path must be a real directory, not a symlink: ${inputDir}`);

  const allowedNames = new Set(ids.flatMap(id => [`${id}.png`, `${id}.png.json`, `${id}.webp`, `${id}.webp.json`]));
  const files = fs.readdirSync(inputDir, { withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile() || entry.isSymbolicLink() || !allowedNames.has(entry.name)) fail(`Unexpected intake entry: ${entry.name}. The intake directory must contain only manifest image files and sidecars.`);
  }

  const present = new Set();
  for (const entry of files) {
    const base = entry.name.endsWith('.json') ? entry.name.slice(0, -'.json'.length) : entry.name;
    const dot = base.lastIndexOf('.');
    if (dot > 0) present.add(base.slice(0, dot));
  }

  const plates = ids.filter(id => present.has(id)).map(id => {
    const imagePaths = {};
    const provenance = {};
    for (const extension of ['.webp', '.png']) {
      const imagePath = path.join(inputDir, `${id}${extension}`);
      if (fs.existsSync(imagePath)) {
        validateImage(imagePath, extension);
        imagePaths[extension.slice(1)] = imagePath;
        provenance[extension.slice(1)] = validateProvenance(readJson(path.join(inputDir, `${id}${extension}.json`), 'Provenance sidecar'), id);
      }
    }
    if (!imagePaths.webp && !imagePaths.png) fail(`${id} requires at least one .webp or .png image.`);
    return { id, provenance, imagePaths };
  });

  if (!plates.length) fail(`No approved images present in ${inputDir}. Add <id>.webp/.png files and matching sidecars, then re-run.`);
  return plates;
}

function importPlates(plates) {
  const stagingDir = path.join(outputDir, `.intake-${process.pid}-${crypto.randomUUID()}`);
  fs.mkdirSync(stagingDir, { recursive: true });
  try {
    for (const plate of plates) {
      for (const [format, source] of Object.entries(plate.imagePaths)) fs.copyFileSync(source, path.join(stagingDir, `${plate.id}.${format}`));
    }
    fs.mkdirSync(outputDir, { recursive: true });
    for (const plate of plates) {
      for (const format of Object.keys(plate.imagePaths)) fs.renameSync(path.join(stagingDir, `${plate.id}.${format}`), path.join(outputDir, `${plate.id}.${format}`));
    }
    const registry = plates.map(plate => ({
      id: plate.id,
      ...(plate.imagePaths.webp ? { webp: `assets/plates/ai/${plate.id}.webp` } : {}),
      ...(plate.imagePaths.png ? { png: `assets/plates/ai/${plate.id}.png` } : {}),
      provenance: plate.provenance
    }));
    const temporaryRegistry = path.join(outputDir, `.registry-${process.pid}-${crypto.randomUUID()}.js`);
    fs.writeFileSync(temporaryRegistry, `// Generated by scripts/import-ai-plates.mjs. Do not edit.\nwindow.BR_AI_PLATES = ${JSON.stringify(registry, null, 2)};\n`);
    fs.renameSync(temporaryRegistry, registryPath);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

try {
  const inputDir = inputDirectory();
  if (isInside(inputDir, assetRoot)) fail(`Input directory must be outside deployable assets: ${assetRoot}`);
  const ids = loadManifest();
  const plates = collectInput(inputDir, ids);
  importPlates(plates);
  console.log(`Imported ${plates.length} reviewed AI plates from ${inputDir}.`);
  console.log(`Emitted browser registry: ${registryPath}`);
} catch (error) {
  console.error(`AI plate intake failed: ${error.message}`);
  process.exitCode = 1;
}
