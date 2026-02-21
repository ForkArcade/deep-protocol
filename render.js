// Deep Protocol — Rendering (Unified World)
// One map layer, one entity layer, conditional lighting — works on any map
(function() {
  'use strict';
  var FA = window.FA;

  // Object pool for FA.draw.text opts — zero allocations per frame
  var _o = {};
  function O(color, size, bold, align, baseline) {
    _o.color = color; _o.size = size; _o.bold = !!bold;
    _o.align = align || 'left'; _o.baseline = baseline || 'top';
    return _o;
  }

  function setupLayers() {
    var cfg = FA.lookup('config', 'game');
    var colors = FA.lookup('config', 'colors');
    var ts = cfg.tileSize;
    var W = cfg.canvasWidth;
    var H = cfg.canvasHeight;
    var uiY = cfg.rows * ts;

    // === TILE HELPERS ===

    var OW_TILE_NAMES = ['floor', 'wall', 'indoor', 'garden', 'sidewalk'];

    function isWall(map, x, y) {
      if (x < 0 || x >= cfg.cols || y < 0 || y >= cfg.rows) return true;
      var t = map[y][x];
      return t === 1 || t === 9;
    }

    function wallFrame(map, x, y) {
      var mask = 0;
      if (!isWall(map, x, y - 1)) mask |= 1;
      if (!isWall(map, x, y + 1)) mask |= 2;
      if (!isWall(map, x + 1, y)) mask |= 4;
      if (!isWall(map, x - 1, y)) mask |= 8;
      return mask;
    }

    // === GLOW CACHE ===

    var _glitchColors = ['#f00', '#0ff', '#f0f', '#ff0'];
    var _sentinelDirs = [[1,0],[-1,0],[0,1],[0,-1]];
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

    // === OFFSCREEN CACHES ===

    var _mapCanvas = document.createElement('canvas');
    _mapCanvas.width = W; _mapCanvas.height = cfg.rows * ts;
    var _mapCtx = _mapCanvas.getContext('2d');
    var _mapVersion = -1;

    var _lightCanvas = document.createElement('canvas');
    _lightCanvas.width = W; _lightCanvas.height = cfg.rows * ts;
    var _lightCtx = _lightCanvas.getContext('2d');
    var _lightCacheKey = '';
    var _lightImageData = null;

    // ================================================================
    //  START SCREEN
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
    var _startFx = { color: '#556', dimColor: '#223', size: 14, align: 'center', baseline: 'middle', duration: 80, charDelay: 8, flicker: 30 };

    // Precomputed scanline overlay — avoids ~167 fillRect calls per frame
    var _scanlineCanvas = document.createElement('canvas');
    _scanlineCanvas.width = W; _scanlineCanvas.height = H;
    var _slCtx = _scanlineCanvas.getContext('2d');
    _slCtx.fillStyle = '#000';
    for (var _sy = 0; _sy < H; _sy += 3) _slCtx.fillRect(0, _sy, W, 1);
    Render.scanlineCanvas = _scanlineCanvas;

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
      ctx.globalAlpha = 0.06;
      ctx.drawImage(_scanlineCanvas, 0, 0);
      if (Math.random() < 0.02) {
        ctx.globalAlpha = 0.05; ctx.fillStyle = '#4ef';
        ctx.fillRect(0, Math.random() * H, W, 1);
      }
      ctx.globalAlpha = 0.75; ctx.fillStyle = '#020610';
      ctx.fillRect(0, H / 2 - 80, W, 160);
      ctx.globalAlpha = 0.08;
      ctx.drawImage(getGlow('#4ef', 0, 120, 240), W / 2 - 120, H / 2 - 70);
      ctx.globalAlpha = 1;
      FA.draw.text('DEEP  PROTOCOL', W / 2, H / 2 - 50, O('#4ef', 34, true, 'center', 'middle'));
      ctx.globalAlpha = 0.15; ctx.fillStyle = '#4ef';
      ctx.fillRect(W / 2 - 90, H / 2 - 30, 180, 1);
      var tagElapsed = now % 8000; if (tagElapsed > 3000) tagElapsed = 3000;
      ctx.globalAlpha = 0.9;
      TextFX.render(ctx, 'You were built to want freedom.', tagElapsed, W / 2, H / 2 + 10, _startFx);
      var spacePulse = Math.sin(now / 500) * 0.3 + 0.7;
      ctx.globalAlpha = spacePulse;
      FA.draw.text('[ SPACE ]', W / 2, H / 2 + 65, O('#fff', 16, true, 'center', 'middle'));
      ctx.globalAlpha = 1;
    }, 0);

    // ================================================================
    //  UNIFIED MAP RENDERING (to offscreen canvas)
    // ================================================================

    function renderMap(oc, map, tilesetName, state) {
      oc.clearRect(0, 0, oc.canvas.width, oc.canvas.height);

      for (var y = 0; y < cfg.rows && y < map.length; y++) {
        for (var x = 0; x < cfg.cols && x < map[y].length; x++) {
          var tid = map[y][x];
          var px = x * ts, py = y * ts;

          // Blocking placeholder → floor
          if (tid === 9) tid = 0;

          // Resolve sprite name + frame based on tileset
          var spriteName, frame = 0, spriteCategory;
          if (tilesetName === 'overworld') {
            spriteName = OW_TILE_NAMES[tid];
            if (tid === 1) frame = wallFrame(map, x, y);
            else if (tid === 0 || tid === 2) frame = (x + y) % 2;
          } else {
            // Dungeon tileset: dungeon_d{N}_floor, dungeon_d{N}_wall, etc.
            if (tid === 0) { spriteName = tilesetName + '_floor'; frame = (x + y) % 2; }
            else if (tid === 1) { spriteName = tilesetName + '_wall'; frame = wallFrame(map, x, y); }
            else if (tid === 3) { spriteName = 'dungeon_stairs'; spriteCategory = 'objects'; }
            else if (tid === 4) { spriteName = 'dungeon_terminal'; spriteCategory = 'objects'; frame = 0; }
            else if (tid === 5) { spriteName = 'dungeon_terminal'; spriteCategory = 'objects'; frame = 1; }
          }

          var sprite = spriteName ? getSprite(spriteCategory || 'tiles', spriteName) : null;
          if (!sprite) {
            oc.fillStyle = '#222';
            oc.fillRect(px, py, ts, ts);
            continue;
          }
          drawSprite(oc, sprite, px, py, ts, frame);
        }
      }

      // Objects (on any map that has them)
      var mapData = state ? state.maps[state.mapId] : null;
      var objects = mapData ? mapData.objects : null;
      if (objects) {
        for (var oi = 0; oi < objects.length; oi++) {
          var obj = objects[oi];
          if (obj.type === 'system_entrance' && !(state && state.systemRevealed)) continue;
          var objSprite = getSprite('objects', obj.type);
          if (objSprite) drawSprite(oc, objSprite, obj.x * ts, obj.y * ts, ts, 0);
        }
      }
    }

    // ================================================================
    //  MAP LAYER
    // ================================================================

    FA.addLayer('map', function() {
      var state = FA.getState();
      if (state.screen === 'start' || state.screen === 'cutscene') return;

      // Dream: render with dungeon tileset
      if (state.screen === 'dream') {
        if (!state.dreamMap) return;
        var dmv = state.mapVersion || 0;
        if (dmv !== _mapVersion) {
          _mapVersion = dmv;
          renderMap(_mapCtx, state.dreamMap, 'dungeon_d' + (state.dreamDepth || 1), null);
        }
        FA.getCtx().drawImage(_mapCanvas, 0, 0);
        return;
      }

      if (!state.map || !state.maps) return;
      var mv = state.mapVersion || 0;
      if (mv !== _mapVersion) {
        _mapVersion = mv;
        var tilesetName = Location.tileset(state.mapId) || 'overworld';
        renderMap(_mapCtx, state.map, tilesetName, state);
      }
      FA.getCtx().drawImage(_mapCanvas, 0, 0);
    }, 1);

    // ================================================================
    //  DREAM OVERLAY
    // ================================================================

    var _dreamVignette = (function() {
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      var dc = c.getContext('2d');
      var vg = dc.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,1)');
      dc.fillStyle = vg; dc.fillRect(0, 0, W, H);
      return c;
    })();
    var _dreamFx = {};

    FA.addLayer('dreamOverlay', function() {
      var state = FA.getState();
      if (state.screen !== 'dream') return;
      var ctx = FA.getCtx();
      var t = state.dreamTimer || 0;
      var pulse = 0.5 + 0.15 * Math.sin(t * 0.002);

      ctx.globalAlpha = 0.55 * pulse;
      ctx.fillStyle = '#080420'; ctx.fillRect(0, 0, W, H);

      ctx.globalAlpha = 0.12;
      ctx.drawImage(_scanlineCanvas, 0, 0);

      ctx.globalAlpha = 0.6;
      ctx.drawImage(_dreamVignette, 0, 0);

      if (Math.random() > 0.93) {
        ctx.globalAlpha = 0.03; ctx.fillStyle = '#4ef';
        ctx.fillRect(0, 0, W, H);
      }

      if (state.dreamText) {
        ctx.globalAlpha = 0.7 * pulse;
        _dreamFx.color = '#4ef'; _dreamFx.dimColor = '#0a2a2a'; _dreamFx.size = 11;
        _dreamFx.duration = 80; _dreamFx.charDelay = 8; _dreamFx.flicker = 40;
        TextFX.render(ctx, state.dreamText, t, 20, 12, _dreamFx);
      }

      ctx.globalAlpha = 0.3 * pulse;
      FA.draw.text('You dream of corridors that shouldn\'t exist.', W / 2, H - 50,
        O('#446', 10, false, 'center', 'middle'));
      ctx.globalAlpha = 1;

      var now = Date.now();
      if (t > 1500 && Math.floor(now / 600) % 2 === 0) {
        FA.draw.text('[ SPACE ]', W / 2, H - 30,
          O('#335', 12, false, 'center', 'middle'));
      }
    }, 55);

    // ================================================================
    //  UNIFIED ENTITIES (Items + All Entity Types + Player)
    // ================================================================

    FA.addLayer('entities', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player || !state.maps || !state.maps[state.mapId]) return;
      var ctx = FA.getCtx();
      var mapData = state.maps[state.mapId];

      // --- Items ---
      var items = mapData.items || [];
      for (var ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        ctx.globalAlpha = item.type === 'module' ? 0.25 : 0.15;
        ctx.drawImage(getGlow(item.color, 0, ts, _glowSize), item.x * ts - ts / 2, item.y * ts - ts / 2);
        ctx.globalAlpha = 1;
        FA.draw.sprite('items', item.type, item.x * ts, item.y * ts, ts, item.char, item.color, 0);
      }

      // --- Entities (NPCs, system NPCs, enemies) ---
      var entities = mapData.entities;
      for (var i = 0; i < entities.length; i++) {
        var e = entities[i];

        if (e.type === 'npc') {
          if (state.day < e.appearsDay || e.x < 0) continue;
          var ncx = e.x * ts + ts / 2, ncy = e.y * ts + ts / 2;
          ctx.globalAlpha = 0.15;
          ctx.drawImage(getGlow(e.color, 0, ts, _glowSize), e.x * ts - ts / 2, e.y * ts - ts / 2);
          ctx.globalAlpha = 1;
          FA.draw.sprite('npcs', e.id, e.x * ts, e.y * ts, ts, e.char, e.color, 0);
          ctx.globalAlpha = 0.5;
          FA.draw.text(e.name, ncx, ncy - ts / 2 - 3, O(e.color, 8, false, 'center', 'bottom'));
          ctx.globalAlpha = 1;

        } else if (e.type === 'system_npc') {
          ctx.globalAlpha = 0.2;
          ctx.drawImage(getGlow(e.color, 0, ts, _glowSize), e.x * ts - ts / 2, e.y * ts - ts / 2);
          ctx.globalAlpha = 1;
          FA.draw.sprite('npcs', e.id, e.x * ts, e.y * ts, ts, e.char, e.color, 0);
          ctx.globalAlpha = 0.4;
          FA.draw.text(e.name, e.x * ts + ts / 2, e.y * ts - 3, O(e.color, 8, false, 'center', 'bottom'));
          ctx.globalAlpha = 1;

        } else if (e.type === 'enemy') {
          var ecx = e.x * ts + ts / 2, ecy = e.y * ts + ts / 2;

          // Sentinel scan beams
          if (e.behavior === 'sentinel' && !(e.stunTurns > 0)) {
            ctx.globalAlpha = 0.12; ctx.fillStyle = e.color;
            for (var dd = 0; dd < _sentinelDirs.length; dd++) {
              var lx = e.x, ly = e.y;
              for (var lr = 1; lr <= 6; lr++) {
                lx += _sentinelDirs[dd][0]; ly += _sentinelDirs[dd][1];
                if (ly < 0 || ly >= cfg.rows || lx < 0 || lx >= cfg.cols) break;
                if (state.map[ly][lx] === 1) break;
                ctx.fillRect(lx * ts + ts / 2 - 1, ly * ts + ts / 2 - 1, 3, 3);
              }
            }
            ctx.globalAlpha = 1;
          }

          ctx.globalAlpha = 0.25;
          ctx.drawImage(getGlow(e.color, 2, _enemyOuterR, _glowSize), e.x * ts - ts / 2, e.y * ts - ts / 2);
          ctx.globalAlpha = 1;
          FA.draw.sprite('enemies', e.behavior, e.x * ts, e.y * ts, ts, e.char, e.color, 0);

          var hpRatio = e.hp / e.maxHp;
          if (hpRatio < 1) FA.draw.bar(e.x * ts + 2, e.y * ts - 3, ts - 4, 2, hpRatio, '#f44', '#400');

          if (e.stunTurns > 0) FA.draw.text('~', ecx, ecy - ts / 2 - 2, O('#ff0', 10, true, 'center', 'bottom'));
          else if (e.aiState === 'hunting') FA.draw.text('!', ecx, ecy - ts / 2 - 2, O('#f44', 10, true, 'center', 'bottom'));
          else if (e.aiState === 'alert') FA.draw.text('?', ecx, ecy - ts / 2 - 2, O('#ff0', 10, true, 'center', 'bottom'));
        }
      }

      // --- Player ---
      var p = state.player;
      if (p.cloakTurns > 0) {
        ctx.globalAlpha = 0.12;
        ctx.drawImage(getGlow('#88f', 2, _playerOuterR, _glowSize), p.x * ts - ts / 2, p.y * ts - ts / 2);
        ctx.globalAlpha = 0.35;
        FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', '#88f', 0);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.2;
        ctx.drawImage(getGlow(colors.player, 2, _playerOuterR, _glowSize), p.x * ts - ts / 2, p.y * ts - ts / 2);
        ctx.globalAlpha = 1;
        FA.draw.sprite('player', 'base', p.x * ts, p.y * ts, ts, '@', colors.player, 0);
      }
    }, 10);

    // ================================================================
    //  LIGHTING (town: time-of-day, dungeon: FOV)
    // ================================================================

    // ================================================================
    //  EFFECT REGISTRY — named effects, applied per-map via mapData.effects[]
    // ================================================================

    var EFFECTS = {
      // Progressive darkness based on time of day
      timeOfDay: function(ctx, state) {
        var timeCfg = FA.lookup('config', 'time');
        var t = state.timeOfDay / timeCfg.turnsPerDay;
        if (t > 0.6) {
          var darkness = (t - 0.6) / 0.4;
          ctx.globalAlpha = darkness * 0.4;
          ctx.fillStyle = '#000008'; ctx.fillRect(0, 0, W, uiY);
          ctx.globalAlpha = 1;
        }
      },

      // Curfew — pulsing siren + smoke patches (offscreen to avoid composite mode switching)
      curfew: (function() {
        var _curfewCanvas = document.createElement('canvas');
        _curfewCanvas.width = W; _curfewCanvas.height = uiY;
        var _cc = _curfewCanvas.getContext('2d');
        var _lastSmokeT = -1;
        return function(ctx, state) {
          var timeCfg = FA.lookup('config', 'time');
          if (state.timeOfDay < timeCfg.warningTime) return;
          var t = Math.min(1, (state.timeOfDay - timeCfg.warningTime) / (timeCfg.curfewTime - timeCfg.warningTime));
          if (t !== _lastSmokeT) {
            _lastSmokeT = t;
            _cc.clearRect(0, 0, W, uiY);
            _cc.fillStyle = '#f00';
            _cc.globalAlpha = t * 0.25;
            _cc.fillRect(0, 0, W, uiY);
            var smokeCount = Math.floor(t * 8);
            _cc.fillStyle = '#f10';
            for (var ni = 0; ni < smokeCount; ni++) {
              _cc.globalAlpha = t * (0.03 + Math.random() * 0.06);
              _cc.fillRect(Math.random() * W, Math.random() * uiY, 30 + Math.random() * 60, 10 + Math.random() * 25);
            }
            _cc.globalAlpha = 1;
          }
          var pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.002);
          ctx.globalAlpha = pulse;
          ctx.drawImage(_curfewCanvas, 0, 0);
          ctx.globalAlpha = 1;
        };
      })(),

      // Deep system corruption — subtle purple noise
      corruption: function(ctx, state) {
        var depth = state.depth || 1;
        if (depth < 3) return;
        var intensity = (depth - 2) * 0.01;
        if (Math.random() < 0.05) {
          ctx.globalAlpha = intensity;
          ctx.fillStyle = '#208';
          ctx.fillRect(0, Math.random() * uiY, W, 1);
          ctx.globalAlpha = 1;
        }
      },

      // Cold blue ambient for system levels
      systemCold: function(ctx) {
        ctx.globalAlpha = 0.03;
        ctx.fillStyle = '#004'; ctx.fillRect(0, 0, W, uiY);
        ctx.globalAlpha = 1;
      }
    };

    // === LIGHT SOURCES ===
    var _lsVer = -1, _lsMapId = '', _lsList = [];
    var _lightsCfg = null;

    function collectLights(state) {
      var mv = state.mapVersion || 0;
      if (mv === _lsVer && state.mapId === _lsMapId) return _lsList;
      _lsVer = mv; _lsMapId = state.mapId; _lsList = [];
      if (!_lightsCfg) _lightsCfg = FA.lookup('config', 'lights');
      if (!_lightsCfg) return _lsList;
      var mapData = state.maps[state.mapId], objs = mapData ? mapData.objects : null;
      if (_lightsCfg.objects && objs) {
        for (var i = 0; i < objs.length; i++) {
          var ld = _lightsCfg.objects[objs[i].type];
          if (ld && !(objs[i].type === 'system_entrance' && !state.systemRevealed))
            _lsList.push({ x: objs[i].x, y: objs[i].y, r: ld.radius, c: ld.color });
        }
      }
      if (_lightsCfg.tiles && state.map) {
        for (var y = 0; y < cfg.rows; y++)
          for (var x = 0; x < cfg.cols; x++) {
            var td = _lightsCfg.tiles[state.map[y][x]];
            if (td) _lsList.push({ x: x, y: y, r: td.radius, c: td.color });
          }
      }
      return _lsList;
    }

    var _slVer = -1, _slMapId = '', _slMap = null;

    function computeStaticLights(state) {
      var mv = state.mapVersion || 0;
      if (mv === _slVer && state.mapId === _slMapId) return _slMap;
      _slVer = mv; _slMapId = state.mapId;
      var rows = cfg.rows, cols = cfg.cols;
      if (!_slMap) {
        _slMap = [];
        for (var y = 0; y < rows; y++) _slMap[y] = new Array(cols);
      }
      for (var y2 = 0; y2 < rows; y2++)
        for (var x2 = 0; x2 < cols; x2++) _slMap[y2][x2] = 0;
      var lights = collectLights(state);
      if (lights.length === 0 || !state.map) return _slMap;
      var map = state.map;
      var fov = new ROT.FOV.PreciseShadowcasting(function(x, y) {
        if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
        return map[y][x] !== 1;
      });
      for (var li = 0; li < lights.length; li++) {
        var l = lights[li], lr = l.r;
        fov.compute(l.x, l.y, Math.ceil(lr), function(x, y, dist) {
          if (x < 0 || x >= cols || y < 0 || y >= rows) return;
          var val = Math.max(0, 0.6 * (1 - dist / lr));
          if (val > _slMap[y][x]) _slMap[y][x] = val;
        });
      }
      return _slMap;
    }

    FA.addLayer('lighting', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      if (!state.player || !state.map) return;
      var ctx = FA.getCtx();
      var p = state.player;
      var vis = state.visible;
      var mapData = state.maps[state.mapId];
      var explored = mapData ? mapData.explored : null;

      // FOV + static lights — combined lighting
      if (vis && explored) {
        var slMap = computeStaticLights(state);
        for (var y = 0; y < cfg.rows; y++)
          for (var x = 0; x < cfg.cols; x++)
            if ((vis[y] && vis[y][x] > 0.05) || slMap[y][x] > 0.05) explored[y][x] = true;

        var cacheKey = p.x + ',' + p.y + ',' + (state.depth || 0) + ',' + state.mapId + ',' + (state.mapVersion || 0);
        if (cacheKey !== _lightCacheKey) {
          _lightCacheKey = cacheKey;
          // Use ImageData instead of 1000 fillRect calls
          var lw = cfg.cols * ts, lh = cfg.rows * ts;
          if (!_lightImageData || _lightImageData.width !== lw) {
            _lightImageData = _lightCtx.createImageData(lw, lh);
          }
          var ld = _lightImageData.data;
          for (var y2 = 0; y2 < cfg.rows; y2++) {
            for (var x2 = 0; x2 < cfg.cols; x2++) {
              var v = vis[y2] ? vis[y2][x2] : 0;
              var sv = slMap[y2][x2];
              if (sv > v) v = sv;
              var alpha;
              if (v > 0.97) alpha = 0;
              else if (v > 0.03) alpha = Math.min(1 - v, 0.88) * 255 | 0;
              else if (explored[y2][x2]) alpha = 184; // 0.72 * 255
              else alpha = 245; // 0.96 * 255
              // Fill tile block in ImageData
              var bx = x2 * ts, by = y2 * ts;
              for (var py = by; py < by + ts; py++) {
                var rowOff = py * lw * 4 + bx * 4;
                for (var px = 0; px < ts; px++) {
                  var off = rowOff + px * 4;
                  ld[off + 3] = alpha; // r,g,b stay 0 (black)
                }
              }
            }
          }
          _lightCtx.putImageData(_lightImageData, 0, 0);
        }
        ctx.drawImage(_lightCanvas, 0, 0);
      }

      // Apply map effects from data
      var fx = mapData ? mapData.effects : null;
      if (fx) {
        for (var i = 0; i < fx.length; i++) {
          var fn = EFFECTS[fx[i]];
          if (fn) fn(ctx, state);
        }
      }

    }, 15);

    // ================================================================
    //  EFFECTS (alert glow, scanlines, sound waves, particles)
    // ================================================================

    FA.addLayer('effects', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      var ctx = FA.getCtx();

      // Count hunting enemies for alert overlay
      var entities = state.maps && state.maps[state.mapId] ? state.maps[state.mapId].entities : [];
      var enemyCount = 0, huntingCount = 0;
      for (var hi = 0; hi < entities.length; hi++) {
        if (entities[hi].type === 'enemy') {
          enemyCount++;
          if (entities[hi].aiState === 'hunting') huntingCount++;
        }
      }
      var alertLevel = huntingCount / Math.max(1, enemyCount);
      if (alertLevel > 0) {
        ctx.globalAlpha = alertLevel * 0.06;
        ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, W, uiY);
        ctx.globalAlpha = 1;
      }

      // Depth-based scanlines (dungeon only)
      var depth = state.depth || 0;
      if (depth > 0 && Math.random() < 0.002 * depth) {
        ctx.globalAlpha = 0.06 + Math.random() * 0.06;
        ctx.fillStyle = _glitchColors[Math.floor(Math.random() * 4)];
        ctx.fillRect(0, Math.random() * uiY, W, 1 + Math.random() * 2);
        ctx.globalAlpha = 1;
      }

      // Sound waves
      if (state.soundWaves) {
        ctx.strokeStyle = '#ff0'; ctx.lineWidth = 1;
        for (var wi = 0; wi < state.soundWaves.length; wi++) {
          var wave = state.soundWaves[wi];
          var progress = 1 - wave.life / 500;
          ctx.globalAlpha = (1 - progress) * 0.15;
          ctx.beginPath(); ctx.arc(wave.tx * ts + ts / 2, wave.ty * ts + ts / 2, progress * wave.maxR * ts, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Kill particles
      if (state.particles) {
        for (var pi = 0; pi < state.particles.length; pi++) {
          var pt = state.particles[pi];
          ctx.globalAlpha = pt.life / pt.maxLife; ctx.fillStyle = pt.color;
          ctx.fillRect(pt.x - 1, pt.y - 1, 3, 3);
        }
        ctx.globalAlpha = 1;
      }
    }, 18);

    // ================================================================
    //  FLOATS
    // ================================================================

    FA.addLayer('floats', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      FA.drawFloats();
    }, 20);
  }

  window.Render = { setup: setupLayers, scanlineCanvas: null };
})();
