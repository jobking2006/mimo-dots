import {mkdtemp, mkdir, copyFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),pkg=require('../package.json')
if(process.platform!=='darwin')throw new Error('DMG must be built on macOS')
const arch=process.env.MIMO_TARGET_ARCH || process.arch
if(!['arm64','x64'].includes(arch))throw new Error('Unsupported architecture')
// Build outside iCloud Documents: File Provider adds FinderInfo to .app bundles.
const scratch=await mkdtemp(join(tmpdir(),'mimo-dots-build-'))
const env={...process.env,MIMO_TARGET_ARCH:arch,MIMO_BUILD_OUTPUT:scratch}
function run(file,args) {const r=spawnSync(file,args,{stdio:'inherit',env});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1)}
run(process.execPath,['scripts/build-bridge.mjs'])
run(process.execPath,[require.resolve('electron-builder/cli.js'),'--mac','dmg',`--${arch==='arm64'?'arm64':'x64'}`,'--config','build-config.cjs','--publish','never'])
run('/usr/bin/codesign',['--verify','--deep','--strict',join(scratch,arch==='arm64'?'mac-arm64':'mac',`${pkg.productName}.app`)])
const output=resolve(`release/dots-${pkg.version}`);await mkdir(output,{recursive:true})
const name=`MiMo-Dots-${pkg.version}-${arch}.dmg`
await copyFile(join(scratch,name),join(output,name))
console.log(`DMG: ${join(output,name)}\nBuild staging: ${scratch}`)
