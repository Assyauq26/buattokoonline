"""Do not persist subprocess output: it may contain URLs or provider secrets."""
import os
import subprocess
import core

def safe_run(args, input=None, timeout=120, capture=True):
    result = subprocess.run([str(x) for x in args], input=input,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout,
        env={**os.environ, 'COMPOSE_PARALLEL_LIMIT': '1'})
    if result.returncode:
        raise core.StoreError('operation_failed')
    return result.stdout.decode('utf8').strip()

def install():
    core.run = safe_run
