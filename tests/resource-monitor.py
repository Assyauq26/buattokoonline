import json
import os
from pathlib import Path
import time

start=time.time()
report={'started_at':start,'samples':0,'peak_used_ram_kib':0,'peak_swap_used_kib':0,'peak_node_rss_kib':0,'peak_node_hwm_kib':0}
baseline=None
while True:
    memory={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if len(line.split())>=2 and line.split()[1].isdigit()}
    vm={line.split()[0]:int(line.split()[1]) for line in Path('/proc/vmstat').read_text().splitlines()}
    if baseline is None: baseline=vm
    report.update(mem_total_kib=memory['MemTotal'],swap_total_kib=memory['SwapTotal'],vcpus=os.cpu_count(),samples=report['samples']+1,elapsed_seconds=round(time.time()-start,1))
    report['peak_used_ram_kib']=max(report['peak_used_ram_kib'],memory['MemTotal']-memory['MemAvailable'])
    report['peak_swap_used_kib']=max(report['peak_swap_used_kib'],memory['SwapTotal']-memory['SwapFree'])
    for key in ['oom_kill','pswpin','pswpout','pgmajfault']: report[key+'_delta']=vm.get(key,0)-baseline.get(key,0)
    for process in Path('/proc').glob('[0-9]*'):
        try:
            if process.joinpath('comm').read_text().strip()!='node': continue
            status={line.split(':')[0]:int(line.split()[1]) for line in process.joinpath('status').read_text().splitlines() if line.startswith(('VmRSS:','VmHWM:'))}
            report['peak_node_rss_kib']=max(report['peak_node_rss_kib'],status.get('VmRSS',0))
            report['peak_node_hwm_kib']=max(report['peak_node_hwm_kib'],status.get('VmHWM',0))
        except (OSError,ValueError): pass
    try:
        setup=json.loads(Path('/etc/single-store/setup.json').read_text())
        report['build_seconds']=setup.get('build_seconds')
        report['installed']=bool(setup.get('complete'))
    except (OSError,ValueError): pass
    Path('/tmp/store-resource.json').write_text(json.dumps(report,indent=2))
    os.chmod('/tmp/store-resource.json',0o644)
    time.sleep(1)
