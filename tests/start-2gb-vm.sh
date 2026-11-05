#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
test -c /dev/kvm || { echo 'KVM tidak tersedia; tidak dapat mengklaim uji VM 2 GB.'; exit 1; }
sudo apt-get update -qq
sudo apt-get install -y -qq qemu-system-x86 qemu-utils cloud-image-utils
ssh-keygen -q -t ed25519 -N '' -f /tmp/store-vm-client
ssh-keygen -q -t ed25519 -N '' -f /tmp/store-vm-host
python3 - <<'PY'
from pathlib import Path
private=Path('/tmp/store-vm-host').read_text()
public=Path('/tmp/store-vm-host.pub').read_text().strip()
client=Path('/tmp/store-vm-client.pub').read_text().strip()
data='#cloud-config\nssh_pwauth: false\nssh_authorized_keys:\n  - '+client+'\nssh_keys:\n  ed25519_private: |\n'+''.join('    '+line+'\n' for line in private.splitlines())+'  ed25519_public: '+public+'\npackages: [git, curl]\nswap:\n  filename: /swapfile\n  size: 2147483648\n  maxsize: 2147483648\n'
Path('/tmp/store-vm-userdata').write_text(data)
Path('/tmp/store-vm-metadata').write_text('instance-id: store-test-2gb\nlocal-hostname: store-test\n')
Path('/tmp/store-vm-knownhosts').write_text('[127.0.0.1]:2222 '+public+'\n')
PY
curl --fail --location --silent --show-error https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img -o /tmp/store-vm-base.img
qemu-img create -f qcow2 -F qcow2 -b /tmp/store-vm-base.img /tmp/store-vm-disk.qcow2 45G
cloud-localds /tmp/store-vm-seed.img /tmp/store-vm-userdata /tmp/store-vm-metadata
sudo qemu-system-x86_64 -enable-kvm -cpu host -smp 2 -m 2048 -drive file=/tmp/store-vm-disk.qcow2,format=qcow2,if=virtio -drive file=/tmp/store-vm-seed.img,format=raw,if=virtio -netdev user,id=n0,hostfwd=tcp:127.0.0.1:2222-:22,hostfwd=tcp:127.0.0.1:80-:80,hostfwd=tcp:127.0.0.1:443-:443 -device virtio-net-pci,netdev=n0 -display none -daemonize -pidfile /tmp/store-vm.pid
guest(){ ssh -i /tmp/store-vm-client -p 2222 -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/tmp/store-vm-knownhosts ubuntu@127.0.0.1 "$@"; }
for attempt in $(seq 1 90); do
  if guest true 2>/dev/null; then break; fi
  sleep 2
done
guest 'sudo cloud-init status --wait'
ssh -i /tmp/store-vm-client -p 2222 -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/tmp/store-vm-knownhosts -o ExitOnForwardFailure=yes -N -f -L 127.0.0.1:8787:127.0.0.1:8787 -L 127.0.0.1:3000:127.0.0.1:3000 ubuntu@127.0.0.1
guest "git clone --no-checkout https://github.com/${GITHUB_REPOSITORY}.git /tmp/single-store-clone && git -C /tmp/single-store-clone fetch --depth=1 origin ${GITHUB_SHA} && git -C /tmp/single-store-clone checkout --detach FETCH_HEAD"
guest 'sudo systemd-run --unit store-resource-monitor /usr/bin/python3 /tmp/single-store-clone/tests/resource-monitor.py'
guest 'free -k; nproc; df -Pk /var'
