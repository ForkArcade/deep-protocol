// Roguelike — Rendering
(function() {
  'use strict';
  var FA = window.FA;

  function setupLayers() {
    var cfg = FA.lookup('config', 'game');
    var colors = FA.lookup('config', 'colors');
    var ts = cfg.tileSize;
    var uiY = cfg.rows * ts;

    FA.addLayer('map', function() {
      var state = FA.getState();
      if (!state.map) return;
      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) {
          FA.draw.rect(x * ts, y * ts, ts, ts,
            state.map[y][x] === 1 ? colors.wall : colors.floor);
        }
      }
    }, 0);

    FA.addLayer('entities', function() {
      var state = FA.getState();
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

    FA.addLayer('floats', function() {
      FA.drawFloats();
    }, 20);

    FA.addLayer('ui', function() {
      var state = FA.getState();
      if (!state.player) return;
      var p = state.player;

      FA.draw.rect(0, uiY, cfg.canvasWidth, cfg.canvasHeight - uiY, '#111');

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

    FA.addLayer('overlay', function() {
      var state = FA.getState();
      if (!state.gameOver) return;
      FA.draw.withAlpha(0.7, function() {
        FA.draw.rect(0, 0, cfg.canvasWidth, cfg.canvasHeight, '#000');
      });
      var label = state.victory ? 'ZWYCIESTWO!' : 'SMIERC!';
      var col = state.victory ? '#4f4' : '#f44';
      FA.draw.text(label, cfg.canvasWidth / 2, cfg.canvasHeight / 2 - 30, { color: col, size: 28, bold: true, align: 'center', baseline: 'middle' });
      FA.draw.text('Wynik: ' + (state.score || 0), cfg.canvasWidth / 2, cfg.canvasHeight / 2 + 10, { color: '#fff', size: 16, align: 'center', baseline: 'middle' });
      FA.draw.text('[R] Nowa gra', cfg.canvasWidth / 2, cfg.canvasHeight / 2 + 40, { color: colors.dim, size: 14, align: 'center', baseline: 'middle' });
    }, 40);
  }

  window.Render = { setup: setupLayers };
})();
