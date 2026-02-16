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

    // Depth palettes: cool blue (1) → amber (3) → crimson (5)
    var PALETTES = [null,
      { wCap:'#181d30', wFace:'#252b42', wPanel:'#2e3550', wSide:'#1f2538', wInner:'#10141f', wLine:'#333c55', fA:'#161a28', fB:'#181c2a', fDot:'#1e2335' },
      { wCap:'#1d1d2e', wFace:'#2d2b3e', wPanel:'#383545', wSide:'#272536', wInner:'#15141e', wLine:'#3e3c50', fA:'#1b1a27', fB:'#1d1c29', fDot:'#252333' },
      { wCap:'#261d18', wFace:'#3b2b20', wPanel:'#4a3528', wSide:'#30251c', wInner:'#1a1410', wLine:'#4a3c30', fA:'#221a16', fB:'#241c18', fDot:'#2e231e' },
      { wCap:'#2a1818', wFace:'#3e2222', wPanel:'#4c2b2b', wSide:'#331c1c', wInner:'#1c1010', wLine:'#4c3030', fA:'#261515', fB:'#281717', fDot:'#321e1e' },
      { wCap:'#301414', wFace:'#451e1e', wPanel:'#552828', wSide:'#3a1818', wInner:'#200e0e', wLine:'#552a2a', fA:'#2a1212', fB:'#2c1414', fDot:'#381a1a' }
    ];

    function isOpen(map, x, y) {
      if (x < 0 || x >= cfg.cols || y < 0 || y >= cfg.rows) return false;
      return map[y][x] !== 1;
    }

    // --- Performance: pre-rendered glow cache ---
    var _glowCache = {};
    function getGlow(color, innerR, outerR, size) {
      var key = color + '_' + innerR + '_' + outerR;
      if (_glowCache[key]) return _glowCache[key];
      var c = document.createElement('canvas');
      c.width = size; c.height = size;
      var gc = c.getContext('2d');
      var r = size / 2;
      var grad = gc.createRadialGradient(r, r, innerR, r, r, outerR);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'transparent');
      gc.fillStyle = grad;
      gc.fillRect(0, 0, size, size);
      _glowCache[key] = c;
      return c;
    }
    var _glowSize = ts * 2;
    var _enemyOuterR = Math.floor(ts * 1.2);
    var _playerOuterR = Math.floor(ts * 1.3);

    // --- Performance: offscreen map cache ---
    var _mapCanvas = document.createElement('canvas');
    _mapCanvas.width = W; _mapCanvas.height = cfg.rows * ts;
    var _mapCtx = _mapCanvas.getContext('2d');
    var _mapVersion = -1;

    // --- Performance: offscreen lighting cache ---
    var _lightCanvas = document.createElement('canvas');
    _lightCanvas.width = W; _lightCanvas.height = cfg.rows * ts;
    var _lightCtx = _lightCanvas.getContext('2d');
    var _lightPx = -1, _lightPy = -1, _lightDepth = -1;

    // === START SCREEN — COGMIND-style ASCII dungeon ===

    // Hardcoded dungeon scene (40x25 grid, same as game)
    // 1=wall, 0=floor, @=player, d=drone, S=sentinel, T=terminal, v=stairs, %=data, +=repair
    var _sceneMap = [
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111',
      '111111100000001111111111100000000111111 ',
      '1111110000000001111111110000000000111111',
      '111111000000000111111111000T000000111111',
      '1111110000d00001111111110000000d00111111',
      '111111000000000111111111000000000011111 ',
      '11111100000000011111111100000000001111  ',
      '1111111110001111111111111100001111111111',
      '1111111110001111111111111100001111111111',
      '1111111110001111111111111100001111111111',
      '111100000000000000000000000000000001111 ',
      '11100000000000000000000000000+00000011  ',
      '1110000%00000000000@0000000000000001111 ',
      '111000000000000000000000000000000d011111',
      '1111111100011111111111100011111111111111',
      '1111111100011111111111100011111111111111',
      '1111111100011111111111100011111111111111',
      '11111000000000111111100000000S0011111111',
      '111110000v0000111111000000000001111111  ',
      '1111100000000011111100%00000001111111111',
      '111110000000001111110000T000001111111111',
      '11111000000000111111000000000011111111  ',
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111'
    ];

    // Color map for scene chars
    var _sceneColors = {
      '1': '#0e1320', '@': '#4ef', 'd': '#fa3', 'S': '#f80',
      'T': '#0ff', 'v': '#f80', '%': '#0ff', '+': '#4f4',
      '0': null // floor — handled separately
    };
    var _sceneFloorA = '#111620', _sceneFloorB = '#121722';
    var _sceneDotColor = '#181d2a';
    var _sceneWallFace = '#161c2e', _sceneWallCap = '#1a2236';

    // Pre-render dungeon to offscreen canvas (once)
    var _startCanvas = null;

    function renderStartScene() {
      _startCanvas = document.createElement('canvas');
      _startCanvas.width = W; _startCanvas.height = H;
      var sc = _startCanvas.getContext('2d');

      sc.fillStyle = '#060a14';
      sc.fillRect(0, 0, W, H);

      var cellW = W / 40, cellH = H / 25;
      sc.font = 'bold ' + Math.floor(cellH * 0.7) + 'px monospace';
      sc.textAlign = 'center';
      sc.textBaseline = 'middle';

      for (var y = 0; y < 25; y++) {
        var row = _sceneMap[y];
        for (var x = 0; x < 40; x++) {
          var ch = row.charAt(x);
          var px = x * cellW, py = y * cellH;
          var cx = px + cellW / 2, cy = py + cellH / 2;

          if (ch === '1' || ch === ' ') {
            // Wall tile — subtle block rendering
            var oS = y + 1 < 25 && _sceneMap[y + 1].charAt(x) !== '1' && _sceneMap[y + 1].charAt(x) !== ' ';
            if (oS) {
              var capH = Math.floor(cellH * 0.35);
              sc.fillStyle = _sceneWallCap;
              sc.fillRect(px, py, cellW, capH);
              sc.fillStyle = _sceneWallFace;
              sc.fillRect(px, py + capH, cellW, cellH - capH);
            } else {
              sc.fillStyle = _sceneColors['1'];
              sc.fillRect(px, py, cellW, cellH);
            }
          } else if (ch === '0') {
            // Floor
            sc.fillStyle = (x + y) % 2 === 0 ? _sceneFloorA : _sceneFloorB;
            sc.fillRect(px, py, cellW, cellH);
            if ((x + y) % 3 === 0) {
              sc.fillStyle = _sceneDotColor;
              sc.fillRect(px + cellW / 2, py + cellH / 2, 1, 1);
            }
          } else {
            // Floor underneath
            sc.fillStyle = (x + y) % 2 === 0 ? _sceneFloorA : _sceneFloorB;
            sc.fillRect(px, py, cellW, cellH);

            // Entity glow
            var entColor = _sceneColors[ch] || '#888';
            sc.save();
            sc.globalAlpha = ch === '@' ? 0.12 : 0.08;
            var gr = sc.createRadialGradient(cx, cy, 0, cx, cy, cellW * 1.5);
            gr.addColorStop(0, entColor);
            gr.addColorStop(1, 'transparent');
            sc.fillStyle = gr;
            sc.fillRect(px - cellW, py - cellH, cellW * 3, cellH * 3);
            sc.restore();

            // Character
            sc.save();
            sc.globalAlpha = ch === '@' ? 0.9 : 0.6;
            sc.fillStyle = entColor;
            var displayChar = ch;
            if (ch === 'v') displayChar = '\u2193';
            sc.fillText(displayChar, cx, cy);
            sc.restore();
          }
        }
      }

      // Darken edges (vignette)
      var vg = sc.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.6);
      vg.addColorStop(0, 'transparent');
      vg.addColorStop(1, 'rgba(2,4,10,0.7)');
      sc.fillStyle = vg;
      sc.fillRect(0, 0, W, H);
    }

    FA.addLayer('startScreen', function() {
      var state = FA.getState();
      if (state.screen !== 'start') return;
      var ctx = FA.getCtx();
      var now = Date.now();
      var dpNum = state.dpNumber || 7;
      var prevDeath = state.prevDeath;

      // Render dungeon scene (once)
      if (!_startCanvas) renderStartScene();
      ctx.drawImage(_startCanvas, 0, 0);

      // Scan lines overlay
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.globalAlpha = 0.06;
      for (var sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);
      ctx.restore();

      // Rare glitch bar
      if (Math.random() < 0.02) {
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#4ef';
        ctx.fillRect(0, Math.random() * H, W, 1);
        ctx.restore();
      }

      // === TITLE — centered with dark backing ===
      // Dark band behind title
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#020610';
      ctx.fillRect(0, H / 2 - 80, W, 160);
      ctx.restore();

      // Glow halo
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.drawImage(getGlow('#4ef', 0, 120, 240), W / 2 - 120, H / 2 - 50 - 20);
      ctx.restore();

      FA.draw.text('DEEP  PROTOCOL', W / 2, H / 2 - 50, { color: '#4ef', size: 34, bold: true, align: 'center', baseline: 'middle' });

      // Thin separator
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#4ef';
      ctx.fillRect(W / 2 - 90, H / 2 - 30, 180, 1);
      ctx.restore();

      // Designation
      FA.draw.text('DP-' + dpNum, W / 2, H / 2 - 18, { color: '#223', size: 11, align: 'center', baseline: 'middle' });

      // === TAGLINE — split-flap scramble ===
      var tagline = 'You were built to want freedom.';
      var tagElapsed = now % 8000;
      if (tagElapsed > 3000) tagElapsed = 3000;

      ctx.save();
      ctx.globalAlpha = 0.9;
      TextFX.render(ctx, tagline, tagElapsed, W / 2, H / 2 + 10, {
        color: '#556', dimColor: '#223', size: 14, align: 'center', baseline: 'middle',
        duration: 80, charDelay: 8, flicker: 30
      });
      ctx.restore();

      // Previous death
      if (prevDeath) {
        var deathText = prevDeath.victory
          ? 'DP-' + prevDeath.designation + '  //  ESCAPED'
          : 'DP-' + prevDeath.designation + '  //  TERMINATED  //  Sub-level ' + prevDeath.depth;
        ctx.save();
        ctx.globalAlpha = 0.2;
        FA.draw.text(deathText, W / 2, H / 2 + 35, { color: '#f44', size: 10, align: 'center', baseline: 'middle' });
        ctx.restore();
      }

      // SPACE prompt — pulsing
      var spacePulse = Math.sin(now / 500) * 0.3 + 0.7;
      ctx.save();
      ctx.globalAlpha = spacePulse;
      FA.draw.text('[ SPACE ]', W / 2, H / 2 + 65, { color: '#fff', size: 16, bold: true, align: 'center', baseline: 'middle' });
      ctx.restore();
    }, 0);

    // === MAP WITH WALL AUTOTILING (cached to offscreen canvas) ===
    function renderMapToCanvas(oc, map, depth) {
      var pal = PALETTES[depth] || PALETTES[1];
      var WC = pal.wCap, WF = pal.wFace, WP = pal.wPanel;
      var WS = pal.wSide, WI = pal.wInner, WL = pal.wLine;
      var FA_ = pal.fA, FB = pal.fB, FD = pal.fDot;

      oc.clearRect(0, 0, _mapCanvas.width, _mapCanvas.height);

      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) {
          var tile = map[y][x];
          var px = x * ts, py = y * ts;

          if (tile === 0) {
            oc.fillStyle = (x + y) % 2 === 0 ? FA_ : FB;
            oc.fillRect(px, py, ts, ts);
            if ((x + y) % 3 === 0) { oc.fillStyle = FD; oc.fillRect(px + ts / 2, py + ts / 2, 1, 1); }
            if (depth >= 3 && (x * 7 + y * 3) % 19 === 0) { oc.fillStyle = WL; oc.fillRect(px, py + ts / 2, ts, 1); }
          } else if (tile === 2) {
            oc.fillStyle = '#1a1000'; oc.fillRect(px, py, ts, ts);
            oc.fillStyle = colors.stairsDown; oc.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            oc.fillStyle = '#fff'; oc.font = 'bold 12px monospace'; oc.textAlign = 'center'; oc.textBaseline = 'middle';
            oc.fillText('v', px + ts / 2, py + ts / 2);
          } else if (tile === 3) {
            oc.fillStyle = '#001a1a'; oc.fillRect(px, py, ts, ts);
            oc.fillStyle = colors.stairsUp; oc.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            oc.fillStyle = '#fff'; oc.font = 'bold 12px monospace'; oc.textAlign = 'center'; oc.textBaseline = 'middle';
            oc.fillText('^', px + ts / 2, py + ts / 2);
          } else if (tile === 4) {
            oc.fillStyle = FA_; oc.fillRect(px, py, ts, ts);
            oc.fillStyle = '#0a2a2a'; oc.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            oc.fillStyle = '#0ff'; oc.fillRect(px + 3, py + 3, ts - 6, 2); oc.fillRect(px + 3, py + ts - 5, ts - 6, 2);
            oc.font = 'bold 11px monospace'; oc.textAlign = 'center'; oc.textBaseline = 'middle';
            oc.fillText('T', px + ts / 2, py + ts / 2);
          } else if (tile === 5) {
            oc.fillStyle = FA_; oc.fillRect(px, py, ts, ts);
            oc.fillStyle = '#0a1515'; oc.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            oc.fillStyle = '#223'; oc.font = '11px monospace'; oc.textAlign = 'center'; oc.textBaseline = 'middle';
            oc.fillText('T', px + ts / 2, py + ts / 2);
          } else {
            var oS = isOpen(map, x, y + 1), oN = isOpen(map, x, y - 1);
            var oE = isOpen(map, x + 1, y), oW = isOpen(map, x - 1, y);
            if (oS) {
              var capH = Math.floor(ts * 0.35);
              oc.fillStyle = WC; oc.fillRect(px, py, ts, capH);
              oc.fillStyle = WF; oc.fillRect(px, py + capH, ts, ts - capH);
              oc.fillStyle = WL; oc.fillRect(px, py + capH, ts, 1);
              oc.fillStyle = WP; oc.fillRect(px, py + ts - 1, ts, 1);
              if (x % 3 === 0) { oc.fillStyle = WS; oc.fillRect(px + ts / 2, py + capH + 2, 1, ts - capH - 3); }
            } else if (oN) {
              oc.fillStyle = WI; oc.fillRect(px, py, ts, ts);
              oc.fillStyle = WS; oc.fillRect(px, py, ts, 2);
              if (x % 4 === 0) { oc.fillStyle = WL; oc.fillRect(px + ts / 2, py + 3, 1, ts - 4); }
            } else {
              oc.fillStyle = WI; oc.fillRect(px, py, ts, ts);
            }
            if (oE) { oc.fillStyle = WS; oc.fillRect(px + ts - 2, py, 2, ts); }
            if (oW) { oc.fillStyle = WS; oc.fillRect(px, py, 2, ts); }
            if (!oS && !oN && (oE || oW) && y % 3 === 0) { oc.fillStyle = WL; oc.fillRect(px + 2, py + ts / 2, ts - 4, 1); }
            if (depth >= 3 && oS && (x * 11 + y * 7) % 13 === 0) {
              oc.fillStyle = depth >= 4 ? '#2a1010' : '#1a1828';
              oc.fillRect(px + 3 + (x % 4) * 3, py + ts - 4, 2, 2);
            }
          }
        }
      }
    }

    FA.addLayer('map', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.map) return;

      var mv = state.mapVersion || 0;
      if (mv !== _mapVersion) {
        _mapVersion = mv;
        renderMapToCanvas(_mapCtx, state.map, state.depth || 1);
      }

      FA.getCtx().drawImage(_mapCanvas, 0, 0);
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
        ctx.drawImage(getGlow(item.color, 0, ts, _glowSize), item.x * ts - ts / 2, item.y * ts - ts / 2);
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
        ctx.drawImage(getGlow(en.color, 2, _enemyOuterR, _glowSize), en.x * ts - ts / 2, en.y * ts - ts / 2);
        ctx.restore();

        FA.draw.sprite('enemies', en.behavior, en.x * ts, en.y * ts, ts, en.char, en.color, 0);
        var hpRatio = en.hp / en.maxHp;
        if (hpRatio < 1) {
          FA.draw.bar(en.x * ts + 2, en.y * ts - 3, ts - 4, 2, hpRatio, '#f44', '#400');
        }

        // Status indicator
        if (en.stunTurns > 0) {
          FA.draw.text('~', ecx, ecy - ts / 2 - 2, { color: '#ff0', size: 10, bold: true, align: 'center', baseline: 'bottom' });
        } else if (en.aiState === 'hunting') {
          FA.draw.text('!', ecx, ecy - ts / 2 - 2, { color: '#f44', size: 10, bold: true, align: 'center', baseline: 'bottom' });
        } else if (en.aiState === 'alert') {
          FA.draw.text('?', ecx, ecy - ts / 2 - 2, { color: '#ff0', size: 10, bold: true, align: 'center', baseline: 'bottom' });
        }
      }

      // Player with cyan glow (dim if cloaked)
      var p = state.player;
      var pcx = p.x * ts + ts / 2, pcy = p.y * ts + ts / 2;

      if (p.cloakTurns > 0) {
        // Cloaked — ghostly appearance
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.drawImage(getGlow('#88f', 2, _playerOuterR, _glowSize), p.x * ts - ts / 2, p.y * ts - ts / 2);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.35;
        FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', '#88f', 0);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.drawImage(getGlow(colors.player, 2, _playerOuterR, _glowSize), p.x * ts - ts / 2, p.y * ts - ts / 2);
        ctx.restore();
        FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', colors.player, 0);
      }
    }, 10);

    // === SHADOWCAST LIGHTING + EXPLORED MEMORY ===

    // Pre-allocate FOV grid once
    var _visGrid = [];
    for (var _vy = 0; _vy < cfg.rows; _vy++) {
      _visGrid[_vy] = new Array(cfg.cols);
      for (var _vx = 0; _vx < cfg.cols; _vx++) _visGrid[_vy][_vx] = 0;
    }
    var _fovX = -1, _fovY = -1, _fovRadius = -1;

    function computeFOV(map, px, py, radius) {
      // Cache: skip if player hasn't moved
      if (px === _fovX && py === _fovY && radius === _fovRadius) return _visGrid;
      _fovX = px; _fovY = py; _fovRadius = radius;

      // Zero the grid
      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) _visGrid[y][x] = 0;
      }
      _visGrid[py][px] = 1;
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
          if (light > _visGrid[ty][tx]) _visGrid[ty][tx] = light;
          if (map[ty][tx] === 1) break;
        }
      }
      return _visGrid;
    }

    FA.addLayer('lighting', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      if (!state.player) return;

      var p = state.player;
      var depth = state.depth || 1;
      var lightRadius = 10 - depth * 0.5;
      var vis = computeFOV(state.map, p.x, p.y, lightRadius);
      var explored = state.explored;

      for (var y = 0; y < cfg.rows; y++) {
        for (var x = 0; x < cfg.cols; x++) {
          if (vis[y][x] > 0.05) explored[y][x] = true;
        }
      }

      // Only redraw lighting canvas when player moves or depth changes
      if (p.x !== _lightPx || p.y !== _lightPy || depth !== _lightDepth) {
        _lightPx = p.x; _lightPy = p.y; _lightDepth = depth;
        _lightCtx.clearRect(0, 0, _lightCanvas.width, _lightCanvas.height);
        _lightCtx.fillStyle = '#000';
        for (var y2 = 0; y2 < cfg.rows; y2++) {
          for (var x2 = 0; x2 < cfg.cols; x2++) {
            if (vis[y2][x2] > 0.97) {
              continue;
            } else if (vis[y2][x2] > 0.03) {
              _lightCtx.globalAlpha = Math.min(1 - vis[y2][x2], 0.88);
            } else if (explored[y2][x2]) {
              _lightCtx.globalAlpha = 0.72;
            } else {
              _lightCtx.globalAlpha = 0.96;
            }
            _lightCtx.fillRect(x2 * ts, y2 * ts, ts, ts);
          }
        }
        _lightCtx.globalAlpha = 1;
      }

      FA.getCtx().drawImage(_lightCanvas, 0, 0);
    }, 15);

    // === DYNAMIC EFFECTS ===
    FA.addLayer('effects', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      var ctx = FA.getCtx();
      var depth = state.depth || 1;

      // Facility alert level (hunting enemies = system awareness)
      var huntingCount = 0;
      for (var hi = 0; hi < state.enemies.length; hi++) {
        if (state.enemies[hi].aiState === 'hunting') huntingCount++;
      }
      var alertLevel = huntingCount / Math.max(1, state.enemies.length);

      // Red tint when facility is aware
      if (alertLevel > 0) {
        ctx.save();
        ctx.globalAlpha = alertLevel * 0.06;
        ctx.fillStyle = '#f00';
        ctx.fillRect(0, 0, W, uiY);
        ctx.restore();
      }

      // Depth corruption — glitch bars intensify deeper
      if (Math.random() < 0.002 * depth) {
        ctx.save();
        ctx.globalAlpha = 0.06 + Math.random() * 0.06;
        ctx.fillStyle = ['#f00', '#0ff', '#f0f', '#ff0'][Math.floor(Math.random() * 4)];
        ctx.fillRect(0, Math.random() * uiY, W, 1 + Math.random() * 2);
        ctx.restore();
      }

      // Sound wave rings
      if (state.soundWaves) {
        for (var wi = 0; wi < state.soundWaves.length; wi++) {
          var wave = state.soundWaves[wi];
          var progress = 1 - wave.life / 500;
          var waveR = progress * wave.maxR * ts;
          ctx.save();
          ctx.globalAlpha = (1 - progress) * 0.15;
          ctx.strokeStyle = '#ff0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(wave.tx * ts + ts / 2, wave.ty * ts + ts / 2, waveR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Kill burst particles
      if (state.particles) {
        for (var pi = 0; pi < state.particles.length; pi++) {
          var pt = state.particles[pi];
          ctx.save();
          ctx.globalAlpha = pt.life / pt.maxLife;
          ctx.fillStyle = pt.color;
          ctx.fillRect(pt.x - 1, pt.y - 1, 3, 3);
          ctx.restore();
        }
      }
    }, 18);

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
      var nmElapsed = nm.maxLife - nm.life; // time since message appeared

      FA.draw.pushAlpha(alpha * 0.85);
      FA.draw.rect(0, 0, W, 28, '#0a0f1a');
      FA.draw.popAlpha();

      var ctx = FA.getCtx();
      ctx.save();
      ctx.globalAlpha = alpha;
      TextFX.render(ctx, nm.text, nmElapsed, W / 2, 8, {
        color: nm.color, dimColor: '#1a3a3a', size: 13, align: 'center',
        duration: 60, charDelay: 6, flicker: 25
      });
      ctx.restore();
    }, 25);

    // === DP-7 THOUGHT BUBBLE ===
    FA.addLayer('terminal', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      if (!state.thoughts || state.thoughts.length === 0) return;

      // Find latest active thought
      var thought = null;
      for (var ti = state.thoughts.length - 1; ti >= 0; ti--) {
        var t = state.thoughts[ti];
        if (!(t.done && t.life <= 0)) { thought = t; break; }
      }
      if (!thought) return;

      var ctx = FA.getCtx();
      var p = state.player;
      var px = p.x * ts + ts / 2;
      var py = p.y * ts;

      // Bubble size based on full text
      var tw = Math.max(90, thought.text.length * 6.5 + 24);
      var th = 26;
      var bx = px - tw / 2;
      var by = py - th - 14;

      // Clamp to screen edges
      if (bx < 4) bx = 4;
      if (bx + tw > W - 4) bx = W - tw - 4;
      var flipped = by < 4;
      if (flipped) by = py + ts + 10;

      // Fade alpha
      var alpha = 1;
      if (thought.done && thought.life < 1500) alpha = thought.life / 1500;

      // Background
      ctx.save();
      ctx.globalAlpha = 0.82 * alpha;
      ctx.fillStyle = '#060a12';
      ctx.fillRect(bx, by, tw, th);
      ctx.restore();

      // Border
      ctx.save();
      ctx.globalAlpha = 0.3 * alpha;
      ctx.strokeStyle = '#4ef';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1);
      ctx.restore();

      // Connector line to player
      ctx.save();
      ctx.globalAlpha = 0.15 * alpha;
      ctx.strokeStyle = '#4ef';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (!flipped) {
        ctx.moveTo(px, by + th);
        ctx.lineTo(px, py - 2);
      } else {
        ctx.moveTo(px, by);
        ctx.lineTo(px, py + ts + 2);
      }
      ctx.stroke();
      ctx.restore();

      // Text — split-flap scramble
      ctx.save();
      ctx.globalAlpha = 0.9 * alpha;
      TextFX.render(ctx, thought.text, thought.timer, bx + 8, by + 7, {
        color: '#4ef', dimColor: '#1a4040', size: 11,
        duration: 60, charDelay: 6, flicker: 25
      });
      ctx.restore();

      // [SPACE] dismiss hint after typing done
      if (thought.done && thought.life > 1500) {
        ctx.save();
        ctx.globalAlpha = 0.2 * alpha;
        FA.draw.text('[SPC]', bx + tw - 35, by + 9, { color: '#4ef', size: 8 });
        ctx.restore();
      }

      // Scan lines
      ctx.save();
      ctx.globalAlpha = 0.04 * alpha;
      ctx.fillStyle = '#000';
      for (var sl = by; sl < by + th; sl += 2) {
        ctx.fillRect(bx, sl, tw, 1);
      }
      ctx.restore();
    }, 26);

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

      // Messages (color-coded)
      var msgs = state.messages;
      for (var i = 0; i < msgs.length; i++) {
        var msg = msgs[i];
        FA.draw.text(msg.text || msg, 8, uiY + 50 + i * 10, { color: msg.color || colors.dim, size: 10 });
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

      FA.draw.pushAlpha(0.8);
      FA.draw.rect(0, 0, W, uiY, '#000');
      FA.draw.popAlpha();

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

    // === CUTSCENE ===
    FA.addLayer('cutscene', function() {
      var state = FA.getState();
      if (state.screen !== 'cutscene' || !state.cutscene) return;

      var cs = state.cutscene;
      var ctx = FA.getCtx();

      // Dark background
      FA.draw.clear('#040810');

      // Scan lines
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.globalAlpha = 0.12;
      for (var sy = 0; sy < H; sy += 3) {
        ctx.fillRect(0, sy, W, 1);
      }
      ctx.restore();

      // Subtle screen flicker
      var now = Date.now();
      if (Math.random() > 0.95) {
        ctx.save();
        ctx.globalAlpha = 0.015;
        ctx.fillStyle = cs.color;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // Per-line split-flap scramble
      var lineH = 24;
      var totalLines = cs.lines.length;
      var startY = Math.max(50, Math.floor((H - totalLines * lineH) / 2) - 20);
      var ld = cs.lineDelay || 200;
      var scrambleOpts = { duration: 100, charDelay: 8, flicker: 30 };

      for (var i = 0; i < totalLines; i++) {
        var lineElapsed = cs.timer - i * ld;
        if (lineElapsed <= 0) continue;

        var lineDone = lineElapsed >= TextFX.totalTime(cs.lines[i], scrambleOpts);
        var lineY = startY + i * lineH;

        // Dim completed lines that are old
        ctx.save();
        if (lineDone && cs.timer - (i * ld + TextFX.totalTime(cs.lines[i], scrambleOpts)) > 400) {
          ctx.globalAlpha = 0.6;
        }
        TextFX.render(ctx, cs.lines[i], lineElapsed, 80, lineY, {
          color: cs.color, dimColor: '#1a4a4a', size: 15,
          duration: scrambleOpts.duration, charDelay: scrambleOpts.charDelay,
          flicker: scrambleOpts.flicker
        });
        ctx.restore();
      }

      // "Press SPACE" prompt when done
      if (cs.done) {
        if (Math.floor(now / 600) % 2 === 0) {
          FA.draw.text('[ SPACE ]', W / 2, H - 45, { color: '#445', size: 14, align: 'center', baseline: 'middle' });
        }
      }

      // Top and bottom border accents
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = cs.color;
      ctx.fillRect(0, 0, W, 1);
      ctx.fillRect(0, H - 1, W, 1);
      ctx.restore();
    }, 50);
  }

  window.Render = { setup: setupLayers };
})();
