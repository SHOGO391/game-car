const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createGameServer } = require('../server');

function event(socket, name) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out: ${name}`)), 2000);
        socket.once(name, data => { clearTimeout(timer); resolve(data); });
    });
}
const ack = (socket, name, ...args) => socket.timeout(2000).emitWithAck(name, ...args);
async function fixture(t, options) {
    const app = createGameServer(options);
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${app.server.address().port}`, clients = [];
    t.after(async () => {
        clients.forEach(c => c.disconnect());
        await new Promise(resolve => app.io.close(resolve));
    });
    async function client(extra = {}) {
        const socket = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true, ...extra });
        clients.push(socket);
        await event(socket, 'connect');
        return socket;
    }
    return { ...app, url, client };
}

test('only browser assets are served; unrelated browser origins are rejected', async t => {
    const f = await fixture(t);
    for (const file of ['/', '/index.html', '/js/game.js', '/css/style.css', '/socket.io/socket.io.js']) {
        assert.equal((await fetch(f.url + file)).status, 200, file);
    }
    for (const file of ['/server.js', '/package.json', '/package-lock.json', '/node_modules/express/package.json', '/.claude/settings.local.json', '/.git/config']) {
        assert.equal((await fetch(f.url + file)).status, 404, file);
    }
    const cross = await fetch(f.url + '/socket.io/?EIO=4&transport=polling', { headers: { Origin: 'https://unrelated.example' } });
    assert.equal(cross.status, 403);
    assert.equal((await fetch(f.url + '/socket.io/?EIO=4&transport=polling', { headers: { Origin: f.url } })).status, 200);
});

test('malformed events cannot stop the server; one socket cannot leak multiple rooms', async t => {
    const f = await fixture(t), a = await f.client(), b = await f.client();
    a.emit('createRoom'); a.emit('joinRoom', null); a.emit('joinRoom', {});
    assert.equal((await ack(a, 'joinRoom', null)).success, false);
    const created = await ack(a, 'createRoom');
    assert.equal(created.success, true);
    for (let i = 0; i < 10; i++) assert.equal((await ack(a, 'createRoom')).success, false);
    assert.equal(f.rooms.size, 1);
    assert.equal((await ack(b, 'joinRoom', created.roomCode.toLowerCase())).success, true);
    for (const type of ['updatePosition', 'endTurn', 'gameOver', 'selectHand', 'selectDirection']) a.emit(type, null);
    assert.equal((await ack(a, 'createRoom')).success, false);
    const left = event(b, 'opponentDisconnected');
    a.disconnect(); await left;
    assert.equal(f.rooms.size, 0);
    assert.equal(f.io.sockets.sockets.get(b.id).roomCode, null);
    assert.equal((await ack(b, 'createRoom')).success, true);
});

test('valid draw, move, finish and rematch survive schema validation', async t => {
    const f = await fixture(t), a = await f.client(), b = await f.client();
    const created = await ack(a, 'createRoom');
    const joined = await ack(b, 'joinRoom', created.roomCode);
    const oni = joined.role === 'oni' ? b : a, runner = oni === a ? b : a;
    let waiting = event(a, 'gameStarted'); oni.emit('startGame'); await waiting;
    waiting = event(a, 'handsRevealed'); a.emit('selectHand', 'rock'); b.emit('selectHand', 'rock'); await waiting;
    assert.equal(f.rooms.get(created.roomCode).turn, 2);
    waiting = event(a, 'handsRevealed'); oni.emit('selectHand', 'rock'); runner.emit('selectHand', 'scissors');
    assert.deepEqual(await waiting, { oniHand: 'rock', runnerHand: 'scissors' });
    const relayed = []; runner.on('turnEnded', data => relayed.push(data));
    oni.emit('endTurn', { turn: '<b>injected</b>', oniPos: 0, runnerPos: 8 });
    oni.emit('updatePosition', { oniPos: -1, runnerPos: 100 });
    oni.emit('gameOver', { winner: {}, reason: [] });
    oni.emit('selectDirection', 'invalid');
    waiting = event(runner, 'directionSelected'); oni.emit('selectDirection', 'cw');
    assert.deepEqual(await waiting, { role: 'oni', direction: 'cw' });
    assert.equal(relayed.length, 0);
    waiting = event(runner, 'turnEnded');
    oni.emit('endTurn', { turn: 3, oniPos: 2, runnerPos: 8, extra: '<b>ignored</b>' });
    assert.deepEqual(await waiting, { turn: 3, oniPos: 2, runnerPos: 8 });
    waiting = event(runner, 'gameFinished'); oni.emit('gameOver', { winner: 'oni', reason: 'caught' });
    assert.deepEqual(await waiting, { winner: 'oni', reason: 'caught' });
    waiting = event(a, 'roomReady'); a.emit('requestRematch'); b.emit('requestRematch'); await waiting;
    waiting = event(b, 'gameStarted'); oni.emit('startGame'); assert.equal((await waiting).turn, 1);
});

test('room cap, inactivity cleanup and event flood limits release resources', async t => {
    const f = await fixture(t, { maxRooms: 1, roomTtlMs: 100, eventLimit: 5 });
    const a = await f.client(), b = await f.client();
    assert.equal((await ack(a, 'createRoom')).success, true);
    assert.equal((await ack(b, 'createRoom')).success, false);
    await event(a, 'opponentDisconnected');
    assert.equal(f.rooms.size, 0);
    assert.equal((await ack(b, 'createRoom')).success, true);
    const disconnected = event(b, 'disconnect');
    for (let i = 0; i < 10; i++) b.emit('selectHand', 'rock');
    await disconnected;
    assert.equal(f.rooms.size, 0);
});
