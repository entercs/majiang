// 仅内存模拟：验证查询量和并发业务不变式，不代表真实云端时延/吞吐。
const Module = require('module');
const assert = require('assert');
global.jest = { fn: implementation => implementation || (() => {}) };
const { makeCloud } = require('../tests/helpers/fakeCloud');
const root = require('path').join(__dirname, '..');
const now = Date.now();
const initial = { rooms: [], players: [], rules: [], rounds: [] };
for (let i = 0; i < 20; i++) {
  const roomId = 'room_' + (100000 + i), a = 'a' + i, b = 'b' + i;
  initial.rooms.push({ _id: roomId, roomCode: String(100000 + i), ruleId: 'rule' + i,
    status: 'active', createdAt: now, ledgerSchema: 1, totalsThroughIndex: 501, ledgerEntryCount: 501, roundCount: 501,
    revision: 1, scoreTotals: { [a]: -501, [b]: 501 } });
  initial.rules.push({ _id: 'rule' + i, baseScore: 1 });
  for (let seat = 0; seat < 4; seat++) initial.players.push({ _id: ['a', 'b', 'c', 'd'][seat] + i,
    roomId, openid: 'wx-' + i + '-' + seat, clientId: 'device-' + i + '-' + seat,
    seatIndex: seat, isOnline: true, lastSeenAt: now });
  for (let j = 1; j <= 501; j++) initial.rounds.push({ _id: roomId + '-old-' + j, roomId,
    roundIndex: j, clientId: 'old-' + j, createdBy: a, scoreChanges: { [a]: -1, [b]: 1 }, createdAt: now });
}
const cloud = makeCloud(initial, 'wx-0-0');
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  return name === 'wx-server-sdk' ? cloud : originalLoad.call(this, name, parent, main);
};
(async () => {
  const snapshot = require(root + '/cloudfunctions/getRoomSnapshot').main;
  const settle = require(root + '/cloudfunctions/settleRound').main;
  let offset = 0, through, invocations = 0, bytes = 0;
  cloud.calls.length = 0;
  do {
    const response = await snapshot({ roomId: 'room_100000', memberClientId: 'device-0-0', offset, throughRoundIndex: through });
    invocations++; bytes += Buffer.byteLength(JSON.stringify(response));
    offset = response.data.nextOffset; through = response.data.throughRoundIndex;
  } while (offset != null);
  const before = { invocations, databaseOperations: cloud.calls.length, responseBytes: bytes };
  cloud.calls.length = 0;
  const current = await snapshot({ protocol: 2, roomId: 'room_100000', memberClientId: 'device-0-0',
    sinceRoundIndex: 501, knownRevision: 1 });
  const after = { invocations: 1, databaseOperations: cloud.calls.length,
    responseBytes: Buffer.byteLength(JSON.stringify(current)) };
  const tasks = [];
  for (let room = 0; room < 20; room++) for (let j = 0; j < 50; j++) {
    const operation = { roomId: 'room_' + (100000 + room), clientId: 'operation-' + room + '-' + j,
      playerId: 'a' + room, memberClientId: 'device-' + room + '-0', type: 'manual',
      scoreChanges: { ['a' + room]: -1, ['b' + room]: 1 } };
    cloud.setOpenid('wx-' + room + '-0');
    tasks.push(settle(operation), settle(operation));
  }
  const responses = await Promise.all(tasks);
  assert(responses.every(r => r.code === 'OK'));
  for (const room of cloud.rows('rooms')) {
    assert.equal(room.roundCount, 551);
    assert.equal(Object.values(room.scoreTotals).reduce((sum, n) => sum + n, 0), 0);
    const rounds = cloud.rows('rounds').filter(r => r.roomId === room._id);
    assert.equal(rounds.length, 551);
    assert.equal(new Set(rounds.map(r => r.roundIndex)).size, 551);
  }
  console.log(JSON.stringify({ note: '内存模拟，非线上性能承诺', quietRoom501Records: { before, after },
    concurrentCorrectness: { rooms: 20, playersPerRoom: 4, attempts: tasks.length, distinctNewRounds: 1000,
      duplicateCharges: 0, allRoomsBalanced: true } }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { Module._load = originalLoad; delete global.jest; });
