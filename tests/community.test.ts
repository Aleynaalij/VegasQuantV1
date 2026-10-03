import test from 'node:test';
import assert from 'node:assert/strict';
import {runMilestone} from '../src/lib/community';
test('participation never implies wager wins and duplicate wins cannot complete a run',()=>{
 assert.equal(runMilestone([],false,false),'FOLLOWING');
 assert.equal(runMilestone([],true,false),'IN PLAY');
 assert.equal(runMilestone([1],false,false),'LEG WON');
 assert.equal(runMilestone([1],false,true),'RUN REVIEW');
 assert.notEqual(runMilestone([1,1,2,3,4],false,false),'CHALLENGE COMPLETED');
 assert.equal(runMilestone([1,2,3,4,5],false,false),'CHALLENGE COMPLETED');
});
