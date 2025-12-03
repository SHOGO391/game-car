/**
 * 円環型じゃんけん鬼ごっこ - マルチプレイヤークライアント
 */

class MultiplayerClient {
    constructor() {
        this.socket = null;
        this.roomCode = null;
        this.myRole = null; // 'oni' or 'runner'
        this.isConnected = false;
        this.isOnlineMode = false;
        this.callbacks = {};
    }

    /**
     * サーバーに接続
     */
    connect(serverUrl = null) {
        return new Promise((resolve, reject) => {
            // Socket.io のURLを自動検出またはカスタムURL使用
            const url = serverUrl || window.location.origin;

            try {
                this.socket = io(url, {
                    transports: ['websocket', 'polling']
                });

                this.socket.on('connect', () => {
                    console.log('Connected to server');
                    this.isConnected = true;
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    console.error('Connection error:', error);
                    this.isConnected = false;
                    reject(error);
                });

                this.setupEventListeners();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * イベントリスナーを設定
     */
    setupEventListeners() {
        // 相手がルームに参加
        this.socket.on('playerJoined', (data) => {
            console.log('Player joined:', data);
            this.emit('playerJoined', data);
        });

        // ルーム準備完了（2人揃った）
        this.socket.on('roomReady', (data) => {
            console.log('Room ready:', data);
            this.emit('roomReady', data);
        });

        // 役割が割り当てられた
        this.socket.on('roleAssigned', (data) => {
            console.log('Role assigned:', data);
            this.myRole = data.role;
            this.emit('roleAssigned', data);
        });

        // ゲーム開始
        this.socket.on('gameStarted', (data) => {
            console.log('Game started:', data);
            this.emit('gameStarted', data);
        });

        // 相手が手を選んだ
        this.socket.on('opponentSelectedHand', (data) => {
            console.log('Opponent selected hand:', data);
            this.emit('opponentSelectedHand', data);
        });

        // 両者の手が公開
        this.socket.on('handsRevealed', (data) => {
            console.log('Hands revealed:', data);
            this.emit('handsRevealed', data);
        });

        // 移動方向が選択された
        this.socket.on('directionSelected', (data) => {
            console.log('Direction selected:', data);
            this.emit('directionSelected', data);
        });

        // 位置更新
        this.socket.on('positionUpdated', (data) => {
            console.log('Position updated:', data);
            this.emit('positionUpdated', data);
        });

        // ターン終了
        this.socket.on('turnEnded', (data) => {
            console.log('Turn ended:', data);
            this.emit('turnEnded', data);
        });

        // ゲーム終了
        this.socket.on('gameFinished', (data) => {
            console.log('Game finished:', data);
            this.emit('gameFinished', data);
        });

        // 再戦リクエスト
        this.socket.on('rematchRequested', (data) => {
            console.log('Rematch requested:', data);
            this.emit('rematchRequested', data);
        });

        // 相手が切断
        this.socket.on('opponentDisconnected', () => {
            console.log('Opponent disconnected');
            this.emit('opponentDisconnected');
        });

        // 切断
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.emit('disconnected');
        });
    }

    /**
     * ルーム作成
     */
    createRoom() {
        return new Promise((resolve, reject) => {
            this.socket.emit('createRoom', (response) => {
                if (response.success) {
                    this.roomCode = response.roomCode;
                    this.myRole = response.role;
                    this.isOnlineMode = true;
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    /**
     * ルーム参加
     */
    joinRoom(roomCode) {
        return new Promise((resolve, reject) => {
            this.socket.emit('joinRoom', roomCode, (response) => {
                if (response.success) {
                    this.roomCode = response.roomCode;
                    this.myRole = response.role;
                    this.isOnlineMode = true;
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }

    /**
     * ゲーム開始を通知
     */
    startGame() {
        this.socket.emit('startGame');
    }

    /**
     * 手を選択
     */
    selectHand(hand) {
        this.socket.emit('selectHand', hand);
    }

    /**
     * 移動方向を選択
     */
    selectDirection(direction) {
        this.socket.emit('selectDirection', direction);
    }

    /**
     * 位置を更新
     */
    updatePosition(oniPos, runnerPos) {
        this.socket.emit('updatePosition', { oniPos, runnerPos });
    }

    /**
     * ターン終了を通知
     */
    endTurn(turn, oniPos, runnerPos) {
        this.socket.emit('endTurn', { turn, oniPos, runnerPos });
    }

    /**
     * ゲーム終了を通知
     */
    gameOver(winner, reason) {
        this.socket.emit('gameOver', { winner, reason });
    }

    /**
     * 再戦リクエスト
     */
    requestRematch() {
        this.socket.emit('requestRematch');
    }

    /**
     * ルーム退出
     */
    leaveRoom() {
        this.socket.emit('leaveRoom');
        this.roomCode = null;
        this.myRole = null;
        this.isOnlineMode = false;
    }

    /**
     * 切断
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.isConnected = false;
        this.isOnlineMode = false;
    }

    /**
     * コールバック登録
     */
    on(event, callback) {
        if (!this.callbacks[event]) {
            this.callbacks[event] = [];
        }
        this.callbacks[event].push(callback);
    }

    /**
     * コールバック解除
     */
    off(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
        }
    }

    /**
     * イベント発火
     */
    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(cb => cb(data));
        }
    }

    /**
     * 自分のターンかどうか（じゃんけんは常に自分のターン）
     */
    isMyTurn() {
        return true; // じゃんけんは同時なので常にtrue
    }

    /**
     * 自分が勝者かどうか
     */
    isWinner(jankenWinner) {
        return jankenWinner === this.myRole;
    }
}

// グローバルに公開
window.MultiplayerClient = MultiplayerClient;
