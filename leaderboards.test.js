import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEADERBOARD_IDS, countLeaderboardItems, recordBossLeaderboardScore,
  leaderboardScores, createLeaderboardClient,
} from './leaderboards.js';

test('item score counts treasure copies and acquired books, excluding medicine and stat growth', () => {
  const shop = { purchases: [
    { itemId: 'iron_bell_book' }, { itemId: 'medicine_atk_1' }, { itemId: 'angel_breath' },
  ] };
  const campaign = {
    playerId: 'naruto', partyIds: ['naruto', 'eren'],
    partyStates: {
      naruto: { permanentEffects: [{ id: 'angel_breath' }, { id: 'angel_breath_growth' }],
        skillHistory: [{ kind: 'fate-book', skillId: 'brick-force' }] },
      eren: { permanentEffects: [{ id: 'drip_coffee' }, { id: 'angel_breath' }],
        skillHistory: [{ kind: 'learn', skillId: 'apocalypse-knight', sourceId: 'hidden-boss:1' },
          { kind: 'learn', skillId: 'another-skill', sourceId: 'event:1' }] },
    }, shopHistory: [shop], activeShop: { purchases: [{ itemId: 'daily_progress_book' }] },
  };
  assert.equal(countLeaderboardItems(campaign), 7);
  assert.deepEqual(leaderboardScores(campaign), { items: 7 });
  campaign.activeShop = null;
  campaign.shopHistory.push({ purchases: [{ itemId: 'daily_progress_book' }] });
  assert.equal(countLeaderboardItems(campaign), 7);
});

test('boss scores are recorded only for victories in the matching battles', () => {
  const campaign = { playerId: 'naruto' };
  assert.equal(recordBossLeaderboardScore(campaign, { hiddenBoss: true }, { outcome: 'defeat', rounds: 8 }), null);
  assert.deepEqual(recordBossLeaderboardScore(campaign, { hiddenBoss: true }, { outcome: 'victory', rounds: 12 }),
    { key: 'hiddenBoss', score: 12 });
  assert.deepEqual(recordBossLeaderboardScore(campaign, { enemies: ['makima'] }, { outcome: 'victory', rounds: 9 }),
    { key: 'finalBoss', score: 9 });
  assert.deepEqual(recordBossLeaderboardScore(campaign, { hiddenBoss: true }, { outcome: 'victory', rounds: 10 }),
    { key: 'hiddenBoss', score: 10 });
  assert.deepEqual(leaderboardScores(campaign), { hiddenBoss: 10, finalBoss: 9 });
});

test('TapTap client submits integer scores to the correct IDs and opens the selected board', () => {
  let submitted, opened;
  const client = createLeaderboardClient(() => ({ getLeaderboardManager: () => ({
    submitScores(request) { submitted = request; request.callback.onSuccess({}); },
    openLeaderboard(request) { opened = request; request.callback.onSuccess(); },
  }) }));
  let success = 0;
  assert.equal(client.submit('items', 11, () => success++), true);
  assert.equal(success, 1);
  assert.deepEqual(submitted.scores, [{ leaderboardId: LEADERBOARD_IDS.items, score: 11 }]);
  assert.equal(client.open('finalBoss', () => success++), true);
  assert.equal(opened.leaderboardId, LEADERBOARD_IDS.finalBoss);
  assert.equal(opened.collection, 'public');
  assert.equal(success, 2);
  assert.equal(client.submit('items', 2.5), false);
  assert.equal(createLeaderboardClient(() => undefined).open('items'), false);
});
