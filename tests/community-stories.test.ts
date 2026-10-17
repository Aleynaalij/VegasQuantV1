import test from 'node:test';
import assert from 'node:assert/strict';
import { unreadStories, storyReadKey } from '../src/lib/community-stories';
test('opened posts disappear while new posts from the same member return newest first', () => {
 const base={avatar:null,sport:'nfl'};
 const rows=[{...base,post_id:'old',username:'Frank',created_at:'2026-10-17T00:00:00Z'},{...base,post_id:'other',username:'Mike',created_at:'2026-10-17T01:00:00Z'},{...base,post_id:'new',username:'Frank',created_at:'2026-10-17T02:00:00Z'}];
 assert.deepEqual(unreadStories(rows,['old']).map(r=>r.post_id),['new','other']);
 assert.deepEqual(unreadStories(rows,['old','new','other']),[]);
 assert.notEqual(storyReadKey('a'),storyReadKey('b'));
});
