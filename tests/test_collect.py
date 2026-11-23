import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from collect import collect, core_release, validate_id
ROOT=Path(__file__).resolve().parents[1]

class CollectTests(unittest.TestCase):
    def setUp(self):
        self.config=json.loads((ROOT/'web/config.json').read_text())
        self.rows=json.loads((ROOT/'tests/fixtures/release-sample.json').read_text())['releases']
    def test_presets_expand_into_real_collector_requests(self):
        calls=[]
        rows={r['id']:r for r in self.rows}
        class Fake:
            def get(_,path,**params):
                calls.append(path)
                return {**next(iter(rows.values())), 'id':path.split('/')[-1]}
        result=collect(Fake(),self.config)
        self.assertEqual(len(calls),len(self.config['opening']['releaseIds']))
        self.assertEqual(len(result['releases']),len(calls))
    def test_invalid_id_does_not_reach_network(self):
        with self.assertRaises(ValueError): validate_id('x/../../file')
    def test_core_copy_excludes_ratings_and_cover_art(self):
        r=core_release({**self.rows[0],'rating':{'value':5},'cover-art-archive':{'front':True}})
        self.assertNotIn('rating',r)
        self.assertNotIn('cover-art-archive',r)
    def test_browse_pages_stop_at_limit_and_keep_provenance(self):
        rows=self.rows
        class Fake:
            def get(_,path,**params):
                if path.startswith('artist/'): return {'name':'Artist'}
                return {'releases':rows[:params['limit']], 'release-count':10000}
        result=collect(Fake(),self.config,'artist',self.config['opening']['artistId'],3)
        self.assertEqual(len(result['releases']),3)
        self.assertIn('3 retained of 10000',result['method'])
    def test_failed_fetch_never_returns_a_partial_opening(self):
        rows=self.rows
        class Fake:
            count=0
            def get(self,path,**params):
                self.count+=1
                if self.count>1: raise OSError('upstream unavailable')
                return rows[0]
        with self.assertRaises(OSError):collect(Fake(),self.config)
