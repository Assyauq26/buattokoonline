"""Actual DB/HTTP pending-carrier and duplicate placeholder-webhook checks."""
import json
import os
import uuid
import updater_linux_lab as lab
from update_service.server import Controller
from update_service.native_forward import NativeForward
from update_service.trust import Rejected
import core

if __name__=='__main__':
    if os.geteuid()!=0:raise SystemExit('Root owned disposable lab only')
    with lab.context('e18a0006') as (root,cfg):
        core.dc(['up','-d','--no-build','--wait','db','app','proxy'])
        core.sql('''INSERT INTO "Order" (id,"orderNumber","userId",subtotal,total,"updatedAt")
          SELECT 'isolated-carrier-e18a0006','ISOLATED-JNT-e18a0006',id,0,0,NOW()
          FROM "User" WHERE email='updater-admin-e18a0006@example.invalid';
          INSERT INTO "JntShipmentRequest" ("orderId","externalOrderId","payloadFingerprint",state,"requestedBy","updatedAt")
          VALUES ('isolated-carrier-e18a0006','LABE18A0006',repeat('0',64),'UNKNOWN','isolated-test-no-provider-call',NOW());''')
        controller=Controller(cfg);catalog=controller.checked(True);status=controller.status()
        assert status['availability']['state']=='blocked' and status['availability']['reason']=='carrier_work_pending' and status['release'] is None
        job_count=len(controller.state.jobs())
        admin=json.loads(core.sql('''SELECT row_to_json(x) FROM (SELECT id,"sessionVersion" FROM "User" WHERE email='updater-admin-e18a0006@example.invalid') x;'''))
        try:controller.command({'action':'start','installation':cfg['installation'],'actor':admin['id'],'sessionVersion':admin['sessionVersion'],
            'sessionHash':'b'*64,'sessionExpires':int(__import__('time').time())+86400,'sha':catalog['releases'][0]['sha'],'requestKey':str(uuid.uuid4())})
        except Rejected as error:assert str(error)=='release_not_available'
        else:raise AssertionError('Pending carrier start must be denied')
        assert len(controller.state.jobs())==job_count
        driver=NativeForward(controller.engine,{'id':'read-only-probe','release':json.dumps(catalog['releases'][0])})
        before=driver.data_snapshot()
        responses=[]
        for _ in range(2):
            value=json.loads(core.run(['curl','--fail','--silent','--max-time','20','-X','POST','-H','Content-Type: application/json',
                '--data','{"event_id":"isolated-late-duplicate","order_id":"LABE18A0006"}',
                'http://127.0.0.1:3088/api/v1/webhooks/jnt']))
            assert value['success'] and value['data']['received'];responses.append(True)
        assert before==driver.data_snapshot()
        assert core.sql('''SELECT state FROM "JntShipmentRequest" WHERE "orderId"='isolated-carrier-e18a0006';''')=='UNKNOWN'
        report={'case':'e18a0006','pendingCarrierBlocksActualPreflight':True,'startDeniedWithoutNewJob':True,'carrierOutcomeRemainsUnknown':True,
            'duplicateLateWebhookAcknowledgements':len(responses),'existingTableHashesUnchanged':len(before),'externalCarrierRequests':0,
            'webhookDurableProcessingImplemented':False,'limitation':'Published webhook is acknowledgement-only; this proves no duplicate mutation, not provider event delivery/replay.','productionStoresUpdated':0}
        (root/'carrier-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
        core.dc(['stop'])
