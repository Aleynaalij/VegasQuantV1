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
import {socialUrl} from '../src/lib/community';
test('social links accept profile URLs and reject redirects, credentials and scripts',()=>{
 assert.equal(socialUrl('', 'x'),null);
 assert.equal(socialUrl('https://instagram.com/mike.test/', 'instagram'),'https://instagram.com/mike.test/');
 assert.equal(socialUrl('https://x.com/mike_', 'x'),'https://x.com/mike_');
 for(const value of ['javascript:alert(1)','https://x.com.evil.test/name','https://x.com/name?redirect=evil','https://user@x.com/name','https://x.com/name/status/123'])assert.throws(()=>socialUrl(value,'x'));
});
