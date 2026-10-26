const {join}=require('node:path')
module.exports=async context=>{
  if(context.electronPlatformName!=='darwin')return
  // iCloud Documents may attach Finder metadata that codesign refuses.
  // Remove only packaging detritus from the generated bundle, never quarantine.
  const bundle=join(context.appOutDir,`${context.packager.appInfo.productFilename}.app`)
  for(const attribute of ['com.apple.FinderInfo','com.apple.ResourceFork']) {
    const {spawnSync}=require('node:child_process')
    const r=spawnSync('/usr/bin/xattr',['-dr',attribute,bundle],{encoding:'utf8'})
    if(r.error)throw r.error
    if(r.status!==0&&!r.stderr.includes('No such xattr'))throw new Error('Could not remove generated Finder metadata')
  }
}
