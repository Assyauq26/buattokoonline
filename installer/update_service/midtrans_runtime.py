"""Generate only a missing installation encryption key; never rotate an existing key."""
import base64,secrets,re,os
from pathlib import Path
import core
from .native_forward import require
def ensure_key(candidate):
    service=candidate['services']['app']
    found=[]
    for item in service.get('env_file',[]):
        path=Path(item if isinstance(item,str) else item['path'])
        require(path.is_absolute() and path.is_relative_to(core.CONFIG) and not path.is_symlink(),'payment_key_path')
        for line in path.read_text().splitlines():
            if line.startswith('PAYMENT_INTEGRATION_ENCRYPTION_KEY='):found.append(line.split('=',1)[1])
    if 'PAYMENT_INTEGRATION_ENCRYPTION_KEY' in service.get('environment',{}):found.append(service['environment']['PAYMENT_INTEGRATION_ENCRYPTION_KEY'])
    if found:
        require(all(v==found[0] for v in found) and re.fullmatch(r'[A-Za-z0-9+/]{43}=',found[0]) is not None,'payment_key_configuration')
        return
    path=core.CONFIG/'midtrans-encryption.env'
    if path.exists():
        require(path.is_file() and not path.is_symlink() and path.stat().st_uid==0 and path.stat().st_mode&0o077==0,'payment_key_permissions')
        value=path.read_text().strip()
        require(re.fullmatch(r'PAYMENT_INTEGRATION_ENCRYPTION_KEY=[A-Za-z0-9+/]{43}=',value) is not None,'payment_key_configuration')
    else:
        with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as file:file.write('PAYMENT_INTEGRATION_ENCRYPTION_KEY='+base64.b64encode(secrets.token_bytes(32)).decode()+'\n')
    service.setdefault('env_file',[]).append(str(path))
