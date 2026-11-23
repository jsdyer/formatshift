import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from refresh_ci import config_changed, refresh_opening
ROOT=Path(__file__).resolve().parents[1]

class RefreshTests(unittest.TestCase):
    def test_change_detection_uses_full_push_range_and_only_config(self):
        seen=[]
        self.assertTrue(config_changed('abc','def',lambda args:seen.append(args) or 'web/config.json\n'))
        self.assertEqual(seen,[['diff','--name-only','abc','def','--','web/config.json']])
        self.assertFalse(config_changed('abc','def',lambda args:''))
        self.assertTrue(config_changed('0'*40,'def'))
    def test_failed_live_collection_preserves_last_good_bytes(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            shutil.copytree(ROOT/'web',root/'web')
            target=root/'web/data/opening.json'
            before=target.read_bytes()
            class Fail:
                def get(self,*args,**kwargs):raise OSError('source unavailable')
            with self.assertRaises(OSError):refresh_opening(root,Fail())
            self.assertEqual(target.read_bytes(),before)
            self.assertFalse((root/'collection-checks/api-receipt.json').exists())
    def test_success_writes_matching_live_receipt_and_evidence(self):
        fixture=json.loads((ROOT/'tests/fixtures/release-sample.json').read_text())['releases'][0]
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            shutil.copytree(ROOT/'web',root/'web')
            class Success:
                def get(self,path,**params):return {**fixture,'id':path.split('/')[-1]}
            count=refresh_opening(root,Success())
            self.assertEqual(count,len(json.loads((root/'web/config.json').read_text())['opening']['releaseIds']))
            self.assertEqual((root/'web/data/opening.json').read_bytes(),(root/'collection-checks/api-receipt.json').read_bytes())
            self.assertIn('fetched individually from the MusicBrainz API',json.loads((root/'web/data/opening.json').read_text())['method'])
