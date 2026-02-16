// Roguelike — Rendering
(function() {
  'use strict';
  var FA = window.FA;

  function setupLayers() {
    var cfg = FA.lookup('config', 'game');
    var colors = FA.lookup('config', 'colors');
    var ts = cfg.tileSize;
    var W = cfg.canvasWidth;
    var H = cfg.canvasHeight;
    var uiY = cfg.rows * ts;

    // Wall colors
    var WALL_TOP = '#151030';
    var WALL_FACE = '#2a2255';
    var WALL_SIDE = '#1f1845';
    var WALL_INNER = '#120e24';
    var FLOOR_BASE = '#201c3a';
    var FLOOR_ACCENT = '#262042';

    function isOpen(map, x, y) {
      if (x < 0 || x >= cfg.cols || y < 0 || y >= cfg.rows) return false;
      return map[y][x] !== 1;
    }

    // === START SCREEN ===
    FA.addLayer('startScreen', function() {
      var state = FA.getState();
      if (state.screen !== 'start') return;

      FA.draw.clear(colors.bg);

      FA.draw.text('RAT DUNGEON', W / 2, H / 2 - 80, { color: colors.player, size: 36, bold: true, align: 'center', baseline: 'middle' });
      FA.draw.text('r   r   r   r   r', W / 2, H / 2 - 30, { color: colors.enemy, size: 20, align: 'center', baseline: 'middle' });
      FA.draw.text('Enter the dungeon. Defeat the rats. Collect gold.', W / 2, H / 2 + 20, { color: colors.narrative, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('5 floors of increasing danger await.', W / 2, H / 2 + 42, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });
      FA.draw.text('WASD / Arrows — move and attack', W / 2, H / 2 + 70, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });
      FA.draw.text('Walk onto stairs to change floors', W / 2, H / 2 + 90, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });
      FA.draw.text('[ SPACE ]  to begin', W / 2, H / 2 + 130, { color: '#fff', size: 18, bold: true, align: 'center', baseline: 'middle' });
    }, 0);

    // === MAP WITH WALL AUTOTILING ===
    FA.addLayer('map', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'death') return;
      if (!state.map) return;
      var ctx = FA.getCtx();
      var map = state.map;

      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) {
          var tile = map[y][x];
          var px = x * ts, py = y * ts;

          if (tile === 0) {
            // Floor tile with subtle checker pattern
            ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_BASE : FLOOR_ACCENT;
            ctx.fillRect(px, py, ts, ts);
          } else if (tile === 2) {
            // Stairs down
            ctx.fillStyle = colors.stairsDown;
            ctx.fillRect(px, py, ts, ts);
            FA.draw.text('>', px + ts / 2, py + ts / 2, { color: '#fff', size: 14, bold: true, align: 'center', baseline: 'middle' });
          } else if (tile === 3) {
            // Stairs up
            ctx.fillStyle = colors.stairsUp;
            ctx.fillRect(px, py, ts, ts);
            FA.draw.text('<', px + ts / 2, py + ts / 2, { color: '#fff', size: 14, bold: true, align: 'center', baseline: 'middle' });
          } else {
            // Wall — autotile based on neighbors
            var openS = isOpen(map, x, y + 1);
            var openN = isOpen(map, x, y - 1);
            var openE = isOpen(map, x + 1, y);
            var openW = isOpen(map, x - 1, y);

            if (openS) {
              // Front-facing wall (floor below) — 2-part: dark cap + lighter face
              ctx.fillStyle = WALL_TOP;
              ctx.fillRect(px, py, ts, Math.floor(ts * 0.4));
              ctx.fillStyle = WALL_FACE;
              ctx.fillRect(px, py + Math.floor(ts * 0.4), ts, ts - Math.floor(ts * 0.4));
              // Bottom edge highlight
              ctx.fillStyle = '#3a3070';
              ctx.fillRect(px, py + ts - 1, ts, 1);
            } else if (openN) {
              // Back wall (floor above) — single accent at top
              ctx.fillStyle = WALL_INNER;
              ctx.fillRect(px, py, ts, ts);
              ctx.fillStyle = WALL_SIDE;
              ctx.fillRect(px, py, ts, 2);
            } else if (openE || openW) {
              // Side wall — vertical accent
              ctx.fillStyle = WALL_INNER;
              ctx.fillRect(px, py, ts, ts);
              if (openE) {
                ctx.fillStyle = WALL_SIDE;
                ctx.fillRect(px + ts - 2, py, 2, ts);
              }
              if (openW) {
                ctx.fillStyle = WALL_SIDE;
                ctx.fillRect(px, py, 2, ts);
              }
            } else {
              // Interior wall — fully dark
              ctx.fillStyle = WALL_INNER;
              ctx.fillRect(px, py, ts, ts);
            }
          }
        }
      }
    }, 1);

    // === ENTITIES ===
    FA.addLayer('entities', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'death') return;
      if (!state.player) return;

      for (var i = 0; i < state.items.length; i++) {
        var item = state.items[i];
        FA.draw.sprite('items', item.type, item.x * ts, item.y * ts, ts, item.char, item.color, 0);
      }

      for (var e = 0; e < state.enemies.length; e++) {
        var en = state.enemies[e];
        FA.draw.sprite('enemies', 'rat', en.x * ts, en.y * ts, ts, en.char, en.color, 0);
        var hpRatio = en.hp / en.maxHp;
        if (hpRatio < 1) {
          FA.draw.bar(en.x * ts + 2, en.y * ts - 3, ts - 4, 2, hpRatio, '#f44', '#400');
        }
      }

      var p = state.player;
      FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', colors.player, 0);
    }, 10);

    // === SHADOWCAST LIGHTING + EXPLORED MEMORY ===
    function computeFOV(map, px, py, radius) {
      var vis = [];
      for (var y = 0; y < cfg.rows; y++) {
        vis[y] = [];
        for (var x = 0; x < cfg.cols; x++) vis[y][x] = 0;
      }
      vis[py][px] = 1;
      var rays = 720;
      for (var a = 0; a < rays; a++) {
        var angle = (a / rays) * Math.PI * 2;
        var dx = Math.cos(angle) * 0.5;
        var dy = Math.sin(angle) * 0.5;
        var rx = px + 0.5, ry = py + 0.5;
        for (var d = 0; d < radius * 2; d++) {
          rx += dx; ry += dy;
          var tx = Math.floor(rx), ty = Math.floor(ry);
          if (tx < 0 || tx >= cfg.cols || ty < 0 || ty >= cfg.rows) break;
          var dist = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
          if (dist > radius) break;
          var light = 1 - (dist / radius);
          light = light * light;
          if (light > vis[ty][tx]) vis[ty][tx] = light;
          if (map[ty][tx] === 1) break;
        }
      }
      return vis;
    }

    FA.addLayer('lighting', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      if (!state.player) return;

      var ctx = FA.getCtx();
      var p = state.player;
      var lightRadius = 9 - (state.depth || 1) * 0.5;
      var vis = computeFOV(state.map, p.x, p.y, lightRadius);
      var explored = state.explored;

      // Mark visible tiles as explored
      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) {
          if (vis[y][x] > 0.05) explored[y][x] = true;
        }
      }

      ctx.save();
      ctx.fillStyle = '#000';
      for (var y2 = 0; y2 < cfg.rows; y2++) {
        for (var x2 = 0; x2 < cfg.cols; x2++) {
          if (vis[y2][x2] > 0.03) {
            // Currently visible — shadow based on light level
            var dark = 1 - vis[y2][x2];
            ctx.globalAlpha = Math.min(dark, 0.92);
          } else if (explored[y2][x2]) {
            // Explored but not visible — dim memory
            ctx.globalAlpha = 0.75;
          } else {
            // Never seen — full darkness
            ctx.globalAlpha = 0.97;
          }
          ctx.fillRect(x2 * ts, y2 * ts, ts, ts);
        }
      }
      ctx.restore();
    }, 15);

    // === FLOATING MESSAGES ===
    FA.addLayer('floats', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'death') return;
      FA.drawFloats();
    }, 20);

    // === NARRATIVE BAR ===
    FA.addLayer('narrative', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      var nm = state.narrativeMessage;
      if (!nm || nm.life <= 0) return;

      var alpha = nm.life < 1000 ? nm.life / 1000 : 1;
      FA.draw.withAlpha(alpha * 0.85, function() {
        FA.draw.rect(0, 0, W, 28, '#1a1030');
      });
      FA.draw.withAlpha(alpha, function() {
        FA.draw.text(nm.text, W / 2, 14, { color: nm.color, size: 13, align: 'center', baseline: 'middle' });
      });
    }, 25);

    // === UI PANEL ===
    FA.addLayer('ui', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'death') return;
      if (!state.player) return;
      var p = state.player;

      FA.draw.rect(0, uiY, W, H - uiY, '#111');

      FA.draw.text('HP', 8, uiY + 8, { color: colors.text, size: 12 });
      FA.draw.bar(30, uiY + 8, 100, 12, p.hp / p.maxHp, '#4f4', '#400');
      FA.draw.text(p.hp + '/' + p.maxHp, 135, uiY + 8, { color: colors.text, size: 12 });
      FA.draw.text('ATK:' + p.atk + '  DEF:' + p.def, 200, uiY + 8, { color: colors.dim, size: 12 });

      var depthText = 'Depth:' + (state.depth || 1) + '/' + cfg.maxDepth;
      FA.draw.text(depthText, 340, uiY + 8, { color: colors.stairsDown, size: 12, bold: true });

      FA.draw.text('Gold:' + p.gold + '  Kills:' + p.kills + '  Turn:' + state.turn, 8, uiY + 26, { color: colors.dim, size: 12 });

      var msgs = state.messages;
      for (var i = 0; i < msgs.length; i++) {
        FA.draw.text(msgs[i], 8, uiY + 44 + i * 14, { color: colors.dim, size: 11 });
      }
    }, 30);

    // === GAME OVER SCREEN ===
    FA.addLayer('gameOver', function() {
      var state = FA.getState();
      if (state.screen !== 'victory' && state.screen !== 'death') return;

      var isVictory = state.screen === 'victory';

      FA.draw.withAlpha(0.75, function() {
        FA.draw.rect(0, 0, W, uiY, '#000');
      });

      var title = isVictory ? 'VICTORY!' : 'DEATH!';
      var titleColor = isVictory ? '#4f4' : '#f44';
      FA.draw.text(title, W / 2, uiY / 2 - 70, { color: titleColor, size: 32, bold: true, align: 'center', baseline: 'middle' });

      var narText = FA.lookup('narrativeText', state.screen);
      if (narText) {
        FA.draw.text(narText.text, W / 2, uiY / 2 - 30, { color: narText.color, size: 14, align: 'center', baseline: 'middle' });
      }

      var p = state.player;
      FA.draw.text('Rats defeated: ' + p.kills, W / 2, uiY / 2 + 10, { color: colors.text, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Gold collected: ' + p.gold, W / 2, uiY / 2 + 30, { color: colors.gold, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Deepest floor: ' + (state.maxDepthReached || 1) + '/' + cfg.maxDepth, W / 2, uiY / 2 + 50, { color: colors.stairsDown, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Turns: ' + state.turn, W / 2, uiY / 2 + 70, { color: colors.dim, size: 14, align: 'center', baseline: 'middle' });

      FA.draw.text('SCORE: ' + (state.score || 0), W / 2, uiY / 2 + 105, { color: '#fff', size: 22, bold: true, align: 'center', baseline: 'middle' });

      FA.draw.text('[ R ]  Play again', W / 2, uiY / 2 + 145, { color: colors.dim, size: 16, align: 'center', baseline: 'middle' });
    }, 40);
  }

  window.Render = { setup: setupLayers };
})();
