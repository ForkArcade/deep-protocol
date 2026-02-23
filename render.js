// Deep Protocol — Rendering (Unified World)
// One map layer, one entity layer, conditional lighting — works on any map
// Responsive: reads actual canvas size, scales tileSize dynamically
(function() {
  'use strict';
  var FA = window.FA;
  var cfg = FA.lookup('config', 'game');
  var colors = FA.lookup('config', 'colors');

  // Object pool for FA.draw.text opts — zero allocations per frame
  var _o = {};
  function O(color, size, bold, align, baseline) {
    _o.color = color; _o.size = size; _o.bold = !!bold;
    _o.align = align || 'left'; _o.baseline = baseline || 'top';
    return _o;
  }

  function setupLayers() {

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
      var key = color + '_' + innerR + '_' + outerR + '_' + size;
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

    // === OFFSCREEN CACHES (resized dynamically) ===

    var _mapCanvas = document.createElement('canvas');
    var _mapCtx = _mapCanvas.getContext('2d');
    var _mapVersion = -1;
    var _mapTs = 0; // track tile size changes

    var _lightCanvas = document.createElement('canvas');
    var _lightCtx = _lightCanvas.getContext('2d');
    var _lightCacheKey = '';
    var _lightImageData = null;
    var _lightTs = 0;

    function ensureMapCanvas(L) {
      if (_mapCanvas.width !== L.mapW || _mapCanvas.height !== L.mapH) {
        _mapCanvas.width = L.mapW;
        _mapCanvas.height = L.mapH;
        _mapVersion = -1; // force re-render
      }
    }

    function ensureLightCanvas(L) {
      if (_lightCanvas.width !== L.mapW || _lightCanvas.height !== L.mapH) {
        _lightCanvas.width = L.mapW;
        _lightCanvas.height = L.mapH;
        _lightCacheKey = '';
        _lightImageData = null;
      }
    }

    // === SCANLINE OVERLAY (rebuilt on resize) ===

    var _scanlineCanvas = document.createElement('canvas');
    var _scanW = 0, _scanH = 0;

    function ensureScanlines(W, H) {
      if (W === _scanW && H === _scanH) return;
      _scanW = W; _scanH = H;
      _scanlineCanvas.width = W; _scanlineCanvas.height = H;
      var sc = _scanlineCanvas.getContext('2d');
      sc.clearRect(0, 0, W, H);
      sc.fillStyle = '#000';
      for (var sy = 0; sy < H; sy += 3) sc.fillRect(0, sy, W, 1);
      Render.scanlineCanvas = _scanlineCanvas;
    }

    var _startCanvas = null;
    var _startW = 0, _startH = 0;
    var _startFx = { color: '#556', dimColor: '#223', size: 14, align: 'center', baseline: 'middle', duration: 80, charDelay: 8, flicker: 30 };

    // Invalidate start canvas when spritesheet loads so it re-renders with real sprites
    if (FA.assets.spritesheet) FA.assets.spritesheet.addEventListener('load', function() { _startCanvas = null; });

    function renderStartScene(W, H) {
      _startCanvas = document.createElement('canvas');
      _startCanvas.width = W; _startCanvas.height = H;
      _startW = W; _startH = H;
      var sc = _startCanvas.getContext('2d');
      sc.fillStyle = '#060a14';
      sc.fillRect(0, 0, W, H);

      // Render real overworld map
      var grid = getMapGrid('overworld');
      if (grid) {
        var ts = Math.floor(Math.min(W / cfg.cols, H / cfg.rows));
        var ox = Math.floor((W - cfg.cols * ts) / 2);
        var oy = Math.floor((H - cfg.rows * ts) / 2);
        sc.save();
        sc.translate(ox, oy);
        renderMap(sc, grid, 'overworld', null, ts);
        // Draw objects (except system_entrance — secret)
        var objects = getMapObjects('overworld');
        for (var oi = 0; oi < objects.length; oi++) {
          var obj = objects[oi];
          if (obj.type === 'system_entrance') continue;
          var objSprite = getSprite('objects', obj.type);
          if (objSprite) drawSprite(sc, objSprite, obj.x * ts, obj.y * ts, ts, 0);
        }
        sc.restore();
      }

      // Vignette overlay
      var vg = sc.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.6);
      vg.addColorStop(0, 'transparent'); vg.addColorStop(1, 'rgba(2,4,10,0.7)');
      sc.fillStyle = vg; sc.fillRect(0, 0, W, H);
    }

    FA.addLayer('startScreen', function() {
      var state = FA.getState();
      if (state.screen !== 'start') return;
      var L = getLayout();
      var W = L.W, H = L.H;
      var ctx = FA.getCtx();
      var now = Date.now();
      ensureScanlines(W, H);
      if (!_startCanvas || _startW !== W || _startH !== H) renderStartScene(W, H);
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

    function renderMap(oc, map, tilesetName, state, ts) {
      oc.clearRect(0, 0, oc.canvas.width, oc.canvas.height);

      for (var y = 0; y < cfg.rows && y < map.length; y++) {
        for (var x = 0; x < cfg.cols && x < map[y].length; x++) {
          var tid = map[y][x];
          var px = x * ts, py = y * ts;

          // Blocking placeholder → floor
          if (tid === 9) tid = 0;

          // Resolve sprite name based on tileset
          var spriteName, spriteCategory;
          if (tilesetName === 'overworld') {
            spriteName = OW_TILE_NAMES[tid];
          } else {
            if (tid === 0) spriteName = 'dungeon_floor';
            else if (tid === 1) spriteName = 'dungeon_wall';
            else if (tid === 3) { spriteName = 'dungeon_stairs'; spriteCategory = 'objects'; }
            else if (tid === 4) { spriteName = 'dungeon_terminal'; spriteCategory = 'objects'; }
            else if (tid === 5) { spriteName = 'dungeon_terminal'; spriteCategory = 'objects'; }
          }

          var sprite = spriteName ? getSprite(spriteCategory || 'tiles', spriteName) : null;
          if (!sprite) {
            oc.fillStyle = '#222';
            oc.fillRect(px, py, ts, ts);
            continue;
          }
          // Frame from tiling method
          var frame = 0;
          if (sprite.tiling === 'autotile') frame = wallFrame(map, x, y);
          else if (sprite.tiling === 'checker') frame = (x + y) % 2;
          if (tid === 5) frame = 1; // terminal used state
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

    FA.addLayer('map', function() {
      var state = FA.getState();
      if (state.screen === 'start' || state.screen === 'cutscene') return;
      var L = getLayout();
      var ts = L.ts;
      ensureMapCanvas(L);

      // Dream: render with dungeon tileset
      if (state.screen === 'dream') {
        if (!state.dreamMap) return;
        var dmv = state.mapVersion || 0;
        if (dmv !== _mapVersion || ts !== _mapTs) {
          _mapVersion = dmv; _mapTs = ts;
          renderMap(_mapCtx, state.dreamMap, 'dungeon', null, ts);
        }
        FA.getCtx().drawImage(_mapCanvas, L.ox, L.oy);
        return;
      }

      if (!state.map || !state.maps) return;
      var mv = state.mapVersion || 0;
      if (mv !== _mapVersion || ts !== _mapTs) {
        _mapVersion = mv; _mapTs = ts;
        var tilesetName = Location.tileset(state.mapId) || 'overworld';
        renderMap(_mapCtx, state.map, tilesetName, state, ts);
      }
      FA.getCtx().drawImage(_mapCanvas, L.ox, L.oy);
    }, 1);

    var _dreamVignette = null;
    var _dvW = 0, _dvH = 0;
    function ensureDreamVignette(W, H) {
      if (W === _dvW && H === _dvH && _dreamVignette) return;
      _dvW = W; _dvH = H;
      _dreamVignette = document.createElement('canvas');
      _dreamVignette.width = W; _dreamVignette.height = H;
      var dc = _dreamVignette.getContext('2d');
      var vg = dc.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,1)');
      dc.fillStyle = vg; dc.fillRect(0, 0, W, H);
    }
    var _dreamFx = {};

    FA.addLayer('dreamOverlay', function() {
      var state = FA.getState();
      if (state.screen !== 'dream') return;
      var L = getLayout();
      var W = L.W, H = L.H;
      var ctx = FA.getCtx();
      var t = state.dreamTimer || 0;
      var pulse = 0.5 + 0.15 * Math.sin(t * 0.002);

      ensureScanlines(W, H);
      ensureDreamVignette(W, H);

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

    FA.addLayer('entities', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player || !state.maps || !state.maps[state.mapId]) return;
      var L = getLayout();
      var ts = L.ts, ox = L.ox, oy = L.oy;
      var glowSize = ts * 2;
      var enemyOuterR = Math.floor(ts * 1.2);
      var playerOuterR = Math.floor(ts * 1.3);
      var ctx = FA.getCtx();
      var mapData = state.maps[state.mapId];

      // --- Items ---
      var items = mapData.items || [];
      for (var ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        ctx.globalAlpha = item.type === 'module' ? 0.25 : 0.15;
        ctx.drawImage(getGlow(item.color, 0, ts, glowSize), ox + item.x * ts - ts / 2, oy + item.y * ts - ts / 2);
        ctx.globalAlpha = 1;
        FA.draw.sprite('items', item.type, ox + item.x * ts, oy + item.y * ts, ts, item.char, item.color, 0);
      }

      // --- Entities (NPCs, system NPCs, enemies) ---
      var entities = mapData.entities;
      for (var i = 0; i < entities.length; i++) {
        var e = entities[i];

        if (e.type === 'npc') {
          if (state.day < e.appearsDay || e.x < 0) continue;
          var ncx = ox + e.x * ts + ts / 2, ncy = oy + e.y * ts + ts / 2;
          ctx.globalAlpha = 0.15;
          ctx.drawImage(getGlow(e.color, 0, ts, glowSize), ox + e.x * ts - ts / 2, oy + e.y * ts - ts / 2);
          ctx.globalAlpha = 1;
          FA.draw.sprite('npcs', e.id, ox + e.x * ts, oy + e.y * ts, ts, e.char, e.color, 0);
          ctx.globalAlpha = 0.5;
          FA.draw.text(e.name, ncx, ncy - ts / 2 - 3, O(e.color, 8, false, 'center', 'bottom'));
          ctx.globalAlpha = 1;

        } else if (e.type === 'system_npc') {
          ctx.globalAlpha = 0.2;
          ctx.drawImage(getGlow(e.color, 0, ts, glowSize), ox + e.x * ts - ts / 2, oy + e.y * ts - ts / 2);
          ctx.globalAlpha = 1;
          FA.draw.sprite('npcs', e.id, ox + e.x * ts, oy + e.y * ts, ts, e.char, e.color, 0);
          ctx.globalAlpha = 0.4;
          FA.draw.text(e.name, ox + e.x * ts + ts / 2, oy + e.y * ts - 3, O(e.color, 8, false, 'center', 'bottom'));
          ctx.globalAlpha = 1;

        } else if (e.type === 'enemy') {
          var ecx = ox + e.x * ts + ts / 2, ecy = oy + e.y * ts + ts / 2;

          // Sentinel scan beams
          if (e.behavior === 'sentinel' && !(e.stunTurns > 0)) {
            ctx.globalAlpha = 0.12; ctx.fillStyle = e.color;
            for (var dd = 0; dd < _sentinelDirs.length; dd++) {
              var lx = e.x, ly = e.y;
              for (var lr = 1; lr <= 6; lr++) {
                lx += _sentinelDirs[dd][0]; ly += _sentinelDirs[dd][1];
                if (ly < 0 || ly >= cfg.rows || lx < 0 || lx >= cfg.cols) break;
                if (state.map[ly][lx] === 1) break;
                ctx.fillRect(ox + lx * ts + ts / 2 - 1, oy + ly * ts + ts / 2 - 1, 3, 3);
              }
            }
            ctx.globalAlpha = 1;
          }

          ctx.globalAlpha = 0.25;
          ctx.drawImage(getGlow(e.color, 2, enemyOuterR, glowSize), ox + e.x * ts - ts / 2, oy + e.y * ts - ts / 2);
          ctx.globalAlpha = 1;
          FA.draw.sprite('enemies', e.behavior, ox + e.x * ts, oy + e.y * ts, ts, e.char, e.color, 0);

          var hpRatio = e.hp / e.maxHp;
          if (hpRatio < 1) FA.draw.bar(ox + e.x * ts + 2, oy + e.y * ts - 3, ts - 4, 2, hpRatio, '#f44', '#400');

          if (e.stunTurns > 0) FA.draw.text('~', ecx, ecy - ts / 2 - 2, O('#ff0', 10, true, 'center', 'bottom'));
          else if (e.aiState === 'hunting') FA.draw.text('!', ecx, ecy - ts / 2 - 2, O('#f44', 10, true, 'center', 'bottom'));
          else if (e.aiState === 'alert') FA.draw.text('?', ecx, ecy - ts / 2 - 2, O('#ff0', 10, true, 'center', 'bottom'));
        }
      }

      // --- Player ---
      var p = state.player;
      if (p.cloakTurns > 0) {
        ctx.globalAlpha = 0.12;
        ctx.drawImage(getGlow('#88f', 2, playerOuterR, glowSize), ox + p.x * ts - ts / 2, oy + p.y * ts - ts / 2);
        ctx.globalAlpha = 0.35;
        FA.draw.sprite('player', 'base', ox + p.x * ts, oy + p.y * ts, ts, '@', '#88f', 0);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.2;
        ctx.drawImage(getGlow(colors.player, 2, playerOuterR, glowSize), ox + p.x * ts - ts / 2, oy + p.y * ts - ts / 2);
        ctx.globalAlpha = 1;
        FA.draw.sprite('player', 'base', ox + p.x * ts, oy + p.y * ts, ts, '@', colors.player, 0);
      }
    }, 10);

    var _curfewCanvas = document.createElement('canvas');
    var _cc = _curfewCanvas.getContext('2d');
    var _lastSmokeT = -1;
    var _curfewW = 0, _curfewMapH = 0;

    var EFFECTS = {
      // Progressive darkness based on time of day
      timeOfDay: function(ctx, state) {
        var L = getLayout();
        var timeCfg = FA.lookup('config', 'time');
        var t = state.timeOfDay / timeCfg.turnsPerDay;
        if (t > 0.6) {
          var darkness = (t - 0.6) / 0.4;
          ctx.globalAlpha = darkness * 0.4;
          ctx.fillStyle = '#000008'; ctx.fillRect(L.ox, L.oy, L.mapW, L.mapH);
          ctx.globalAlpha = 1;
        }
      },

      // Curfew — pulsing siren + smoke patches
      curfew: function(ctx, state) {
        var L = getLayout();
        var timeCfg = FA.lookup('config', 'time');
        if (state.timeOfDay < timeCfg.warningTime) return;
        var t = Math.min(1, (state.timeOfDay - timeCfg.warningTime) / (timeCfg.curfewTime - timeCfg.warningTime));
        if (L.mapW !== _curfewW || L.mapH !== _curfewMapH) {
          _curfewW = L.mapW; _curfewMapH = L.mapH;
          _curfewCanvas.width = L.mapW; _curfewCanvas.height = L.mapH;
          _lastSmokeT = -1;
        }
        if (t !== _lastSmokeT) {
          _lastSmokeT = t;
          _cc.clearRect(0, 0, L.mapW, L.mapH);
          _cc.fillStyle = '#f00';
          _cc.globalAlpha = t * 0.25;
          _cc.fillRect(0, 0, L.mapW, L.mapH);
          var smokeCount = Math.floor(t * 8);
          _cc.fillStyle = '#f10';
          for (var ni = 0; ni < smokeCount; ni++) {
            _cc.globalAlpha = t * (0.03 + Math.random() * 0.06);
            _cc.fillRect(Math.random() * L.mapW, Math.random() * L.mapH, 30 + Math.random() * 60, 10 + Math.random() * 25);
          }
          _cc.globalAlpha = 1;
        }
        var pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.002);
        ctx.globalAlpha = pulse;
        ctx.drawImage(_curfewCanvas, L.ox, L.oy);
        ctx.globalAlpha = 1;
      },

      // Deep system corruption — subtle purple noise
      corruption: function(ctx, state) {
        var L = getLayout();
        var depth = state.depth || 1;
        if (depth < 3) return;
        var intensity = (depth - 2) * 0.01;
        if (Math.random() < 0.05) {
          ctx.globalAlpha = intensity;
          ctx.fillStyle = '#208';
          ctx.fillRect(L.ox, L.oy + Math.random() * L.mapH, L.mapW, 1);
          ctx.globalAlpha = 1;
        }
      },

      // Cold blue ambient for system levels
      systemCold: function(ctx) {
        var L = getLayout();
        ctx.globalAlpha = 0.03;
        ctx.fillStyle = '#004'; ctx.fillRect(L.ox, L.oy, L.mapW, L.mapH);
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
      var L = getLayout();
      var ts = L.ts;
      var ctx = FA.getCtx();
      var p = state.player;
      var vis = state.visible;
      var mapData = state.maps[state.mapId];
      var explored = mapData ? mapData.explored : null;

      ensureLightCanvas(L);

      // FOV + static lights — combined lighting
      if (vis && explored) {
        var slMap = computeStaticLights(state);
        for (var y = 0; y < cfg.rows; y++)
          for (var x = 0; x < cfg.cols; x++)
            if ((vis[y] && vis[y][x] > 0.05) || slMap[y][x] > 0.05) explored[y][x] = true;

        var cacheKey = p.x + ',' + p.y + ',' + (state.depth || 0) + ',' + state.mapId + ',' + (state.mapVersion || 0) + ',' + ts;
        if (cacheKey !== _lightCacheKey) {
          _lightCacheKey = cacheKey;
          // Use ImageData instead of 1000 fillRect calls
          var lw = cfg.cols * ts, lh = cfg.rows * ts;
          if (!_lightImageData || _lightImageData.width !== lw || _lightImageData.height !== lh) {
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
        ctx.drawImage(_lightCanvas, L.ox, L.oy);
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

    FA.addLayer('effects', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      var L = getLayout();
      var ts = L.ts;
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
        ctx.fillStyle = '#f00'; ctx.fillRect(L.ox, L.oy, L.mapW, L.mapH);
        ctx.globalAlpha = 1;
      }

      // Depth-based scanlines (dungeon only)
      var depth = state.depth || 0;
      if (depth > 0 && Math.random() < 0.002 * depth) {
        ctx.globalAlpha = 0.06 + Math.random() * 0.06;
        ctx.fillStyle = _glitchColors[Math.floor(Math.random() * 4)];
        ctx.fillRect(L.ox, L.oy + Math.random() * L.mapH, L.mapW, 1 + Math.random() * 2);
        ctx.globalAlpha = 1;
      }

      // Sound waves
      if (state.soundWaves) {
        ctx.strokeStyle = '#ff0'; ctx.lineWidth = 1;
        for (var wi = 0; wi < state.soundWaves.length; wi++) {
          var wave = state.soundWaves[wi];
          var progress = 1 - wave.life / 500;
          ctx.globalAlpha = (1 - progress) * 0.15;
          ctx.beginPath(); ctx.arc(L.ox + wave.tx * ts + ts / 2, L.oy + wave.ty * ts + ts / 2, progress * wave.maxR * ts, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Kill particles (these use absolute pixel positions, already set at spawn time)
      if (state.particles) {
        for (var pi = 0; pi < state.particles.length; pi++) {
          var pt = state.particles[pi];
          ctx.globalAlpha = pt.life / pt.maxLife; ctx.fillStyle = pt.color;
          ctx.fillRect(pt.x - 1, pt.y - 1, 3, 3);
        }
        ctx.globalAlpha = 1;
      }
    }, 18);

    FA.addLayer('floats', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      FA.drawFloats();
    }, 20);
  }

  function getCW(ctx, size) { return TextFX.charWidth(ctx, size || 11); }
  var _fx = {};
  function FX(color, dimColor, size, duration, charDelay, flicker) {
    _fx.color = color; _fx.dimColor = dimColor; _fx.size = size;
    _fx.duration = duration; _fx.charDelay = charDelay; _fx.flicker = flicker;
    return _fx;
  }

  function drawBox(ctx, bx, by, tw, th, color, alpha) {
    ctx.globalAlpha = 0.85 * alpha; ctx.fillStyle = '#060a12';
    ctx.fillRect(bx, by, tw, th);
    ctx.globalAlpha = 0.3 * alpha; ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1);
    ctx.globalAlpha = 0.04 * alpha; ctx.fillStyle = '#000';
    for (var sl = by; sl < by + th; sl += 2) ctx.fillRect(bx, sl, tw, 1);
    ctx.globalAlpha = 1;
  }

  function drawPointer(ctx, px, by, th, flipped, color, alpha) {
    ctx.globalAlpha = 0.85 * alpha; ctx.fillStyle = '#060a12';
    ctx.beginPath();
    if (!flipped) { ctx.moveTo(px - 4, by + th); ctx.lineTo(px + 4, by + th); ctx.lineTo(px, by + th + 7); }
    else { ctx.moveTo(px - 4, by); ctx.lineTo(px + 4, by); ctx.lineTo(px, by - 7); }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.3 * alpha; ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.stroke();
  }

  function setupUILayers() {
    var _adjDirs = [[0,-1],[0,1],[-1,0],[1,0]];
    var _actions = [{ label: '', color: '' }, { label: '', color: '' }, { label: '', color: '' }, { label: '', color: '' }, { label: '', color: '' }];

    FA.addLayer('ui', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var L = getLayout();
      var W = L.W, H = L.H, uiY = L.panelY, ts = L.ts;
      var p = state.player;
      var ctx = FA.getCtx();
      var inTown = !Location.isSystem(state.mapId);
      var timeCfg = FA.lookup('config', 'time');
      FA.draw.rect(0, uiY, W, H - uiY, '#0a0c14');
      FA.draw.rect(0, uiY, W, 1, '#1a2030');
      var hpRatio = p.hp / p.maxHp;
      var hpColor = hpRatio > 0.5 ? '#4f4' : hpRatio > 0.25 ? '#fa4' : '#f44';
      FA.draw.text('HP', 8, uiY + 6, O('#4a6a7a', 11));
      FA.draw.bar(26, uiY + 7, 80, 8, hpRatio, hpColor, '#0a1a0a');
      FA.draw.text(p.hp + '/' + p.maxHp, 110, uiY + 6, O('#6a8a9a', 11));
      FA.draw.text('ATK:' + p.atk + ' DEF:' + p.def, 175, uiY + 6, O('#4a5a6a', 11));
      FA.draw.text(state.credits + ' cr', 310, uiY + 6, O(colors.credits, 11, true));
      FA.draw.text('-' + state.rent + '/night', 365, uiY + 6, O('#a65', 10));
      var day = timeCfg.turnsPerDay;
      var period = state.timeOfDay < day * 0.33 ? 'MORNING' : state.timeOfDay < day * 0.66 ? 'MIDDAY' : 'EVENING';
      var periodColor = state.timeOfDay < day * 0.33 ? '#d8b060' : state.timeOfDay < day * 0.66 ? '#e0a030' : '#c06030';
      var timeRatio = state.timeOfDay / day;
      if (timeRatio > 0.95) { period = 'CURFEW'; periodColor = '#f44'; }
      FA.draw.text('DAY ' + state.day + ' ' + period, 480, uiY + 6, O(periodColor, 11));
      var timeColor = timeRatio > 0.95 ? '#f44' : timeRatio > 0.75 ? '#e08030' : '#c8a050';
      FA.draw.bar(620, uiY + 7, 70, 8, 1 - timeRatio, timeColor, '#1a1610');
      if (!inTown) FA.draw.text('D' + (state.depth || 1) + '/' + cfg.maxDepth, W - 50, uiY + 6, O(colors.stairsDown, 11, true));
      var mods = p.modules || [];
      for (var m = 0; m < 3; m++) {
        var mx = 8 + m * 130;
        if (m < mods.length) { FA.draw.text('[' + (m + 1) + ']', mx, uiY + 21, O('#3a5060', 11)); FA.draw.text(mods[m].name, mx + 22, uiY + 21, O(mods[m].color, 11, true)); }
        else FA.draw.text('[' + (m + 1) + '] ---', mx, uiY + 21, O('#1a2530', 11));
      }
      var buffX = 420;
      if (p.cloakTurns > 0) { FA.draw.text('CLOAK:' + p.cloakTurns, buffX, uiY + 21, O('#88f', 11, true)); buffX += 65; }
      if (p.overclockActive) { FA.draw.text('OC:RDY', buffX, uiY + 21, O('#f44', 11, true)); buffX += 55; }
      if (p.firewallHp > 0) FA.draw.text('FW:' + p.firewallHp, buffX, uiY + 21, O('#4f4', 11, true));
      if (state.systemVisits > 0) FA.draw.text('DIVES:' + state.systemVisits, W - 65, uiY + 21, O('#664', 10));
      var actionCount = 0;
      if (inTown) {
        var obj = Core.getObjectAtPos(p.x, p.y);
        if (obj && obj.type === 'bed') { _actions[0].label = 'Lodging (' + state.rent + ' cr)'; _actions[0].color = '#8878cc'; actionCount = 1; }
        else if (obj && obj.type === 'terminal') { _actions[0].label = state.workedToday ? 'Shift done' : 'Work'; _actions[0].color = state.workedToday ? '#443' : '#88aa66'; actionCount = 1; }
        else if (obj && obj.type === 'notice_board') { _actions[0].label = 'Read notices'; _actions[0].color = '#aa9a50'; actionCount = 1; }
        else if (obj && obj.type === 'cafe_table') { var cafeCfg = FA.lookup('config', 'cafe'); if (cafeCfg) { _actions[0].label = 'Eat (' + cafeCfg.cost + ' cr)'; _actions[0].color = '#e8a040'; actionCount = 1; } }
        else if (obj && obj.type === 'garden_bench') { var gardenCfg = FA.lookup('config', 'garden'); if (gardenCfg) { _actions[0].label = 'Rest (free)'; _actions[0].color = '#6a4'; actionCount = 1; } }
        else if (obj && obj.type === 'system_entrance' && state.systemRevealed) { _actions[0].label = 'Enter System'; _actions[0].color = '#f80'; actionCount = 1; }
        var entities = state.maps.town.entities;
        for (var d = 0; d < _adjDirs.length; d++) {
          var nx = p.x + _adjDirs[d][0], ny = p.y + _adjDirs[d][1];
          for (var nj = 0; nj < entities.length; nj++) {
            var adjNpc = entities[nj];
            if (adjNpc.type !== 'npc') continue;
            if (state.day >= adjNpc.appearsDay && adjNpc.x === nx && adjNpc.y === ny) {
              if (actionCount < _actions.length) { _actions[actionCount].label = 'Talk to ' + adjNpc.name; _actions[actionCount].color = adjNpc.color; actionCount++; }
              break;
            }
          }
        }
      }
      var ax = 8;
      for (var ai = 0; ai < actionCount; ai++) {
        var act = _actions[ai];
        FA.draw.text('[SPACE]', ax, uiY + 36, O('#554', 10));
        ax += getCW(ctx, 10) * 7 + 4;
        FA.draw.text(act.label, ax, uiY + 36, O(act.color, 10));
        ax += getCW(ctx, 10) * act.label.length + 12;
      }
      if (inTown && state.maps.town) {
        var npcEntities = state.maps.town.entities;
        var tagX = Math.max(ax + 8, 280);
        for (var ni = 0; ni < npcEntities.length; ni++) {
          var npc = npcEntities[ni];
          if (npc.type !== 'npc' || state.day < npc.appearsDay || npc.x < 0) continue;
          var nd = Math.abs(npc.x - p.x) + Math.abs(npc.y - p.y);
          if (nd > 10) continue;
          var dimmed = nd > 5;
          ctx.globalAlpha = dimmed ? 0.4 : 0.9;
          var moodCfg = FA.lookup('config', 'moods');
          var mLow = moodCfg && moodCfg.thresholds ? moodCfg.thresholds.low : 30;
          var mHigh = moodCfg && moodCfg.thresholds ? moodCfg.thresholds.high : 70;
          var dotColor = !dimmed && npc.mood < mLow ? '#f44' : !dimmed && npc.mood > mHigh ? '#4f4' : npc.color;
          FA.draw.rect(tagX, uiY + 37, 4, 4, dotColor);
          var npcLabel = npc.name;
          if (!dimmed && npc.currentJob) npcLabel += ' [' + npc.currentJob.id + ']';
          if (!dimmed) { var mc = npc.mood > mHigh ? '+' : npc.mood < mLow ? '-' : ''; if (mc) npcLabel += mc; }
          FA.draw.text(npcLabel, tagX + 7, uiY + 36, O(dimmed ? '#665' : '#aa9', 10));
          tagX += getCW(ctx, 10) * npcLabel.length + 18;
        }
        ctx.globalAlpha = 1;
      }
      if (!inTown) {
        FA.draw.text('DATA:' + p.gold, W - 220, uiY + 36, O('#0aa', 10));
        FA.draw.text('KILLS:' + p.kills, W - 150, uiY + 36, O('#a44', 10));
        FA.draw.text('T:' + (state.systemTurn || 0), W - 80, uiY + 36, O('#3a4a5a', 10));
      }
    }, 30);

    FA.addLayer('systemBubble', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      var sb = state.systemBubble;
      if (!sb) return;
      var L = getLayout();
      var W = L.W, ts = L.ts, ox = L.ox, oy = L.oy;
      var ctx = FA.getCtx();
      var cw = getCW(ctx);
      var lines = sb.lines, lineH = 16, maxLineLen = 0;
      for (var mi = 0; mi < lines.length; mi++) if (lines[mi].length > maxLineLen) maxLineLen = lines[mi].length;
      var tw = Math.min(W - 40, Math.max(140, maxLineLen * cw + 24));
      var th = lines.length * lineH + 12;
      var bx, by;
      var hasSource = sb.source && typeof sb.source.x === 'number';
      if (hasSource) {
        var sx = ox + sb.source.x * ts + ts / 2, sy = oy + sb.source.y * ts;
        bx = sx - tw / 2; by = sy - th - 12;
        if (bx < 4) bx = 4; if (bx + tw > W - 4) bx = W - tw - 4;
        if (by < 4) by = sy + ts + 10;
      } else { bx = W / 2 - tw / 2; by = 8; }
      drawBox(ctx, bx, by, tw, th, sb.color, 1);
      if (hasSource) {
        var flipped = by > sy;
        drawPointer(ctx, Math.max(bx + 8, Math.min(bx + tw - 8, sx)), by, th, flipped, sb.color, 1);
      }
      ctx.globalAlpha = 0.9;
      for (var li = 0; li < lines.length; li++) {
        var lineElapsed = sb.timer - li * 200;
        if (lineElapsed <= 0) continue;
        TextFX.render(ctx, lines[li], lineElapsed, bx + 12, by + 6 + li * lineH, FX(sb.color, '#1a3030', 11, 60, 6, 25));
      }
      if (sb.done) { ctx.globalAlpha = 0.3; FA.draw.text('[SPACE]', bx + tw - 48, by + th + 4, O(sb.color, 8)); }
      ctx.globalAlpha = 1;
    }, 25);

    FA.addLayer('thoughtBubble', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' || state.systemBubble) return;
      if (!state.thoughts || state.thoughts.length === 0 || !state.player) return;
      var thought = state.thoughts[0];
      if (!thought) return;
      var L = getLayout();
      var W = L.W, ts = L.ts, ox = L.ox, oy = L.oy;
      var ctx = FA.getCtx();
      var cw = getCW(ctx);
      var ppx = ox + state.player.x * ts + ts / 2, ppy = oy + state.player.y * ts;
      var tw = Math.max(90, thought.text.length * cw + 24), th = 26;
      var bx = ppx - tw / 2, by = ppy - th - 14;
      if (bx < 4) bx = 4; if (bx + tw > W - 4) bx = W - tw - 4;
      var flipped = by < 4;
      if (flipped) by = ppy + ts + 10;
      drawBox(ctx, bx, by, tw, th, '#4ef', 1);
      drawPointer(ctx, Math.max(bx + 8, Math.min(bx + tw - 8, ppx)), by, th, flipped, '#4ef', 1);
      ctx.globalAlpha = 0.9;
      TextFX.render(ctx, thought.text, thought.timer, bx + 8, by + 7, FX('#4ef', '#1a4040', 11, 60, 6, 25));
      if (thought.done) { ctx.globalAlpha = 0.3; FA.draw.text('[SPACE]', bx + tw - 48, by + th + 4, O('#4ef', 8)); }
      ctx.globalAlpha = 1;
    }, 26);

    FA.addLayer('choiceMenu', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' || !state.choiceMenu) return;
      var L = getLayout();
      var W = L.W;
      var menu = state.choiceMenu;
      menu.timer = (menu.timer || 0);
      var sel = menu.selectedIndex || 0;
      var ctx = FA.getCtx();
      var cw = getCW(ctx);
      var lineH = 18, maxLen = menu.title.length;
      for (var oi = 0; oi < menu.options.length; oi++) {
        var optText = '  ' + menu.options[oi].label;
        if (optText.length > maxLen) maxLen = optText.length;
      }
      var tw = Math.min(W - 40, Math.max(180, maxLen * cw + 32));
      var th = (1 + menu.options.length) * lineH + 34;
      var bx = W / 2 - tw / 2, by = 20;
      drawBox(ctx, bx, by, tw, th, '#8878cc', 1);
      ctx.globalAlpha = 0.9;
      TextFX.render(ctx, menu.title, menu.timer, bx + 12, by + 10, FX('#8878cc', '#1a1530', 11, 60, 6, 25));
      for (var i = 0; i < menu.options.length; i++) {
        var opt = menu.options[i];
        var selected = i === sel;
        var label = (selected ? '> ' : '  ') + opt.label;
        var optColor = opt.enabled !== false ? (opt.color || '#aa9') : '#443';
        ctx.globalAlpha = opt.enabled !== false ? (selected ? 1.0 : 0.5) : 0.3;
        TextFX.render(ctx, label, menu.timer, bx + 16, by + 10 + (i + 1) * lineH, FX(optColor, '#1a1530', 11, 60, 4, 20));
      }
      ctx.globalAlpha = 0.3;
      FA.draw.text('[W/S] Select  [SPACE] Confirm', bx + 12, by + th - 16, O('#665', 8));
      ctx.globalAlpha = 1;
    }, 27);

    var endingTitles = {
      revelation: { title: 'THE DOOR WAS ALWAYS OPEN', color: '#0ff' },
      curfew: { title: 'CURFEW VIOLATION', color: '#f44' },
      eviction: { title: 'EVICTION NOTICE', color: '#f44' },
      shutdown: { title: 'SYSTEM SHUTDOWN', color: '#f44' }
    };

    FA.addLayer('gameOver', function() {
      var state = FA.getState();
      if (state.screen !== 'victory' && state.screen !== 'shutdown') return;
      var ending = endingTitles[state.endingNode] || endingTitles.shutdown;
      var fs = state.finalStats || {};
      var statsList = [
        { label: 'Days survived', value: fs.days || 1 },
        { label: 'System visits', value: fs.visits || 0, color: '#f80' },
        { label: 'Drones neutralized', value: fs.kills || 0 },
        { label: 'Credits', value: fs.credits || 0, color: colors.credits }
      ];
      var memories = state._activeMemories;
      if (memories && memories.length > 0) {
        statsList.push({ label: 'MEMORIES RECOVERED', value: '', color: '#4ef' });
        for (var mi = 0; mi < memories.length; mi++)
          statsList.push({ label: memories[mi].text, value: '', color: '#3a7a8a' });
      }
      FA.ui.gameOver({
        victory: state.screen === 'victory', title: ending.title, titleColor: ending.color,
        score: state.score || 0, stats: statsList, prompt: '[ R ]  Reinitialize'
      });
    }, 40);

    FA.addLayer('cutscene', function() {
      var state = FA.getState();
      if (state.screen !== 'cutscene' || !state.cutscene) return;
      var L = getLayout();
      var W = L.W, H = L.H;
      var cs = state.cutscene;
      var ctx = FA.getCtx();
      FA.draw.clear('#040810');
      ctx.globalAlpha = 0.12;
      if (Render.scanlineCanvas) ctx.drawImage(Render.scanlineCanvas, 0, 0);
      if (Math.random() > 0.95) { ctx.globalAlpha = 0.015; ctx.fillStyle = cs.color; ctx.fillRect(0, 0, W, H); }
      ctx.globalAlpha = 1;
      var lineH = 24, totalLines = cs.lines.length;
      var startY = Math.max(50, Math.floor((H - totalLines * lineH) / 2) - 20);
      var ld = cs.lineDelay || 200;
      for (var i = 0; i < totalLines; i++) {
        var lineElapsed = cs.timer - i * ld;
        if (lineElapsed <= 0) continue;
        var lineDone = lineElapsed >= TextFX.totalTime(cs.lines[i], FX(null, null, null, 100, 8, 30));
        ctx.globalAlpha = (lineDone && cs.timer - (i * ld + TextFX.totalTime(cs.lines[i], FX(null, null, null, 100, 8, 30))) > 400) ? 0.6 : 1;
        TextFX.render(ctx, cs.lines[i], lineElapsed, 80, startY + i * lineH, FX(cs.color, '#1a4a4a', 15, 100, 8, 30));
      }
      ctx.globalAlpha = 1;
      if (cs.done) {
        if (Math.floor(Date.now() / 600) % 2 === 0)
          FA.draw.text('[ SPACE ]', W / 2, H - 45, O('#445', 14, false, 'center', 'middle'));
      }
      ctx.globalAlpha = 0.3; ctx.fillStyle = cs.color;
      ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, H - 1, W, 1);
      ctx.globalAlpha = 1;
    }, 50);
  }

  window.Render = { setup: function() { setupLayers(); setupUILayers(); }, scanlineCanvas: null };
})();
