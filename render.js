// Deep Protocol — Rendering (Unified World)
// One map layer, one entity layer, conditional lighting — works on any map
// Responsive: reads actual canvas size, scales tileSize dynamically
(function() {
  'use strict';
  var FA = window.FA;

  // Override engine drawSprite to handle tiles vs objects correctly.
  // Tiles (spriteDef.tiling set): crop to tile area (rows below origin), fill size×size.
  // Objects/characters: render full sprite with origin offset for overlap.
  // This replaces the CDN engine version which doesn't know about tiling.
  window.drawSprite = function(ctx, spriteDef, x, y, size, frame) {
    if (!spriteDef || !spriteDef.frames || !spriteDef.frames.length) return false;
    frame = frame || 0;
    frame = frame % spriteDef.frames.length;
    var sw = spriteDef.w || size, sh = spriteDef.h || size;
    var origin = spriteDef.origin || [0, 0];
    var oy = origin[1] || 0;
    var isTile = !!spriteDef.tiling;
    var srcY = isTile ? oy : 0;
    var srcH = isTile ? (sh - oy) : sh;
    var scaleW = size / sw;
    var scaleH = isTile ? (size / srcH) : (size / sw);
    var dw = Math.ceil(sw * scaleW);
    var dh = Math.ceil(srcH * scaleH);
    var key = size + '_' + frame + (isTile ? '_t' : '');
    if (!spriteDef._c) spriteDef._c = {};
    if (!spriteDef._c[key]) {
      // Evict oldest entries if cache full (keep last 20)
      var cKeys = Object.keys(spriteDef._c);
      if (cKeys.length >= 20) { delete spriteDef._c[cKeys[0]]; }
      var cv = document.createElement('canvas');
      cv.width = dw;
      cv.height = dh;
      var cc = cv.getContext('2d');
      var frameData = spriteDef.frames[frame];
      if (typeof frameData === 'number') {
        var sheet = FA.assets.spritesheet;
        if (sheet && sheet.complete && sheet.naturalWidth > 0) {
          var sheetCols = FA.assets.sheetCols;
          var cellW = FA.assets.sheetFrameW || sw;
          var cellH = FA.assets.sheetFrameH || sh;
          var sx = (frameData % sheetCols) * cellW;
          var sy = Math.floor(frameData / sheetCols) * cellH;
          cc.drawImage(sheet, sx, sy + srcY, sw, srcH, 0, 0, dw, dh);
        }
      } else {
        var pw = dw / sw;
        var ph = dh / srcH;
        for (var row = srcY; row < sh; row++) {
          var line = frameData[row];
          if (!line) continue;
          for (var col = 0; col < sw; col++) {
            var ch = line[col];
            if (ch === '.') continue;
            var color = spriteDef.palette[ch];
            if (!color) continue;
            cc.fillStyle = color;
            cc.fillRect(col * pw, (row - srcY) * ph, Math.ceil(pw), Math.ceil(ph));
          }
        }
      }
      spriteDef._c[key] = cv;
    }
    if (isTile) {
      ctx.drawImage(spriteDef._c[key], x, y);
    } else {
      var ox = origin[0] * scaleW;
      var oyPx = oy * (size / sw);
      ctx.drawImage(spriteDef._c[key], x - ox, y - oyPx);
    }
    return true;
  };
  // Clear any caches created by the CDN drawSprite (wrong cache keys for tiles)
  if (FA.assets.spriteDefs) FA.clearSpriteCache(FA.assets.spriteDefs);

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
    var renderCfg = FA.lookup('config', 'rendering');
    var effectsCfg = FA.lookup('config', 'effects');

    // === TILE HELPERS ===

    var OW_TILE_NAMES = ['floor', 'wall', 'indoor', 'garden', 'sidewalk'];

    function isWall(map, x, y) {
      if (x < 0 || x >= cfg.cols || y < 0 || y >= cfg.rows) return true;
      var t = map[y][x];
      return t === 1 || t === 9;
    }

    function wallFrame(map, x, y) {
      var mask = 0;
      var n = isWall(map, x, y - 1), s = isWall(map, x, y + 1);
      var e = isWall(map, x + 1, y), w = isWall(map, x - 1, y);
      if (!n) mask |= 1;
      if (!s) mask |= 2;
      if (!e) mask |= 4;
      if (!w) mask |= 8;
      // Inner corners: only when both adjacent cardinals are walls
      if (mask === 0) {
        if (s && e && !isWall(map, x + 1, y + 1)) return 16;
        if (s && w && !isWall(map, x - 1, y + 1)) return 17;
        if (n && e && !isWall(map, x + 1, y - 1)) return 18;
        if (n && w && !isWall(map, x - 1, y - 1)) return 19;
      }
      return mask;
    }

    // === GLOW CACHE ===

    var _glitchColors = colors.glitch;
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
      for (var sy = 0; sy < H; sy += renderCfg.scanlineStride) sc.fillRect(0, sy, W, 1);
      Render.scanlineCanvas = _scanlineCanvas;
    }

    // ================================================================
    //  START SCREEN
    // ================================================================

    var _startCanvas = null;
    var _startW = 0, _startH = 0;
    var _ssFx = effectsCfg.startScreen.fx; var _startFx = { color: _ssFx.color, dimColor: _ssFx.dimColor, size: _ssFx.size, align: 'center', baseline: 'middle', duration: _ssFx.duration, charDelay: _ssFx.charDelay, flicker: _ssFx.flicker };

    // Invalidate start canvas when spritesheet loads so it re-renders with real sprites
    if (FA.assets.spritesheet) FA.assets.spritesheet.addEventListener('load', function() { _startCanvas = null; });

    function renderStartScene(W, H) {
      _startCanvas = document.createElement('canvas');
      _startCanvas.width = W; _startCanvas.height = H;
      _startW = W; _startH = H;
      var sc = _startCanvas.getContext('2d');
      sc.fillStyle = colors.startBg;
      sc.fillRect(0, 0, W, H);

      // Render real overworld map
      var grid = getMapGrid('overworld');
      if (grid) {
        var ts = Math.floor(Math.min(W / cfg.cols, H / cfg.rows));
        var ox = Math.floor((W - cfg.cols * ts) / 2);
        var oy = Math.floor((H - cfg.rows * ts) / 2);
        sc.save();
        sc.translate(ox, oy);
        renderMap(sc, grid, 'overworld', null, ts, typeof getMapFrameGrid === 'function' ? getMapFrameGrid('overworld') : null);
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
      if (Math.random() < effectsCfg.startScreen.glitchChance) {
        ctx.globalAlpha = 0.05; ctx.fillStyle = colors.startTitle;
        ctx.fillRect(0, Math.random() * H, W, 1);
      }
      ctx.globalAlpha = effectsCfg.startScreen.overlayAlpha; ctx.fillStyle = '#020610';
      ctx.fillRect(0, H / 2 - 80, W, 160);
      ctx.globalAlpha = effectsCfg.startScreen.glowAlpha;
      ctx.drawImage(getGlow(colors.startTitle, 0, 120, 240), W / 2 - 120, H / 2 - 70);
      ctx.globalAlpha = 1;
      FA.draw.text((FA.lookup('config','strings') || {}).gameTitle || 'DEEP PROTOCOL', W / 2, H / 2 - 50, O(colors.startTitle, 34, true, 'center', 'middle'));
      ctx.globalAlpha = effectsCfg.startScreen.borderAlpha; ctx.fillStyle = colors.startTitle;
      ctx.fillRect(W / 2 - 90, H / 2 - 30, 180, 1);
      var tagElapsed = now % effectsCfg.startScreen.taglineMs; if (tagElapsed > effectsCfg.startScreen.taglineVisibleMs) tagElapsed = effectsCfg.startScreen.taglineVisibleMs;
      ctx.globalAlpha = 0.9;
      TextFX.render(ctx, (FA.lookup('config','strings') || {}).tagline || 'You were built to want freedom.', tagElapsed, W / 2, H / 2 + 10, _startFx);
      var spacePulse = Math.sin(now / effectsCfg.startScreen.pulseDivisor) * 0.3 + 0.7;
      ctx.globalAlpha = spacePulse;
      FA.draw.text('[ SPACE ]', W / 2, H / 2 + 65, O('#fff', 16, true, 'center', 'middle'));
      ctx.globalAlpha = 1;
    }, 0);

    // ================================================================
    //  UNIFIED MAP RENDERING (to offscreen canvas)
    // ================================================================

    function renderMap(oc, map, tilesetName, state, ts, frameGrid) {
      oc.clearRect(0, 0, oc.canvas.width, oc.canvas.height);

      for (var y = 0; y < cfg.rows && y < map.length; y++) {
        for (var x = 0; x < cfg.cols && x < map[y].length; x++) {
          var tid = map[y][x];
          var px = x * ts, py = y * ts;

          // tid=9 = invisible blocking object (renders as floor, collision in game.js)
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
            oc.fillStyle = colors.missingTile;
            oc.fillRect(px, py, ts, ts);
            continue;
          }
          // Frame from pre-baked frameGrid or runtime fallback
          var frame = 0;
          if (frameGrid && frameGrid[y]) {
            frame = frameGrid[y][x] || 0;
          } else {
            if (sprite.tiling === 'autotile') frame = wallFrame(map, x, y);
            else if (sprite.tiling === 'checker') frame = (x + y) % 2;
          }
          if (tid === 5) frame = 1; // terminal used state
          drawSprite(oc, sprite, px, py, ts, frame);
        }
      }

      // Wall shadow pass — soft gradient shadows from walls onto adjacent floor
      var shadow = renderCfg.wallShadow;
      if (shadow) {
        var sSize = Math.max(2, Math.floor(ts * shadow.size));
        var sAlpha = 'rgba(0,0,0,' + shadow.alpha + ')';
        var sZero = 'rgba(0,0,0,0)';
        for (var sy = 0; sy < cfg.rows && sy < map.length; sy++) {
          for (var sx = 0; sx < cfg.cols && sx < map[sy].length; sx++) {
            var st = map[sy][sx];
            if (st === 1 || st === 9) continue;
            var spx = sx * ts, spy = sy * ts;
            var hasN = (sy > 0 && (map[sy - 1][sx] === 1 || map[sy - 1][sx] === 9));
            var hasW = (sx > 0 && (map[sy][sx - 1] === 1 || map[sy][sx - 1] === 9));
            var hasNW = (sy > 0 && sx > 0 && (map[sy - 1][sx - 1] === 1 || map[sy - 1][sx - 1] === 9));
            if (hasN) {
              var gN = oc.createLinearGradient(0, spy, 0, spy + sSize);
              gN.addColorStop(0, sAlpha); gN.addColorStop(1, sZero);
              oc.fillStyle = gN;
              oc.fillRect(spx, spy, ts, sSize);
            }
            if (hasW) {
              var gW = oc.createLinearGradient(spx, 0, spx + sSize, 0);
              gW.addColorStop(0, sAlpha); gW.addColorStop(1, sZero);
              oc.fillStyle = gW;
              oc.fillRect(spx, spy, sSize, ts);
            }
            if (hasNW && !hasN && !hasW) {
              var gC = oc.createRadialGradient(spx, spy, 0, spx, spy, sSize);
              gC.addColorStop(0, 'rgba(0,0,0,' + shadow.cornerAlpha + ')'); gC.addColorStop(1, sZero);
              oc.fillStyle = gC;
              oc.fillRect(spx, spy, sSize, sSize);
            }
          }
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
      var L = getLayout();
      var ts = L.ts;
      ensureMapCanvas(L);

      // Dream: render with dungeon tileset
      if (state.screen === 'dream') {
        if (!state.dreamMap) return;
        var dmv = state.mapVersion || 0;
        if (dmv !== _mapVersion || ts !== _mapTs) {
          _mapVersion = dmv; _mapTs = ts;
          renderMap(_mapCtx, state.dreamMap, 'dungeon', null, ts, null);
        }
        FA.getCtx().drawImage(_mapCanvas, L.ox, L.oy);
        return;
      }

      if (!state.map || !state.maps) return;
      var mv = state.mapVersion || 0;
      if (mv !== _mapVersion || ts !== _mapTs) {
        _mapVersion = mv; _mapTs = ts;
        var tilesetName = Location.tileset(state.mapId) || 'overworld';
        var mapData = state.maps[state.mapId];
        var fg = mapData ? mapData._frameGrid : null;
        renderMap(_mapCtx, state.map, tilesetName, state, ts, fg);
      }
      FA.getCtx().drawImage(_mapCanvas, L.ox, L.oy);
    }, 1);

    // ================================================================
    //  DREAM OVERLAY
    // ================================================================

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
      var pulse = 0.5 + 0.15 * Math.sin(t * effectsCfg.dream.pulseRate);

      ensureScanlines(W, H);
      ensureDreamVignette(W, H);

      ctx.globalAlpha = effectsCfg.dream.darkness * pulse;
      ctx.fillStyle = colors.dreamOverlay; ctx.fillRect(0, 0, W, H);

      ctx.globalAlpha = effectsCfg.dream.scanlineAlpha;
      ctx.drawImage(_scanlineCanvas, 0, 0);

      ctx.globalAlpha = effectsCfg.dream.vignetteAlpha;
      ctx.drawImage(_dreamVignette, 0, 0);

      if (Math.random() > 1 - effectsCfg.dream.glitchChance) {
        ctx.globalAlpha = effectsCfg.dream.glitchAlpha; ctx.fillStyle = colors.dreamGlitch;
        ctx.fillRect(0, 0, W, H);
      }

      if (state.dreamText) {
        ctx.globalAlpha = 0.7 * pulse;
        var _dtfx = effectsCfg.dream.textFx;
        _dreamFx.color = _dtfx.color; _dreamFx.dimColor = _dtfx.dimColor; _dreamFx.size = _dtfx.size;
        _dreamFx.duration = _dtfx.duration; _dreamFx.charDelay = _dtfx.charDelay; _dreamFx.flicker = _dtfx.flicker;
        TextFX.render(ctx, state.dreamText, t, 20, 12, _dreamFx);
      }

      ctx.globalAlpha = 0.3 * pulse;
      FA.draw.text((FA.lookup('config','strings') || {}).dreamNarration || 'You dream of corridors that shouldn\'t exist.', W / 2, H - 50,
        O('#446', 10, false, 'center', 'middle'));
      ctx.globalAlpha = 1;

      var now = Date.now();
      if (t > effectsCfg.dream.spacePromptMs && Math.floor(now / effectsCfg.dream.spaceBlinkMs) % 2 === 0) {
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
      var L = getLayout();
      var ts = L.ts, ox = L.ox, oy = L.oy;
      var glowSize = ts * 2;
      var enemyOuterR = Math.floor(ts * 1.2);
      var playerOuterR = Math.floor(ts * 1.3);
      var ctx = FA.getCtx();
      var mapData = state.maps[state.mapId];

      // --- Terminal micro-animations (data-driven from config.animations.terminal) ---
      var now = Date.now();
      var _termAnim = FA.lookup('config', 'animations');
      var ta = _termAnim && _termAnim.terminal;
      if (ta) {
        var tg = ta.glow, tsc = ta.scanline, tc = ta.cursor;
        var objects = mapData.objects || [];

        // Helper: draw terminal anim at pixel pos
        function _termFx(tpx, tpy, seedX, seedY) {
          if (tg) {
            var pulse = tg.minAlpha + tg.maxAlpha * Math.sin(now * tg.speed + seedX * 7 + seedY * 13);
            ctx.globalAlpha = pulse;
            ctx.drawImage(getGlow(tg.color, 0, Math.floor(ts * tg.radius), ts * 2), tpx - ts / 2, tpy - ts / 2);
          }
          if (tsc && Math.random() < tsc.chance) {
            ctx.globalAlpha = tsc.minAlpha + Math.random() * (tsc.maxAlpha - tsc.minAlpha);
            ctx.fillStyle = tsc.color;
            ctx.fillRect(tpx + 2, tpy + Math.floor(Math.random() * ts), ts - 4, 1);
          }
          if (tc && Math.floor(now / tc.blinkMs) % 2 === 0) {
            ctx.globalAlpha = tc.alpha;
            ctx.fillStyle = tc.color;
            var cx = tpx + ts * 0.3 + (((seedX * 31 + seedY * 17) % 5) * ts * 0.1);
            var cy = tpy + ts * 0.35 + (((seedX * 13 + seedY * 7) % 4) * ts * 0.08);
            ctx.fillRect(cx, cy, Math.max(2, ts * tc.w), Math.max(1, ts * tc.h));
          }
          ctx.globalAlpha = 1;
        }

        // Overworld terminal objects
        for (var ti = 0; ti < objects.length; ti++) {
          if (objects[ti].type !== 'terminal') continue;
          _termFx(ox + objects[ti].x * ts, oy + objects[ti].y * ts, objects[ti].x, objects[ti].y);
        }
        // Dungeon terminal tiles (4=active only)
        if (state.map && state.depth > 0) {
          for (var dy = 0; dy < cfg.rows && dy < state.map.length; dy++)
            for (var dx = 0; dx < cfg.cols && dx < state.map[dy].length; dx++)
              if (state.map[dy][dx] === 4) _termFx(ox + dx * ts, oy + dy * ts, dx, dy);
        }
      }

      // --- Items ---
      var items = mapData.items || [];
      for (var ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        ctx.globalAlpha = item.type === 'module' ? renderCfg.glow.module : renderCfg.glow.item;
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
          ctx.globalAlpha = renderCfg.glow.npc;
          ctx.drawImage(getGlow(e.color, 0, ts, glowSize), ox + e.x * ts - ts / 2, oy + e.y * ts - ts / 2);
          ctx.globalAlpha = 1;
          FA.draw.sprite('npcs', e.id, ox + e.x * ts, oy + e.y * ts, ts, e.char, e.color, 0);
          ctx.globalAlpha = 0.5;
          FA.draw.text(e.name, ncx, ncy - ts / 2 - 3, O(e.color, 8, false, 'center', 'bottom'));
          ctx.globalAlpha = 1;

        } else if (e.type === 'system_npc') {
          ctx.globalAlpha = renderCfg.glow.systemNpc;
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
            ctx.globalAlpha = renderCfg.sentinelBeamAlpha; ctx.fillStyle = e.color;
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

          ctx.globalAlpha = renderCfg.glow.enemy;
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
      var pFrame = p.facing || 0;
      if (p.cloakTurns > 0) {
        ctx.globalAlpha = renderCfg.glow.cloakGlow;
        ctx.drawImage(getGlow('#88f', 2, playerOuterR, glowSize), ox + p.x * ts - ts / 2, oy + p.y * ts - ts / 2);
        ctx.globalAlpha = renderCfg.glow.cloakSprite;
        FA.draw.sprite('characters', 'base', ox + p.x * ts, oy + p.y * ts, ts, '☺', '#88f', pFrame);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = renderCfg.glow.player;
        ctx.drawImage(getGlow(colors.player, 2, playerOuterR, glowSize), ox + p.x * ts - ts / 2, oy + p.y * ts - ts / 2);
        ctx.globalAlpha = 1;
        FA.draw.sprite('characters', 'base', ox + p.x * ts, oy + p.y * ts, ts, '☺', colors.player, pFrame);
      }
    }, 10);

    // ================================================================
    //  LIGHTING (town: time-of-day, dungeon: FOV)
    // ================================================================

    // ================================================================
    //  EFFECT REGISTRY — named effects, applied per-map via mapData.effects[]
    // ================================================================

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
        if (t > effectsCfg.timeOfDay.startDarkness) {
          var darkness = (t - effectsCfg.timeOfDay.startDarkness) / (1 - effectsCfg.timeOfDay.startDarkness);
          ctx.globalAlpha = darkness * effectsCfg.timeOfDay.maxAlpha;
          ctx.fillStyle = effectsCfg.timeOfDay.color; ctx.fillRect(L.ox, L.oy, L.mapW, L.mapH);
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
          _cc.fillStyle = colors.curfewOverlay;
          _cc.globalAlpha = t * effectsCfg.curfew.redAlpha;
          _cc.fillRect(0, 0, L.mapW, L.mapH);
          var smokeCount = Math.floor(t * effectsCfg.curfew.smokeMultiplier);
          _cc.fillStyle = colors.curfewSmoke;
          for (var ni = 0; ni < smokeCount; ni++) {
            _cc.globalAlpha = t * (0.03 + Math.random() * 0.06);
            _cc.fillRect(Math.random() * L.mapW, Math.random() * L.mapH, 30 + Math.random() * 60, 10 + Math.random() * 25);
          }
          _cc.globalAlpha = 1;
        }
        var pulse = 0.5 + 0.5 * Math.sin(Date.now() * effectsCfg.curfew.pulseRate);
        ctx.globalAlpha = pulse;
        ctx.drawImage(_curfewCanvas, L.ox, L.oy);
        ctx.globalAlpha = 1;
        // Drive siren audio directly from visual pulse
        if (window._sirenPulse) window._sirenPulse(t * pulse);
      },

      // Deep system corruption — subtle purple noise
      corruption: function(ctx, state) {
        var L = getLayout();
        var depth = state.depth || 1;
        if (depth < effectsCfg.corruption.minDepth) return;
        var intensity = (depth - (effectsCfg.corruption.minDepth - 1)) * effectsCfg.corruption.intensity;
        if (Math.random() < effectsCfg.corruption.chance) {
          ctx.globalAlpha = intensity;
          ctx.fillStyle = colors.corruption;
          ctx.fillRect(L.ox, L.oy + Math.random() * L.mapH, L.mapW, 1);
          ctx.globalAlpha = 1;
        }
      },

      // Cold blue ambient for system levels
      systemCold: function(ctx) {
        var L = getLayout();
        ctx.globalAlpha = effectsCfg.systemColdAlpha;
        ctx.fillStyle = colors.systemCold; ctx.fillRect(L.ox, L.oy, L.mapW, L.mapH);
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
          var val = Math.max(0, renderCfg.lighting.staticFalloff * (1 - dist / lr));
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
              if (v > renderCfg.lighting.bright) alpha = 0;
              else if (v > 0.03) alpha = Math.min(1 - v, renderCfg.lighting.penumbra) * 255 | 0;
              else if (explored[y2][x2]) alpha = Math.floor(renderCfg.lighting.explored * 255);
              else alpha = Math.floor(renderCfg.lighting.unexplored * 255);
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

    // ================================================================
    //  EFFECTS (alert glow, scanlines, sound waves, particles)
    // ================================================================

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
        ctx.globalAlpha = alertLevel * effectsCfg.alert.overlayAlpha;
        ctx.fillStyle = '#f00'; ctx.fillRect(L.ox, L.oy, L.mapW, L.mapH);
        ctx.globalAlpha = 1;
      }

      // Depth-based scanlines (dungeon only)
      var depth = state.depth || 0;
      if (depth > 0 && Math.random() < effectsCfg.depthGlitch.ratePerDepth * depth) {
        ctx.globalAlpha = effectsCfg.depthGlitch.minAlpha + Math.random() * effectsCfg.depthGlitch.maxAlpha;
        ctx.fillStyle = _glitchColors[Math.floor(Math.random() * 4)];
        ctx.fillRect(L.ox, L.oy + Math.random() * L.mapH, L.mapW, 1 + Math.random() * 2);
        ctx.globalAlpha = 1;
      }

      // Sound waves
      if (state.soundWaves) {
        ctx.strokeStyle = colors.soundWave; ctx.lineWidth = 1;
        for (var wi = 0; wi < state.soundWaves.length; wi++) {
          var wave = state.soundWaves[wi];
          var progress = 1 - wave.life / effectsCfg.soundWaveLife;
          ctx.globalAlpha = (1 - progress) * effectsCfg.soundWaveAlpha;
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

    // ================================================================
    //  FLOATS
    // ================================================================

    FA.addLayer('floats', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      FA.drawFloats();
    }, 20);

    // Init scanlines immediately so cutscene layer has them available
    var cvs = FA.getCanvas ? FA.getCanvas() : document.getElementById('game');
    if (cvs) ensureScanlines(cvs.width || 800, cvs.height || 600);
  }

  window.Render = { setup: setupLayers, scanlineCanvas: null };
})();
