"""Fresh-only hook must never bootstrap an existing store or repeat an install."""
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'installer'))
if os.name!='posix':sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None))
from update_service import fresh_worker_hook as hook
from update_service.trust import Rejected


class FreshTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.p=Path(self.tmp.name)
        self.config=self.p/'etc-store';self.state=self.config/'setup.json';self.units=self.p/'units';self.units.mkdir()
        for name,value in [('core.CONFIG',self.config),('core.ROOT',self.p/'opt-store'),('core.DATA',self.p/'data-store'),('core.STATE',self.state),
            ('update_service.fresh_worker_hook.HOOK',self.p/'hook'),('update_service.fresh_worker_hook.UNITS',self.units)]:
            p=patch(name,value);p.start();self.addCleanup(p.stop)
        p=patch.object(os,'geteuid',return_value=0,create=True);p.start();self.addCleanup(p.stop)
    def test_existing_data_refused_before_arming(self):
        self.config.mkdir()
        with self.assertRaises(Rejected):hook.arm('/opt/source','a'*40)
        self.assertFalse((self.p/'hook').exists())
    def test_auto_install_waits_for_complete_wizard_then_disarms(self):
        with patch('update_service.worker_upgrade.inventory',return_value={}),patch('core.run') as run,patch('update_service.worker_upgrade.install') as install:
            hook.arm('/opt/source','a'*40)
            hook.run();install.assert_not_called()
            (self.config/'updater').mkdir(parents=True)
            (self.config/'updater/activated.json').write_text('{}')
            self.state.write_text(json.dumps({'complete':False}));hook.run();install.assert_not_called()
            self.state.write_text(json.dumps({'complete':True}));hook.run()
            install.assert_called_once_with(str(Path('/opt/source').resolve()),'a'*40,True)
            hook.run();install.assert_called_once()
            self.assertIn(['systemctl','disable','--now',hook.UNIT+'.timer'],[c.args[0] for c in run.call_args_list])
