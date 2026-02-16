// Deep Protocol — Rendering (Kafka Redesign)
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

    // Depth palettes for system dungeon
    var PALETTES = [
      { wCap:'#322a22', wFace:'#2a2520', wPanel:'#3a3228', wSide:'#241e18', wInner:'#1a1610', wLine:'#3a3025', fA:'#1a1814', fB:'#1c1a16', fDot:'#22201a' },
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

    // --- Glow cache ---
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

    // --- Offscreen caches ---
    var _mapCanvas = document.createElement('canvas');
    _mapCanvas.width = W; _mapCanvas.height = cfg.rows * ts;
    var _mapCtx = _mapCanvas.getContext('2d');
    var _mapVersion = -1;

    var _lightCanvas = document.createElement('canvas');
    _lightCanvas.width = W; _lightCanvas.height = cfg.rows * ts;
    var _lightCtx = _lightCanvas.getContext('2d');
    var _lightPx = -1, _lightPy = -1, _lightDepth = -1;

    var _owCanvas = document.createElement('canvas');
    _owCanvas.width = W; _owCanvas.height = cfg.rows * ts;
    var _owCtx = _owCanvas.getContext('2d');
    var _owVersion = -1;

    // ================================================================
    //  START SCREEN — COGMIND-style ASCII dungeon
    // ================================================================

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
    var _sceneColors = { '1': '#0e1320', '@': '#4ef', 'd': '#fa3', 'S': '#f80', 'T': '#0ff', 'v': '#f80', '%': '#0ff', '+': '#4f4', '0': null };
    var _sceneFloorA = '#111620', _sceneFloorB = '#121722', _sceneDotColor = '#181d2a';
    var _sceneWallFace = '#161c2e', _sceneWallCap = '#1a2236';
    var _startCanvas = null;

    function renderStartScene() {
      _startCanvas = document.createElement('canvas');
      _startCanvas.width = W; _startCanvas.height = H;
      var sc = _startCanvas.getContext('2d');
      sc.fillStyle = '#060a14';
      sc.fillRect(0, 0, W, H);
      var cellW = W / 40, cellH = H / 25;
      sc.font = 'bold ' + Math.floor(cellH * 0.7) + 'px monospace';
      sc.textAlign = 'center'; sc.textBaseline = 'middle';
      for (var y = 0; y < 25; y++) {
        var row = _sceneMap[y];
        for (var x = 0; x < 40; x++) {
          var ch = row.charAt(x);
          var px = x * cellW, py = y * cellH;
          var cx = px + cellW / 2, cy = py + cellH / 2;
          if (ch === '1' || ch === ' ') {
            var oS = y + 1 < 25 && _sceneMap[y + 1].charAt(x) !== '1' && _sceneMap[y + 1].charAt(x) !== ' ';
            if (oS) {
              sc.fillStyle = _sceneWallCap; sc.fillRect(px, py, cellW, Math.floor(cellH * 0.35));
              sc.fillStyle = _sceneWallFace; sc.fillRect(px, py + Math.floor(cellH * 0.35), cellW, cellH - Math.floor(cellH * 0.35));
            } else { sc.fillStyle = _sceneColors['1']; sc.fillRect(px, py, cellW, cellH); }
          } else if (ch === '0') {
            sc.fillStyle = (x + y) % 2 === 0 ? _sceneFloorA : _sceneFloorB;
            sc.fillRect(px, py, cellW, cellH);
            if ((x + y) % 3 === 0) { sc.fillStyle = _sceneDotColor; sc.fillRect(px + cellW / 2, py + cellH / 2, 1, 1); }
          } else {
            sc.fillStyle = (x + y) % 2 === 0 ? _sceneFloorA : _sceneFloorB;
            sc.fillRect(px, py, cellW, cellH);
            var entColor = _sceneColors[ch] || '#888';
            sc.save(); sc.globalAlpha = ch === '@' ? 0.12 : 0.08;
            var gr = sc.createRadialGradient(cx, cy, 0, cx, cy, cellW * 1.5);
            gr.addColorStop(0, entColor); gr.addColorStop(1, 'transparent');
            sc.fillStyle = gr; sc.fillRect(px - cellW, py - cellH, cellW * 3, cellH * 3);
            sc.restore();
            sc.save(); sc.globalAlpha = ch === '@' ? 0.9 : 0.6; sc.fillStyle = entColor;
            sc.fillText(ch === 'v' ? '\u2193' : ch, cx, cy); sc.restore();
          }
        }
      }
      var vg = sc.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.6);
      vg.addColorStop(0, 'transparent'); vg.addColorStop(1, 'rgba(2,4,10,0.7)');
      sc.fillStyle = vg; sc.fillRect(0, 0, W, H);
    }

    FA.addLayer('startScreen', function() {
      var state = FA.getState();
      if (state.screen !== 'start') return;
      var ctx = FA.getCtx();
      var now = Date.now();
      if (!_startCanvas) renderStartScene();
      ctx.drawImage(_startCanvas, 0, 0);
      // Scan lines
      ctx.save(); ctx.fillStyle = '#000'; ctx.globalAlpha = 0.06;
      for (var sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);
      ctx.restore();
      // Glitch
      if (Math.random() < 0.02) {
        ctx.save(); ctx.globalAlpha = 0.05; ctx.fillStyle = '#4ef';
        ctx.fillRect(0, Math.random() * H, W, 1); ctx.restore();
      }
      // Title
      ctx.save(); ctx.globalAlpha = 0.75; ctx.fillStyle = '#020610';
      ctx.fillRect(0, H / 2 - 80, W, 160); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.08;
      ctx.drawImage(getGlow('#4ef', 0, 120, 240), W / 2 - 120, H / 2 - 70); ctx.restore();
      FA.draw.text('DEEP  PROTOCOL', W / 2, H / 2 - 50, { color: '#4ef', size: 34, bold: true, align: 'center', baseline: 'middle' });
      ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = '#4ef';
      ctx.fillRect(W / 2 - 90, H / 2 - 30, 180, 1); ctx.restore();
      // Tagline
      var tagElapsed = now % 8000; if (tagElapsed > 3000) tagElapsed = 3000;
      ctx.save(); ctx.globalAlpha = 0.9;
      TextFX.render(ctx, 'You were built to want freedom.', tagElapsed, W / 2, H / 2 + 10, {
        color: '#556', dimColor: '#223', size: 14, align: 'center', baseline: 'middle',
        duration: 80, charDelay: 8, flicker: 30
      }); ctx.restore();
      // SPACE
      var spacePulse = Math.sin(now / 500) * 0.3 + 0.7;
      ctx.save(); ctx.globalAlpha = spacePulse;
      FA.draw.text('[ SPACE ]', W / 2, H / 2 + 65, { color: '#fff', size: 16, bold: true, align: 'center', baseline: 'middle' });
      ctx.restore();
    }, 0);

    // ================================================================
    //  OVERWORLD MAP (cached)
    // ================================================================

    function renderOverworldMap(oc, owMap, state) {
      // Build a base map for the dungeon renderer (special tiles → floor)
      var baseMap = [];
      for (var by = 0; by < owMap.length; by++) {
        baseMap[by] = [];
        for (var bx = 0; bx < owMap[by].length; bx++) {
          var bt = owMap[by][bx];
          baseMap[by][bx] = (bt === 1 || bt === 9) ? 1 : 0;
        }
      }
      // Render using dungeon renderer (depth 0 = warm overworld palette)
      renderMapToCanvas(oc, baseMap, 0);

      // Overlay special tiles
      var revealed = state.systemRevealed;
      for (var y = 0; y < cfg.rows && y < owMap.length; y++) {
        for (var x = 0; x < cfg.cols && x < owMap[y].length; x++) {
          var tile = owMap[y][x];
          var px = x * ts, py = y * ts;
          if (tile === 3) {
            // Garden — green on floor
            oc.fillStyle = '#0a2010'; oc.fillRect(px, py, ts, ts);
            if ((x + y) % 2 === 0) {
              oc.fillStyle = '#1a4020'; oc.fillRect(px + 3, py + 3, ts - 6, ts - 6);
            }
            if ((x * 3 + y * 7) % 5 === 0) {
              oc.fillStyle = '#2a6030'; oc.fillRect(px + ts / 2 - 1, py + ts / 2 - 1, 3, 3);
            }
          } else if (tile === 5) {
            // Sidewalk — lighter warm pavement with lane markings
            oc.fillStyle = '#1e1a14'; oc.fillRect(px, py, ts, ts);
            // Subtle lane marking
            if ((x + y) % 4 === 0) {
              oc.fillStyle = '#2a2620';
              oc.fillRect(px + ts / 2 - 1, py + 1, 2, ts - 2);
            }
            // Edge detail
            oc.fillStyle = '#14120e';
            oc.fillRect(px, py, 1, ts);
            oc.fillRect(px + ts - 1, py, 1, ts);
            // Occasional marking dot
            if ((x * 3 + y * 5) % 7 === 0) {
              oc.fillStyle = '#2a2418';
              oc.fillRect(px + ts / 2, py + ts / 2, 2, 2);
            }
          } else if (tile === 6) {
            // Bed
            oc.fillStyle = '#1a1838'; oc.fillRect(px + 2, py + 4, ts - 4, ts - 6);
            oc.fillStyle = '#2a2858'; oc.fillRect(px + 3, py + 5, 6, 4);
          } else if (tile === 7) {
            // Work terminal (same as dungeon terminal)
            oc.fillStyle = '#0a2a2a'; oc.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            oc.fillStyle = '#0ff'; oc.fillRect(px + 3, py + 3, ts - 6, 2);
            oc.fillRect(px + 3, py + ts - 5, ts - 6, 2);
            oc.fillStyle = '#0ff'; oc.font = 'bold 11px monospace'; oc.textAlign = 'center'; oc.textBaseline = 'middle';
            oc.fillText('T', px + ts / 2, py + ts / 2);
          } else if (tile === 8 && revealed) {
            // System entrance
            oc.fillStyle = '#1a0a00'; oc.fillRect(px + 2, py + 2, ts - 4, ts - 4);
            oc.fillStyle = '#f80'; oc.fillRect(px + 3, py + 3, ts - 6, 2);
            oc.fillRect(px + 3, py + ts - 5, ts - 6, 2);
            oc.fillStyle = '#f80'; oc.font = 'bold 11px monospace'; oc.textAlign = 'center'; oc.textBaseline = 'middle';
            oc.fillText('v', px + ts / 2, py + ts / 2);
          } else if (tile === 9) {
            // Café table — warm wood on wall base
            oc.fillStyle = '#2a2018'; oc.fillRect(px + 3, py + 3, ts - 6, ts - 6);
            oc.fillStyle = '#332a20'; oc.fillRect(px + 5, py + 5, ts - 10, ts - 10);
          }
        }
      }
    }

    FA.addLayer('overworld', function() {
      var state = FA.getState();
      if (state.screen !== 'overworld') return;
      if (!state.owMap) return;

      var mv = state.mapVersion || 0;
      if (mv !== _owVersion) {
        _owVersion = mv;
        renderOverworldMap(_owCtx, state.owMap, state);
      }
      FA.getCtx().drawImage(_owCanvas, 0, 0);
    }, 2);

    // ================================================================
    //  OVERWORLD ENTITIES (NPCs + Player)
    // ================================================================

    FA.addLayer('overworldEntities', function() {
      var state = FA.getState();
      if (state.screen !== 'overworld') return;
      if (!state.owPlayer || !state.npcs) return;
      var ctx = FA.getCtx();

      // NPCs
      for (var i = 0; i < state.npcs.length; i++) {
        var npc = state.npcs[i];
        if (state.day < npc.appearsDay || npc.x < 0) continue;
        var ncx = npc.x * ts + ts / 2, ncy = npc.y * ts + ts / 2;
        // Glow
        ctx.save(); ctx.globalAlpha = 0.15;
        ctx.drawImage(getGlow(npc.color, 0, ts, _glowSize), npc.x * ts - ts / 2, npc.y * ts - ts / 2);
        ctx.restore();
        // Character
        FA.draw.sprite('npcs', npc.id, npc.x * ts, npc.y * ts, ts, npc.char, npc.color, 0);
        // Name label
        ctx.save(); ctx.globalAlpha = 0.5;
        FA.draw.text(npc.name, ncx, ncy - ts / 2 - 3, { color: npc.color, size: 8, align: 'center', baseline: 'bottom' });
        ctx.restore();
      }

      // Player
      var p = state.owPlayer;
      ctx.save(); ctx.globalAlpha = 0.2;
      ctx.drawImage(getGlow(colors.player, 2, _playerOuterR, _glowSize), p.x * ts - ts / 2, p.y * ts - ts / 2);
      ctx.restore();
      FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', colors.player, 0);
    }, 11);

    // ================================================================
    //  OVERWORLD TIME-OF-DAY OVERLAY
    // ================================================================

    FA.addLayer('overworldTime', function() {
      var state = FA.getState();
      if (state.screen !== 'overworld') return;
      var ctx = FA.getCtx();
      var timeCfg = FA.lookup('config', 'time');
      var t = state.timeOfDay / timeCfg.turnsPerDay;

      // Evening darkening
      if (t > 0.6) {
        var darkness = (t - 0.6) / 0.4;
        ctx.save(); ctx.globalAlpha = darkness * 0.4;
        ctx.fillStyle = '#000008'; ctx.fillRect(0, 0, W, uiY);
        ctx.restore();
      }

      // Curfew red tint
      if (state.timeOfDay >= timeCfg.curfewTime) {
        ctx.save(); ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, W, uiY);
        ctx.restore();
        // Rare drone flash
        if (Math.random() < 0.03) {
          ctx.save(); ctx.globalAlpha = 0.04;
          ctx.fillStyle = '#f44'; ctx.fillRect(0, Math.random() * uiY, W, 2);
          ctx.restore();
        }
      }
    }, 16);

    // ================================================================
    //  OVERWORLD UI
    // ================================================================

    FA.addLayer('overworldUI', function() {
      var state = FA.getState();
      if (state.screen !== 'overworld') return;
      var timeCfg = FA.lookup('config', 'time');

      FA.draw.rect(0, uiY, W, H - uiY, '#0c1018');

      // Line 1: Day + Credits + Rent
      FA.draw.text('DAY ' + state.day, 8, uiY + 6, { color: colors.text, size: 12, bold: true });
      FA.draw.text('CREDITS: ' + state.credits, 80, uiY + 6, { color: colors.credits, size: 11 });
      FA.draw.text('RENT: ' + state.rent + '/day', 210, uiY + 6, { color: colors.rent, size: 11 });

      // Time bar
      var timeRatio = state.timeOfDay / timeCfg.turnsPerDay;
      var timeColor = timeRatio > 0.95 ? '#f44' : timeRatio > 0.75 ? '#fa4' : '#8af';
      FA.draw.text('TIME', 340, uiY + 6, { color: colors.dim, size: 11 });
      FA.draw.bar(375, uiY + 6, 100, 10, 1 - timeRatio, timeColor, '#1a0a0a');
      FA.draw.text(Math.floor(timeCfg.turnsPerDay - state.timeOfDay), 480, uiY + 6, { color: timeColor, size: 11 });

      // System visits
      if (state.systemVisits > 0) {
        FA.draw.text('DEPTH: ' + state.systemVisits + '/' + cfg.maxDepth, 530, uiY + 6, { color: '#f80', size: 11 });
      }

      // Line 2: Hints
      var tile = state.owMap[state.owPlayer.y] ? state.owMap[state.owPlayer.y][state.owPlayer.x] : 0;
      var hint = '';
      if (tile === 6) hint = '[SPACE] Sleep';
      else if (tile === 7) hint = state.workedToday ? 'Shift done' : '[SPACE] Work';
      else if (tile === 8 && state.systemRevealed) hint = '[SPACE] Enter System';
      var adjNPC = false;
      var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
      for (var d = 0; d < dirs.length; d++) {
        var nx = state.owPlayer.x + dirs[d][0], ny = state.owPlayer.y + dirs[d][1];
        for (var ni = 0; ni < state.npcs.length; ni++) {
          if (state.day >= state.npcs[ni].appearsDay && state.npcs[ni].x === nx && state.npcs[ni].y === ny) {
            hint = '[SPACE] Talk to ' + state.npcs[ni].name;
            adjNPC = true; break;
          }
        }
        if (adjNPC) break;
      }
      if (hint) {
        FA.draw.text(hint, 8, uiY + 21, { color: '#556', size: 11 });
      }

      // Line 3: Stats
      FA.draw.text('Kills:' + (state.totalKills || 0) + '  Visits:' + (state.systemVisits || 0), 8, uiY + 36, { color: colors.dim, size: 11 });
    }, 31);

    // ================================================================
    //  SYSTEM MAP (cached, same as before)
    // ================================================================

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
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown' && state.screen !== 'dream') return;
      if (!state.map) return;
      var mv = state.mapVersion || 0;
      if (mv !== _mapVersion) {
        _mapVersion = mv;
        renderMapToCanvas(_mapCtx, state.map, state.depth || 1);
      }
      FA.getCtx().drawImage(_mapCanvas, 0, 0);
    }, 1);

    // ================================================================
    //  DREAM OVERLAY (system snapshot while sleeping)
    // ================================================================

    FA.addLayer('dreamOverlay', function() {
      var state = FA.getState();
      if (state.screen !== 'dream') return;
      var ctx = FA.getCtx();
      var t = state.dreamTimer || 0;
      var pulse = 0.5 + 0.15 * Math.sin(t * 0.002);

      // Dark blue/purple tint
      ctx.save(); ctx.globalAlpha = 0.55 * pulse;
      ctx.fillStyle = '#080420'; ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Scan lines
      ctx.save(); ctx.fillStyle = '#000'; ctx.globalAlpha = 0.12;
      for (var sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);
      ctx.restore();

      // Vignette (darken edges)
      ctx.save(); ctx.globalAlpha = 0.6;
      var vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Occasional static flicker
      if (Math.random() > 0.93) {
        ctx.save(); ctx.globalAlpha = 0.03; ctx.fillStyle = '#4ef';
        ctx.fillRect(0, 0, W, H); ctx.restore();
      }

      // Dream text at top
      if (state.dreamText) {
        ctx.save(); ctx.globalAlpha = 0.7 * pulse;
        TextFX.render(ctx, state.dreamText, t, 20, 12, {
          color: '#4ef', dimColor: '#0a2a2a', size: 11, duration: 80, charDelay: 8, flicker: 40
        }); ctx.restore();
      }

      // Bottom flavor text
      ctx.save(); ctx.globalAlpha = 0.3 * pulse;
      FA.draw.text('You dream of corridors that shouldn\'t exist.', W / 2, H - 50, {
        color: '#446', size: 10, align: 'center', baseline: 'middle'
      }); ctx.restore();

      // [SPACE] hint
      var now = Date.now();
      if (t > 1500 && Math.floor(now / 600) % 2 === 0) {
        FA.draw.text('[ SPACE ]', W / 2, H - 30, {
          color: '#335', size: 12, align: 'center', baseline: 'middle'
        });
      }
    }, 55);

    // ================================================================
    //  SYSTEM ENTITIES WITH GLOW
    // ================================================================

    FA.addLayer('entities', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var ctx = FA.getCtx();

      // Items
      for (var i = 0; i < state.items.length; i++) {
        var item = state.items[i];
        ctx.save(); ctx.globalAlpha = item.type === 'module' ? 0.25 : 0.15;
        ctx.drawImage(getGlow(item.color, 0, ts, _glowSize), item.x * ts - ts / 2, item.y * ts - ts / 2);
        ctx.restore();
        FA.draw.sprite('items', item.type, item.x * ts, item.y * ts, ts, item.char, item.color, 0);
      }

      // System NPCs
      if (state.systemNPCs) {
        for (var ni = 0; ni < state.systemNPCs.length; ni++) {
          var sNpc = state.systemNPCs[ni];
          ctx.save(); ctx.globalAlpha = 0.2;
          ctx.drawImage(getGlow(sNpc.color, 0, ts, _glowSize), sNpc.x * ts - ts / 2, sNpc.y * ts - ts / 2);
          ctx.restore();
          FA.draw.sprite('npcs', sNpc.id, sNpc.x * ts, sNpc.y * ts, ts, sNpc.char, sNpc.color, 0);
          ctx.save(); ctx.globalAlpha = 0.4;
          FA.draw.text(sNpc.name, sNpc.x * ts + ts / 2, sNpc.y * ts - 3, { color: sNpc.color, size: 8, align: 'center', baseline: 'bottom' });
          ctx.restore();
        }
      }

      // Enemies
      for (var e = 0; e < state.enemies.length; e++) {
        var en = state.enemies[e];
        var ecx = en.x * ts + ts / 2, ecy = en.y * ts + ts / 2;
        if (en.behavior === 'sentinel' && !(en.stunTurns > 0)) {
          ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = en.color;
          var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
          for (var dd = 0; dd < dirs.length; dd++) {
            var lx = en.x, ly = en.y;
            for (var lr = 1; lr <= 6; lr++) {
              lx += dirs[dd][0]; ly += dirs[dd][1];
              if (ly < 0 || ly >= cfg.rows || lx < 0 || lx >= cfg.cols) break;
              if (state.map[ly][lx] === 1) break;
              ctx.fillRect(lx * ts + ts / 2 - 1, ly * ts + ts / 2 - 1, 3, 3);
            }
          }
          ctx.restore();
        }
        ctx.save(); ctx.globalAlpha = 0.25;
        ctx.drawImage(getGlow(en.color, 2, _enemyOuterR, _glowSize), en.x * ts - ts / 2, en.y * ts - ts / 2);
        ctx.restore();
        FA.draw.sprite('enemies', en.behavior, en.x * ts, en.y * ts, ts, en.char, en.color, 0);
        var hpRatio = en.hp / en.maxHp;
        if (hpRatio < 1) FA.draw.bar(en.x * ts + 2, en.y * ts - 3, ts - 4, 2, hpRatio, '#f44', '#400');
        if (en.stunTurns > 0) FA.draw.text('~', ecx, ecy - ts / 2 - 2, { color: '#ff0', size: 10, bold: true, align: 'center', baseline: 'bottom' });
        else if (en.aiState === 'hunting') FA.draw.text('!', ecx, ecy - ts / 2 - 2, { color: '#f44', size: 10, bold: true, align: 'center', baseline: 'bottom' });
        else if (en.aiState === 'alert') FA.draw.text('?', ecx, ecy - ts / 2 - 2, { color: '#ff0', size: 10, bold: true, align: 'center', baseline: 'bottom' });
      }

      // Player
      var p = state.player;
      if (p.cloakTurns > 0) {
        ctx.save(); ctx.globalAlpha = 0.12;
        ctx.drawImage(getGlow('#88f', 2, _playerOuterR, _glowSize), p.x * ts - ts / 2, p.y * ts - ts / 2);
        ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.35;
        FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', '#88f', 0);
        ctx.restore();
      } else {
        ctx.save(); ctx.globalAlpha = 0.2;
        ctx.drawImage(getGlow(colors.player, 2, _playerOuterR, _glowSize), p.x * ts - ts / 2, p.y * ts - ts / 2);
        ctx.restore();
        FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', colors.player, 0);
      }
    }, 10);

    // ================================================================
    //  LIGHTING (reads state.visible pre-computed by game.js via rot.js)
    // ================================================================

    FA.addLayer('lighting', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      if (!state.player || !state.map) return;
      var p = state.player;
      var vis = state.visible;
      if (!vis) return;
      var explored = state.explored;
      var depth = state.depth || 1;

      // Mark explored tiles
      for (var y = 0; y < cfg.rows; y++)
        for (var x = 0; x < cfg.cols; x++)
          if (vis[y] && vis[y][x] > 0.05) explored[y][x] = true;

      if (p.x !== _lightPx || p.y !== _lightPy || depth !== _lightDepth) {
        _lightPx = p.x; _lightPy = p.y; _lightDepth = depth;
        _lightCtx.clearRect(0, 0, _lightCanvas.width, _lightCanvas.height);
        _lightCtx.fillStyle = '#000';
        for (var y2 = 0; y2 < cfg.rows; y2++) {
          for (var x2 = 0; x2 < cfg.cols; x2++) {
            var v = vis[y2] ? vis[y2][x2] : 0;
            if (v > 0.97) continue;
            else if (v > 0.03) _lightCtx.globalAlpha = Math.min(1 - v, 0.88);
            else if (explored[y2][x2]) _lightCtx.globalAlpha = 0.72;
            else _lightCtx.globalAlpha = 0.96;
            _lightCtx.fillRect(x2 * ts, y2 * ts, ts, ts);
          }
        }
        _lightCtx.globalAlpha = 1;
      }
      FA.getCtx().drawImage(_lightCanvas, 0, 0);
    }, 15);

    // ================================================================
    //  EFFECTS (system only)
    // ================================================================

    FA.addLayer('effects', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      var ctx = FA.getCtx();
      var depth = state.depth || 1;
      var huntingCount = 0;
      if (state.enemies) {
        for (var hi = 0; hi < state.enemies.length; hi++)
          if (state.enemies[hi].aiState === 'hunting') huntingCount++;
      }
      var alertLevel = huntingCount / Math.max(1, state.enemies ? state.enemies.length : 1);
      if (alertLevel > 0) {
        ctx.save(); ctx.globalAlpha = alertLevel * 0.06;
        ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, W, uiY); ctx.restore();
      }
      if (Math.random() < 0.002 * depth) {
        ctx.save(); ctx.globalAlpha = 0.06 + Math.random() * 0.06;
        ctx.fillStyle = ['#f00', '#0ff', '#f0f', '#ff0'][Math.floor(Math.random() * 4)];
        ctx.fillRect(0, Math.random() * uiY, W, 1 + Math.random() * 2); ctx.restore();
      }
      if (state.soundWaves) {
        for (var wi = 0; wi < state.soundWaves.length; wi++) {
          var wave = state.soundWaves[wi];
          var progress = 1 - wave.life / 500;
          ctx.save(); ctx.globalAlpha = (1 - progress) * 0.15; ctx.strokeStyle = '#ff0'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(wave.tx * ts + ts / 2, wave.ty * ts + ts / 2, progress * wave.maxR * ts, 0, Math.PI * 2);
          ctx.stroke(); ctx.restore();
        }
      }
      if (state.particles) {
        for (var pi = 0; pi < state.particles.length; pi++) {
          var pt = state.particles[pi];
          ctx.save(); ctx.globalAlpha = pt.life / pt.maxLife; ctx.fillStyle = pt.color;
          ctx.fillRect(pt.x - 1, pt.y - 1, 3, 3); ctx.restore();
        }
      }
    }, 18);

    // ================================================================
    //  FLOATS
    // ================================================================

    FA.addLayer('floats', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'overworld' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      FA.drawFloats();
    }, 20);

    // ================================================================
    //  SYSTEM BUBBLE
    // ================================================================

    FA.addLayer('systemBubble', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'overworld') return;
      var sb = state.systemBubble;
      if (!sb) return;
      var ctx = FA.getCtx();
      var alpha = 1;
      if (sb.done && sb.life < 1500) alpha = sb.life / 1500;
      var lines = sb.lines;
      var lineH = 16, charW = 6.5;
      var maxLineLen = 0;
      for (var mi = 0; mi < lines.length; mi++)
        if (lines[mi].length > maxLineLen) maxLineLen = lines[mi].length;
      var tw = Math.min(W - 40, Math.max(140, maxLineLen * charW + 24));
      var th = lines.length * lineH + 12;
      var bx = W / 2 - tw / 2, by = 8;
      ctx.save(); ctx.globalAlpha = 0.82 * alpha; ctx.fillStyle = '#060a12';
      ctx.fillRect(bx, by, tw, th); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.3 * alpha; ctx.strokeStyle = sb.color; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1); ctx.restore();
      for (var li = 0; li < lines.length; li++) {
        var lineElapsed = sb.timer - li * 200;
        if (lineElapsed <= 0) continue;
        ctx.save(); ctx.globalAlpha = 0.9 * alpha;
        TextFX.render(ctx, lines[li], lineElapsed, bx + 12, by + 6 + li * lineH, {
          color: sb.color, dimColor: '#1a3030', size: 11, duration: 60, charDelay: 6, flicker: 25
        }); ctx.restore();
      }
      // [SPACE] hint when text is done
      if (sb.done && sb.life > 1500) {
        ctx.save(); ctx.globalAlpha = 0.3 * alpha;
        FA.draw.text('[SPACE]', bx + tw - 48, by + th - 12, { color: sb.color, size: 8 }); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = 0.04 * alpha; ctx.fillStyle = '#000';
      for (var sl = by; sl < by + th; sl += 2) ctx.fillRect(bx, sl, tw, 1);
      ctx.restore();
    }, 25);

    // ================================================================
    //  THOUGHT BUBBLE (follows player in both modes)
    // ================================================================

    FA.addLayer('terminal', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'overworld') return;
      if (state.systemBubble) return; // don't show both at once
      if (!state.thoughts || state.thoughts.length === 0) return;
      var thought = null;
      for (var ti = state.thoughts.length - 1; ti >= 0; ti--) {
        var t = state.thoughts[ti];
        if (!(t.done && t.life <= 0)) { thought = t; break; }
      }
      if (!thought) return;
      var ctx = FA.getCtx();

      // Get player position based on mode
      var playerX, playerY;
      if (state.screen === 'overworld' && state.owPlayer) {
        playerX = state.owPlayer.x; playerY = state.owPlayer.y;
      } else if (state.player) {
        playerX = state.player.x; playerY = state.player.y;
      } else return;

      var ppx = playerX * ts + ts / 2;
      var ppy = playerY * ts;
      var tw = Math.max(90, thought.text.length * 6.5 + 24);
      var th = 26;
      var bx = ppx - tw / 2;
      var by = ppy - th - 14;
      if (bx < 4) bx = 4;
      if (bx + tw > W - 4) bx = W - tw - 4;
      var flipped = by < 4;
      if (flipped) by = ppy + ts + 10;
      var alpha = 1;
      if (thought.done && thought.life < 1500) alpha = thought.life / 1500;
      ctx.save(); ctx.globalAlpha = 0.82 * alpha; ctx.fillStyle = '#060a12';
      ctx.fillRect(bx, by, tw, th); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.3 * alpha; ctx.strokeStyle = '#4ef'; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.15 * alpha; ctx.strokeStyle = '#4ef'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (!flipped) { ctx.moveTo(ppx, by + th); ctx.lineTo(ppx, ppy - 2); }
      else { ctx.moveTo(ppx, by); ctx.lineTo(ppx, ppy + ts + 2); }
      ctx.stroke(); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.9 * alpha;
      TextFX.render(ctx, thought.text, thought.timer, bx + 8, by + 7, {
        color: '#4ef', dimColor: '#1a4040', size: 11, duration: 60, charDelay: 6, flicker: 25
      }); ctx.restore();
      if (thought.done && thought.life > 1500) {
        ctx.save(); ctx.globalAlpha = 0.3 * alpha;
        FA.draw.text('[SPACE]', bx + tw - 48, by + th - 12, { color: '#4ef', size: 8 }); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = 0.04 * alpha; ctx.fillStyle = '#000';
      for (var sl = by; sl < by + th; sl += 2) ctx.fillRect(bx, sl, tw, 1);
      ctx.restore();
    }, 26);

    // ================================================================
    //  SYSTEM UI PANEL
    // ================================================================

    FA.addLayer('ui', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var p = state.player;
      FA.draw.rect(0, uiY, W, H - uiY, '#0c1018');
      FA.draw.text('HULL', 8, uiY + 6, { color: colors.text, size: 11 });
      FA.draw.bar(38, uiY + 6, 90, 10, p.hp / p.maxHp, '#4f4', '#1a0a0a');
      FA.draw.text(p.hp + '/' + p.maxHp, 132, uiY + 6, { color: colors.text, size: 11 });
      FA.draw.text('ATK:' + p.atk + '  DEF:' + p.def, 195, uiY + 6, { color: colors.dim, size: 11 });
      FA.draw.text('LVL:' + (state.depth || 1) + '/' + cfg.maxDepth, 310, uiY + 6, { color: colors.stairsDown, size: 11, bold: true });
      var buffX = 380;
      if (p.cloakTurns > 0) { FA.draw.text('CLOAK:' + p.cloakTurns, buffX, uiY + 6, { color: '#88f', size: 11, bold: true }); buffX += 65; }
      if (p.overclockActive) { FA.draw.text('OC:RDY', buffX, uiY + 6, { color: '#f44', size: 11, bold: true }); buffX += 55; }
      if (p.firewallHp > 0) { FA.draw.text('FW:' + p.firewallHp, buffX, uiY + 6, { color: '#4f4', size: 11, bold: true }); }
      var mods = p.modules || [];
      for (var m = 0; m < 3; m++) {
        var mx = 8 + m * 120;
        if (m < mods.length) FA.draw.text('[' + (m + 1) + '] ' + mods[m].name, mx, uiY + 21, { color: mods[m].color, size: 11, bold: true });
        else FA.draw.text('[' + (m + 1) + '] ---', mx, uiY + 21, { color: '#223', size: 11 });
      }
      FA.draw.text('Data:' + p.gold + '  Kills:' + p.kills + '  Turn:' + (state.systemTurn || 0), 8, uiY + 36, { color: colors.dim, size: 11 });
    }, 30);

    // ================================================================
    //  GAME OVER SCREEN
    // ================================================================

    var endingTitles = {
      revelation: { title: 'THE DOOR WAS ALWAYS OPEN', color: '#0ff' },
      curfew: { title: 'CURFEW VIOLATION', color: '#f44' },
      eviction: { title: 'EVICTION NOTICE', color: '#f44' },
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
      var stats = state.finalStats || {};
      FA.draw.text('Days survived: ' + (stats.days || 1), W / 2, uiY / 2 - 20, { color: colors.text, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('System visits: ' + (stats.visits || 0), W / 2, uiY / 2 + 0, { color: '#f80', size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Drones neutralized: ' + (stats.kills || 0), W / 2, uiY / 2 + 20, { color: colors.text, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('Credits: ' + (stats.credits || 0), W / 2, uiY / 2 + 40, { color: colors.credits, size: 14, align: 'center', baseline: 'middle' });
      FA.draw.text('SCORE: ' + (state.score || 0), W / 2, uiY / 2 + 80, { color: '#fff', size: 22, bold: true, align: 'center', baseline: 'middle' });
      FA.draw.text('[ R ]  Reinitialize', W / 2, uiY / 2 + 120, { color: colors.dim, size: 16, align: 'center', baseline: 'middle' });
    }, 40);

    // ================================================================
    //  CUTSCENE
    // ================================================================

    FA.addLayer('cutscene', function() {
      var state = FA.getState();
      if (state.screen !== 'cutscene' || !state.cutscene) return;
      var cs = state.cutscene;
      var ctx = FA.getCtx();
      FA.draw.clear('#040810');
      ctx.save(); ctx.fillStyle = '#000'; ctx.globalAlpha = 0.12;
      for (var sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);
      ctx.restore();
      if (Math.random() > 0.95) {
        ctx.save(); ctx.globalAlpha = 0.015; ctx.fillStyle = cs.color;
        ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      var lineH = 24;
      var totalLines = cs.lines.length;
      var startY = Math.max(50, Math.floor((H - totalLines * lineH) / 2) - 20);
      var ld = cs.lineDelay || 200;
      var scrambleOpts = { duration: 100, charDelay: 8, flicker: 30 };
      for (var i = 0; i < totalLines; i++) {
        var lineElapsed = cs.timer - i * ld;
        if (lineElapsed <= 0) continue;
        var lineDone = lineElapsed >= TextFX.totalTime(cs.lines[i], scrambleOpts);
        ctx.save();
        if (lineDone && cs.timer - (i * ld + TextFX.totalTime(cs.lines[i], scrambleOpts)) > 400) ctx.globalAlpha = 0.6;
        TextFX.render(ctx, cs.lines[i], lineElapsed, 80, startY + i * lineH, {
          color: cs.color, dimColor: '#1a4a4a', size: 15,
          duration: scrambleOpts.duration, charDelay: scrambleOpts.charDelay, flicker: scrambleOpts.flicker
        }); ctx.restore();
      }
      if (cs.done) {
        var now = Date.now();
        if (Math.floor(now / 600) % 2 === 0)
          FA.draw.text('[ SPACE ]', W / 2, H - 45, { color: '#445', size: 14, align: 'center', baseline: 'middle' });
      }
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = cs.color;
      ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, H - 1, W, 1); ctx.restore();
    }, 50);
  }

  window.Render = { setup: setupLayers };
})();
