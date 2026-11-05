const $=id=>document.getElementById(id);let current,busy=false,lastKey='';
async function api(path,data){const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const result=await response.json();if(!response.ok)throw Error(result.error||'Proses belum berhasil.');return result;}
function render(state){current=state;busy=!!state.busy;const key=[state.step,busy,state.has_admin,state.status,state.message].join('|');
  $('access').hidden=true;$('progress').hidden=!busy;$('progress').textContent=state.message||'Sedang memproses…';
  if(!busy&&state.message&&!state.complete){$('error').hidden=false;$('error').textContent=state.message;}else $('error').hidden=true;
  for(let i=1;i<=4;i++){$('step'+i).hidden=state.step!==i;document.querySelectorAll('nav li')[i-1].classList.toggle('current',state.step===i);}
  if(document.activeElement!==$('name'))$('name').value=state.name||'';
  if(document.activeElement!==$('domain'))$('domain').value=state.domain||'';
  $('www').checked=!!state.www;$('ip').textContent=state.ips?.ipv4||'IP publik akan diperiksa dari VPS ini';
  $('domain-status').textContent=(state.local_test?'MODE UJI LOKAL — ':'')+(state.status||'Menunggu DNS diperbarui');
  $('domain-next').hidden=state.status!=='Domain berhasil terhubung';$('check-domain').textContent=state.status?'Periksa Lagi':'Periksa Koneksi Domain';
  $('dns-evidence').hidden=!state.evidence;$('dns-evidence').textContent=state.evidence?JSON.stringify(state.evidence,null,2):'';
  $('admin-fields').hidden=!!state.has_admin;for(const input of $('admin-fields').querySelectorAll('input'))input.required=!state.has_admin;
  $('create-store').textContent=state.has_admin?'Lanjutkan Finalisasi':'Buat Toko Saya';
  document.querySelectorAll('button').forEach(button=>button.disabled=busy);
  if(state.complete){$('result').replaceChildren();for(const[label,value]of[['Nama brand',state.name],['Domain',state.domain],['HTTPS',state.evidence?.https==='PUBLIC_CERTIFICATE_VALID'?'Sertifikat publik valid':'CA lokal valid — khusus pengujian']]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('result').append(row);}$('dashboard').href='https://'+state.domain+'/admin';$('storefront').href='https://'+state.domain+'/';}
  lastKey=key;
}
function failure(error){$('error').hidden=false;$('error').textContent=error.message;}
async function act(path,data){try{render(await api(path,data));}catch(error){failure(error);}}
$('name-form').addEventListener('submit',e=>{e.preventDefault();act('name',{name:$('name').value});});
$('domain-form').addEventListener('submit',e=>{e.preventDefault();act('domain',{domain:$('domain').value,www:$('www').checked});});
$('domain-next').onclick=()=>act('next',{});document.querySelectorAll('.back').forEach(button=>button.onclick=()=>act('back',{}));
$('admin-form').addEventListener('submit',e=>{e.preventDefault();const data={email:$('email').value,password:$('password').value,confirmation:$('confirmation').value};$('password').value='';$('confirmation').value='';act('admin',data);});
document.querySelectorAll('.toggle').forEach(button=>button.onclick=()=>{const input=$(button.dataset.target),show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Sembunyikan':'Lihat';button.setAttribute('aria-pressed',String(show));});
(async()=>{try{const token=new URLSearchParams(location.hash.slice(1)).get('setup');history.replaceState(null,'',location.pathname);render(token?await api('session',{token}):await api('state'));}catch(error){failure(error);}})();
setInterval(async()=>{if(!current||current.complete)return;try{const state=await api('state');const key=[state.step,!!state.busy,state.has_admin,state.status,state.message].join('|');if(key!==lastKey||busy)render(state);}catch(error){failure(Error('Setup belum terjangkau. Progres tersimpan; buka kembali tautan dari server.'));}},2000);
