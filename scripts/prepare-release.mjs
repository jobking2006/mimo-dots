import { createReadStream } from 'node:fs';
import { appendFile, copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const config = createRequire(import.meta.url)('../build-config.cjs');
const platform=process.env.MIMO_RELEASE_PLATFORM || process.platform;
if(!['darwin','win32'].includes(platform))throw new Error('Unsupported release platform');
const arch=process.env.MIMO_TARGET_ARCH || process.arch;
const installer = resolve(root, config.directories.output, platform==='darwin'?`MiMo-Dots-${pkg.version}-${arch}.dmg`:`${config.productName} Setup ${pkg.version}.exe`);
const info = await stat(installer);
if (!info.isFile() || info.size === 0) throw new Error('Installer is missing or empty.');

const hash = createHash('sha256');
for await (const chunk of createReadStream(installer)) hash.update(chunk);
const digest = hash.digest('hex');
const publishedName = platform==='darwin'?`MiMo-Dots-${pkg.version}-${arch}.dmg`:`${config.productName.replaceAll(' ', '.')}.Setup.${pkg.version}.exe`;
const publishedInstaller = resolve(dirname(installer), publishedName);
if(installer!==publishedInstaller)await copyFile(installer, publishedInstaller);
const checksum = `${publishedInstaller}.sha256`;
await writeFile(checksum, `${digest}  ${publishedName}\n`, 'ascii');

const assetPath = relative(root, publishedInstaller).split(sep).join('/');
const checksumPath = relative(root, checksum).split(sep).join('/');
const outputs = `version=${pkg.version}\ninstaller_path=${assetPath}\nchecksum_path=${checksumPath}\n`;
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, outputs, 'utf8');
console.log(outputs.trim());
console.log(`size=${info.size}\nsha256=${digest}`);
