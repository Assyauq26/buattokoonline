import {execFileSync} from 'node:child_process';
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
export function runRoot(args,options={}){
  if(process.env.STORE_VM_SSH==='1'){
    if(args[0]==='--preserve-env=GITHUB_ACTIONS')args=args.slice(1);
    const remote=['sudo','env','GITHUB_ACTIONS=true',...args].map(quote).join(' ');
    return execFileSync('ssh',['-i','/tmp/store-vm-client','-p','2222','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/tmp/store-vm-knownhosts','ubuntu@127.0.0.1',remote],{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
  }
  return execFileSync('sudo',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
}
