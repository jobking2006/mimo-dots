import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'

export function accountView(result, previous={}) {
  if(!result || !['visible','signedIn','signedOut'].includes(result.login) || typeof result.name!=='string' || result.name.length>80 || /[\r\n]/.test(result.name))throw new Error('MiMo 账号显示无法识别。')
  const same=result.name===previous.name,stillFresh=Date.now()-(previous.verifiedAt||0)<5*60*1000
  const verified=result.login==='signedIn'||(result.login==='visible'&&same&&stillFresh&&previous.login==='signedIn')
  return {name:result.name,login:verified?'signedIn':result.login,observedAt:Date.now(),verifiedAt:result.login==='signedIn'?Date.now():verified?previous.verifiedAt:null,source:result.source==='MiMo 账号菜单'?'MiMo 账号菜单':'MiMo 侧边栏',quota:'unavailable',detail:''}
}

// Only the account UI's allowlisted display fields leave the native reader.
// Account details stay in memory; no MiMo credentials or private databases are read.
export class AccountStatus {
  constructor(executable,onChange) {this.executable=executable;this.onChange=onChange;this.status={name:'',login:'unknown',quota:'unavailable',detail:'正在读取 MiMo 窗口账号…'};this.reading=false}
  publish(){this.onChange({...this.status})}
  async refresh(interactive=false) {
    if(this.reading){if(interactive)throw new Error('正在读取账号，请稍后刷新。');return this.status}
    this.reading=true
    try {
      const result=await new Promise((resolve,reject)=>{
        const child=spawn(this.executable,[],{stdio:['pipe','pipe','pipe'],windowsHide:true});this.child=child
        let value,error,settled=false
        const timer=setTimeout(()=>{error=new Error('账号读取超时，请稍后刷新。');child.kill()},12000)
        const lines=createInterface({input:child.stdout});child.stderr.resume()
        lines.on('line',line=>{try{const e=JSON.parse(line);if(e.type==='result')value=e;else if(e.type==='error')error=new Error(e.message)}catch{error=new Error('账号读取返回异常。')}})
        const finish=e=>{if(settled)return;settled=true;clearTimeout(timer);lines.close();if(this.child===child)this.child=null;e?reject(e):resolve(value)}
        child.on('error',()=>finish(new Error('账号窗口助手暂不可用。')))
        child.on('close',code=>finish(error||(!value||code!==0?new Error('未读取到 MiMo 账号，请打开 MiMo 后刷新。'):null)))
        child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({operation:interactive?'account-sync':'account-peek'})+'\n','utf8')
      })
      this.status=accountView(result,this.status)
    }catch(e){this.status={name:'',login:'unknown',quota:'unavailable',observedAt:Date.now(),detail:e.message}}
    finally{this.reading=false;this.publish()}
    return this.status
  }
  close(){this.child?.kill()}
}
