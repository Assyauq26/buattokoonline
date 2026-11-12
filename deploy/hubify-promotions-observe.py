#!/usr/bin/env python3
"""Read-only Hubify observation, stdout JSON only. No API/shipping requests.

Run the reviewed bytes through sudo python3 stdin. Redirect stdout on the
operator machine, not on the VPS. No production files or ledger are written.
"""
import base64
import datetime
import hashlib
import json
from pathlib import Path
import subprocess


def run(args, input=None):
    result = subprocess.run(args, input=input, capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise RuntimeError('Read-only observation command failed: ' + args[0])
    return result.stdout.strip()


def main():
    config = Path('/etc/single-store')
    compose_path = Path('/opt/single-store/deploy/compose.yaml')
    compose = json.loads(compose_path.read_text())
    source = Path(compose['services']['app']['build']['context']).parent
    dc = ['docker', 'compose', '-f', str(compose_path)]
    setup = json.loads((config / 'setup.json').read_text())
    updater = json.loads((config / 'updater/config.json').read_text())
    if setup.get('domain') != 'hubify.web.id' or not setup.get('complete') or setup.get('local_test'):
        raise RuntimeError('Not the completed Hubify installation')

    def sql(query):
        output = run(dc + ['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'store',
                           '-At', '-v', 'ON_ERROR_STOP=1'], 'BEGIN READ ONLY;\n' + query + '\nROLLBACK;')
        return json.loads(output[output.index('{'):output.rindex('}') + 1])

    schema = sql("""SELECT json_build_object(
      'columns',(SELECT json_agg(row_to_json(c) ORDER BY table_name,ordinal_position) FROM
        (SELECT table_name,column_name,ordinal_position,is_nullable,data_type,udt_name,column_default
         FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations') c),
      'constraints',(SELECT json_agg(row_to_json(c) ORDER BY tablename,conname) FROM
        (SELECT cl.relname AS tablename,co.conname,co.contype,pg_get_constraintdef(co.oid) AS definition
         FROM pg_constraint co JOIN pg_class cl ON co.conrelid=cl.oid JOIN pg_namespace ns ON cl.relnamespace=ns.oid
         WHERE ns.nspname='public' AND cl.relname <> '_prisma_migrations') c),
      'indexes',(SELECT json_agg(row_to_json(i) ORDER BY tablename,indexname) FROM
        (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') i),
      'rls',(SELECT json_agg(row_to_json(r) ORDER BY relname) FROM
        (SELECT relname,relrowsecurity FROM pg_class cl JOIN pg_namespace ns ON cl.relnamespace=ns.oid
         WHERE ns.nspname='public' AND relkind='r' AND relname <> '_prisma_migrations') r));"""
    )
    database = sql("""SELECT json_build_object('ledger',(SELECT json_agg(row_to_json(m) ORDER BY migration_name)
       FROM (SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,
             rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations") m));"""
    )
    runtime_js = """const fs=require('fs'),crypto=require('crypto');let input='';
    process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{
      const result={};for(const name of JSON.parse(input)){
        const path='/app/'+name.slice(4);
        try{const b=fs.readFileSync(path);result[name]={sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length}}
        catch{result[name]={missing:true}}
      }console.log(JSON.stringify(result));});"""
    paths = [p for p in run(['git', '-C', str(source), 'ls-files', 'app']).splitlines()
             if not p.startswith(('app/tests/', 'app/resources/'))]
    runtime = json.loads(run(dc + ['exec', '-T', 'app', 'node', '-e', runtime_js], json.dumps(paths)))
    containers = []
    for cid in run(dc + ['ps', '-q']).splitlines():
        item = json.loads(run(['docker', 'inspect', cid]))[0]
        containers.append({'service': item['Config']['Labels'].get('com.docker.compose.service'),
                           'image': item['Image'], 'running': item['State']['Running'],
                           'health': item['State'].get('Health', {}).get('Status')})
    app_id = run(dc + ['ps', '-q', 'app'])
    environment = json.loads(run(['docker', 'inspect', app_id]))[0]['Config']['Env']
    allowed = {'STORE_BUILD_SHA', 'STORE_INSTALLED_VERSION', 'STORE_UPDATE_CHANNEL',
               'JNT_PRODUCTION_API_APPROVED', 'JNT_PRODUCTION_ORDER_APPROVED', 'JNT_ENABLE_ORDER_CREATE'}
    safe_environment = {k: v for line in environment for k, _, v in [line.partition('=')] if k in allowed}
    original = Path('/opt/single-store/development-sources/5145bdcd7cd84f93f49a066aa669560e858db0ac')
    history = {}
    for name in ['20261109120000_order_resolution_workflow', '20261109121500_resolution_transfer_review']:
        history[name] = {}
        for label, root in [('original', original), ('active', source)]:
            p = root / 'app/prisma/migrations' / name / 'migration.sql'
            if p.is_symlink():
                raise RuntimeError('Historical symlink rejected')
            raw = p.read_bytes()
            history[name][label] = {'base64': base64.b64encode(raw).decode(),
                                     'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
    observation = {
        'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'version': json.loads((config / 'version.json').read_text()),
        'source_commit': run(['git', '-C', str(source), 'rev-parse', 'HEAD']),
        'app_tree': run(['git', '-C', str(source), 'rev-parse', 'HEAD:app']),
        'source_version': (source / 'VERSION').read_text().strip(),
        'source_inventory': {p.parent.name: hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in (source / 'app/prisma/migrations').glob('*/migration.sql')},
        'app_environment': safe_environment, 'containers': containers,
        'database': database, 'historical_files': history,
    }
    print(json.dumps({'observation': observation, 'runtime': runtime, 'schema': schema,
                      'context': {'installation': updater.get('installation'), 'origin': updater.get('origin')},
                      'production_writes': False}, sort_keys=True))


if __name__ == '__main__':
    main()
