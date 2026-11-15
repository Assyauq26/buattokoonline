#!/usr/bin/env python3
"""Official exact Hubify v1.8.2/schema33 -> v1.8.3/schema34 cutover."""
import argparse,json,os,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'installer'))
import core,promotions_cutover as official
from payment_live_cutover import Native
from update_service.runtime import install
def main():
    p=argparse.ArgumentParser(description=__doc__);mode=p.add_mutually_exclusive_group(required=True)
    for name in ('dry-run','apply','reconcile'):mode.add_argument('--'+name,action='store_true')
    p.add_argument('--candidate',required=True);p.add_argument('--candidate-sha256',required=True);p.add_argument('--source-sha',required=True)
    p.add_argument('--baseline-archive',required=True);p.add_argument('--prepared-images');p.add_argument('--pull-request',type=int)
    p.add_argument('--external-work-stopped',action='store_true');a=p.parse_args()
    install();os.umask(0o077)
    official.check(not a.external_work_stopped or a.reconcile,'external attestation only for reconciliation')
    driver=Native(ROOT,a.candidate,a.candidate_sha256,a.source_sha,a.baseline_archive)
    if a.prepared_images:
        from update_service.worker_upgrade import secure_path
        path=Path(a.prepared_images);secure_path(path);official.check(not path.stat().st_mode&0o077,'prepared receipt permissions')
        driver.prepared_images=core.read_json(path)
    driver.external_work_stopped=a.external_work_stopped;engine=official.Cutover(driver)
    if a.dry_run:print(json.dumps(engine.dry_run(),sort_keys=True));return
    official.check(a.pull_request and a.pull_request>56,'merged continuation PR required')
    req=urllib.request.Request('https://api.github.com/repos/'+core.REPO+'/pulls/'+str(a.pull_request),headers={'User-Agent':'Hubify-payment-release-operator'})
    with urllib.request.urlopen(req,timeout=30) as response:pr=json.load(response)
    official.check(pr.get('merged') is True and pr.get('merge_commit_sha')==a.source_sha and pr['base']['ref']=='main' and pr['head']['repo']['full_name']==core.REPO,'exact merged reviewed PR required')
    with official.operation_lock():
        j=engine.reconcile() if a.reconcile else engine.apply()
        print(json.dumps(dict(phase=j['phase'],source_sha=a.source_sha,artifact_sha256=a.candidate_sha256,backup=j.get('backup'))))
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,core.StoreError) else 'Payment cutover stopped; inspect the root-only journal.',file=sys.stderr);sys.exit(1)
