import test from "node:test";
import assert from "node:assert/strict";
import { STORY_TTL_MS, STORY_CLOCK_MAX_AGE_MS, serverClock, storyNow, storyEligible, storyExpiresAt,
 storyGroups, stepStory, storyDetail, displayedStoryRead, type StoryPost } from "../src/lib/community-story-contracts";
import { unreadStories } from "../src/lib/community-stories";
const START = "2026-11-03T12:00:00.000Z", epoch = Date.parse(START);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const post = (n: number, author: number, created: number): StoryPost => ({id:id(n),user_id:id(author),author_name:"Sample",sport:"nhl",created_at:new Date(created).toISOString()});
test("24-hour boundary is exclusive; future, missing, invalid and unknown clocks fail closed", () => {
 assert.equal(storyExpiresAt(START), epoch + STORY_TTL_MS);
 assert.equal(storyEligible(START, epoch - 1), false);
 assert.equal(storyEligible(START, epoch), true);
 assert.equal(storyEligible(START, epoch + STORY_TTL_MS - 1), true);
 assert.equal(storyEligible(START, epoch + STORY_TTL_MS), false);
 assert.equal(storyEligible(START, epoch + STORY_TTL_MS + 1), false);
 for (const bad of [null,undefined,"bad","2026-11-03T12:00:00",123]) {
  assert.equal(storyExpiresAt(bad),null); assert.equal(storyEligible(bad,epoch),false);
 }
 for (const bad of [null,NaN,Infinity]) assert.equal(storyEligible(START,bad),false);
});
test("monotonic anchor survives device wall-clock changes, includes response transit, and expires its lease", () => {
 const clock = serverClock(START,100,120)!;
 assert.equal(storyNow(clock,120),epoch+20);
 assert.equal(storyNow(clock,220),epoch+120);
 const original = Date.now;
 try { Date.now=()=>epoch-100*STORY_TTL_MS; assert.equal(storyNow(clock,220),epoch+120);
  Date.now=()=>epoch+100*STORY_TTL_MS; assert.equal(storyNow(clock,220),epoch+120);
 } finally { Date.now=original; }
 assert.equal(storyNow(clock,119),null);
 assert.equal(storyNow(clock,120+STORY_CLOCK_MAX_AGE_MS-1),epoch+20+STORY_CLOCK_MAX_AGE_MS-1);
 assert.equal(storyNow(clock,120+STORY_CLOCK_MAX_AGE_MS),null);
 assert.equal(storyNow(null,220),null);
 assert.equal(storyNow(clock,Infinity),null);
 for (const args of [[START,200,100],[START,0,30001],[START,NaN,100],[START,-1,1],["bad",1,2]] as const)
  assert.equal(serverClock(args[0], args[1], args[2]),null);
});
test("mixed authors retain order but drop expired/future entries in groups and unread rail", () => {
 const now=epoch+STORY_TTL_MS;
 const expired=post(1,10,epoch), fresh=post(2,10,epoch+1), newer=post(3,20,epoch+1000), future=post(4,20,now+1);
 const groups=storyGroups([future,expired,fresh,newer],now);
 assert.deepEqual(groups.map(g=>g.posts.map(p=>p.id)),[[newer.id],[fresh.id]]);
 const rows=[expired,fresh,newer,future].map(p=>({post_id:p.id,username:p.author_name,avatar:null,sport:p.sport,created_at:p.created_at}));
 assert.deepEqual(unreadStories(rows,[],now).map(r=>r.post_id),[newer.id,fresh.id]);
 assert.deepEqual(unreadStories(rows,[fresh.id],now).map(r=>r.post_id),[newer.id]);
 assert.deepEqual(storyGroups([fresh]),[]); assert.deepEqual(unreadStories(rows,[]),[]);
});
test("open-view expiry skips expired current/neighbors in original order without wrapping or resetting lifetime", () => {
 const a=post(1,10,epoch), b=post(2,10,epoch+1), c=post(3,10,epoch+2);
 const groups=storyGroups([a,b,c],epoch+3), cursor={authorId:a.user_id,postId:a.id};
 assert.deepEqual(stepStory(groups,cursor,1,epoch+STORY_TTL_MS+1),{authorId:c.user_id,postId:c.id});
 assert.equal(stepStory(groups,cursor,-1,epoch+STORY_TTL_MS),null);
 assert.equal(stepStory(groups,cursor,1,epoch+STORY_TTL_MS+2),null);
 assert.equal(stepStory(groups,cursor,1,null),null);
 assert.deepEqual(storyGroups([a],epoch+STORY_TTL_MS),[]); // reload/reopen/read state cannot revive it
});
test("delayed detail and read callbacks re-evaluate expiry; identity/account guards remain mandatory", () => {
 const p=post(1,10,epoch),request={viewerId:id(99),generation:1,postId:p.id},current={viewerId:id(99),generation:1};
 assert.deepEqual(storyDetail(p,request,current,epoch),p);
 assert.equal(storyDetail(p,request,current,epoch+STORY_TTL_MS),null);
 assert.equal(storyDetail(p,request,{...current,viewerId:id(98)},epoch),null);
 assert.deepEqual(displayedStoryRead([],p,request,current,true,epoch+STORY_TTL_MS),[]);
 assert.deepEqual(displayedStoryRead([],p,request,current,true,epoch),[p.id]);
 assert.deepEqual(displayedStoryRead([],p,request,current,false,epoch),[]);
});
test("expiry is 24 elapsed hours across DST and timestamp offsets, not next local midnight", () => {
 for (const created of ["2026-03-08T01:30:00-05:00", "2026-11-01T01:30:00-04:00"]) {
  const expires=Date.parse(created)+STORY_TTL_MS;
  assert.equal(storyExpiresAt(created),expires);
  assert.equal(storyEligible(created,expires-1),true);
  assert.equal(storyEligible(created,expires),false);
 }
});
