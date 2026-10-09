const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('network-derived log values stay text and invalid state does not enter the game', () => {
    const dom = new JSDOM('<table><tbody id="log-content"></tbody></table>', { runScripts: 'outside-only' });
    const read = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
    dom.window.eval(read('game.js') + '\n' + read('app.js').replace('const app = new App();', 'window.testApp = Object.create(App.prototype);'));
    const app = dom.window.testApp, payload = '<b data-test="injection">not HTML</b>';
    app.addLogEntry(payload, 'rock', 'paper', 'oni', payload, payload, 'cw', payload);
    const log = dom.window.document.getElementById('log-content');
    assert.equal(log.querySelector('b'), null);
    assert.equal(log.querySelectorAll('td').length, 6);
    assert(log.textContent.includes(payload));
    app.game = { turn: 1, oniPos: 0, runnerPos: 8 };
    app.applyTurnEnded({ turn: payload, oniPos: 0, runnerPos: 8 });
    assert.equal(app.game.turn, 1);
    assert.equal(app.validOnlineState({ turn: 2, oniPos: -1, runnerPos: 8 }), false);
    assert.equal(app.validOnlineState({ turn: 2, oniPos: 2, runnerPos: 8 }), true);
    dom.window.close();
});
