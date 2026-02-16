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

      // title
      FA.draw.text('LOCH SZCZUROW', W / 2, H / 2 - 80, { color: colors.player, size: 36, bold: true, align: 'center', baseline: 'middle' });

      // decorative rats
      FA.draw.text('r   r   r   r   r', W / 2, H / 2 - 30, { color: colors.enemy, size: 20, align: 'center', baseline: 'middle' });

      // description
      FA.draw.text('Wejdz do lochu. Pokonaj szczury. Zbierz zloto.', W / 2, H / 2 + 20, { color: colors.narrative, size: 14, align: 'center', baseline: 'middle' });

      // controls
      FA.draw.text('WASD / Strzalki — ruch i atak', W / 2, H / 2 + 60, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });
      FA.draw.text('Wejdz na wroga aby zaatakowac', W / 2, H / 2 + 80, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });

      // prompt
      FA.draw.text('[ SPACJA ]  aby rozpoczac', W / 2, H / 2 + 130, { color: '#fff', size: 18, bold: true, align: 'center', baseline: 'middle' });
    }, 0);

    // === MAP ===
    FA.addLayer('map', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'death') return;
      if (!state.map) return;
      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) {
          FA.draw.rect(x * ts, y * ts, ts, ts,
            state.map[y][x] === 1 ? colors.wall : colors.floor);
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
        FA.draw.sprite('items', item.type, item.x * ts, item.y * ts, ts, item.char, item.color);
      }

      for (var e = 0; e < state.enemies.length; e++) {
        var en = state.enemies[e];
        FA.draw.sprite('enemies', 'rat', en.x * ts, en.y * ts, ts, en.char, en.color);
        var hpRatio = en.hp / en.maxHp;
        if (hpRatio < 1) {
          FA.draw.bar(en.x * ts + 2, en.y * ts - 3, ts - 4, 2, hpRatio, '#f44', '#400');
        }
      }

      var p = state.player;
      FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', colors.player);
    }, 10);

    // === FLOATING MESSAGES ===
    FA.addLayer('floats', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'death') return;
      FA.drawFloats();
    }, 20);

    // === NARRATIVE BAR (top of screen during play) ===
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
      FA.draw.text('Zloto:' + p.gold + '  Zabite:' + p.kills + '  Tura:' + state.turn, 8, uiY + 26, { color: colors.dim, size: 12 });

      var msgs = state.messages;
      for (var i = 0; i < msgs.length; i++) {
        FA.draw.text(msgs[i], 8, uiY + 44 + i * 14, { color: colors.dim, size: 11 });
      }
    }, 30);

    // === GAME OVER SCREEN (victory or death) ===
    FA.addLayer('gameOver', function() {
      var state = FA.getState();
      if (state.screen !== 'victory' && state.screen !== 'death') return;

      var isVictory = state.screen === 'victory';

      FA.draw.withAlpha(0.75, function() {
        FA.draw.rect(0, 0, W, uiY, '#000');
      });

      // title
      var title = isVictory ? 'ZWYCIESTWO!' : 'SMIERC!';
      var titleColor = isVictory ? '#4f4' : '#f44';
      FA.draw.text(title, W / 2, uiY / 2 - 60, { color: titleColor, size: 32, bold: true, align: 'center', baseline: 'middle' });

      // narrative text
      var narText = FA.lookup('narrativeText', state.screen);
      if (narText) {
        FA.draw.text(narText.text, W / 2, uiY / 2 - 20, { color: narText.color, size: 14, align: 'center', baseline: 'middle' });
      }

      // stats
      var p = state.player;
      FA.draw.text('Szczury pokonane: ' + p.kills + '/' + (p.kills + state.enemies.length), W / 2, uiY / 2 + 20, { color: colors.text, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Zloto zebrane: ' + p.gold, W / 2, uiY / 2 + 40, { color: colors.gold, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Tury: ' + state.turn, W / 2, uiY / 2 + 60, { color: colors.dim, size: 14, align: 'center', baseline: 'middle' });

      // score
      FA.draw.text('WYNIK: ' + (state.score || 0), W / 2, uiY / 2 + 95, { color: '#fff', size: 22, bold: true, align: 'center', baseline: 'middle' });

      // restart
      FA.draw.text('[ R ]  Zagraj ponownie', W / 2, uiY / 2 + 135, { color: colors.dim, size: 16, align: 'center', baseline: 'middle' });
    }, 40);
  }

  window.Render = { setup: setupLayers };
})();
