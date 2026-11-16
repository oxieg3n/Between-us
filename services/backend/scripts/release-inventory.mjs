import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Offline metadata inventory only: no network, subprocess, environment, source-tree or binary scan.
const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const output = path.join(root, 'spec/production/release');
const hash = value => createHash('sha256').update(value).digest('hex');
const relative = value => path.relative(root, value).split(path.sep).join('/');
const optionalJson = async file => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const knownLicenses = new Set(['0BSD','Apache-2.0','Artistic-2.0','BlueOak-1.0.0','BSD-2-Clause','BSD-3-Clause','BSD-4-Clause','CC0-1.0',
  'CC-BY-3.0','CC-BY-4.0','CC-BY-SA-4.0','GPL-2.0-only','GPL-2.0-or-later','GPL-3.0-only','GPL-3.0-or-later','ISC','LGPL-2.1-only',
  'LGPL-2.1-or-later','LGPL-3.0-only','LGPL-3.0-or-later','MIT','MPL-2.0','Python-2.0','Unlicense','WTFPL','Zlib']);
function declaredLicense(raw) {
  const text = typeof raw === 'string' ? raw.trim() : raw && typeof raw.type === 'string' ? raw.type.trim() : '';
  // Conservatively accept only known identifiers and simple balanced AND/OR expressions.
  const tokens = text.match(/\(|\)|AND|OR|[A-Za-z0-9.+-]+/g) ?? [];
  if (!text || tokens.join('') !== text.replace(/\s/g, '')) return 'NOASSERTION';
  let depth = 0, needLicense = true;
  for (const token of tokens) {
    if (token === '(' && needLicense) depth++;
    else if (token === ')' && !needLicense && depth > 0) depth--;
    else if ((token === 'AND' || token === 'OR') && !needLicense) needLicense = true;
    else if (knownLicenses.has(token) && needLicense) needLicense = false;
    else return 'NOASSERTION';
  }
  return !needLicense && depth === 0 ? text : 'NOASSERTION';
}
async function notices(directory) {
  try {
    const names = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && /^(licen[sc]e|notice|copying)(\.[A-Za-z]+)?$/i.test(entry.name));
    return await Promise.all(names.sort((a,b) => a.name.localeCompare(b.name)).map(async entry => {
      const file = path.join(directory, entry.name), bytes = await readFile(file);
      return { path: relative(file), sha256: hash(bytes) };
    }));
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
function archiveChecksum(integrity) {
  if (typeof integrity !== 'string') return [];
  const match = /^(sha1|sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/.exec(integrity);
  return match ? [{ algorithm: match[1].toUpperCase(), checksumValue: Buffer.from(match[2], 'base64').toString('hex') }] : [];
}
function publicDownload(resolved) {
  try { const url = new URL(resolved); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href : 'NOASSERTION'; }
  catch { return 'NOASSERTION'; }
}
const packages = [], relationships = [], rows = [], lockEvidence = [];
const relation = (a, type, b) => relationships.push({ spdxElementId: a, relationshipType: type, relatedSpdxElement: b });
function entry({ id, name, version, license = 'NOASSERTION', download = 'NOASSERTION', comment, checksums = [] }) {
  const item = { SPDXID: id, name, ...(version ? { versionInfo: version } : {}), downloadLocation: download,
    filesAnalyzed: false, licenseConcluded: 'NOASSERTION', licenseDeclared: license, copyrightText: 'NOASSERTION', comment,
    ...(checksums.length ? { checksums } : {}) };
  packages.push(item); return item;
}
const rootId = 'SPDXRef-BetweenUs';
const rootManifest = await optionalJson(path.join(root, 'package.json'));
entry({ id: rootId, name: rootManifest?.name ?? 'Between Us repository', version: rootManifest?.version, license: declaredLicense(rootManifest?.license),
  comment: `Root notice evidence: ${JSON.stringify(await notices(root))}. No whole-repository license conclusion is made; the Expo template notice at apps/mobile/LICENSE is not a blanket application grant.` });
relation('SPDXRef-DOCUMENT', 'DESCRIBES', rootId);
for (const scope of [{ directory: 'apps/mobile', key: 'Mobile' }, { directory: 'services/backend', key: 'Backend' }]) {
  const directory = path.join(root, scope.directory), lockFile = path.join(directory, 'package-lock.json');
  const lockBytes = await readFile(lockFile), lock = JSON.parse(lockBytes.toString('utf8'));
  if (lock.lockfileVersion !== 3 || !lock.packages) throw Error('Unsupported lockfile metadata format.');
  lockEvidence.push({ path: relative(lockFile), sha256: hash(lockBytes) });
  const manifest = await optionalJson(path.join(directory, 'package.json'));
  const projectId = `SPDXRef-${scope.key}`, ids = new Map([['', projectId]]);
  entry({ id: projectId, name: manifest.name, version: manifest.version, license: declaredLicense(manifest.license),
    comment: `First-party ${scope.directory}; package manifest license is reported without a legal conclusion. Notices: ${JSON.stringify(await notices(directory))}` });
  relation(rootId, 'CONTAINS', projectId);
  for (const [location, metadata] of Object.entries(lock.packages).sort(([a],[b]) => a.localeCompare(b))) {
    if (!location) continue;
    if (!location.startsWith('node_modules/') || location.includes('..') || location.includes('\\')) throw Error('Unsupported lock location; no filesystem traversal performed.');
    const name = metadata.name || location.slice(location.lastIndexOf('node_modules/') + 13);
    const id = `SPDXRef-${scope.key}-${hash(location).slice(0,20)}`; ids.set(location, id);
    const installedDirectory = path.resolve(directory, location);
    if (!installedDirectory.startsWith(path.join(directory, 'node_modules') + path.sep)) throw Error('Metadata path escaped its package directory.');
    const installed = await optionalJson(path.join(installedDirectory, 'package.json'));
    const matched = !!installed && installed.name === name && installed.version === metadata.version;
    const rawLicense = metadata.license ?? (matched ? installed.license ?? installed.licenses : undefined);
    const license = declaredLicense(rawLicense), files = matched ? await notices(installedDirectory) : [];
    const checksums = archiveChecksum(metadata.integrity);
    entry({ id, name, version: metadata.version, license, download: publicDownload(metadata.resolved), checksums,
      comment: JSON.stringify({ scope: scope.directory, lockLocation: location, dev: !!metadata.dev, optional: !!metadata.optional,
        installedMetadataMatchesLock: matched, rawLicense: rawLicense ?? null, noticeFiles: files,
        integrityScope: 'npm archive integrity from lockfile; installed bytes were not verified' }) });
    rows.push({ name, version: metadata.version ?? 'NOASSERTION', license, scope: scope.key, matched, notices: files.length,
      raw: typeof rawLicense === 'string' ? rawLicense : JSON.stringify(rawLicense ?? null) });
    relation(projectId, 'CONTAINS', id);
  }
  // Resolve relationships from the lock itself; do not execute packages or ask a registry.
  for (const [location, metadata] of Object.entries(lock.packages)) {
    for (const dependency of Object.keys({ ...metadata.dependencies, ...metadata.optionalDependencies }).sort()) {
      let cursor = location, target;
      do {
        target = ids.get((cursor ? `${cursor}/` : '') + 'node_modules/' + dependency);
        if (target || !cursor) break; cursor = path.posix.dirname(cursor); if (cursor === '.') cursor = '';
      } while (true);
      if (target) relation(ids.get(location), 'DEPENDS_ON', target);
    }
  }
}

// Explicit metadata-only native entries. No Maven/CocoaPods/binary inventory is claimed.
const native = [
  ['llama.cpp (vendored)', 'apps/mobile/node_modules/llama.rn/vendor/llama.cpp', 'MIT'],
  ['codec.cpp (vendored)', 'apps/mobile/node_modules/llama.rn/vendor/codec.cpp', 'MIT'],
  ['OpenCL-Headers (vendored)', 'apps/mobile/node_modules/llama.rn/vendor/OpenCL-Headers', 'Apache-2.0'],
  ['ggml (vendored)', 'apps/mobile/node_modules/llama.rn/vendor/llama.cpp/ggml', 'NOASSERTION'],
  ['SQLCipher (expo-sqlite vendor)', 'apps/mobile/node_modules/expo-sqlite/vendor/sqlcipher', 'NOASSERTION'],
  ['SQLite3 (expo-sqlite vendor)', 'apps/mobile/node_modules/expo-sqlite/vendor/sqlite3', 'NOASSERTION'],
  ['Hermes engine (native artifact)', 'apps/mobile/node_modules/react-native/sdks/hermes-engine', 'NOASSERTION'],
];
const nativeRows = [];
for (const [name, directory, observedLicense] of native) {
  const files = await notices(path.join(root, directory));
  let currentDeclaration = 'NOASSERTION';
  for (const file of files) {
    const text = (await readFile(path.join(root, file.path), 'utf8')).slice(0,4096);
    if (/MIT License|The MIT License/.test(text)) currentDeclaration = 'MIT';
    else if (/Apache License\s+Version 2\.0/.test(text)) currentDeclaration = 'Apache-2.0';
  }
  const id = `SPDXRef-Native-${hash(name).slice(0,16)}`, license = currentDeclaration === observedLicense ? observedLicense : 'NOASSERTION';
  entry({ id, name, license, comment: JSON.stringify({ metadataDirectory: directory, noticeFiles: files,
    review: 'Standalone native version/artifact composition not established. No transitive native license review or binary scan performed.' }) });
  relation('SPDXRef-Mobile', 'CONTAINS', id); nativeRows.push({ name, license, notices: files });
}
const model = entry({ id: 'SPDXRef-OptionalLocalModel', name: 'SmolLM2-360M-Instruct-GGUF Q8_0',
  version: '593b5a2e04c8f3e4ee880263f93e0bd2901ad47f', license: 'Apache-2.0',
  download: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/smollm2-360m-instruct-q8_0.gguf',
  checksums: [{ algorithm: 'SHA256', checksumValue: '48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201' }],
  comment: 'Optional 386404992-byte r12 model. Pin/license/hash transcribed from public spec/LOCAL_AI_MODEL_EVALUATION.md, not a model-file scan or newly fetched publisher license. Not bundled by this inventory. Redistribution notices/model provenance remain owner review gates.' });
relation(model.SPDXID, 'OPTIONAL_DEPENDENCY_OF', 'SPDXRef-Mobile');
const document = { spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT', name: 'Between Us metadata release inventory',
  documentNamespace: `https://betweenus.invalid/spdx/${hash(JSON.stringify(lockEvidence))}`,
  creationInfo: { creators: ['Tool: BetweenUs-release-inventory'], created: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') },
  documentComment: `Offline lock/installed metadata inventory; NOASSERTION conclusions; not legal review, vulnerability audit or built-artifact SBOM. Inputs: ${JSON.stringify(lockEvidence)}`,
  packages, relationships };
const escape = value => String(value).replaceAll('|','\\|').replaceAll('\n',' ');
const groups = new Map();
for (const row of rows) { const key = `${row.name}\0${row.version}\0${row.license}`; const found = groups.get(key);
  if (found) { found.scopes.add(row.scope); found.count++; found.installed += Number(row.matched); found.notices += row.notices; }
  else groups.set(key, { ...row, scopes: new Set([row.scope]), count: 1, installed: Number(row.matched) }); }
const unknown = rows.filter(row => row.license === 'NOASSERTION').length;
const markdown = [
  '# Dependency license metadata', '', `Generated ${document.creationInfo.created} by the offline release-inventory script.`, '',
  `${rows.length} npm lock locations; ${groups.size} distinct name/version/license groups; ${unknown} locations have NOASSERTION declared licenses. All SPDX licenseConcluded fields are NOASSERTION.`, '',
  'This includes development, optional and platform-specific lock entries; an installed metadata match does not verify package bytes. It is not a built APK/AAB/iOS/server artifact inventory, license approval or vulnerability assessment. No registry, private environment, model file, source-tree or binary scan was performed.', '',
  '## First-party and release gates', '',
  '- Whole-repository and first-party package license grants: NOASSERTION. The MIT Expo template notice at apps/mobile/LICENSE is preserved evidence, not a blanket grant for application code, brand assets or model weights.',
  '- llama.rn 0.13.0-rc.11 is a release candidate. Its installed MIT declaration does not establish production compatibility, physical-device safety, supply-chain verification or all native artifact licenses.',
  '- The optional r12 SmolLM2 model has a pinned Apache-2.0 declaration in the public model evaluation record. Full publisher license/NOTICE and upstream provenance must accompany any approved redistribution; no weights were fetched or copied.',
  '- Maven/Gradle, CocoaPods, platform frameworks, SQLCipher crypto dependencies, llama native artifacts and bundled fonts/assets need the owner\'s final artifact/notice inventory. NOASSERTION is an explicit review gate, not permission to ship.',
  '- Notice paths/hashes are recorded in SBOM.json; notices are not copied into a distributable here. Preserve full required copyright/license/NOTICE files when packaging. No vulnerability claim is made without a separate audit.', '',
  '## Inputs', '', ...lockEvidence.map(item => `- ${item.path}: SHA-256 ${item.sha256}`), '',
  '## Explicit native/model status', '', '| Component | Declared metadata | Notice evidence |', '| --- | --- | --- |',
  ...nativeRows.map(row => `| ${escape(row.name)} | ${row.license} | ${row.notices.length ? row.notices.map(item => escape(item.path)).join('; ') : 'NOASSERTION: no standalone notice/version established'} |`),
  '| Optional SmolLM2 Q8_0 model | Apache-2.0 (public pinned evaluation record) | Publisher license/NOTICE redistribution review pending; model not scanned or bundled |', '',
  '## npm name/version mapping', '', '| Package | Version | Declared license | Scope | Installed metadata matches / lock locations | Notice files observed |', '| --- | --- | --- | --- | --- | --- |',
  ...[...groups.values()].sort((a,b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)).map(row =>
    `| ${escape(row.name)} | ${escape(row.version)} | ${escape(row.license)} | ${[...row.scopes].sort().join(', ')} | ${row.installed}/${row.count} | ${row.notices} |`), '',
  'Raw non-SPDX declarations, lock location, archive integrity and notice hashes are retained per package in SBOM.json. The generator uses a conservative SPDX expression allowlist; unsupported declarations become NOASSERTION instead of a guessed license.', '',
].join('\n');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'SBOM.json'), JSON.stringify(document, null, 2) + '\n');
await writeFile(path.join(output, 'DEPENDENCY_LICENSES.md'), markdown);
process.stdout.write(`Wrote offline inventory: ${packages.length} components, ${rows.length} npm locations, ${unknown} declared-license gaps. No dependency or private configuration was changed.\n`);
