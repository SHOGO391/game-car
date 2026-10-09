/**
 * 円環型じゃんけん鬼ごっこ - WebSocket サーバー
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { randomInt } = require('crypto');

function createGameServer({ maxRooms = 100, maxConnections = 200, roomTtlMs = 3600000,
    allowedOrigins = [], eventLimit = 100 } = {}) {

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 4096,
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    },
    allowRequest: (req, callback) => {
        const origin = req.headers.origin;
        let sameOrigin = false;
        try { sameOrigin = ['http:', 'https:'].includes(new URL(origin).protocol)
            && new URL(origin).host === req.headers.host; } catch { /* invalid origin */ }
        callback(null, !origin || sameOrigin || allowedOrigins.includes(origin));
    },
});

// 静的ファイルを配信
app.disable('x-powered-by');
app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use('/css', express.static(path.join(__dirname, 'css'), { dotfiles: 'deny' }));
app.use('/js', express.static(path.join(__dirname, 'js'), { dotfiles: 'deny' }));

// ルーム管理
const rooms = new Map();
const validPosition = n => Number.isInteger(n) && n >= 0 && n < 16;
const validPositions = d => d && validPosition(d.oniPos) && validPosition(d.runnerPos);
const validTurn = n => Number.isInteger(n) && n >= 1 && n <= 16;

// Deleting a room also clears both players' memberships and metadata.
function closeRoom(code, departingId = '') {
    const room = rooms.get(code);
    if (!room) return;
    io.to(code).except(departingId).emit('opponentDisconnected');
    for (const player of room.players) {
        const member = io.sockets.sockets.get(player.id);
        if (member) {
            member.leave(code);
            member.roomCode = null;
            member.playerRole = null;
        }
    }
    rooms.delete(code);
}
const cleanup = setInterval(() => {
    for (const [code, room] of rooms) {
        if (Date.now() - room.lastActive > roomTtlMs) closeRoom(code);
    }
}, Math.min(roomTtlMs, 30000));
cleanup.unref();
server.on('close', () => clearInterval(cleanup));

/**
 * 4桁のルームコードを生成
 */
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(randomInt(chars.length));
    }
    // 既に存在する場合は再生成
    if (rooms.has(code)) {
        return generateRoomCode();
    }
    return code;
}

/**
 * ルームの状態を取得
 */
function getRoomState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return null;

    return {
        roomCode: room.roomCode,
        players: room.players.map(p => ({
            id: p.id,
            role: p.role,
            ready: p.ready
        })),
        gameState: room.gameState,
        phase: room.phase
    };
}

io.on('connection', (socket) => {
    if (io.engine.clientsCount > maxConnections) return socket.disconnect(true);
    let windowStart = Date.now(), count = 0;
    socket.use((_packet, next) => {
        const now = Date.now();
        if (now - windowStart >= 10000) { windowStart = now; count = 0; }
        if (++count > eventLimit) { socket.disconnect(true); return; }
        const room = rooms.get(socket.roomCode);
        if (room) room.lastActive = now;
        next();
    });
    console.log(`Player connected: ${socket.id}`);

    // ルーム作成
    socket.on('createRoom', (callback) => {
        if (typeof callback !== 'function') return;
        if (socket.roomCode || rooms.size >= maxRooms) {
            callback({ success: false, error: '退出してから再試行してください。満員の場合は時間をおいてください。' });
            return;
        }
        const roomCode = generateRoomCode();

        const room = {
            roomCode,
            lastActive: Date.now(),
            players: [{
                id: socket.id,
                role: null, // 役割は2人揃った時にランダムで決定
                ready: false,
                hand: null
            }],
            gameState: null,
            phase: 'waiting', // waiting, ready, playing, finished
            turn: 1,
            oniPos: 0,
            runnerPos: 8
        };

        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerRole = null; // まだ未定

        console.log(`Room created: ${roomCode} by ${socket.id}`);

        callback({
            success: true,
            roomCode,
            role: null // 役割は後で通知
        });
    });

    // ルーム参加
    socket.on('joinRoom', (roomCode, callback) => {
        if (typeof callback !== 'function') return;
        if (socket.roomCode || typeof roomCode !== 'string' || !/^[A-Z2-9]{4}$/i.test(roomCode)) {
            callback({ success: false, error: 'ルームコードまたは参加状態が不正です' });
            return;
        }
        const room = rooms.get(roomCode.toUpperCase());

        if (!room) {
            callback({ success: false, error: 'ルームが見つかりません' });
            return;
        }

        if (room.players.length >= 2) {
            callback({ success: false, error: 'ルームが満員です' });
            return;
        }

        if (room.phase !== 'waiting') {
            callback({ success: false, error: 'ゲームが既に開始されています' });
            return;
        }

        // 50%の確率で役割をランダムに決定
        const roles = Math.random() < 0.5 ? ['oni', 'runner'] : ['runner', 'oni'];

        // 最初のプレイヤー（ルーム作成者）の役割を設定
        room.players[0].role = roles[0];

        // 参加者を追加
        room.players.push({
            id: socket.id,
            role: roles[1],
            ready: false,
            hand: null
        });

        socket.join(roomCode.toUpperCase());
        socket.roomCode = roomCode.toUpperCase();
        socket.playerRole = roles[1];

        // ルーム作成者のsocketも更新
        const creatorSocketId = room.players[0].id;
        const creatorSocket = io.sockets.sockets.get(creatorSocketId);
        if (creatorSocket) {
            creatorSocket.playerRole = roles[0];
        }

        console.log(`Player ${socket.id} joined room: ${roomCode}`);
        console.log(`Roles assigned - Creator: ${roles[0]}, Joiner: ${roles[1]}`);

        callback({
            success: true,
            roomCode: roomCode.toUpperCase(),
            role: roles[1]
        });

        // 相手に自分の役割を通知
        socket.to(roomCode.toUpperCase()).emit('playerJoined', {
            playerId: socket.id,
            role: roles[1]
        });

        // 両者揃ったらready状態に（各プレイヤーに役割を通知）
        room.phase = 'ready';

        // 各プレイヤーに個別に役割を通知
        room.players.forEach(player => {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
                playerSocket.emit('roleAssigned', { role: player.role });
            }
        });

        io.to(roomCode.toUpperCase()).emit('roomReady', getRoomState(roomCode.toUpperCase()));
    });

    // ゲーム開始
    socket.on('startGame', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'ready' || socket.playerRole !== 'oni') return;

        room.phase = 'playing';
        room.turn = 1;
        room.oniPos = 0;
        room.runnerPos = 8;
        room.players.forEach(p => {
            p.hand = null;
            p.direction = null;
        });

        io.to(socket.roomCode).emit('gameStarted', {
            turn: room.turn,
            oniPos: room.oniPos,
            runnerPos: room.runnerPos
        });
    });

    // じゃんけんの手を選択
    socket.on('selectHand', (hand) => {
        if (!['rock', 'scissors', 'paper'].includes(hand)) return;
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.hand || room.turn > 15) return;

        player.hand = hand;

        // 相手に「手を選んだ」ことだけ通知（手の内容は送らない）
        socket.to(socket.roomCode).emit('opponentSelectedHand', {
            role: player.role
        });

        // 両者が選んだか確認
        const oni = room.players.find(p => p.role === 'oni');
        const runner = room.players.find(p => p.role === 'runner');

        if (oni.hand && runner.hand) {
            // 両者が選んだら結果を公開
            io.to(socket.roomCode).emit('handsRevealed', {
                oniHand: oni.hand,
                runnerHand: runner.hand
            });
            // A draw advances locally on both clients without an endTurn packet.
            if (oni.hand === runner.hand) {
                room.turn++;
                room.players.forEach(p => { p.hand = null; p.direction = null; });
            }
        }
    });

    // 移動方向を選択
    socket.on('selectDirection', (direction) => {
        if (!['cw', 'ccw'].includes(direction)) return;
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.direction || !room.players.every(p => p.hand)) return;
        const opponent = room.players.find(p => p.id !== socket.id);
        if ({ rock: 'scissors', scissors: 'paper', paper: 'rock' }[player.hand] !== opponent.hand) return;

        player.direction = direction;

        // 移動を通知
        io.to(socket.roomCode).emit('directionSelected', {
            role: player.role,
            direction: direction
        });
    });

    // 移動完了・位置更新
    socket.on('updatePosition', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing' || !validPositions(data)) return;

        room.oniPos = data.oniPos;
        room.runnerPos = data.runnerPos;

        // 相手に同期
        socket.to(socket.roomCode).emit('positionUpdated', { oniPos: data.oniPos, runnerPos: data.runnerPos });
    });

    // ターン終了
    socket.on('endTurn', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing' || !validPositions(data) || !validTurn(data.turn)
            || data.turn !== room.turn + 1 || !room.players.find(p => p.id === socket.id)?.direction) return;

        room.turn = data.turn;
        room.oniPos = data.oniPos;
        room.runnerPos = data.runnerPos;

        // 手をリセット
        room.players.forEach(p => {
            p.hand = null;
            p.direction = null;
        });

        // 相手に同期
        socket.to(socket.roomCode).emit('turnEnded', { turn: data.turn, oniPos: data.oniPos, runnerPos: data.runnerPos });
    });

    // ゲーム終了
    socket.on('gameOver', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing' || !data || !['oni', 'runner'].includes(data.winner)
            || typeof data.reason !== 'string' || data.reason.length > 160) return;

        room.phase = 'finished';

        io.to(socket.roomCode).emit('gameFinished', { winner: data.winner, reason: data.reason });
    });

    // 再戦リクエスト
    socket.on('requestRematch', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'finished') return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.ready = true;
        }

        // 相手に通知
        socket.to(socket.roomCode).emit('rematchRequested', {
            role: socket.playerRole
        });

        // 両者がOKなら再開
        if (room.players.every(p => p.ready)) {
            room.phase = 'ready';
            room.players.forEach(p => p.ready = false);
            io.to(socket.roomCode).emit('roomReady', getRoomState(socket.roomCode));
        }
    });

    // 切断
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);

        closeRoom(socket.roomCode, socket.id);
    });

    // ルーム退出
    socket.on('leaveRoom', () => {
        closeRoom(socket.roomCode, socket.id);
    });
});

return { server, io, rooms };
}

if (require.main === module) {
    const PORT = Number(process.env.PORT || 3001);
    const HOST = process.env.HOST || '127.0.0.1';
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    createGameServer({ allowedOrigins }).server.listen(PORT, HOST, () => {
        console.log(`Server running on http://${HOST}:${PORT}`);
    });
}
module.exports = { createGameServer };
