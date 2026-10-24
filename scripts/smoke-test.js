'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(new URL('../index.html', 'file://' + __filename), 'utf8');

const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(source => source.trim());
assert.ok(inlineScripts.length > 0, 'Expected inline application scripts');
inlineScripts.forEach((source, index) => {
  assert.doesNotThrow(() => new vm.Script(source), `Inline script ${index + 1} must parse`);
});

assert.ok(html.includes('<title>Viral Cage Play'), 'Homepage title must exist');
assert.ok(html.includes('<meta name="description"'), 'Meta description must exist');
assert.ok(html.includes('<link rel="canonical" href="https://play.viralcage.com/">'), 'Canonical URL must point to the production homepage');
const routeLine = html.split(String.fromCharCode(10)).find(line => line.includes('var slug=location.pathname'));
assert.ok(routeLine && routeLine.includes('replace(') && routeLine.includes('|') && routeLine.includes('$'), 'Clean route parser must strip leading and trailing slashes');

for (const slug of ['baghchal', 'tictactoe', 'dotsandboxes', 'dotsboxes', 'fourconnect', 'chess']) {
  assert.ok(html.includes(slug + ':{value:'), `Expected clean route for /${slug}`);
}
assert.ok(html.includes('Date.now() - startedAt < 10000'), 'Random Match should wait 10 seconds');
assert.ok(html.includes('Starting a game against the strongest AI'), 'Random Match should fall back to AI');
for (const mode of ['ai-tiger-hardest', 'ai-goat-hardest', 'ai-tictactoe', 'ai-dotsboxes', 'ai-fourconnect', 'ai-chess']) {
  assert.ok(html.includes(`value="${mode}"`), `AI fallback mode ${mode} must exist in the selector`);
}
assert.ok(html.includes('Perfect-play Tic-Tac-Toe'), 'Tic-Tac-Toe AI must retain perfect-play minimax');

// Online multiplayer regression checks: every game must have a Firebase state listener,
// and the room listener's lazy initialization references must be declared in its scope.
for (const [name, path] of [
  ['tttRef', 'tictactoe'],
  ['dotsRef', 'dotsboxes'],
  ['fourRef', 'fourconnect'],
  ['chessRef', 'chess'],
  ['bombRef', 'chipbomb']
]) {
  assert.ok(html.includes(`const ${name} = onlineRoomRef.child('miniGames/${path}')`), `Expected declared Firebase reference for ${path}`);
}
assert.ok(html.includes("child('game').on('value'"), 'Expected live Firebase listener for BaghChal');
assert.ok(html.includes("['baghchal','tictactoe','dotsboxes','fourconnect','chess','checkers'].includes(type)"), 'All six supported online games must be selectable');
for (const game of ['tictactoe', 'dotsboxes', 'fourconnect', 'chess', 'checkers']) {
  assert.ok(html.includes(`child('miniGames/${game}').on('value'`) || html.includes(`child('miniGames/${game}').on(`), `Expected live Firebase listener for ${game}`);
}
assert.ok(html.includes("checkers: 'ai-checkers'"), 'Checkers Random Match must have a valid AI fallback');
assert.ok(html.includes("function checkersClick(i){if(state.mode==='online'&&(!onlineRoomRef||!onlineRole||!firebaseReady||onlineAiOpponent))"), 'Checkers must reject moves without a valid online room');

console.log(`PASS: ${inlineScripts.length} inline scripts parse; SEO, clean routes, matchmaking, AI fallbacks and online game sync paths verified.`);
