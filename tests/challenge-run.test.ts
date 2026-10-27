import test from 'node:test';
import assert from 'node:assert/strict';
import {canCheckIn,runMessage,runShareText} from '../src/lib/challenge-run';
test('passes pause, losses never promise recovery, preparation cannot be checked in',()=>{
 assert.match(runMessage('PASS / PAUSED').body,/Paused/);assert.match(runMessage('LOST').body,/no need to chase/);assert.equal(canCheckIn('PREP'),false);assert.equal(canCheckIn('ANALYSIS IN PROGRESS'),false);assert.equal(canCheckIn('PASS / PAUSED'),true);
});
test('run sharing contains participation only, never private money or implied wins',()=>{const s=runShareText(1,3,'OFFICIAL PLAY');assert.match(s,/3\/5 stages followed/);assert.doesNotMatch(s,/\$|profit|wins|bankroll/);assert.match(s,/without placing a wager/);});
