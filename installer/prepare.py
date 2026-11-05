import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
import core

os.umask(0o077)
source = Path(sys.argv[1]).resolve()
local = sys.argv[2:] == ['--local-test']
if sys.argv[2:] not in [[], ['--local-test']]:
    raise SystemExit('Gunakan sudo bash install.sh [--local-test]')
for path in [core.CONFIG, core.ROOT, core.DATA]:
    if path.is_symlink():
        raise SystemExit('Direktori instalasi tidak boleh berupa symlink.')
    path.mkdir(mode=0o700 if path == core.CONFIG else 0o755, exist_ok=True)
media = core.DATA / 'media'
media.mkdir(mode=0o700, exist_ok=True)
os.chown(media, 1000, 1000)
(core.ROOT / 'deploy').mkdir(exist_ok=True)
(core.ROOT / 'manager').mkdir(mode=0o700, exist_ok=True)
sha = core.run(['git', '-C', source, 'rev-parse', 'HEAD'])
if core.STATE.exists():
    state = core.read_json(core.STATE)
    if state['local_test'] != local or state['source_sha'] != sha:
        raise SystemExit('Lanjutkan menggunakan mode dan exact Git SHA instalasi pertama. Data tidak diubah.')
else:
    token = secrets.token_urlsafe(32)
    (core.CONFIG / 'setup-token').write_text(token)
    state = {'step': 1, 'local_test': local, 'source_sha': sha, 'setup_hash': hashlib.sha256(token.encode()).hexdigest(),
             'proof': secrets.token_hex(24), 'busy': False, 'complete': False}
    core.atomic_json(core.STATE, state)
core.run(['rsync', '-a', '--exclude=node_modules', '--exclude=.next', '--exclude=*.tsbuildinfo', '--exclude=.env*', source / 'app', str(core.ROOT) + '/'])
core.run(['rsync', '-a', str(source / 'installer') + '/', str(core.ROOT / 'manager') + '/'])
for name in ['VERSION', 'update.sh', 'restore.sh']:
    (core.ROOT / 'manager' / name).write_bytes((source / name).read_bytes())
for name in ['single-store-maintenance.service', 'single-store-maintenance.timer']:
    (core.ROOT / 'manager' / name).write_bytes((source / 'deploy' / name).read_bytes())
(core.ROOT / 'manager/compose-base.json').write_bytes((source / 'deploy/compose.yaml').read_bytes())
if not core.COMPOSE.exists():
    core.atomic_json(core.COMPOSE, core.compose_for(core.ROOT))
if state.get('bootstrap_started'):
    try:
        existing = json.loads(core.sql('SELECT json_build_object(\'users\',(SELECT count(*) FROM "User"),\'identity\',(SELECT count(*) FROM "StoreAppearance"));'))
        state['has_admin'] = existing == {'users': 1, 'identity': 1}
        core.atomic_json(core.STATE, state)
    except core.StoreError:
        pass
Path('/etc/systemd/system/single-store-setup.service').write_text('''[Unit]
Description=Owner-only local store setup wizard
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=simple
UMask=0077
ExecStart=/usr/bin/python3 /opt/single-store/manager/wizard.py
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
''')
core.run(['systemctl', 'daemon-reload'])
core.run(['systemctl', 'enable', '--now', 'single-store-setup.service'])
token = (core.CONFIG / 'setup-token').read_text().strip()
print('\nWizard hanya mendengarkan 127.0.0.1:8787. Dari komputer kamu jalankan:')
print('ssh -L 8787:127.0.0.1:8787 USER@IP_VPS')
print('Buka tautan sekali pakai ini melalui tunnel (jangan bagikan):')
print('http://127.0.0.1:8787/#setup=' + token)
print('Tutup terminal/browser dengan aman. Jalankan perintah installer yang sama untuk melanjutkan.')
