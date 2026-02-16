// Deep Protocol — Rendering
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

    // Sci-fi wall palette
    var WALL_CAP = '#181d30';
    var WALL_FACE = '#252b42';
    var WALL_PANEL = '#2e3550';
    var WALL_SIDE = '#1f2538';
    var WALL_INNER = '#10141f';
    var WALL_LINE = '#333c55';
    var FLOOR_A = '#161a28';
    var FLOOR_B = '#181c2a';
    var FLOOR_DOT = '#1e2335';

    function isOpen(map, x, y) {
      if (x < 0 || x >= cfg.cols || y < 0 || y >= cfg.rows) return false;
      return map[y][x] !== 1;
    }

    // === START SCREEN ===
    FA.addLayer('startScreen', function() {
      var state = FA.getState();
      if (state.screen !== 'start') return;

      FA.draw.clear(colors.bg);

      FA.draw.text('DEEP PROTOCOL', W / 2, H / 2 - 80, { color: colors.player, size: 36, bold: true, align: 'center', baseline: 'middle' });
      FA.draw.text('d   d   d   d   d', W / 2, H / 2 - 30, { color: colors.enemy, size: 20, align: 'center', baseline: 'middle' });
      FA.draw.text('Infiltrate the facility. Neutralize drones. Extract data.', W / 2, H / 2 + 20, { color: colors.narrative, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('5 sub-levels of increasing security.', W / 2, H / 2 + 42, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });
      FA.draw.text('WASD / Arrows — move and attack', W / 2, H / 2 + 70, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });
      FA.draw.text('Walk onto access points to change levels', W / 2, H / 2 + 90, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });
      FA.draw.text('[ SPACE ]  to initiate', W / 2, H / 2 + 130, { color: '#fff', size: 18, bold: true, align: 'center', baseline: 'middle' });
    }, 0);

    // === MAP WITH WALL AUTOTILING ===
    FA.addLayer('map', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'extraction' && state.screen !== 'shutdown') return;
      if (!state.map) return;
      var ctx = FA.getCtx();
      var map = state.map;

      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) {
          var tile = map[y][x];
          var px = x * ts, py = y * ts;

          if (tile === 0) {
            // Floor — subtle grid
            ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B;
            ctx.fillRect(px, py, ts, ts);
            // Grid dot at center
            if ((x + y) % 3 === 0) {
              ctx.fillStyle = FLOOR_DOT;
              ctx.fillRect(px + ts / 2, py + ts / 2, 1, 1);
            }
          } else if (tile === 2) {
            // Access down
            ctx.fillStyle = '#1a1000';
            ctx.fillRect(px, py, ts, ts);
            ctx.fillStyle = colors.stairsDown;
            ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            FA.draw.text('v', px + ts / 2, py + ts / 2, { color: '#fff', size: 12, bold: true, align: 'center', baseline: 'middle' });
          } else if (tile === 3) {
            // Access up
            ctx.fillStyle = '#001a1a';
            ctx.fillRect(px, py, ts, ts);
            ctx.fillStyle = colors.stairsUp;
            ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            FA.draw.text('^', px + ts / 2, py + ts / 2, { color: '#fff', size: 12, bold: true, align: 'center', baseline: 'middle' });
          } else {
            // Wall autotiling
            var openS = isOpen(map, x, y + 1);
            var openN = isOpen(map, x, y - 1);
            var openE = isOpen(map, x + 1, y);
            var openW = isOpen(map, x - 1, y);

            // Base fill
            if (openS) {
              // Front wall — 2-part: cap + panel face
              var capH = Math.floor(ts * 0.35);
              ctx.fillStyle = WALL_CAP;
              ctx.fillRect(px, py, ts, capH);
              ctx.fillStyle = WALL_FACE;
              ctx.fillRect(px, py + capH, ts, ts - capH);
              ctx.fillStyle = WALL_LINE;
              ctx.fillRect(px, py + capH, ts, 1);
              ctx.fillStyle = WALL_PANEL;
              ctx.fillRect(px, py + ts - 1, ts, 1);
              if (x % 3 === 0) {
                ctx.fillStyle = WALL_SIDE;
                ctx.fillRect(px + ts / 2, py + capH + 2, 1, ts - capH - 3);
              }
            } else if (openN) {
              // Back wall — accent at top
              ctx.fillStyle = WALL_INNER;
              ctx.fillRect(px, py, ts, ts);
              ctx.fillStyle = WALL_SIDE;
              ctx.fillRect(px, py, ts, 2);
              if (x % 4 === 0) {
                ctx.fillStyle = WALL_LINE;
                ctx.fillRect(px + ts / 2, py + 3, 1, ts - 4);
              }
            } else {
              // Interior wall
              ctx.fillStyle = WALL_INNER;
              ctx.fillRect(px, py, ts, ts);
            }

            // Side accents — always on top regardless of N/S style
            if (openE) {
              ctx.fillStyle = WALL_SIDE;
              ctx.fillRect(px + ts - 2, py, 2, ts);
            }
            if (openW) {
              ctx.fillStyle = WALL_SIDE;
              ctx.fillRect(px, py, 2, ts);
            }
            // Horizontal seam on pure side walls
            if (!openS && !openN && (openE || openW) && y % 3 === 0) {
              ctx.fillStyle = WALL_LINE;
              ctx.fillRect(px + 2, py + ts / 2, ts - 4, 1);
            }
          }
        }
      }
    }, 1);

    // === ENTITIES WITH GLOW ===
    FA.addLayer('entities', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'extraction' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var ctx = FA.getCtx();

      // Items with subtle glow
      for (var i = 0; i < state.items.length; i++) {
        var item = state.items[i];
        var icx = item.x * ts + ts / 2, icy = item.y * ts + ts / 2;
        ctx.save();
        ctx.globalAlpha = 0.15;
        var ig = ctx.createRadialGradient(icx, icy, 0, icx, icy, ts);
        ig.addColorStop(0, item.color);
        ig.addColorStop(1, 'transparent');
        ctx.fillStyle = ig;
        ctx.fillRect(item.x * ts - ts / 2, item.y * ts - ts / 2, ts * 2, ts * 2);
        ctx.restore();
        FA.draw.sprite('items', item.type, item.x * ts, item.y * ts, ts, item.char, item.color, 0);
      }

      // Drones with amber glow
      for (var e = 0; e < state.enemies.length; e++) {
        var en = state.enemies[e];
        var ecx = en.x * ts + ts / 2, ecy = en.y * ts + ts / 2;
        ctx.save();
        ctx.globalAlpha = 0.25;
        var eg = ctx.createRadialGradient(ecx, ecy, 2, ecx, ecy, ts * 1.2);
        eg.addColorStop(0, en.color);
        eg.addColorStop(1, 'transparent');
        ctx.fillStyle = eg;
        ctx.fillRect(en.x * ts - ts / 2, en.y * ts - ts / 2, ts * 2, ts * 2);
        ctx.restore();
        FA.draw.sprite('enemies', 'drone', en.x * ts, en.y * ts, ts, en.char, en.color, 0);
        var hpRatio = en.hp / en.maxHp;
        if (hpRatio < 1) {
          FA.draw.bar(en.x * ts + 2, en.y * ts - 3, ts - 4, 2, hpRatio, '#f44', '#400');
        }
      }

      // Player with cyan glow
      var p = state.player;
      var pcx = p.x * ts + ts / 2, pcy = p.y * ts + ts / 2;
      ctx.save();
      ctx.globalAlpha = 0.2;
      var pg = ctx.createRadialGradient(pcx, pcy, 2, pcx, pcy, ts * 1.3);
      pg.addColorStop(0, colors.player);
      pg.addColorStop(1, 'transparent');
      ctx.fillStyle = pg;
      ctx.fillRect(p.x * ts - ts / 2, p.y * ts - ts / 2, ts * 2, ts * 2);
      ctx.restore();
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
          // Bright center (dist < 2), then linear falloff
          var light = dist < 2 ? 1 : Math.max(0, 1 - (dist - 2) / (radius - 2));
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
      var lightRadius = 10 - (state.depth || 1) * 0.5;
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
          if (vis[y2][x2] > 0.97) {
            // Fully lit — no overlay
            continue;
          } else if (vis[y2][x2] > 0.03) {
            // Visible with shadow falloff
            ctx.globalAlpha = Math.min(1 - vis[y2][x2], 0.88);
          } else if (explored[y2][x2]) {
            // Explored memory — dim blue tint
            ctx.globalAlpha = 0.72;
          } else {
            // Never seen
            ctx.globalAlpha = 0.96;
          }
          ctx.fillRect(x2 * ts, y2 * ts, ts, ts);
        }
      }
      ctx.restore();
    }, 15);

    // === FLOATING MESSAGES ===
    FA.addLayer('floats', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'extraction' && state.screen !== 'shutdown') return;
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
        FA.draw.rect(0, 0, W, 28, '#0a0f1a');
      });
      FA.draw.withAlpha(alpha, function() {
        FA.draw.text(nm.text, W / 2, 14, { color: nm.color, size: 13, align: 'center', baseline: 'middle' });
      });
    }, 25);

    // === UI PANEL ===
    FA.addLayer('ui', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'extraction' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var p = state.player;

      FA.draw.rect(0, uiY, W, H - uiY, '#0c1018');

      FA.draw.text('HULL', 8, uiY + 8, { color: colors.text, size: 12 });
      FA.draw.bar(40, uiY + 8, 100, 12, p.hp / p.maxHp, '#4f4', '#1a0a0a');
      FA.draw.text(p.hp + '/' + p.maxHp, 145, uiY + 8, { color: colors.text, size: 12 });
      FA.draw.text('ATK:' + p.atk + '  DEF:' + p.def, 210, uiY + 8, { color: colors.dim, size: 12 });

      var depthText = 'LVL:' + (state.depth || 1) + '/' + cfg.maxDepth;
      FA.draw.text(depthText, 340, uiY + 8, { color: colors.stairsDown, size: 12, bold: true });

      FA.draw.text('Data:' + p.gold + '  Kills:' + p.kills + '  Turn:' + state.turn, 8, uiY + 26, { color: colors.dim, size: 12 });

      var msgs = state.messages;
      for (var i = 0; i < msgs.length; i++) {
        FA.draw.text(msgs[i], 8, uiY + 44 + i * 14, { color: colors.dim, size: 11 });
      }
    }, 30);

    // === GAME OVER SCREEN ===
    FA.addLayer('gameOver', function() {
      var state = FA.getState();
      if (state.screen !== 'extraction' && state.screen !== 'shutdown') return;

      var isVictory = state.screen === 'extraction';

      FA.draw.withAlpha(0.8, function() {
        FA.draw.rect(0, 0, W, uiY, '#000');
      });

      var title = isVictory ? 'EXTRACTION COMPLETE' : 'SYSTEM SHUTDOWN';
      var titleColor = isVictory ? '#4f4' : '#f44';
      FA.draw.text(title, W / 2, uiY / 2 - 70, { color: titleColor, size: 28, bold: true, align: 'center', baseline: 'middle' });

      var narText = FA.lookup('narrativeText', state.screen);
      if (narText) {
        FA.draw.text(narText.text, W / 2, uiY / 2 - 30, { color: narText.color, size: 14, align: 'center', baseline: 'middle' });
      }

      var p = state.player;
      FA.draw.text('Drones neutralized: ' + p.kills, W / 2, uiY / 2 + 10, { color: colors.text, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Data extracted: ' + p.gold, W / 2, uiY / 2 + 30, { color: colors.gold, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Deepest level: ' + (state.maxDepthReached || 1) + '/' + cfg.maxDepth, W / 2, uiY / 2 + 50, { color: colors.stairsDown, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Turns: ' + state.turn, W / 2, uiY / 2 + 70, { color: colors.dim, size: 14, align: 'center', baseline: 'middle' });

      FA.draw.text('SCORE: ' + (state.score || 0), W / 2, uiY / 2 + 105, { color: '#fff', size: 22, bold: true, align: 'center', baseline: 'middle' });

      FA.draw.text('[ R ]  Reinitialize', W / 2, uiY / 2 + 145, { color: colors.dim, size: 16, align: 'center', baseline: 'middle' });
    }, 40);
  }

  window.Render = { setup: setupLayers };
})();
