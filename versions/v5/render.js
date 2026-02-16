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

    // === MAP ===
    FA.addLayer('map', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'death') return;
      if (!state.map) return;
      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) {
          var tile = state.map[y][x];
          var color;
          if (tile === 1) color = colors.wall;
          else if (tile === 2) color = colors.stairsDown;
          else if (tile === 3) color = colors.stairsUp;
          else color = colors.floor;
          FA.draw.rect(x * ts, y * ts, ts, ts, color);
          if (tile === 2) {
            FA.draw.text('>', x * ts + ts / 2, y * ts + ts / 2, { color: '#fff', size: 14, bold: true, align: 'center', baseline: 'middle' });
          } else if (tile === 3) {
            FA.draw.text('<', x * ts + ts / 2, y * ts + ts / 2, { color: '#fff', size: 14, bold: true, align: 'center', baseline: 'middle' });
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

    // === PLAYER LIGHT ===
    FA.addLayer('lighting', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      if (!state.player) return;

      var ctx = FA.getCtx();
      var p = state.player;
      var cx = (p.x + 0.5) * ts;
      var cy = (p.y + 0.5) * ts;
      var lightRadius = (9 - (state.depth || 1)) * ts;

      ctx.save();
      var grad = ctx.createRadialGradient(cx, cy, ts * 1.5, cx, cy, lightRadius);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.4)');
      grad.addColorStop(1, 'rgba(0,0,0,0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, uiY);
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
