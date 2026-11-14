#!/usr/bin/env python3
"""Guarded Hubify-only PR56 app update, with no migration or public release."""
import argparse,json,os,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'installer'))
import core,promotions_cutover as official,payment_test_cutover as pilot
from update_service.runtime import install

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    for name in ['dry-run','apply','reconcile']:mode.add_argument('--'+name,action='store_true')
    parser.add_argument('--candidate',required=True);parser.add_argument('--candidate-sha256',required=True)
    parser.add_argument('--source-sha',required=True);parser.add_argument('--baseline-archive',required=True)
    parser.add_argument('--external-work-stopped',action='store_true')
    args=parser.parse_args();install();os.umask(0o077)
    official.check(not args.external_work_stopped or args.reconcile,'external work attestation requires reconcile')
    driver=pilot.Native(ROOT,args.candidate,args.candidate_sha256,args.source_sha,args.baseline_archive)
    driver.external_work_stopped=args.external_work_stopped
    engine=official.Cutover(driver)
    if args.dry_run: print(json.dumps(engine.dry_run(),sort_keys=True));return
    req=urllib.request.Request('https://api.github.com/repos/'+core.REPO+'/pulls/56',headers={'User-Agent':'Hubify-PR56-test-operator'})
    with urllib.request.urlopen(req,timeout=30) as response:pr=json.load(response)
    official.check(pr['state']=='open' and not pr.get('merged') and pr['head']['sha']==args.source_sha and pr['head']['repo']['full_name']==core.REPO and pr['base']['ref']=='main','exact PR56 head required')
    with official.operation_lock():
        result=engine.reconcile() if args.reconcile else engine.apply()
        print(json.dumps({'phase':result['phase'],'source_sha':args.source_sha,'artifact_sha256':args.candidate_sha256,'backup':result.get('backup')}))
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,core.StoreError) else 'Test cutover stopped; inspect root-only journal.',file=sys.stderr);sys.exit(1)
