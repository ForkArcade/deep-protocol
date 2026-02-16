// Roguelike — Rendering
(function() {
  'use strict';
  var FA = window.FA;

  // === RAYCASTER ===

  function castRay(px, py, angle, map, rows, cols) {
    var dx = Math.cos(angle);
    var dy = Math.sin(angle);
    var mapX = Math.floor(px);
    var mapY = Math.floor(py);
    var ddx = dx === 0 ? 1e10 : Math.abs(1 / dx);
    var ddy = dy === 0 ? 1e10 : Math.abs(1 / dy);
    var stepX, stepY, sdx, sdy;
    if (dx < 0) { stepX = -1; sdx = (px - mapX) * ddx; }
    else { stepX = 1; sdx = (mapX + 1 - px) * ddx; }
    if (dy < 0) { stepY = -1; sdy = (py - mapY) * ddy; }
    else { stepY = 1; sdy = (mapY + 1 - py) * ddy; }
    var side = 0;
    for (var i = 0; i < 64; i++) {
      if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; }
      else { sdy += ddy; mapY += stepY; side = 1; }
      if (mapY < 0 || mapY >= rows || mapX < 0 || mapX >= cols) return 20;
      if (map[mapY][mapX] === 1) {
        var d = side === 0 ? sdx - ddx : sdy - ddy;
        return d + (side ? 0.001 : 0); // encode side in fractional
      }
    }
    return 20;
  }

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
      FA.draw.text('[ TAB ]  przelacz widok 2D / 3D', W / 2, H / 2 + 160, { color: colors.dim, size: 12, align: 'center', baseline: 'middle' });
    }, 0);

    // === MAP (2D only) ===
    FA.addLayer('map', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'death') return;
      if (!state.map || state.viewMode === '3d') return;
      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) {
          FA.draw.rect(x * ts, y * ts, ts, ts,
            state.map[y][x] === 1 ? colors.wall : colors.floor);
        }
      }
    }, 1);

    // === ENTITIES (2D only) ===
    FA.addLayer('entities', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'death') return;
      if (!state.player || state.viewMode === '3d') return;

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

    // === 3D FIRST-PERSON VIEW ===
    FA.addLayer('firstPerson', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' || state.viewMode !== '3d') return;
      if (!state.map || !state.player) return;

      var ctx = FA.getCtx();
      var p = state.player;
      var px = p.x + 0.5;
      var py = p.y + 0.5;
      var pAngle = p.angle;
      var fov = cfg.fov;
      var halfFov = fov / 2;
      var rows = cfg.rows;
      var cols = cfg.cols;
      var map = state.map;
      var vpH = uiY; // viewport height
      var halfVp = vpH / 2;
      var stripW = 2;
      var numRays = Math.ceil(W / stripW);

      // Ceiling
      ctx.fillStyle = colors.ceiling;
      ctx.fillRect(0, 0, W, halfVp);
      // Floor
      ctx.fillStyle = colors.floorFp;
      ctx.fillRect(0, halfVp, W, halfVp);

      // Raycast walls
      var zBuf = [];
      var wR = colors.wallR;
      var wG = colors.wallG;
      var wB = colors.wallB;

      for (var i = 0; i < numRays; i++) {
        var rayAngle = pAngle - halfFov + (i / numRays) * fov;
        var dist = castRay(px, py, rayAngle, map, rows, cols);
        var isSide = (dist % 1) > 0.0005;
        var corrDist = dist * Math.cos(rayAngle - pAngle);
        zBuf[i] = corrDist;

        if (corrDist < cfg.renderDist) {
          var wallH = vpH / corrDist;
          var bright = Math.max(0.08, 1 - corrDist / cfg.renderDist);
          if (isSide) bright *= 0.7;
          var r = Math.floor(wR * bright);
          var g = Math.floor(wG * bright);
          var b = Math.floor(wB * bright);
          ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
          ctx.fillRect(i * stripW, halfVp - wallH / 2, stripW, wallH);
        }
      }

      // Sprites (enemies + items)
      var sprites = [];
      for (var ei = 0; ei < state.enemies.length; ei++) {
        var en = state.enemies[ei];
        sprites.push({ x: en.x + 0.5, y: en.y + 0.5, color: en.color, char: en.char, size: 0.6 });
      }
      for (var ii = 0; ii < state.items.length; ii++) {
        var it = state.items[ii];
        sprites.push({ x: it.x + 0.5, y: it.y + 0.5, color: it.color, char: it.char, size: 0.35 });
      }

      // Sort by distance (far first)
      sprites.sort(function(a, b) {
        var da = (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py);
        var db = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
        return db - da;
      });

      for (var si = 0; si < sprites.length; si++) {
        var s = sprites[si];
        var sdx = s.x - px;
        var sdy = s.y - py;
        var sDist = Math.sqrt(sdx * sdx + sdy * sdy);
        if (sDist < 0.3 || sDist > cfg.renderDist) continue;

        var sAngle = Math.atan2(sdy, sdx) - pAngle;
        // Normalize angle
        while (sAngle > Math.PI) sAngle -= 2 * Math.PI;
        while (sAngle < -Math.PI) sAngle += 2 * Math.PI;

        if (Math.abs(sAngle) > halfFov + 0.2) continue;

        var screenX = W / 2 + (sAngle / halfFov) * (W / 2);
        var sprH = (vpH / sDist) * s.size;
        var sprW = sprH * 0.7;

        // Z-buffer check (center column)
        var col = Math.floor(screenX / stripW);
        if (col >= 0 && col < numRays && zBuf[col] < sDist) continue;

        var bright = Math.max(0.15, 1 - sDist / cfg.renderDist);
        ctx.globalAlpha = bright;
        ctx.fillStyle = s.color;
        ctx.fillRect(screenX - sprW / 2, halfVp - sprH / 2, sprW, sprH);

        // Character label
        if (sprH > 12) {
          ctx.fillStyle = '#fff';
          ctx.font = Math.max(8, Math.floor(sprH * 0.4)) + 'px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(s.char, screenX, halfVp);
        }
        ctx.globalAlpha = 1;
      }

      // Minimap (bottom-left corner, above UI)
      var mmS = 3; // minimap tile size
      var mmX = 8;
      var mmY = uiY - rows * mmS - 8;
      ctx.globalAlpha = 0.6;
      for (var my = 0; my < rows; my++) {
        for (var mx = 0; mx < cols; mx++) {
          ctx.fillStyle = map[my][mx] === 1 ? '#444' : '#222';
          ctx.fillRect(mmX + mx * mmS, mmY + my * mmS, mmS, mmS);
        }
      }
      // Player dot on minimap
      ctx.fillStyle = colors.player;
      ctx.fillRect(mmX + p.x * mmS, mmY + p.y * mmS, mmS, mmS);
      // Enemy dots
      ctx.fillStyle = colors.enemy;
      for (var me = 0; me < state.enemies.length; me++) {
        ctx.fillRect(mmX + state.enemies[me].x * mmS, mmY + state.enemies[me].y * mmS, mmS, mmS);
      }
      ctx.globalAlpha = 1;

      // View mode hint
      FA.draw.text('[TAB] 2D view', W - 8, uiY - 8, { color: colors.dim, size: 10, align: 'right' });
    }, 5);

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
      if (state.screen === 'playing' && state.viewMode === '2d') {
        FA.draw.text('[TAB] 3D view', W - 8, uiY + 8, { color: colors.dim, size: 10, align: 'right' });
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
