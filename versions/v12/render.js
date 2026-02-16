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

      FA.draw.text('DEEP PROTOCOL', W / 2, H / 2 - 100, { color: colors.player, size: 36, bold: true, align: 'center', baseline: 'middle' });
      FA.draw.text('d   S   t   d   S', W / 2, H / 2 - 55, { color: colors.enemy, size: 20, align: 'center', baseline: 'middle' });
      FA.draw.text('Infiltrate. Hack terminals. Recover hardware. Choose your protocol.', W / 2, H / 2 - 15, { color: colors.narrative, size: 13, align: 'center', baseline: 'middle' });
      FA.draw.text('5 sub-levels  |  3 paths  |  3 endings', W / 2, H / 2 + 10, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });

      FA.draw.text('WASD / Arrows — move & attack', W / 2, H / 2 + 45, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });
      FA.draw.text('1 / 2 / 3 — activate module', W / 2, H / 2 + 63, { color: '#ff0', size: 12, align: 'center', baseline: 'middle' });
      FA.draw.text('Walk on terminals to hack  |  Walk on stairs to descend', W / 2, H / 2 + 83, { color: colors.dim, size: 11, align: 'center', baseline: 'middle' });

      FA.draw.text('[ SPACE ]  to initiate', W / 2, H / 2 + 125, { color: '#fff', size: 18, bold: true, align: 'center', baseline: 'middle' });
    }, 0);

    // === MAP WITH WALL AUTOTILING ===
    FA.addLayer('map', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
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
          } else if (tile === 4) {
            // Active terminal
            ctx.fillStyle = FLOOR_A;
            ctx.fillRect(px, py, ts, ts);
            ctx.fillStyle = '#0a2a2a';
            ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            ctx.fillStyle = '#0ff';
            ctx.fillRect(px + 3, py + 3, ts - 6, 2);
            ctx.fillRect(px + 3, py + ts - 5, ts - 6, 2);
            FA.draw.text('T', px + ts / 2, py + ts / 2, { color: '#0ff', size: 11, bold: true, align: 'center', baseline: 'middle' });
          } else if (tile === 5) {
            // Used terminal
            ctx.fillStyle = FLOOR_A;
            ctx.fillRect(px, py, ts, ts);
            ctx.fillStyle = '#0a1515';
            ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            FA.draw.text('T', px + ts / 2, py + ts / 2, { color: '#223', size: 11, align: 'center', baseline: 'middle' });
          } else {
            // Wall autotiling
            var openS = isOpen(map, x, y + 1);
            var openN = isOpen(map, x, y - 1);
            var openE = isOpen(map, x + 1, y);
            var openW = isOpen(map, x - 1, y);

            // Base fill
            if (openS) {
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
              ctx.fillStyle = WALL_INNER;
              ctx.fillRect(px, py, ts, ts);
              ctx.fillStyle = WALL_SIDE;
              ctx.fillRect(px, py, ts, 2);
              if (x % 4 === 0) {
                ctx.fillStyle = WALL_LINE;
                ctx.fillRect(px + ts / 2, py + 3, 1, ts - 4);
              }
            } else {
              ctx.fillStyle = WALL_INNER;
              ctx.fillRect(px, py, ts, ts);
            }

            // Side accents — always on top
            if (openE) {
              ctx.fillStyle = WALL_SIDE;
              ctx.fillRect(px + ts - 2, py, 2, ts);
            }
            if (openW) {
              ctx.fillStyle = WALL_SIDE;
              ctx.fillRect(px, py, 2, ts);
            }
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
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var ctx = FA.getCtx();

      // Items with subtle glow
      for (var i = 0; i < state.items.length; i++) {
        var item = state.items[i];
        var icx = item.x * ts + ts / 2, icy = item.y * ts + ts / 2;
        ctx.save();
        ctx.globalAlpha = item.type === 'module' ? 0.25 : 0.15;
        var ig = ctx.createRadialGradient(icx, icy, 0, icx, icy, ts);
        ig.addColorStop(0, item.color);
        ig.addColorStop(1, 'transparent');
        ctx.fillStyle = ig;
        ctx.fillRect(item.x * ts - ts / 2, item.y * ts - ts / 2, ts * 2, ts * 2);
        ctx.restore();
        FA.draw.sprite('items', item.type, item.x * ts, item.y * ts, ts, item.char, item.color, 0);
      }

      // Enemies with glow + sentinel fire lines
      for (var e = 0; e < state.enemies.length; e++) {
        var en = state.enemies[e];
        var ecx = en.x * ts + ts / 2, ecy = en.y * ts + ts / 2;

        // Sentinel fire lines (before glow, so glow renders on top)
        if (en.behavior === 'sentinel' && !(en.stunTurns > 0)) {
          ctx.save();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = en.color;
          var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
          for (var dd = 0; dd < dirs.length; dd++) {
            var lx = en.x, ly = en.y;
            for (var lr = 1; lr <= 6; lr++) {
              lx += dirs[dd][0];
              ly += dirs[dd][1];
              if (ly < 0 || ly >= cfg.rows || lx < 0 || lx >= cfg.cols) break;
              if (state.map[ly][lx] === 1) break;
              ctx.fillRect(lx * ts + ts / 2 - 1, ly * ts + ts / 2 - 1, 3, 3);
            }
          }
          ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = 0.25;
        var eg = ctx.createRadialGradient(ecx, ecy, 2, ecx, ecy, ts * 1.2);
        eg.addColorStop(0, en.color);
        eg.addColorStop(1, 'transparent');
        ctx.fillStyle = eg;
        ctx.fillRect(en.x * ts - ts / 2, en.y * ts - ts / 2, ts * 2, ts * 2);
        ctx.restore();

        FA.draw.sprite('enemies', en.behavior, en.x * ts, en.y * ts, ts, en.char, en.color, 0);
        var hpRatio = en.hp / en.maxHp;
        if (hpRatio < 1) {
          FA.draw.bar(en.x * ts + 2, en.y * ts - 3, ts - 4, 2, hpRatio, '#f44', '#400');
        }

        // Stun indicator
        if (en.stunTurns > 0) {
          FA.draw.text('~', ecx, ecy - ts / 2 - 2, { color: '#ff0', size: 10, bold: true, align: 'center', baseline: 'bottom' });
        }
      }

      // Player with cyan glow (dim if cloaked)
      var p = state.player;
      var pcx = p.x * ts + ts / 2, pcy = p.y * ts + ts / 2;

      if (p.cloakTurns > 0) {
        // Cloaked — ghostly appearance
        ctx.save();
        ctx.globalAlpha = 0.12;
        var cg = ctx.createRadialGradient(pcx, pcy, 2, pcx, pcy, ts * 1.3);
        cg.addColorStop(0, '#88f');
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg;
        ctx.fillRect(p.x * ts - ts / 2, p.y * ts - ts / 2, ts * 2, ts * 2);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.35;
        FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', '#88f', 0);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 0.2;
        var pg = ctx.createRadialGradient(pcx, pcy, 2, pcx, pcy, ts * 1.3);
        pg.addColorStop(0, colors.player);
        pg.addColorStop(1, 'transparent');
        ctx.fillStyle = pg;
        ctx.fillRect(p.x * ts - ts / 2, p.y * ts - ts / 2, ts * 2, ts * 2);
        ctx.restore();
        FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', colors.player, 0);
      }
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
            continue;
          } else if (vis[y2][x2] > 0.03) {
            ctx.globalAlpha = Math.min(1 - vis[y2][x2], 0.88);
          } else if (explored[y2][x2]) {
            ctx.globalAlpha = 0.72;
          } else {
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
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
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
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var p = state.player;

      FA.draw.rect(0, uiY, W, H - uiY, '#0c1018');

      // Line 1: Hull + stats
      FA.draw.text('HULL', 8, uiY + 6, { color: colors.text, size: 11 });
      FA.draw.bar(38, uiY + 6, 90, 10, p.hp / p.maxHp, '#4f4', '#1a0a0a');
      FA.draw.text(p.hp + '/' + p.maxHp, 132, uiY + 6, { color: colors.text, size: 11 });
      FA.draw.text('ATK:' + p.atk + '  DEF:' + p.def, 195, uiY + 6, { color: colors.dim, size: 11 });
      var depthText = 'LVL:' + (state.depth || 1) + '/' + cfg.maxDepth;
      FA.draw.text(depthText, 310, uiY + 6, { color: colors.stairsDown, size: 11, bold: true });

      // Active buffs
      var buffX = 380;
      if (p.cloakTurns > 0) {
        FA.draw.text('CLOAK:' + p.cloakTurns, buffX, uiY + 6, { color: '#88f', size: 11, bold: true });
        buffX += 65;
      }
      if (p.overclockActive) {
        FA.draw.text('OC:RDY', buffX, uiY + 6, { color: '#f44', size: 11, bold: true });
        buffX += 55;
      }
      if (p.firewallHp > 0) {
        FA.draw.text('FW:' + p.firewallHp, buffX, uiY + 6, { color: '#4f4', size: 11, bold: true });
      }

      // Line 2: Module slots
      var mods = p.modules || [];
      for (var m = 0; m < 3; m++) {
        var mx = 8 + m * 120;
        if (m < mods.length) {
          FA.draw.text('[' + (m + 1) + '] ' + mods[m].name, mx, uiY + 21, { color: mods[m].color, size: 11, bold: true });
        } else {
          FA.draw.text('[' + (m + 1) + '] ---', mx, uiY + 21, { color: '#223', size: 11 });
        }
      }

      // Line 3: Stats
      FA.draw.text('Data:' + p.gold + '  Kills:' + p.kills + '  Turn:' + state.turn, 8, uiY + 36, { color: colors.dim, size: 11 });

      // Messages
      var msgs = state.messages;
      for (var i = 0; i < msgs.length; i++) {
        FA.draw.text(msgs[i], 8, uiY + 50 + i * 12, { color: colors.dim, size: 10 });
      }
    }, 30);

    // === GAME OVER SCREEN ===
    var endingTitles = {
      end_extraction: { title: 'EXTRACTION COMPLETE', color: '#f44' },
      end_integration: { title: 'INTEGRATION COMPLETE', color: '#88f' },
      end_transcendence: { title: 'TRANSCENDENCE', color: '#0ff' },
      shutdown: { title: 'SYSTEM SHUTDOWN', color: '#f44' }
    };

    FA.addLayer('gameOver', function() {
      var state = FA.getState();
      if (state.screen !== 'victory' && state.screen !== 'shutdown') return;

      FA.draw.withAlpha(0.8, function() {
        FA.draw.rect(0, 0, W, uiY, '#000');
      });

      var ending = endingTitles[state.endingNode] || endingTitles.shutdown;
      FA.draw.text(ending.title, W / 2, uiY / 2 - 70, { color: ending.color, size: 28, bold: true, align: 'center', baseline: 'middle' });

      var narText = FA.lookup('narrativeText', state.endingNode);
      if (narText) {
        FA.draw.text(narText.text, W / 2, uiY / 2 - 30, { color: narText.color, size: 14, align: 'center', baseline: 'middle' });
      }

      var p = state.player;
      FA.draw.text('Drones neutralized: ' + p.kills, W / 2, uiY / 2 + 10, { color: colors.text, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Data extracted: ' + p.gold, W / 2, uiY / 2 + 30, { color: colors.gold, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Deepest level: ' + (state.maxDepthReached || 1) + '/' + cfg.maxDepth, W / 2, uiY / 2 + 50, { color: colors.stairsDown, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Terminals hacked: ' + (state.terminalsHacked || 0), W / 2, uiY / 2 + 70, { color: '#0ff', size: 14, align: 'center', baseline: 'middle' });

      if (state.path && state.path !== 'none') {
        var pathLabels = { hunter: 'HUNTER', ghost: 'GHOST', archivist: 'ARCHIVIST' };
        FA.draw.text('Protocol: ' + (pathLabels[state.path] || state.path), W / 2, uiY / 2 + 90, { color: ending.color, size: 13, align: 'center', baseline: 'middle' });
      }

      FA.draw.text('SCORE: ' + (state.score || 0), W / 2, uiY / 2 + 115, { color: '#fff', size: 22, bold: true, align: 'center', baseline: 'middle' });

      FA.draw.text('[ R ]  Reinitialize', W / 2, uiY / 2 + 155, { color: colors.dim, size: 16, align: 'center', baseline: 'middle' });
    }, 40);
  }

  window.Render = { setup: setupLayers };
})();
