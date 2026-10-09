/**
 * 円環型じゃんけん鬼ごっこ - アプリケーション（UI管理）
 */

class App {
    constructor() {
        this.game = new GameState();
        this.currentScreen = 'top';
        this.boardCells = [];
        this.oniMarker = null;
        this.runnerMarker = null;
        this.previousOniPos = null;
        this.previousRunnerPos = null;
        this.lastMoveDirection = null;

        // マルチプレイヤー
        this.multiplayer = null;
        this.isOnlineMode = false;
        this.myRole = null;
        this.myHandSelected = false;
        this.opponentHandSelected = false;

        // CPUモード
        this.isCpuMode = false;
        this.playerRole = null;  // プレイヤーの役割 ('oni' or 'runner')
        this.cpuRole = null;     // CPUの役割 ('oni' or 'runner')
        this.cpuDifficulty = 1;  // 難易度 (1:かんたん, 2:ふつう, 3:むずかしい)

        // オンライン同期用フラグ
        this.isAnimating = false;
        this.pendingTurnEnded = null;
        this.pendingGameFinished = null;

        // チュートリアル
        this.tutorialStep = 0;
        this.tutorialSteps = this.getTutorialSteps();

        // 戦績
        this.stats = this.loadStats();

        // DOM読み込み後に初期化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.createBoard();
        this.createPlayerMarkers();
        this.createBoardOverlays();
        this.setupRoomCodeInput();
        this.updateStatsDisplay();
    }

    /**
     * ルームコード入力のセットアップ
     */
    setupRoomCodeInput() {
        const input = document.getElementById('room-code-input');
        if (input) {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase();
            });
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.joinRoom();
                }
            });
        }
    }

    /**
     * 画面切り替え
     * @param {string} screenId - 画面ID（top/rules/settings/game/result）
     */
    showScreen(screenId) {
        // 全画面を非表示
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // 指定画面を表示
        const targetScreen = document.getElementById(`screen-${screenId}`);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;
        }
    }

    /**
     * ゲームボードを生成
     */
    createBoard() {
        const board = document.getElementById('game-board');
        if (!board) return;

        const computedStyle = getComputedStyle(board);
        const borderWidth = parseFloat(computedStyle.borderLeftWidth) || 0;
        const boardSize = (board.offsetWidth || 300) - borderWidth * 2;
        const radius = (boardSize / 2) - 30;
        const fineAdjust = -2; // 微調整オフセット（左上へ）
        const centerX = boardSize / 2 + fineAdjust;
        const centerY = boardSize / 2 + fineAdjust;

        // 既存のセルを削除
        this.boardCells.forEach(cell => cell.remove());
        this.boardCells = [];

        // 16マスを円形に配置
        for (let i = 0; i < GameConfig.BOARD_SIZE; i++) {
            const angle = (i * 360 / GameConfig.BOARD_SIZE) - 90; // -90で上から開始
            const radian = angle * (Math.PI / 180);

            const cell = document.createElement('div');
            cell.className = 'board-cell';
            cell.dataset.position = i;
            cell.textContent = i;

            // 特殊マスの装飾
            if (i === GameConfig.WARP_FROM) {
                cell.classList.add('warp-cell');
                cell.title = 'ワープマス（4へ移動）';
            }
            if (i === GameConfig.WARP_TO) {
                cell.classList.add('warp-cell');
                cell.title = 'ワープ先';
            }

            const x = centerX + radius * Math.cos(radian) - 20;
            const y = centerY + radius * Math.sin(radian) - 20;

            cell.style.left = `${x}px`;
            cell.style.top = `${y}px`;

            board.appendChild(cell);
            this.boardCells.push(cell);
        }
    }

    /**
     * ボードオーバーレイ（方向矢印、ワープ接続線）を生成
     */
    createBoardOverlays() {
        const board = document.getElementById('game-board');
        if (!board) return;

        // 既存のオーバーレイを削除
        const existingArrows = board.querySelector('.board-direction-arrows');
        const existingWarp = board.querySelector('.warp-connection');
        if (existingArrows) existingArrows.remove();
        if (existingWarp) existingWarp.remove();

        // 方向矢印を追加
        const arrowsDiv = document.createElement('div');
        arrowsDiv.className = 'board-direction-arrows';
        arrowsDiv.innerHTML = `
            <span class="direction-arrow cw">→</span>
            <span class="direction-label-cw">時計回り</span>
            <span class="direction-arrow ccw">←</span>
            <span class="direction-label-ccw">反時計回り</span>
        `;
        board.appendChild(arrowsDiv);

        // ワープ接続線を追加（SVG）
        const warpStyle = getComputedStyle(board);
        const warpBorderWidth = parseFloat(warpStyle.borderLeftWidth) || 0;
        const boardSize = (board.offsetWidth || 300) - warpBorderWidth * 2;
        const radius = (boardSize / 2) - 30;
        const fineAdjust = -2; // 微調整オフセット（左上へ）
        const centerX = boardSize / 2 + fineAdjust;
        const centerY = boardSize / 2 + fineAdjust;

        // マス12と4の位置を計算
        const angle12 = (12 * 360 / GameConfig.BOARD_SIZE) - 90;
        const radian12 = angle12 * (Math.PI / 180);
        const x12 = centerX + radius * Math.cos(radian12);
        const y12 = centerY + radius * Math.sin(radian12);

        const angle4 = (4 * 360 / GameConfig.BOARD_SIZE) - 90;
        const radian4 = angle4 * (Math.PI / 180);
        const x4 = centerX + radius * Math.cos(radian4);
        const y4 = centerY + radius * Math.sin(radian4);

        const warpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        warpSvg.setAttribute('class', 'warp-connection');
        warpSvg.setAttribute('width', boardSize);
        warpSvg.setAttribute('height', boardSize);
        warpSvg.setAttribute('viewBox', `0 0 ${boardSize} ${boardSize}`);

        // 矢印サイズと線の短縮量
        const arrowSize = 12;
        const lineShorten = 18;  // 点線を矢印手前で止める距離

        // 座標計算（オフセットなし）
        const startX = x12;
        const startY = y12;
        const endX = x4;
        const endY = y4;
        const dx = endX - startX;
        const dy = endY - startY;
        const angle = Math.atan2(dy, dx);

        // 線を描画（終点を矢印の手前で止める）
        const lineEndOffset = lineShorten + arrowSize;  // 矢印位置 + 矢印サイズ
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'warp-line');
        line.setAttribute('x1', startX);
        line.setAttribute('y1', startY);
        line.setAttribute('x2', endX - lineEndOffset * Math.cos(angle));
        line.setAttribute('y2', endY - lineEndOffset * Math.sin(angle));
        warpSvg.appendChild(line);

        // 矢印の3点を計算（先端を点線の終端に配置）
        const tipX = endX - lineShorten * Math.cos(angle);
        const tipY = endY - lineShorten * Math.sin(angle);
        const wing1X = tipX - arrowSize * Math.cos(angle - Math.PI / 6);
        const wing1Y = tipY - arrowSize * Math.sin(angle - Math.PI / 6);
        const wing2X = tipX - arrowSize * Math.cos(angle + Math.PI / 6);
        const wing2Y = tipY - arrowSize * Math.sin(angle + Math.PI / 6);

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${tipX},${tipY} ${wing1X},${wing1Y} ${wing2X},${wing2Y}`);
        arrow.setAttribute('fill', '#9b59b6');
        arrow.setAttribute('class', 'warp-arrow');
        warpSvg.appendChild(arrow);

        board.insertBefore(warpSvg, board.firstChild);
    }

    /**
     * プレイヤーマーカーを生成
     */
    createPlayerMarkers() {
        const board = document.getElementById('game-board');
        if (!board) return;

        // 既存マーカーを削除
        if (this.oniMarker) this.oniMarker.remove();
        if (this.runnerMarker) this.runnerMarker.remove();

        // 鬼マーカー
        this.oniMarker = document.createElement('div');
        this.oniMarker.className = 'player-marker oni-marker';
        this.oniMarker.textContent = '👹';
        board.appendChild(this.oniMarker);

        // 逃げマーカー
        this.runnerMarker = document.createElement('div');
        this.runnerMarker.className = 'player-marker runner-marker';
        this.runnerMarker.textContent = '🏃';
        board.appendChild(this.runnerMarker);
    }

    /**
     * マーカーの位置を更新
     */
    updateMarkerPositions() {
        const board = document.getElementById('game-board');
        if (!board) return;

        const computedStyle = getComputedStyle(board);
        const borderWidth = parseFloat(computedStyle.borderLeftWidth) || 0;
        const boardSize = (board.offsetWidth || 300) - borderWidth * 2;
        const radius = (boardSize / 2) - 30;
        const fineAdjust = -2; // 微調整オフセット（左上へ）
        const centerX = boardSize / 2 + fineAdjust;
        const centerY = boardSize / 2 + fineAdjust;

        // 鬼の位置
        const oniAngle = (this.game.oniPos * 360 / GameConfig.BOARD_SIZE) - 90;
        const oniRadian = oniAngle * (Math.PI / 180);
        const oniX = centerX + radius * Math.cos(oniRadian) - 16;
        const oniY = centerY + radius * Math.sin(oniRadian) - 16;

        // 逃げの位置
        const runnerAngle = (this.game.runnerPos * 360 / GameConfig.BOARD_SIZE) - 90;
        const runnerRadian = runnerAngle * (Math.PI / 180);
        const runnerX = centerX + radius * Math.cos(runnerRadian) - 16;
        const runnerY = centerY + radius * Math.sin(runnerRadian) - 16;

        // 同じ位置の場合はオフセット
        if (this.game.oniPos === this.game.runnerPos) {
            this.oniMarker.style.left = `${oniX - 10}px`;
            this.oniMarker.style.top = `${oniY - 10}px`;
            this.runnerMarker.style.left = `${runnerX + 10}px`;
            this.runnerMarker.style.top = `${runnerY + 10}px`;
        } else {
            this.oniMarker.style.left = `${oniX}px`;
            this.oniMarker.style.top = `${oniY}px`;
            this.runnerMarker.style.left = `${runnerX}px`;
            this.runnerMarker.style.top = `${runnerY}px`;
        }

        // ステータス表示更新
        document.getElementById('oni-position').textContent = `マス ${this.game.oniPos}`;
        document.getElementById('runner-position').textContent = `マス ${this.game.runnerPos}`;
    }

    /**
     * ゲーム開始
     */
    startGame() {
        this.game.reset();
        this.isOnlineMode = false;
        this.showScreen('game');

        // 接続状態を非表示
        const connStatus = document.getElementById('connection-status');
        if (connStatus) {
            connStatus.textContent = '';
            connStatus.classList.remove('online');
        }

        // ボードを再生成（画面サイズに合わせる）
        setTimeout(() => {
            this.createBoard();
            this.createPlayerMarkers();
            this.createBoardOverlays();
            this.updateMarkerPositions();
            this.updateTurnDisplay();
            this.clearLog();
            this.clearPreviousPositionMarkers();
            this.showPhase('janken');
            this.setJankenPlayer('oni');
        }, 100);
    }

    /**
     * ゲーム再開
     */
    restartGame() {
        // オンラインモードの場合はトップに戻す
        if (this.isOnlineMode) {
            this.leaveRoom();
            return;
        }
        // CPUモードの場合
        if (this.isCpuMode) {
            this.startCpuGame(this.playerRole);
            return;
        }
        this.startGame();
    }

    /**
     * CPU難易度を設定
     * @param {number} level - 難易度 (1:かんたん, 2:ふつう, 3:むずかしい)
     */
    setCpuDifficulty(level) {
        this.cpuDifficulty = level;

        // ボタンのactive状態を更新
        const buttons = document.querySelectorAll('.btn-difficulty');
        buttons.forEach(btn => {
            if (parseInt(btn.dataset.level) === level) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    /**
     * CPU対戦ゲーム開始
     * @param {string} playerRole - プレイヤーの役割 ('oni' or 'runner')
     */
    startCpuGame(playerRole) {
        this.game.reset();
        this.isCpuMode = true;
        this.isOnlineMode = false;
        this.playerRole = playerRole;
        this.cpuRole = playerRole === 'oni' ? 'runner' : 'oni';
        this.showScreen('game');

        // 接続状態にCPU対戦と表示
        const connStatus = document.getElementById('connection-status');
        if (connStatus) {
            connStatus.textContent = 'vs CPU';
            connStatus.classList.remove('online');
            connStatus.classList.remove('reconnecting');
        }

        // ボードを再生成（画面サイズに合わせる）
        setTimeout(() => {
            this.createBoard();
            this.createPlayerMarkers();
            this.createBoardOverlays();
            this.updateMarkerPositions();
            this.updateTurnDisplay();
            this.clearLog();
            this.clearPreviousPositionMarkers();
            this.startCpuTurn();
        }, 100);
    }

    /**
     * CPUターン開始（じゃんけんフェーズ）
     */
    startCpuTurn() {
        this.showPhase('janken');

        // プライバシー警告を非表示
        const privacyWarning = document.getElementById('privacy-warning');
        if (privacyWarning) privacyWarning.style.display = 'none';

        // プレイヤー用のラベルを表示
        const label = document.getElementById('janken-player-label');
        if (label) {
            if (this.playerRole === 'oni') {
                label.textContent = '👹 あなたの番（鬼）';
                label.style.color = '#e74c3c';
            } else {
                label.textContent = '🏃 あなたの番（逃げ）';
                label.style.color = '#3498db';
            }
        }
    }

    /**
     * CPUのじゃんけん手を選択（AI）
     * @returns {string} rock/scissors/paper
     */
    cpuSelectHand() {
        const hands = ['rock', 'scissors', 'paper'];

        // 難易度に応じてプレイヤーの手を参照してカウンターを出す確率
        // Level 1: 0%, Level 2: 20%, Level 3: 40%
        const cheatChance = [0, 0, 0.2, 0.4][this.cpuDifficulty] || 0;

        if (cheatChance > 0 && Math.random() < cheatChance) {
            // プレイヤーの手を参照してカウンターを出す
            const playerHand = this.game[this.playerRole + 'Hand'];
            if (playerHand) {
                // 勝てる手を返す
                const counterHands = {
                    rock: 'paper',      // グーにはパー
                    scissors: 'rock',   // チョキにはグー
                    paper: 'scissors'   // パーにはチョキ
                };
                return counterHands[playerHand];
            }
        }

        // 通常のAI戦略
        // 状況に応じて手を選ぶ
        const distance = this.getDistanceBetweenPlayers();

        if (this.cpuRole === 'oni') {
            // 鬼の場合：近ければパー（4マス）で追い詰める、遠ければグー（2マス）で安定
            if (distance <= 4) {
                // 近い時はパーを多めに
                const weights = [0.25, 0.25, 0.5]; // rock, scissors, paper
                return this.weightedRandom(hands, weights);
            } else {
                // 遠い時はランダム
                return hands[Math.floor(Math.random() * hands.length)];
            }
        } else {
            // 逃げの場合：パー（4マス）で大きく逃げるか、チョキ（1マス）で細かく調整
            if (distance <= 3) {
                // 近い時はパーを多めに（大きく逃げる）
                const weights = [0.2, 0.2, 0.6];
                return this.weightedRandom(hands, weights);
            } else {
                // 遠い時はランダム
                return hands[Math.floor(Math.random() * hands.length)];
            }
        }
    }

    /**
     * CPUの移動方向を選択（AI）
     * @returns {string} cw/ccw
     */
    cpuSelectDirection() {
        const oniPos = this.game.oniPos;
        const runnerPos = this.game.runnerPos;
        const hand = this.game[this.cpuRole + 'Hand'];
        const steps = GameConfig.MOVE_STEPS[hand];

        if (this.cpuRole === 'oni') {
            // 鬼：逃げに近づく方向を選ぶ
            const cwDist = this.getDistanceAfterMove(oniPos, steps, 'cw', runnerPos);
            const ccwDist = this.getDistanceAfterMove(oniPos, steps, 'ccw', runnerPos);

            // 距離が近くなる方を選ぶ
            if (cwDist < ccwDist) return 'cw';
            if (ccwDist < cwDist) return 'ccw';
            return Math.random() < 0.5 ? 'cw' : 'ccw';
        } else {
            // 逃げ：鬼から離れる方向を選ぶ
            const cwDist = this.getDistanceAfterMove(runnerPos, steps, 'cw', oniPos);
            const ccwDist = this.getDistanceAfterMove(runnerPos, steps, 'ccw', oniPos);

            // 距離が遠くなる方を選ぶ
            if (cwDist > ccwDist) return 'cw';
            if (ccwDist > cwDist) return 'ccw';
            return Math.random() < 0.5 ? 'cw' : 'ccw';
        }
    }

    /**
     * プレイヤー間の距離を取得
     * @returns {number} 最短距離
     */
    getDistanceBetweenPlayers() {
        const oniPos = this.game.oniPos;
        const runnerPos = this.game.runnerPos;
        const cwDist = (runnerPos - oniPos + GameConfig.BOARD_SIZE) % GameConfig.BOARD_SIZE;
        const ccwDist = (oniPos - runnerPos + GameConfig.BOARD_SIZE) % GameConfig.BOARD_SIZE;
        return Math.min(cwDist, ccwDist);
    }

    /**
     * 移動後の距離を計算
     */
    getDistanceAfterMove(startPos, steps, direction, targetPos) {
        let newPos = startPos;
        for (let i = 0; i < steps; i++) {
            if (direction === 'cw') {
                newPos = (newPos + 1) % GameConfig.BOARD_SIZE;
            } else {
                newPos = (newPos - 1 + GameConfig.BOARD_SIZE) % GameConfig.BOARD_SIZE;
            }
        }
        // ワープ処理
        if (newPos === GameConfig.WARP_FROM) {
            newPos = GameConfig.WARP_TO;
        }
        const cwDist = (targetPos - newPos + GameConfig.BOARD_SIZE) % GameConfig.BOARD_SIZE;
        const ccwDist = (newPos - targetPos + GameConfig.BOARD_SIZE) % GameConfig.BOARD_SIZE;
        return Math.min(cwDist, ccwDist);
    }

    /**
     * 重み付きランダム選択
     */
    weightedRandom(items, weights) {
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let random = Math.random() * totalWeight;
        for (let i = 0; i < items.length; i++) {
            random -= weights[i];
            if (random <= 0) return items[i];
        }
        return items[items.length - 1];
    }

    /**
     * ゲームを途中終了
     */
    exitGame() {
        if (this.isOnlineMode) {
            if (confirm('ゲームを終了しますか？')) {
                this.leaveRoom();
            }
        } else {
            if (confirm('ゲームを終了しますか？')) {
                this.showScreen('top');
            }
        }
    }

    /**
     * ターン表示更新
     */
    updateTurnDisplay() {
        document.getElementById('turn-count').textContent = this.game.turn;
    }

    /**
     * フェーズを表示
     * @param {string} phase - janken/confirm/showdown/result/direction/moving/waiting-opponent
     */
    showPhase(phase) {
        const phases = ['janken', 'confirm', 'showdown', 'result', 'direction', 'moving', 'waiting-opponent'];
        phases.forEach(p => {
            const el = document.getElementById(`phase-${p}`);
            if (el) {
                el.style.display = p === phase ? 'block' : 'none';
            }
        });

        // 中央インジケーター更新
        const indicator = document.getElementById('phase-indicator');
        const labels = {
            janken: 'じゃんけん',
            confirm: '交代',
            showdown: 'ぽん！',
            result: '結果',
            direction: '移動選択',
            moving: '移動中',
            'waiting-opponent': '待機中'
        };
        if (indicator) {
            indicator.textContent = labels[phase] || '';
        }
    }

    /**
     * じゃんけんプレイヤーを設定
     * @param {string} player - 'oni' or 'runner'
     */
    setJankenPlayer(player) {
        this.currentJankenPlayer = player;
        const label = document.getElementById('janken-player-label');
        const privacyWarning = document.getElementById('privacy-warning');

        // CPUモード
        if (this.isCpuMode) {
            if (label) {
                if (this.playerRole === 'oni') {
                    label.textContent = '👹 あなたの番（鬼）';
                    label.style.color = '#e74c3c';
                } else {
                    label.textContent = '🏃 あなたの番（逃げ）';
                    label.style.color = '#3498db';
                }
            }
            // CPUモードではプライバシー警告を非表示
            if (privacyWarning) privacyWarning.style.display = 'none';
            return;
        }

        // ローカルモード
        if (label) {
            if (player === 'oni') {
                label.textContent = '👹 鬼の番';
                label.style.color = '#e74c3c';
            } else {
                label.textContent = '🏃 逃げの番';
                label.style.color = '#3498db';
            }
        }

        // ローカルモードではプライバシー警告を表示
        if (privacyWarning) privacyWarning.style.display = 'flex';
    }

    /**
     * じゃんけんの手を選択
     * @param {string} hand - rock/scissors/paper
     */
    selectHand(hand) {
        // オンラインモード
        if (this.isOnlineMode) {
            this.game.setHand(this.myRole, hand);
            this.multiplayer.selectHand(hand);
            this.myHandSelected = true;

            if (this.opponentHandSelected) {
                // 相手も選択済みなら待機画面
                this.showPhase('waiting-opponent');
                document.getElementById('waiting-opponent-text').textContent = '結果を表示中...';
            } else {
                // 相手を待つ
                this.showPhase('waiting-opponent');
                document.getElementById('waiting-opponent-text').textContent = '相手の入力を待っています...';
            }
            return;
        }

        // CPUモード
        if (this.isCpuMode) {
            // プレイヤーの手をセット
            this.game.setHand(this.playerRole, hand);

            // CPUの手を自動選択
            const cpuHand = this.cpuSelectHand();
            this.game.setHand(this.cpuRole, cpuHand);

            // 結果表示へ
            this.showJankenResult();
            return;
        }

        // ローカルモード（1台で対戦）
        this.game.setHand(this.currentJankenPlayer, hand);

        if (this.currentJankenPlayer === 'oni') {
            // 鬼が選んだら確認画面へ
            this.showPhase('confirm');
        } else {
            // 逃げが選んだら結果表示へ
            this.showJankenResult();
        }
    }

    /**
     * 手の確認（端末交代）
     */
    confirmHand() {
        this.setJankenPlayer('runner');
        this.showPhase('janken');
    }

    /**
     * じゃんけん結果を表示（ショーダウン演出付き）
     */
    showJankenResult() {
        // まずショーダウン画面を表示
        this.startShowdown();
    }

    /**
     * ショーダウン（カウントダウン演出）を開始
     */
    startShowdown() {
        this.showPhase('showdown');

        // 初期状態をリセット
        document.getElementById('oni-showdown-hand').textContent = '❓';
        document.getElementById('runner-showdown-hand').textContent = '❓';
        document.getElementById('oni-showdown-hand').classList.remove('revealed');
        document.getElementById('runner-showdown-hand').classList.remove('revealed');

        const countdownEl = document.getElementById('showdown-countdown');
        let count = 3;
        const countdownTexts = ['3', '2', '1', 'ぽん！'];

        const countdown = () => {
            if (count >= 0) {
                countdownEl.textContent = countdownTexts[3 - count];
                countdownEl.style.animation = 'none';
                // アニメーションリセット
                setTimeout(() => {
                    countdownEl.style.animation = 'countdownPop 0.5s ease';
                }, 10);

                count--;
                setTimeout(countdown, 600);
            } else {
                // カウントダウン終了、手を表示
                this.revealHands();
            }
        };

        countdown();
    }

    /**
     * 手を公開する
     */
    revealHands() {
        const oniHandEl = document.getElementById('oni-showdown-hand');
        const runnerHandEl = document.getElementById('runner-showdown-hand');

        // 手を表示
        oniHandEl.textContent = handToEmoji(this.game.oniHand);
        runnerHandEl.textContent = handToEmoji(this.game.runnerHand);
        oniHandEl.classList.add('revealed');
        runnerHandEl.classList.add('revealed');

        // 少し待ってから結果画面へ
        setTimeout(() => {
            this.showFinalResult();
        }, 1000);
    }

    /**
     * 最終結果を表示
     */
    showFinalResult() {
        // 手の表示
        document.getElementById('oni-hand-display').textContent = handToEmoji(this.game.oniHand);
        document.getElementById('runner-hand-display').textContent = handToEmoji(this.game.runnerHand);

        // 勝敗判定
        const { result, winner } = this.game.judgeRound();

        const resultText = document.getElementById('janken-result-text');
        resultText.classList.remove('oni-win', 'runner-win', 'draw');

        if (result === 1) {
            resultText.textContent = '鬼の勝ち！';
            resultText.classList.add('oni-win');
        } else if (result === -1) {
            resultText.textContent = '逃げの勝ち！';
            resultText.classList.add('runner-win');
        } else {
            resultText.textContent = 'あいこ！';
            resultText.classList.add('draw');
        }

        this.jankenWinner = winner;
        this.showPhase('result');

        // オンラインモードでは自動で次へ進む（同期のため）
        const nextBtn = document.getElementById('result-next-btn');
        if (this.isOnlineMode) {
            if (nextBtn) nextBtn.style.display = 'none';
            setTimeout(() => {
                this.proceedAfterResult();
            }, 1500);
        } else {
            if (nextBtn) nextBtn.style.display = 'block';
        }
    }

    /**
     * じゃんけん結果後の処理
     */
    proceedAfterResult() {
        if (this.jankenWinner) {
            // 勝者がいる場合は方向選択へ
            this.showDirectionSelect(this.jankenWinner);
        } else {
            // あいこの場合はログを追加してターン終了
            this.addLogEntry(this.game.turn, this.game.oniHand, this.game.runnerHand, 'draw', this.game.oniPos, this.game.runnerPos);
            this.game.endTurn();

            if (this.game.isGameOver()) {
                if (this.isOnlineMode && this.myRole === 'oni') {
                    this.multiplayer.gameOver(this.game.winner, this.game.winReason);
                }
                this.showResult();
            } else {
                this.updateTurnDisplay();

                // オンラインモード
                if (this.isOnlineMode) {
                    this.startOnlineJanken();
                } else {
                    // ローカルモード
                    this.showPhase('janken');
                    this.setJankenPlayer('oni');
                }
            }
        }
    }

    /**
     * 方向選択画面を表示
     * @param {string} player - 'oni' or 'runner'
     */
    showDirectionSelect(player) {
        this.movingPlayer = player;

        const label = document.getElementById('direction-player-label');

        // オンラインモード
        if (this.isOnlineMode) {
            if (player === this.myRole) {
                // 自分が勝った
                if (player === 'oni') {
                    label.textContent = '👹 あなたの番（鬼）';
                    label.style.color = '#e74c3c';
                } else {
                    label.textContent = '🏃 あなたの番（逃げ）';
                    label.style.color = '#3498db';
                }
                const hand = this.game[player + 'Hand'];
                const steps = GameConfig.MOVE_STEPS[hand];
                document.getElementById('move-steps').textContent = steps;
                this.showPhase('direction');
            } else {
                // 相手が勝った、待機
                this.showPhase('waiting-opponent');
                document.getElementById('waiting-opponent-text').textContent = '相手が移動方向を選んでいます...';
            }
            return;
        }

        // CPUモード
        if (this.isCpuMode) {
            if (player === this.cpuRole) {
                // CPUが勝った場合 - 自動で方向を選択
                const cpuDirection = this.cpuSelectDirection();

                // 少し待ってから移動（演出）
                setTimeout(() => {
                    this.selectDirection(cpuDirection);
                }, 800);
                return;
            } else {
                // プレイヤーが勝った場合 - 方向選択画面を表示
                if (label) {
                    if (player === 'oni') {
                        label.textContent = '👹 あなたの番（鬼）';
                        label.style.color = '#e74c3c';
                    } else {
                        label.textContent = '🏃 あなたの番（逃げ）';
                        label.style.color = '#3498db';
                    }
                }

                const hand = player === 'oni' ? this.game.oniHand : this.game.runnerHand;
                const steps = GameConfig.MOVE_STEPS[hand];
                document.getElementById('move-steps').textContent = steps;

                this.showPhase('direction');
                return;
            }
        }

        // ローカルモード（1台で対戦）
        if (label) {
            if (player === 'oni') {
                label.textContent = '👹 鬼の番';
                label.style.color = '#e74c3c';
            } else {
                label.textContent = '🏃 逃げの番';
                label.style.color = '#3498db';
            }
        }

        const hand = player === 'oni' ? this.game.oniHand : this.game.runnerHand;
        const steps = GameConfig.MOVE_STEPS[hand];
        document.getElementById('move-steps').textContent = steps;

        this.showPhase('direction');
    }

    /**
     * 移動方向を選択
     * @param {string} direction - 'cw' or 'ccw'
     */
    selectDirection(direction) {
        // オンラインモード
        if (this.isOnlineMode) {
            this.multiplayer.selectDirection(direction);
            this.executeOnlineMove(this.myRole, direction);
            return;
        }

        // ローカルモード
        this.showPhase('moving');

        const player = this.movingPlayer;
        const hand = player === 'oni' ? this.game.oniHand : this.game.runnerHand;
        const steps = GameConfig.MOVE_STEPS[hand];
        const startPos = player === 'oni' ? this.game.oniPos : this.game.runnerPos;

        // 移動前の位置を保存（ログ用）
        const preMoveOniPos = this.game.oniPos;
        const preMoveRunnerPos = this.game.runnerPos;

        // 経路を計算
        const path = calculatePath(startPos, steps, direction);

        // 移動アニメーション
        this.animateMove(player, path, direction, () => {
            // 移動実行
            const result = this.game.executeMove(player, direction);

            // ワープアニメーション
            if (result.warped) {
                this.animateWarp(player, () => {
                    this.updateMarkerPositions();
                    this.finishMove(player, result, direction, preMoveOniPos, preMoveRunnerPos);
                });
            } else {
                this.updateMarkerPositions();
                this.finishMove(player, result, direction, preMoveOniPos, preMoveRunnerPos);
            }
        });
    }

    /**
     * 移動アニメーション
     * @param {string} player - 'oni' or 'runner'
     * @param {number[]} path - 経路
     * @param {string} direction - 方向
     * @param {Function} callback - 完了後コールバック
     */
    animateMove(player, path, direction, callback) {
        const board = document.getElementById('game-board');
        const computedStyle = getComputedStyle(board);
        const borderWidth = parseFloat(computedStyle.borderLeftWidth) || 0;
        const boardSize = (board.offsetWidth || 300) - borderWidth * 2;
        const radius = (boardSize / 2) - 30;
        const fineAdjust = -2; // 微調整オフセット（左上へ）
        const centerX = boardSize / 2 + fineAdjust;
        const centerY = boardSize / 2 + fineAdjust;

        const marker = player === 'oni' ? this.oniMarker : this.runnerMarker;
        let step = 0;

        const animate = () => {
            if (step >= path.length) {
                // ハイライトをクリア
                this.boardCells.forEach(cell => cell.classList.remove('path-highlight'));
                callback();
                return;
            }

            const pos = path[step];
            const angle = (pos * 360 / GameConfig.BOARD_SIZE) - 90;
            const radian = angle * (Math.PI / 180);
            const x = centerX + radius * Math.cos(radian) - 16;
            const y = centerY + radius * Math.sin(radian) - 16;

            marker.style.left = `${x}px`;
            marker.style.top = `${y}px`;

            // セルをハイライト
            this.boardCells[pos].classList.add('path-highlight');

            step++;
            setTimeout(animate, 300);
        };

        animate();
    }

    /**
     * ワープアニメーション
     * @param {string} player - 'oni' or 'runner'
     * @param {Function} callback - 完了後コールバック
     */
    animateWarp(player, callback) {
        const marker = player === 'oni' ? this.oniMarker : this.runnerMarker;
        marker.classList.add('warp-animation');

        setTimeout(() => {
            marker.classList.remove('warp-animation');
            callback();
        }, 600);
    }

    /**
     * 移動完了処理
     * @param {string} player - 'oni' or 'runner'
     * @param {Object} result - 移動結果
     * @param {string} direction - 方向
     * @param {number} preMoveOniPos - 移動前の鬼の位置
     * @param {number} preMoveRunnerPos - 移動前の逃げの位置
     */
    finishMove(player, result, direction, preMoveOniPos, preMoveRunnerPos) {
        // 移動マス数を取得
        const hand = player === 'oni' ? this.game.oniHand : this.game.runnerHand;
        const steps = GameConfig.MOVE_STEPS[hand];

        // ログ追加（移動前の位置と方向を記録）
        const winner = player === 'oni' ? 'oni' : 'runner';
        this.addLogEntry(this.game.turn, this.game.oniHand, this.game.runnerHand, winner, preMoveOniPos, preMoveRunnerPos, direction, steps);

        // 直前の移動元を更新
        if (player === 'oni') {
            this.previousOniPos = preMoveOniPos;
        } else {
            this.previousRunnerPos = preMoveRunnerPos;
        }
        this.updatePreviousPositionMarkers();

        // 鬼の勝利判定（どちらが動いても触れたら鬼の勝ち）
        if (result.caught) {
            const reason = player === 'oni'
                ? (result.overtake ? '逃げを追い越した！' : '逃げを捕まえた！')
                : '逃げが鬼に突っ込んだ！';
            this.game.setOniWin(reason);
            this.showResult();
            return;
        }

        // ターン終了
        this.game.endTurn();

        if (this.game.isGameOver()) {
            this.showResult();
        } else {
            this.updateTurnDisplay();
            this.showPhase('janken');
            this.setJankenPlayer('oni');
        }
    }

    /**
     * ログを追加（テーブル形式）
     * @param {number} turn - ターン数
     * @param {string} oniHand - 鬼の手
     * @param {string} runnerHand - 逃げの手
     * @param {string} result - 結果（'oni', 'runner', 'draw'）
     * @param {number} oniPos - 鬼の位置
     * @param {number} runnerPos - 逃げの位置
     * @param {string} direction - 移動方向（'cw', 'ccw', または null）
     * @param {number} steps - 移動マス数
     */
    addLogEntry(turn, oniHand, runnerHand, result, oniPos, runnerPos, direction = null, steps = 0) {
        const logContent = document.getElementById('log-content');
        if (!logContent) return;

        const row = document.createElement('tr');

        // 結果テキストとクラス
        let resultText = '';
        let resultClass = '';
        if (result === 'oni') {
            resultText = '鬼勝';
            resultClass = 'log-result-oni';
        } else if (result === 'runner') {
            resultText = '逃勝';
            resultClass = 'log-result-runner';
        } else {
            resultText = 'あいこ';
            resultClass = 'log-result-draw';
        }

        // 移動方向テキスト
        let directionText = '-';
        let directionClass = '';
        if (direction === 'cw') {
            directionText = `↻${steps}`;
            directionClass = 'log-direction-cw';
        } else if (direction === 'ccw') {
            directionText = `↺${steps}`;
            directionClass = 'log-direction-ccw';
        }

        const cell = (text, className = '') => {
            const td = document.createElement('td');
            td.textContent = String(text);
            td.className = className;
            row.appendChild(td);
            return td;
        };
        cell(turn);
        cell(handToEmoji(oniHand));
        cell(handToEmoji(runnerHand));
        cell(resultText, resultClass);
        cell(directionText, `log-direction ${directionClass}`);
        const positions = cell('', 'log-positions');
        for (const [value, className] of [[oniPos, 'pos-oni'], [runnerPos, 'pos-runner']]) {
            if (positions.firstChild) positions.appendChild(document.createTextNode(':'));
            const span = document.createElement('span');
            span.className = className;
            span.textContent = String(value);
            positions.appendChild(span);
        }

        // 最新を上に追加
        logContent.insertBefore(row, logContent.firstChild);
    }

    /**
     * ログをクリア
     */
    clearLog() {
        const logContent = document.getElementById('log-content');
        if (logContent) {
            logContent.innerHTML = '';
        }
    }

    /**
     * 直前の移動元マーカーを更新
     */
    updatePreviousPositionMarkers() {
        // 既存のマーカーをクリア
        this.boardCells.forEach(cell => {
            cell.classList.remove('previous-position', 'oni-previous', 'runner-previous');
        });

        // 鬼の前の位置をマーク
        if (this.previousOniPos !== null && this.boardCells[this.previousOniPos]) {
            this.boardCells[this.previousOniPos].classList.add('previous-position', 'oni-previous');
        }

        // 逃げの前の位置をマーク
        if (this.previousRunnerPos !== null && this.boardCells[this.previousRunnerPos]) {
            this.boardCells[this.previousRunnerPos].classList.add('previous-position', 'runner-previous');
        }
    }

    /**
     * 直前の移動元マーカーをクリア
     */
    clearPreviousPositionMarkers() {
        this.previousOniPos = null;
        this.previousRunnerPos = null;
        this.boardCells.forEach(cell => {
            cell.classList.remove('previous-position', 'oni-previous', 'runner-previous');
        });
    }

    /**
     * 結果画面を表示
     */
    showResult() {
        const winnerEl = document.getElementById('result-winner');
        const reasonEl = document.getElementById('result-reason');
        const turnsEl = document.getElementById('result-turns');
        const positionsEl = document.getElementById('result-positions');

        winnerEl.classList.remove('oni-winner', 'runner-winner');

        // オンラインモードまたはCPUモードでは役割に応じたメッセージを表示
        if (this.isOnlineMode || this.isCpuMode) {
            const playerRole = this.isOnlineMode ? this.myRole : this.playerRole;
            if (this.game.winner === 'oni') {
                winnerEl.classList.add('oni-winner');
                if (playerRole === 'oni') {
                    winnerEl.textContent = '👹 捕まえた！';
                    reasonEl.textContent = 'あなたの勝ち！';
                } else {
                    winnerEl.textContent = '😱 捕まった！';
                    reasonEl.textContent = 'あなたの負け...';
                }
            } else {
                winnerEl.classList.add('runner-winner');
                if (playerRole === 'runner') {
                    winnerEl.textContent = '🏃 逃げ切った！';
                    reasonEl.textContent = 'あなたの勝ち！';
                } else {
                    winnerEl.textContent = '😢 捕まえられなかった！';
                    reasonEl.textContent = 'あなたの負け...';
                }
            }
        } else {
            // ローカルモード（1台で対戦）では従来通り
            if (this.game.winner === 'oni') {
                winnerEl.textContent = '👹 鬼の勝ち！';
                winnerEl.classList.add('oni-winner');
                reasonEl.textContent = this.game.winReason;
            } else {
                winnerEl.textContent = '🏃 逃げの勝ち！';
                winnerEl.classList.add('runner-winner');
                reasonEl.textContent = this.game.winReason;
            }
        }

        turnsEl.textContent = Math.min(this.game.turn, GameConfig.MAX_TURNS);
        positionsEl.textContent = `鬼:${this.game.oniPos} 逃げ:${this.game.runnerPos}`;

        // オンラインモードでは再戦セクションを表示
        this.updateResultButtons();

        // 戦績を記録
        this.recordGameResult();

        this.showScreen('result');
        // オンラインモードでの gameOver 通知は finishOnlineMove で行う
    }

    // =====================================
    // マルチプレイヤー機能
    // =====================================

    /**
     * サーバーに接続
     */
    async connectToServer() {
        if (this.multiplayer && this.multiplayer.isConnected) {
            return;
        }

        this.multiplayer = new MultiplayerClient();

        try {
            await this.multiplayer.connect();
            this.setupMultiplayerEvents();
            return true;
        } catch (error) {
            console.error('Connection failed:', error);
            alert('サーバーへの接続に失敗しました。\nサーバーが起動しているか確認してください。');
            return false;
        }
    }

    /**
     * マルチプレイヤーイベントのセットアップ
     */
    setupMultiplayerEvents() {
        // 相手が参加
        this.multiplayer.on('playerJoined', (data) => {
            document.getElementById('waiting-message').textContent = '相手が参加しました！';
        });

        // 役割が割り当てられた
        this.multiplayer.on('roleAssigned', (data) => {
            this.myRole = data.role;
            // 待機画面で役割を更新
            const roleDisplay = document.getElementById('your-role-display');
            if (roleDisplay) {
                roleDisplay.textContent = data.role === 'oni' ? '👹 鬼' : '🏃 逃げ';
            }
        });

        // ゲーム開始
        this.multiplayer.on('gameStarted', (data) => {
            this.startOnlineGamePlay(data);
        });

        // 相手が手を選んだ
        this.multiplayer.on('opponentSelectedHand', (data) => {
            this.opponentHandSelected = true;
            this.checkBothHandsSelected();
        });

        // 両者の手が公開
        this.multiplayer.on('handsRevealed', (data) => {
            if (!data || ![data.oniHand, data.runnerHand].every(h => ['rock', 'scissors', 'paper'].includes(h))) return;
            this.game.setHand('oni', data.oniHand);
            this.game.setHand('runner', data.runnerHand);
            this.showJankenResult();
        });

        // 移動方向が選択された
        this.multiplayer.on('directionSelected', (data) => {
            if (!data || !['oni', 'runner'].includes(data.role) || !['cw', 'ccw'].includes(data.direction)) return;
            if (data.role !== this.myRole) {
                // 相手の移動方向が決まった
                this.executeOnlineMove(data.role, data.direction);
            }
        });

        // 位置更新
        this.multiplayer.on('positionUpdated', (data) => {
            if (!data || !this.validOnlineState({ ...data, turn: this.game.turn })) return;
            this.game.oniPos = data.oniPos;
            this.game.runnerPos = data.runnerPos;
            this.updateMarkerPositions();
        });

        // ターン終了（相手の移動後に同期を受け取る）
        this.multiplayer.on('turnEnded', (data) => {
            // アニメーション中なら保留
            if (this.isAnimating) {
                this.pendingTurnEnded = data;
                return;
            }
            this.applyTurnEnded(data);
        });

        // ゲーム終了
        this.multiplayer.on('gameFinished', (data) => {
            // アニメーション中なら保留
            if (this.isAnimating) {
                this.pendingGameFinished = data;
                return;
            }
            this.applyGameFinished(data);
        });

        // 相手が切断
        this.multiplayer.on('opponentDisconnected', () => {
            alert('相手が切断しました');
            this.leaveRoom();
            this.showScreen('top');
        });

        // 自分の接続が切れた
        this.multiplayer.on('disconnected', () => {
            this.updateConnectionStatus();
            // 自動再接続を試行
            this.attemptReconnect();
        });

        // 再戦リクエスト
        this.multiplayer.on('rematchRequested', (data) => {
            // 相手が再戦を希望
            this.handleOpponentRematchRequest();
        });

        // 両者が再戦同意でルーム準備完了（再戦時）
        this.multiplayer.on('roomReady', (data) => {
            // 既にゲーム画面か結果画面にいる場合は再戦
            if (this.currentScreen === 'result' || this.currentScreen === 'game') {
                this.startRematch();
            } else {
                // 初回マッチング
                this.showMatchedScreen();
            }
        });
    }

    /**
     * ルーム作成
     */
    async createRoom() {
        const connected = await this.connectToServer();
        if (!connected) return;

        try {
            const result = await this.multiplayer.createRoom();
            this.myRole = result.role; // null（役割は後で決定）

            document.getElementById('room-code-display').textContent = result.roomCode;
            document.getElementById('your-role-display').textContent = '役割抽選中...';

            this.showScreen('room-waiting');
        } catch (error) {
            console.error('Room creation failed:', error);
            alert('ルームの作成に失敗しました');
        }
    }

    /**
     * ルームコードをクリップボードにコピー
     */
    async copyRoomCode() {
        const codeEl = document.getElementById('room-code-display');
        const code = codeEl.textContent;

        if (code === '----') return;

        try {
            await navigator.clipboard.writeText(code);
            const originalText = codeEl.textContent;
            codeEl.textContent = 'コピー！';
            setTimeout(() => {
                codeEl.textContent = originalText;
            }, 1000);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    }

    /**
     * ルーム参加
     */
    async joinRoom() {
        const input = document.getElementById('room-code-input');
        const errorEl = document.getElementById('join-error');
        const roomCode = input.value.trim().toUpperCase();

        if (roomCode.length !== 4) {
            errorEl.textContent = '4文字のコードを入力してください';
            return;
        }

        const connected = await this.connectToServer();
        if (!connected) return;

        try {
            const result = await this.multiplayer.joinRoom(roomCode);
            this.myRole = result.role;
            errorEl.textContent = '';

            // すぐにマッチング画面へ
            this.showMatchedScreen();
        } catch (error) {
            console.error('Join failed:', error);
            errorEl.textContent = error.message || 'ルームへの参加に失敗しました';
        }
    }

    /**
     * ルーム退出
     */
    leaveRoom() {
        if (this.multiplayer) {
            this.multiplayer.leaveRoom();
        }
        this.isOnlineMode = false;
        this.myRole = null;
        this.showScreen('top');
    }

    /**
     * マッチング完了画面を表示
     */
    showMatchedScreen() {
        // プレイヤーラベルを更新
        const oniLabel = document.getElementById('oni-player-label');
        const runnerLabel = document.getElementById('runner-player-label');

        if (this.myRole === 'oni') {
            oniLabel.textContent = 'あなた';
            runnerLabel.textContent = '相手';
        } else {
            oniLabel.textContent = '相手';
            runnerLabel.textContent = 'あなた';
        }

        // 開始ボタンの表示切替（鬼のみ開始可能）
        const startSection = document.getElementById('start-game-section');
        const waitSection = document.getElementById('wait-start-section');

        if (this.myRole === 'oni') {
            startSection.style.display = 'block';
            waitSection.style.display = 'none';
        } else {
            startSection.style.display = 'none';
            waitSection.style.display = 'block';
        }

        this.showScreen('matched');
    }

    /**
     * オンラインゲーム開始（鬼がボタンを押した時）
     */
    startOnlineGame() {
        if (this.multiplayer && this.myRole === 'oni') {
            this.multiplayer.startGame();
        }
    }

    /**
     * オンラインゲームプレイ開始
     */
    startOnlineGamePlay(data) {
        if (!this.validOnlineState(data)) return;
        this.isOnlineMode = true;
        this.game.reset();
        this.game.oniPos = data.oniPos;
        this.game.runnerPos = data.runnerPos;
        this.game.turn = data.turn;

        this.showScreen('game');

        // 接続状態を表示
        const connStatus = document.getElementById('connection-status');
        if (connStatus) {
            connStatus.textContent = 'オンライン';
            connStatus.classList.add('online');
        }

        setTimeout(() => {
            this.createBoard();
            this.createPlayerMarkers();
            this.createBoardOverlays();
            this.updateMarkerPositions();
            this.updateTurnDisplay();
            this.clearLog();
            this.clearPreviousPositionMarkers();
            this.startOnlineJanken();
        }, 100);
    }

    /**
     * オンラインじゃんけん開始
     */
    startOnlineJanken() {
        this.myHandSelected = false;
        this.opponentHandSelected = false;
        this.isAnimating = false;
        this.pendingTurnEnded = null;
        this.pendingGameFinished = null;

        // プライバシー警告を非表示（オンラインでは不要）
        const privacyWarning = document.getElementById('privacy-warning');
        if (privacyWarning) privacyWarning.style.display = 'none';

        // 自分の役割を表示
        const label = document.getElementById('janken-player-label');
        if (this.myRole === 'oni') {
            label.textContent = '👹 あなたの番（鬼）';
            label.style.color = '#e74c3c';
        } else {
            label.textContent = '🏃 あなたの番（逃げ）';
            label.style.color = '#3498db';
        }

        this.showPhase('janken');
    }

    /**
     * 両者が手を選んだかチェック
     */
    checkBothHandsSelected() {
        if (this.myHandSelected && this.opponentHandSelected) {
            // 両者選択済み、サーバーからhandsRevealedを待つ
            this.showPhase('waiting-opponent');
            document.getElementById('waiting-opponent-text').textContent = '結果を表示中...';
        }
    }

    /**
     * オンライン移動実行
     */
    executeOnlineMove(player, direction) {
        this.showPhase('moving');
        this.isAnimating = true; // アニメーション開始

        const hand = player === 'oni' ? this.game.oniHand : this.game.runnerHand;
        const steps = GameConfig.MOVE_STEPS[hand];
        const startPos = player === 'oni' ? this.game.oniPos : this.game.runnerPos;

        const preMoveOniPos = this.game.oniPos;
        const preMoveRunnerPos = this.game.runnerPos;

        const path = calculatePath(startPos, steps, direction);

        this.animateMove(player, path, direction, () => {
            const result = this.game.executeMove(player, direction);

            if (result.warped) {
                this.animateWarp(player, () => {
                    this.updateMarkerPositions();
                    this.finishOnlineMove(player, result, direction, preMoveOniPos, preMoveRunnerPos);
                });
            } else {
                this.updateMarkerPositions();
                this.finishOnlineMove(player, result, direction, preMoveOniPos, preMoveRunnerPos);
            }
        });
    }

    /**
     * オンライン移動完了
     */
    finishOnlineMove(player, result, direction, preMoveOniPos, preMoveRunnerPos) {
        this.isAnimating = false; // アニメーション完了

        const hand = player === 'oni' ? this.game.oniHand : this.game.runnerHand;
        const steps = GameConfig.MOVE_STEPS[hand];
        const winner = player === 'oni' ? 'oni' : 'runner';

        this.addLogEntry(this.game.turn, this.game.oniHand, this.game.runnerHand, winner, preMoveOniPos, preMoveRunnerPos, direction, steps);

        if (player === 'oni') {
            this.previousOniPos = preMoveOniPos;
        } else {
            this.previousRunnerPos = preMoveRunnerPos;
        }
        this.updatePreviousPositionMarkers();

        // 自分が移動した場合のみ勝利判定と同期を行う（相手側は turnEnded/gameFinished を待つ）
        if (player === this.myRole) {
            // 鬼の勝利判定（どちらが動いても触れたら鬼の勝ち）
            if (result.caught) {
                const reason = player === 'oni'
                    ? (result.overtake ? '逃げを追い越した！' : '逃げを捕まえた！')
                    : '逃げが鬼に突っ込んだ！';
                this.game.setOniWin(reason);
                // 相手に通知
                if (this.multiplayer) {
                    this.multiplayer.gameOver(this.game.winner, this.game.winReason);
                }
                this.showResult();
                return;
            }

            // ターン終了
            this.game.endTurn();

            // 位置を同期
            if (this.multiplayer) {
                this.multiplayer.endTurn(this.game.turn, this.game.oniPos, this.game.runnerPos);
            }

            if (this.game.isGameOver()) {
                // 15ターン経過で逃げの勝ち
                if (this.multiplayer) {
                    this.multiplayer.gameOver(this.game.winner, this.game.winReason);
                }
                this.showResult();
            } else {
                this.updateTurnDisplay();
                this.startOnlineJanken();
            }
        }
        // 相手が移動した場合
        else {
            // 保留中のgameFinishedがあれば適用（優先）
            if (this.pendingGameFinished) {
                const data = this.pendingGameFinished;
                this.pendingGameFinished = null;
                this.applyGameFinished(data);
            }
            // 保留中のturnEndedがあれば適用
            else if (this.pendingTurnEnded) {
                const data = this.pendingTurnEnded;
                this.pendingTurnEnded = null;
                this.applyTurnEnded(data);
            } else {
                // まだ受け取っていないので待機
                this.showPhase('waiting-opponent');
                document.getElementById('waiting-opponent-text').textContent = '同期中...';
            }
        }
    }

    /**
     * turnEndedデータを適用
     */
    applyTurnEnded(data) {
        if (!this.validOnlineState(data)) return;
        this.game.turn = data.turn;
        this.game.oniPos = data.oniPos;
        this.game.runnerPos = data.runnerPos;
        this.updateTurnDisplay();
        this.updateMarkerPositions();

        // 次のじゃんけんへ進む
        if (!this.game.isGameOver()) {
            this.startOnlineJanken();
        }
    }

    /**
     * gameFinishedデータを適用
     */
    applyGameFinished(data) {
        if (!data || !['oni', 'runner'].includes(data.winner) || typeof data.reason !== 'string'
            || data.reason.length > 160) return;
        this.game.winner = data.winner;
        this.game.winReason = data.reason;
        this.showResultScreen();
    }

    validOnlineState(data) {
        return data && Number.isInteger(data.turn) && data.turn >= 1 && data.turn <= GameConfig.MAX_TURNS + 1
            && [data.oniPos, data.runnerPos].every(p => Number.isInteger(p) && p >= 0 && p < GameConfig.BOARD_SIZE);
    }

    /**
     * 結果画面表示（オンライン用）
     */
    showResultScreen() {
        const winnerEl = document.getElementById('result-winner');
        const reasonEl = document.getElementById('result-reason');
        const turnsEl = document.getElementById('result-turns');
        const positionsEl = document.getElementById('result-positions');

        winnerEl.classList.remove('oni-winner', 'runner-winner');

        // 役割に応じたメッセージを表示
        if (this.game.winner === 'oni') {
            winnerEl.classList.add('oni-winner');
            if (this.myRole === 'oni') {
                winnerEl.textContent = '👹 捕まえた！';
                reasonEl.textContent = '勝ち！';
            } else {
                winnerEl.textContent = '😱 捕まった！';
                reasonEl.textContent = '負け...';
            }
        } else {
            winnerEl.classList.add('runner-winner');
            if (this.myRole === 'runner') {
                winnerEl.textContent = '🏃 逃げ切った！';
                reasonEl.textContent = '勝ち！';
            } else {
                winnerEl.textContent = '😢 捕まえられなかった！';
                reasonEl.textContent = '負け...';
            }
        }

        turnsEl.textContent = Math.min(this.game.turn, GameConfig.MAX_TURNS);
        positionsEl.textContent = `鬼:${this.game.oniPos} 逃げ:${this.game.runnerPos}`;

        // オンラインモードでは再戦セクションを表示
        this.updateResultButtons();

        // 戦績を記録
        this.recordGameResult();

        this.showScreen('result');
    }

    /**
     * 結果画面のボタン表示を更新
     */
    updateResultButtons() {
        const rematchSection = document.getElementById('rematch-section');
        const localRestartBtn = document.getElementById('local-restart-btn');
        const rematchBtn = document.getElementById('rematch-btn');
        const rematchStatus = document.getElementById('rematch-status');

        if (this.isOnlineMode) {
            // オンラインモード: 再戦セクションを表示、ローカル再開ボタンを非表示
            if (rematchSection) rematchSection.style.display = 'block';
            if (localRestartBtn) localRestartBtn.style.display = 'none';
            // 再戦ボタンをリセット
            if (rematchBtn) {
                rematchBtn.style.display = 'block';
                rematchBtn.disabled = false;
            }
            if (rematchStatus) rematchStatus.style.display = 'none';
            this.rematchRequested = false;
            this.opponentRematchRequested = false;
        } else {
            // ローカルモード: 再戦セクションを非表示、ローカル再開ボタンを表示
            if (rematchSection) rematchSection.style.display = 'none';
            if (localRestartBtn) localRestartBtn.style.display = 'block';
        }
    }

    /**
     * 再戦リクエスト
     */
    requestRematch() {
        if (!this.multiplayer || !this.isOnlineMode) return;

        this.rematchRequested = true;
        this.multiplayer.requestRematch();

        // ボタンを非表示にし、待機状態を表示
        const rematchBtn = document.getElementById('rematch-btn');
        const rematchStatus = document.getElementById('rematch-status');
        const rematchStatusText = document.getElementById('rematch-status-text');

        if (rematchBtn) rematchBtn.style.display = 'none';
        if (rematchStatus) rematchStatus.style.display = 'flex';

        // 相手も既にリクエスト済みならすぐに再戦開始
        if (this.opponentRematchRequested) {
            if (rematchStatusText) rematchStatusText.textContent = '再戦準備中...';
        } else {
            if (rematchStatusText) rematchStatusText.textContent = '相手の応答を待っています...';
        }
    }

    /**
     * 相手からの再戦リクエストを処理
     */
    handleOpponentRematchRequest() {
        this.opponentRematchRequested = true;

        const rematchStatusText = document.getElementById('rematch-status-text');

        if (this.rematchRequested) {
            // 両者がリクエスト済み、再戦準備
            if (rematchStatusText) rematchStatusText.textContent = '再戦準備中...';
        } else {
            // 相手が先にリクエスト、ボタンテキストを変更
            const rematchBtn = document.getElementById('rematch-btn');
            if (rematchBtn) {
                rematchBtn.textContent = '再戦する（相手が待機中）';
            }
        }
    }

    /**
     * 再戦開始
     */
    startRematch() {
        // ゲーム状態をリセット
        this.game.reset();
        this.rematchRequested = false;
        this.opponentRematchRequested = false;

        // マッチング画面へ戻る（鬼が開始ボタンを押す）
        this.showMatchedScreen();
    }

    // =====================================
    // 戦績管理機能
    // =====================================

    /**
     * 戦績を読み込み
     */
    loadStats() {
        const defaultStats = {
            oni: { wins: 0, losses: 0 },
            runner: { wins: 0, losses: 0 }
        };
        try {
            const saved = localStorage.getItem('jankenOnigokko_stats');
            return saved ? JSON.parse(saved) : defaultStats;
        } catch (e) {
            return defaultStats;
        }
    }

    /**
     * 戦績を保存
     */
    saveStats() {
        try {
            localStorage.setItem('jankenOnigokko_stats', JSON.stringify(this.stats));
        } catch (e) {
            console.error('Failed to save stats:', e);
        }
    }

    /**
     * 戦績を更新
     * @param {string} role - 'oni' or 'runner'
     * @param {boolean} won - 勝ったかどうか
     */
    updateStats(role, won) {
        if (won) {
            this.stats[role].wins++;
        } else {
            this.stats[role].losses++;
        }
        this.saveStats();
        this.updateStatsDisplay();
    }

    /**
     * 戦績表示を更新
     */
    updateStatsDisplay() {
        const oniEl = document.getElementById('stats-oni');
        const runnerEl = document.getElementById('stats-runner');

        if (oniEl) {
            oniEl.textContent = `${this.stats.oni.wins}勝 ${this.stats.oni.losses}敗`;
        }
        if (runnerEl) {
            runnerEl.textContent = `${this.stats.runner.wins}勝 ${this.stats.runner.losses}敗`;
        }
    }

    /**
     * ゲーム終了時に戦績を記録（オンラインモードとCPUモード）
     */
    recordGameResult() {
        // オンラインモードまたはCPUモードでのみ記録
        const playerRole = this.isOnlineMode ? this.myRole : (this.isCpuMode ? this.playerRole : null);
        if (!playerRole) return;

        const iWon = (this.game.winner === 'oni' && playerRole === 'oni') ||
                     (this.game.winner === 'runner' && playerRole === 'runner');

        this.updateStats(playerRole, iWon);
    }

    // =====================================
    // チュートリアル機能
    // =====================================

    /**
     * チュートリアルステップデータを取得
     */
    getTutorialSteps() {
        return [
            {
                title: '👋 ようこそ！',
                content: `
                    <p>「<span class="highlight">じゃんけんおにごっこ</span>」へようこそ！</p>
                    <p>このゲームは、円形のボードで<span class="oni-text">👹鬼</span>と<span class="runner-text">🏃逃げ</span>が追いかけっこをするゲームです。</p>
                    <div class="tutorial-demo">
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">👹</div>
                            <div class="demo-label">鬼</div>
                            <div class="demo-value">捕まえろ！</div>
                        </div>
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">🏃</div>
                            <div class="demo-label">逃げ</div>
                            <div class="demo-value">逃げろ！</div>
                        </div>
                    </div>
                `
            },
            {
                title: '🎯 勝利条件',
                content: `
                    <p><span class="oni-text">👹 鬼の勝ち</span></p>
                    <p>逃げと同じマスに止まるか、追い越したら勝ち！</p>
                    <br>
                    <p><span class="runner-text">🏃 逃げの勝ち</span></p>
                    <p><span class="highlight">15ターン</span>逃げ切れば勝ち！</p>
                    <div class="tutorial-demo">
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">⭕</div>
                            <div class="demo-label">16マス</div>
                            <div class="demo-value">円形ボード</div>
                        </div>
                    </div>
                `
            },
            {
                title: '✊✌️✋ じゃんけんで移動',
                content: `
                    <p>毎ターン、両者がじゃんけんをします。</p>
                    <p><span class="highlight">勝った方</span>だけが移動できます！</p>
                    <div class="tutorial-demo">
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">✊</div>
                            <div class="demo-label">グー</div>
                            <div class="demo-value">2マス</div>
                        </div>
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">✌️</div>
                            <div class="demo-label">チョキ</div>
                            <div class="demo-value">1マス</div>
                        </div>
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">✋</div>
                            <div class="demo-label">パー</div>
                            <div class="demo-value">4マス</div>
                        </div>
                    </div>
                    <p>あいこの場合は両者移動なし（ターン消費）</p>
                `
            },
            {
                title: '↻↺ 移動方向',
                content: `
                    <p>じゃんけんに勝ったら、移動方向を選べます。</p>
                    <div class="tutorial-demo">
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">↻</div>
                            <div class="demo-label">時計回り</div>
                            <div class="demo-value">番号が増える</div>
                        </div>
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">↺</div>
                            <div class="demo-label">反時計回り</div>
                            <div class="demo-value">番号が減る</div>
                        </div>
                    </div>
                    <p>戦略的に方向を選んで、相手を追い詰めよう！</p>
                `
            },
            {
                title: '🌀 ワープマス',
                content: `
                    <p>マス<span class="highlight">12</span>に止まると...</p>
                    <p>マス<span class="highlight">4</span>に即ワープします！</p>
                    <div class="tutorial-demo">
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">1️⃣2️⃣</div>
                            <div class="demo-label">マス12</div>
                            <div class="demo-value">ワープ元</div>
                        </div>
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">➡️</div>
                            <div class="demo-label"></div>
                            <div class="demo-value"></div>
                        </div>
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">4️⃣</div>
                            <div class="demo-label">マス4</div>
                            <div class="demo-value">ワープ先</div>
                        </div>
                    </div>
                    <p>ワープを使って逆転を狙おう！</p>
                `
            },
            {
                title: '🎮 さあ、始めよう！',
                content: `
                    <p>準備はOK！</p>
                    <p>オンライン対戦で友達と対戦するか、1台で対戦モードで練習しよう！</p>
                    <div class="tutorial-demo">
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">🌐</div>
                            <div class="demo-label">オンライン</div>
                            <div class="demo-value">友達と対戦</div>
                        </div>
                        <div class="tutorial-demo-item">
                            <div class="demo-icon">📱</div>
                            <div class="demo-label">1台で対戦</div>
                            <div class="demo-value">練習モード</div>
                        </div>
                    </div>
                    <p>グッドラック！ 🍀</p>
                `
            }
        ];
    }

    /**
     * チュートリアル開始
     */
    startTutorial() {
        this.tutorialStep = 0;
        this.showScreen('tutorial');
        this.updateTutorialDisplay();
    }

    /**
     * チュートリアル表示を更新
     */
    updateTutorialDisplay() {
        const step = this.tutorialSteps[this.tutorialStep];
        const body = document.getElementById('tutorial-body');
        const stepEl = document.getElementById('tutorial-step');
        const totalEl = document.getElementById('tutorial-total');
        const prevBtn = document.getElementById('tutorial-prev');
        const nextBtn = document.getElementById('tutorial-next');
        const finishBtn = document.getElementById('tutorial-finish');

        if (body) {
            body.innerHTML = `
                <div class="tutorial-step-title">${step.title}</div>
                <div class="tutorial-step-content">${step.content}</div>
            `;
        }

        if (stepEl) stepEl.textContent = this.tutorialStep + 1;
        if (totalEl) totalEl.textContent = this.tutorialSteps.length;

        // ボタン表示制御
        if (prevBtn) {
            prevBtn.style.display = this.tutorialStep === 0 ? 'none' : 'block';
        }

        const isLastStep = this.tutorialStep === this.tutorialSteps.length - 1;
        if (nextBtn) nextBtn.style.display = isLastStep ? 'none' : 'block';
        if (finishBtn) finishBtn.style.display = isLastStep ? 'block' : 'none';
    }

    /**
     * チュートリアル次へ
     */
    tutorialNext() {
        if (this.tutorialStep < this.tutorialSteps.length - 1) {
            this.tutorialStep++;
            this.updateTutorialDisplay();
        }
    }

    /**
     * チュートリアル前へ
     */
    tutorialPrev() {
        if (this.tutorialStep > 0) {
            this.tutorialStep--;
            this.updateTutorialDisplay();
        }
    }

    /**
     * チュートリアル完了
     */
    tutorialFinish() {
        this.showScreen('top');
    }

    /**
     * チュートリアルスキップ
     */
    tutorialSkip() {
        this.showScreen('top');
    }

    // =====================================
    // 再接続機能
    // =====================================

    /**
     * 接続状態を監視してUI更新
     */
    updateConnectionStatus() {
        const connStatus = document.getElementById('connection-status');
        if (!connStatus) return;

        if (this.isOnlineMode && this.multiplayer && this.multiplayer.isConnected) {
            connStatus.textContent = 'オンライン';
            connStatus.classList.add('online');
            connStatus.classList.remove('reconnecting');
        } else if (this.isOnlineMode) {
            connStatus.textContent = '再接続中...';
            connStatus.classList.remove('online');
            connStatus.classList.add('reconnecting');
        }
    }

    /**
     * 自動再接続を試行
     */
    async attemptReconnect() {
        if (!this.isOnlineMode || !this.multiplayer) return;

        try {
            await this.multiplayer.connect();
            this.updateConnectionStatus();
        } catch (error) {
            console.error('Reconnection failed:', error);
            // 3秒後に再試行
            setTimeout(() => this.attemptReconnect(), 3000);
        }
    }
}

// アプリケーションインスタンス
const app = new App();
