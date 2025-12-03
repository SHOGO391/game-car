/**
 * 円環型じゃんけん鬼ごっこ - ゲームロジック
 * UIと分離したモジュールとして実装
 */

const GameConfig = {
    BOARD_SIZE: 16,          // マス数
    MAX_TURNS: 15,           // 最大ターン数
    WARP_FROM: 12,           // ワープ元マス
    WARP_TO: 4,              // ワープ先マス
    INITIAL_ONI_POS: 0,      // 鬼の初期位置
    INITIAL_RUNNER_POS: 8,   // 逃げの初期位置

    // 各手の移動マス数
    MOVE_STEPS: {
        rock: 2,      // グー
        scissors: 1,  // チョキ
        paper: 4      // パー
    }
};

/**
 * じゃんけんの勝敗判定
 * @param {string} hand1 - プレイヤー1の手
 * @param {string} hand2 - プレイヤー2の手
 * @returns {number} 1: hand1の勝ち, -1: hand2の勝ち, 0: あいこ
 */
function judgeJanken(hand1, hand2) {
    if (hand1 === hand2) return 0;

    const wins = {
        rock: 'scissors',     // グーはチョキに勝つ
        scissors: 'paper',    // チョキはパーに勝つ
        paper: 'rock'         // パーはグーに勝つ
    };

    return wins[hand1] === hand2 ? 1 : -1;
}

/**
 * 手を日本語に変換
 * @param {string} hand - 手（rock/scissors/paper）
 * @returns {string} 日本語の手名
 */
function handToJapanese(hand) {
    const names = {
        rock: 'グー',
        scissors: 'チョキ',
        paper: 'パー'
    };
    return names[hand] || hand;
}

/**
 * 手を絵文字に変換
 * @param {string} hand - 手（rock/scissors/paper）
 * @returns {string} 絵文字
 */
function handToEmoji(hand) {
    const emojis = {
        rock: '✊',
        scissors: '✌️',
        paper: '✋'
    };
    return emojis[hand] || '';
}

/**
 * 移動経路を計算
 * @param {number} startPos - 開始位置
 * @param {number} steps - 移動マス数
 * @param {string} direction - 'cw'（時計回り）or 'ccw'（反時計回り）
 * @returns {number[]} 経路（開始位置から終了位置まで）
 */
function calculatePath(startPos, steps, direction) {
    const path = [startPos];
    let currentPos = startPos;

    for (let i = 0; i < steps; i++) {
        if (direction === 'cw') {
            currentPos = (currentPos + 1) % GameConfig.BOARD_SIZE;
        } else {
            currentPos = (currentPos - 1 + GameConfig.BOARD_SIZE) % GameConfig.BOARD_SIZE;
        }
        path.push(currentPos);
    }

    return path;
}

/**
 * 追い越し判定
 * @param {number[]} path - 移動経路
 * @param {number} runnerPos - 逃げの位置
 * @returns {boolean} 追い越しがあればtrue
 */
function checkOvertake(path, runnerPos) {
    // 経路の途中（開始位置を除く）に逃げがいれば追い越し
    for (let i = 1; i < path.length; i++) {
        if (path[i] === runnerPos) {
            return true;
        }
    }
    return false;
}

/**
 * ワープ処理
 * @param {number} position - 現在位置
 * @returns {{newPos: number, warped: boolean}} ワープ後の位置とワープしたかどうか
 */
function processWarp(position) {
    if (position === GameConfig.WARP_FROM) {
        return { newPos: GameConfig.WARP_TO, warped: true };
    }
    return { newPos: position, warped: false };
}

/**
 * ゲーム状態クラス
 */
class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        this.turn = 1;
        this.oniPos = GameConfig.INITIAL_ONI_POS;
        this.runnerPos = GameConfig.INITIAL_RUNNER_POS;
        this.oniHand = null;
        this.runnerHand = null;
        this.winner = null;  // 'oni' or 'runner' or null
        this.winReason = null;
        this.gameLog = [];
        this.phase = 'janken_oni';  // フェーズ管理
    }

    /**
     * じゃんけんの手をセット
     * @param {string} player - 'oni' or 'runner'
     * @param {string} hand - 手
     */
    setHand(player, hand) {
        if (player === 'oni') {
            this.oniHand = hand;
        } else {
            this.runnerHand = hand;
        }
    }

    /**
     * じゃんけんの結果を判定
     * @returns {{result: number, winner: string|null}} result: 1=鬼勝ち, -1=逃げ勝ち, 0=あいこ
     */
    judgeRound() {
        const result = judgeJanken(this.oniHand, this.runnerHand);
        let winner = null;

        if (result === 1) {
            winner = 'oni';
        } else if (result === -1) {
            winner = 'runner';
        }

        return { result, winner };
    }

    /**
     * 移動を実行
     * @param {string} player - 'oni' or 'runner'
     * @param {string} direction - 'cw' or 'ccw'
     * @returns {{path: number[], finalPos: number, warped: boolean, caught: boolean, overtake: boolean}}
     */
    executeMove(player, direction) {
        const hand = player === 'oni' ? this.oniHand : this.runnerHand;
        const steps = GameConfig.MOVE_STEPS[hand];
        const startPos = player === 'oni' ? this.oniPos : this.runnerPos;
        const opponentPos = player === 'oni' ? this.runnerPos : this.oniPos;

        // 経路計算
        const path = calculatePath(startPos, steps, direction);
        let finalPos = path[path.length - 1];

        // 追い越し判定（経路上で相手に触れたか）
        let overtake = false;
        overtake = checkOvertake(path, opponentPos);

        // ワープ処理
        const warpResult = processWarp(finalPos);
        finalPos = warpResult.newPos;

        // 位置更新
        if (player === 'oni') {
            this.oniPos = finalPos;
        } else {
            this.runnerPos = finalPos;
        }

        // 捕まった判定（どちらが動いても同じマスに触れたら鬼の勝ち）
        let caught = false;
        // 同一マス判定
        if (this.oniPos === this.runnerPos) {
            caught = true;
        }
        // ワープ後に相手と同じマスになった場合
        if (warpResult.warped && warpResult.newPos === opponentPos) {
            caught = true;
        }

        return {
            path,
            finalPos,
            warped: warpResult.warped,
            caught: caught || overtake,  // 同じマスに触れた時点で勝利（通過も含む）
            overtake
        };
    }

    /**
     * 鬼の勝利をチェック
     * @returns {boolean}
     */
    checkOniWin() {
        return this.oniPos === this.runnerPos;
    }

    /**
     * ターン終了処理
     */
    endTurn() {
        // ログ追加
        const logEntry = {
            turn: this.turn,
            oniHand: this.oniHand,
            runnerHand: this.runnerHand,
            oniPos: this.oniPos,
            runnerPos: this.runnerPos
        };
        this.gameLog.push(logEntry);

        // 手をリセット
        this.oniHand = null;
        this.runnerHand = null;

        // ターン進行
        this.turn++;

        // 15ターン終了判定
        if (this.turn > GameConfig.MAX_TURNS && !this.winner) {
            this.winner = 'runner';
            this.winReason = '15ターン逃げ切った！';
        }
    }

    /**
     * ゲーム終了（鬼の勝利）
     * @param {string} reason - 勝利理由
     */
    setOniWin(reason) {
        this.winner = 'oni';
        this.winReason = reason;
    }

    /**
     * ゲームが終了しているか
     * @returns {boolean}
     */
    isGameOver() {
        return this.winner !== null;
    }
}

// グローバルにエクスポート
window.GameConfig = GameConfig;
window.GameState = GameState;
window.judgeJanken = judgeJanken;
window.handToJapanese = handToJapanese;
window.handToEmoji = handToEmoji;
window.calculatePath = calculatePath;
window.checkOvertake = checkOvertake;
window.processWarp = processWarp;
