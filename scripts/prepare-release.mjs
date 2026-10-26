import { createReadStream } from 'node:fs';
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const config = createRequire(import.meta.url)('../build-config.cjs');
const installer = resolve(root, config.directories.output, `${config.productName} Setup ${pkg.version}.exe`);
const info = await stat(installer);
if (!info.isFile() || info.size === 0) throw new Error('Windows installer is missing or empty.');

const hash = createHash('sha256');
for await (const chunk of createReadStream(installer)) hash.update(chunk);
const digest = hash.digest('hex');
const checksum = `${installer}.sha256`;
await writeFile(checksum, `${digest}  ${config.productName} Setup ${pkg.version}.exe\n`, 'ascii');

const assetPath = relative(root, installer).split(sep).join('/');
const checksumPath = relative(root, checksum).split(sep).join('/');
const outputs = `version=${pkg.version}\ninstaller_path=${assetPath}\nchecksum_path=${checksumPath}\n`;
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, outputs, 'utf8');
console.log(outputs.trim());
console.log(`size=${info.size}\nsha256=${digest}`);
