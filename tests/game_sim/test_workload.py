import copy,unittest
from research.game_sim.workload import Allocator,validate_context
from research.game_sim.state import State,Action,transition

def context():
    return dict(mode='scenario',cutoff='2026-10-27T12:00:00Z',sources=[dict(source_url='https://example.test/reviewed-fixture',sha256='a'*64,retrieved_at='2026-10-27T11:00:00Z')],teams={s:[dict(id=s+'-qb',name='Fixture QB',availability='reviewed_active',passer_weight=1,carry_weight=0,target_weight=0),dict(id=s+'-rb',name='Fixture RB',availability='reviewed_active',passer_weight=0,carry_weight=1,target_weight=0),dict(id=s+'-wr',name='Fixture WR',availability='reviewed_active',passer_weight=0,carry_weight=0,target_weight=1)] for s in ('home','away')})
class WorkloadTests(unittest.TestCase):
    def test_credit_conservation_and_reproducibility(self):
        a=Allocator(context(),7);b=Allocator(context(),7)
        e=transition(State(),Action('pass_complete',20,15))
        self.assertEqual(a.apply(e),b.apply(e));r=a.result();players={p['id']:p['stats'] for p in r['players']}
        self.assertEqual(players['home-qb']['passing_yards'],players['home-wr']['receiving_yards']);self.assertEqual(players['home-wr']['receptions'],1)
        self.assertFalse(r['supported'])
    def test_critical_unknowns_rejected(self):
        for mutate in (lambda c:c['teams']['home'][0].update(availability='unknown'),lambda c:c['sources'][0].update(retrieved_at='2026-10-28T00:00:00Z'),lambda c:c['teams']['home'][0].update(passer_weight=float('nan'))):
            c=copy.deepcopy(context());mutate(c)
            with self.assertRaises(ValueError):validate_context(c)
    def test_missing_target_stays_explicit(self):
        a=Allocator(context(),7);a.apply(transition(State(),Action('pass_incomplete',10)));self.assertEqual(a.result()['missing']['incomplete_or_intercepted_target_identity'],1)
if __name__=='__main__':unittest.main()
