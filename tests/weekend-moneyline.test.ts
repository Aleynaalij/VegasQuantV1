import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weekendMoneylineCard as card, weekendMoneylineCopy } from '../src/lib/weekend-moneyline-card';
test('one-time Sunday card contains all twelve distinct matchups and clean team-only copy', () => {
 assert.equal(card.legs.length,12);
 assert.equal(new Set(card.legs.map(l=>l.slug)).size,12);
 assert.equal(new Set(card.legs.map(l=>l.observationId)).size,12);
 assert.deepEqual(weekendMoneylineCopy.split('\n'),card.legs.map(l=>`${l.name} moneyline`));
 assert.ok(!/@|2026|Sunday|PM|AM/.test(weekendMoneylineCopy));
 assert.ok(card.legs.every(l=>l.why && l.risk && Date.parse(l.quoteAt)<Date.parse(card.preparedAt)));
 assert.ok(Date.parse(card.preparedAt)<Date.parse(card.expiresAt));
});
test('the one-time card is scoped to Parlays and contains no approved/official release write',()=>{
 const feed=readFileSync('src/components/research-feed.tsx','utf8');
 assert.ok(feed.includes('zoneView === "Parlays" && <WeekendMoneylineCard />'));
 const ui=readFileSync('src/components/weekend-moneyline-card.tsx','utf8');
 assert.ok(!/\.insert\(|LegActions|worth_a_dollar|fun_play/.test(ui));
 assert.ok(ui.includes('Not a VQ Approved or official pick'));
 assert.ok(ui.includes('card.expiresAt'));
});
