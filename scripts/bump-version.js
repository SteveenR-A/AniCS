/**
 * AniCS - Version Bump Script
 * Sincroniza la versión automáticamente en todos los archivos del proyecto:
 * - package.json
 * - src-tauri/Cargo.toml
 * - src-tauri/tauri.conf.json
 * - src/pages/SettingsPage.tsx
 * - src/data/changelog.json
 *
 * Uso:
 *   node scripts/bump-version.js 0.1.1 "Título de la versión" "Mejora 1|Mejora 2|Arreglo 3"
 *   npm run bump 0.1.1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const targetVersion = process.argv[2];
const releaseTitle = process.argv[3] || `Actualización v${targetVersion}`;
const highlightsRaw = process.argv[4] || '';

if (!targetVersion || !/^\d+\.\d+\.\d+$/.test(targetVersion)) {
  console.error('\x1b[31m%s\x1b[0m', 'Error: Debes especificar una versión válida en formato SemVer (ej. 0.1.1 o 1.0.0)');
  console.log('Uso: node scripts/bump-version.js <version> [titulo] [cambios_separados_por_pipe]');
  process.exit(1);
}

console.log(`\x1b[36m%s\x1b[0m`, `🚀 Actualizando versión de AniCS a v${targetVersion}...`);

// 1. package.json
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = targetVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('  ✓ package.json actualizado');

// 2. src-tauri/Cargo.toml
const cargoPath = path.join(ROOT, 'src-tauri', 'Cargo.toml');
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version = "[\d.]+"/m, `version = "${targetVersion}"`);
fs.writeFileSync(cargoPath, cargo, 'utf8');
console.log('  ✓ src-tauri/Cargo.toml actualizado');

// 3. src-tauri/tauri.conf.json
const tauriConfPath = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = targetVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
console.log('  ✓ src-tauri/tauri.conf.json actualizado');

// 4. src/services/updateService.ts & páginas de settings
for (const p of [
  'src/services/updateService.ts',
  'src/pages/desktop/DesktopSettingsPage.tsx',
  'src/pages/mobile/MobileSettingsPage.tsx',
  'src/pages/SettingsPage.tsx'
]) {
  const fullPath = path.join(ROOT, p);
  if (fs.existsSync(fullPath)) {
    let code = fs.readFileSync(fullPath, 'utf8');
    code = code.replace(/export const CURRENT_VERSION = '[\d.]+';/g, `export const CURRENT_VERSION = '${targetVersion}';`);
    code = code.replace(/const CURRENT_VERSION = '[\d.]+';/g, `const CURRENT_VERSION = '${targetVersion}';`);
    fs.writeFileSync(fullPath, code, 'utf8');
    console.log(`  ✓ ${p} actualizado`);
  }
}


// 5. src/data/changelog.json
const changelogPath = path.join(ROOT, 'src', 'data', 'changelog.json');
let changelog = [];
if (fs.existsSync(changelogPath)) {
  changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));
}

const existingIndex = changelog.findIndex((e) => e.version === targetVersion);
const today = new Date().toISOString().split('T')[0];
const highlights = highlightsRaw
  ? highlightsRaw.split('|').map((s) => s.trim()).filter(Boolean)
  : [`Actualización de mantenimiento y mejoras de estabilidad v${targetVersion}.`];

const newEntry = {
  version: targetVersion,
  date: today,
  title: releaseTitle,
  type: 'patch',
  highlights,
};

if (existingIndex >= 0) {
  changelog[existingIndex] = newEntry;
} else {
  changelog.unshift(newEntry);
}

fs.writeFileSync(changelogPath, JSON.stringify(changelog, null, 2) + '\n', 'utf8');
console.log('  ✓ src/data/changelog.json actualizado');

console.log(`\n\x1b[32m%s\x1b[0m`, `✅ Versión sincronizada exitosamente a ${targetVersion}!`);
console.log(`\x1b[33m%s\x1b[0m`, `Para publicar en GitHub y crear el instalador EXE y APK:`);
console.log(`  git add .`);
console.log(`  git commit -m "chore: release v${targetVersion}"`);
console.log(`  git tag v${targetVersion}`);
console.log(`  git push origin main --tags`);

