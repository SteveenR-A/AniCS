import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));

try {
  const version = readJson('package.json').version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('La versión de package.json debe ser major.minor.patch.');

  const requested = process.env.RELEASE_EVENT === 'push'
    ? (process.env.RELEASE_REF || '').replace(/^refs\/tags\//, '')
    : (process.env.REQUESTED_VERSION || '').trim() || version;
  const tag = requested.startsWith('v') ? requested : `v${requested}`;
  if (tag !== `v${version}`) {
    throw new Error(`Se solicitó ${tag}, pero el código corresponde a v${version}. Usa npm run bump antes de compilar.`);
  }

  const lock = readJson('package-lock.json');
  const versions = [
    ['package-lock.json', lock.version],
    ['package-lock.json (paquete raíz)', lock.packages?.['']?.version],
    ['src-tauri/tauri.conf.json', readJson('src-tauri/tauri.conf.json').version],
    ['src-tauri/Cargo.toml', read('src-tauri/Cargo.toml').match(/\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1]],
    ['src-tauri/Cargo.lock', read('src-tauri/Cargo.lock').match(/\[\[package\]\]\s+name = "anics"\s+version = "([^"]+)"/)?.[1]],
    ['src/services/updateService.ts', read('src/services/updateService.ts').match(/export const CURRENT_VERSION = '([^']+)'/)?.[1]],
    ['src/data/changelog.json', readJson('src/data/changelog.json')[0]?.version],
  ];
  for (const [file, actual] of versions) {
    if (actual !== version) throw new Error(`${file}: versión ${actual ?? 'ausente'}; se esperaba ${version}.`);
  }
  if (!read('RELEASE_NOTES.md').startsWith(`# AniCS v${version} `)) {
    throw new Error('RELEASE_NOTES.md no corresponde a la versión solicitada.');
  }

  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
  console.log(`Versión y notas verificadas: ${tag}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
