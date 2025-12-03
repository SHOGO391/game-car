/**
 * 円環型じゃんけん鬼ごっこ - WebSocket サーバー
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 静的ファイルを配信
app.use(express.static(path.join(__dirname)));

// ルーム管理
const rooms = new Map();

/**
 * 4桁のルームコードを生成
 */
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
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
    console.log(`Player connected: ${socket.id}`);

    // ルーム作成
    socket.on('createRoom', (callback) => {
        const roomCode = generateRoomCode();

        const room = {
            roomCode,
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
        if (!room || room.phase !== 'ready') return;

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
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

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
        }
    });

    // 移動方向を選択
    socket.on('selectDirection', (direction) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.phase !== 'playing') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

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
        if (!room) return;

        room.oniPos = data.oniPos;
        room.runnerPos = data.runnerPos;

        // 相手に同期
        socket.to(socket.roomCode).emit('positionUpdated', data);
    });

    // ターン終了
    socket.on('endTurn', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        room.turn = data.turn;
        room.oniPos = data.oniPos;
        room.runnerPos = data.runnerPos;

        // 手をリセット
        room.players.forEach(p => {
            p.hand = null;
            p.direction = null;
        });

        // 相手に同期
        socket.to(socket.roomCode).emit('turnEnded', data);
    });

    // ゲーム終了
    socket.on('gameOver', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        room.phase = 'finished';

        io.to(socket.roomCode).emit('gameFinished', data);
    });

    // 再戦リクエスト
    socket.on('requestRematch', () => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

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

        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                // 相手に通知
                socket.to(socket.roomCode).emit('opponentDisconnected');

                // ルームを削除
                rooms.delete(socket.roomCode);
                console.log(`Room ${socket.roomCode} deleted`);
            }
        }
    });

    // ルーム退出
    socket.on('leaveRoom', () => {
        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                socket.to(socket.roomCode).emit('opponentDisconnected');
                rooms.delete(socket.roomCode);
            }
            socket.leave(socket.roomCode);
            socket.roomCode = null;
            socket.playerRole = null;
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
