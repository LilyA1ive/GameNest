// 回归:等待房间换位/移除 AI 的座位一致性。
// 背景:swap_seat 在"两个 bot 相邻对换"时,顺序 delete/set 会把刚放好的电脑删掉(bot 凭空消失);
// remove_bot 删除后曾把剩余 bot 重排到 0..n-1,与真人座位撞索引。此处用真实服务器做协议级验证。
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

// 独立端口,避免与其他测试冲突;测试自身不绑定其他端口
const PORT = 3187;

function assertConsistent(players, tag) {
  const humans = players.filter(p => !p.isBot).map(p => p.index);
  const bots = players.filter(p => p.isBot).map(p => p.index);
  const all = players.map(p => p.index).sort((a, b) => a - b);
  const dupes = all.filter((v, i) => all.indexOf(v) !== i);
  assert.equal(bots.length, 3, tag + ': 应有 3 个电脑,实际 ' + JSON.stringify(bots));
  assert.equal(humans.length, 1, tag + ': 应有 1 个真人,实际 ' + JSON.stringify(humans));
  assert.equal(dupes.length, 0, tag + ': 索引重复 ' + JSON.stringify(dupes));
}

test('swap_seat / remove_bot keeps seats consistent', async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  srv.stderr.on('data', d => { err += d; });
  const delay = ms => new Promise(r => setTimeout(r, ms));

  try {
    await new Promise((res, rej) => {
      const t = setInterval(() => {
        const w = new WebSocket(`ws://127.0.0.1:${PORT}`);
        w.on('open', () => { w.close(); clearInterval(t); res(); });
        w.on('error', () => {});
      }, 150);
      setTimeout(() => rej(new Error('server not listening: ' + err.slice(-200))), 8000);
    });

    let players = null;
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString());
      if (m.players) players = m.players;
    });
    await new Promise(r => ws.on('open', r));
    const send = o => ws.send(JSON.stringify(o));

    send({ type: 'create_room', data: { game: 'flightchess', lang: 'zh' } });
    await delay(120);
    for (let i = 0; i < 3; i++) { send({ type: 'add_bot' }); await delay(60); }
    assertConsistent(players, 'initial');

    // 用户复现序列,含多次 bot-bot 相邻对换(曾在此丢失电脑)
    const clicks = [
      [3, 0], [2, 3], [1, 2], [0, 1], [3, 0], [2, 3], [1, 2], [0, 1],
      [2, 3], [3, 0], [2, 3], [1, 2], [0, 1], [1, 2], [2, 3], [0, 1],
    ];
    for (const [f, t] of clicks) {
      send({ type: 'swap_seat', data: { fromIndex: f, toIndex: t } });
      await delay(60);
      assertConsistent(players, 'swap(' + f + '->' + t + ')');
    }

    // 移除一个 bot 后座位保持稳定,再添加回来
    const botIdx = players.filter(p => p.isBot).map(p => p.index);
    send({ type: 'remove_bot', data: { botIndex: botIdx[0] } });
    await delay(100);
    assert.equal(players.filter(p => p.isBot).length, 2, 'remove_bot 后应剩 2 个电脑');
    send({ type: 'add_bot' });
    await delay(100);
    assertConsistent(players, 'after re-add');
    ws.close();
  } finally {
    srv.kill();
  }
});
