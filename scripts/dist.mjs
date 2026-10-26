import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const args=process.platform==='darwin'?['scripts/build-mac.mjs']:process.platform==='win32'?[require.resolve('electron-builder/cli.js'),'--win','nsis','--x64','--config','build-config.cjs','--publish','never']:null
if(!args)throw new Error('Unsupported installer platform')
const result=spawnSync(process.execPath,args,{stdio:'inherit'})
if(result.error)throw result.error
process.exit(result.status??1)
