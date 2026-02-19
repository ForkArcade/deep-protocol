// Deep Protocol — UI Rendering
// Single consistent panel, bubbles, menus, overlays — same layout everywhere
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;

  // No fade — bubbles dismiss instantly when done

  // Measured char width per font size (cached on first use)
  var _cwCache = {};
  function getCW(ctx, size) {
    if (!size) size = 11;
    if (_cwCache[size]) return _cwCache[size];
    ctx.font = size + 'px monospace';
    _cwCache[size] = ctx.measureText('M').width;
    return _cwCache[size];
  }

  // Object pool for FA.draw.text opts — zero allocations per frame
  var _o = {}, _fx = {};
  function O(color, size, bold, align, baseline) {
    _o.color = color; _o.size = size; _o.bold = !!bold;
    _o.align = align || 'left'; _o.baseline = baseline || 'top';
    return _o;
  }
  function FX(color, dimColor, size, duration, charDelay, flicker) {
    _fx.color = color; _fx.dimColor = dimColor; _fx.size = size;
    _fx.duration = duration; _fx.charDelay = charDelay; _fx.flicker = flicker;
    return _fx;
  }

  // Shared bubble box: background + border + scanlines
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
    var cfg = FA.lookup('config', 'game');
    var colors = FA.lookup('config', 'colors');
    var ts = cfg.tileSize;
    var W = cfg.canvasWidth;
    var H = cfg.canvasHeight;
    var uiY = cfg.rows * ts;

    var _adjDirs = [[0,-1],[0,1],[-1,0],[1,0]];
    var _actions = [{ label: '', color: '' }, { label: '', color: '' }, { label: '', color: '' }, { label: '', color: '' }, { label: '', color: '' }];

    // ================================================================
    //  UNIFIED UI PANEL — same layout in town and dungeon
    // ================================================================

    FA.addLayer('ui', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var p = state.player;
      var ctx = FA.getCtx();
      var inTown = !Location.isSystem(state.mapId);
      var timeCfg = FA.lookup('config', 'time');

      // Background — always the same
      FA.draw.rect(0, uiY, W, H - uiY, '#0a0c14');
      FA.draw.rect(0, uiY, W, 1, '#1a2030');

      // === ROW 1 (y+6): HP | ATK DEF | Credits | Day/Time ===
      var hpRatio = p.hp / p.maxHp;
      var hpColor = hpRatio > 0.5 ? '#4f4' : hpRatio > 0.25 ? '#fa4' : '#f44';
      FA.draw.text('HP', 8, uiY + 6, O('#4a6a7a', 11));
      FA.draw.bar(26, uiY + 7, 80, 8, hpRatio, hpColor, '#0a1a0a');
      FA.draw.text(p.hp + '/' + p.maxHp, 110, uiY + 6, O('#6a8a9a', 11));

      FA.draw.text('ATK:' + p.atk + ' DEF:' + p.def, 175, uiY + 6, O('#4a5a6a', 11));

      FA.draw.text(state.credits + ' cr', 310, uiY + 6, O(colors.credits, 11, true));
      FA.draw.text('-' + state.rent + '/night', 365, uiY + 6, O('#a65', 10));

      // Day + period + time bar (always visible — in dungeon you still burn daylight)
      var day = timeCfg.turnsPerDay;
      var period = state.timeOfDay < day * 0.33 ? 'MORNING' : state.timeOfDay < day * 0.66 ? 'MIDDAY' : 'EVENING';
      var periodColor = state.timeOfDay < day * 0.33 ? '#d8b060' : state.timeOfDay < day * 0.66 ? '#e0a030' : '#c06030';
      var timeRatio = state.timeOfDay / day;
      if (timeRatio > 0.95) { period = 'CURFEW'; periodColor = '#f44'; }
      FA.draw.text('DAY ' + state.day + ' ' + period, 480, uiY + 6, O(periodColor, 11));
      var timeColor = timeRatio > 0.95 ? '#f44' : timeRatio > 0.75 ? '#e08030' : '#c8a050';
      FA.draw.bar(620, uiY + 7, 70, 8, 1 - timeRatio, timeColor, '#1a1610');

      // Depth indicator (only when in dungeon)
      if (!inTown) {
        FA.draw.text('D' + (state.depth || 1) + '/' + cfg.maxDepth, W - 50, uiY + 6, O(colors.stairsDown, 11, true));
      }

      // === ROW 2 (y+21): Modules | Buffs ===
      var mods = p.modules || [];
      for (var m = 0; m < 3; m++) {
        var mx = 8 + m * 130;
        if (m < mods.length) {
          FA.draw.text('[' + (m + 1) + ']', mx, uiY + 21, O('#3a5060', 11));
          FA.draw.text(mods[m].name, mx + 22, uiY + 21, O(mods[m].color, 11, true));
        } else {
          FA.draw.text('[' + (m + 1) + '] ---', mx, uiY + 21, O('#1a2530', 11));
        }
      }

      // Buffs (shown when active, regardless of location)
      var buffX = 420;
      if (p.cloakTurns > 0) { FA.draw.text('CLOAK:' + p.cloakTurns, buffX, uiY + 21, O('#88f', 11, true)); buffX += 65; }
      if (p.overclockActive) { FA.draw.text('OC:RDY', buffX, uiY + 21, O('#f44', 11, true)); buffX += 55; }
      if (p.firewallHp > 0) { FA.draw.text('FW:' + p.firewallHp, buffX, uiY + 21, O('#4f4', 11, true)); }

      // Dives counter (always)
      if (state.systemVisits > 0) {
        FA.draw.text('DIVES:' + state.systemVisits, W - 65, uiY + 21, O('#664', 10));
      }

      // === ROW 3 (y+36): Context actions + NPCs | Stats ===

      // Context actions (town: object-based + NPC talk)
      var actionCount = 0;
      if (inTown) {
        var obj = Core.getObjectAtPos(p.x, p.y);
        if (obj && obj.type === 'bed') { _actions[0].label = 'Lodging (' + state.rent + ' cr)'; _actions[0].color = '#8878cc'; actionCount = 1; }
        else if (obj && obj.type === 'terminal') { _actions[0].label = state.workedToday ? 'Shift done' : 'Work'; _actions[0].color = state.workedToday ? '#443' : '#88aa66'; actionCount = 1; }
        else if (obj && obj.type === 'notice_board') { _actions[0].label = 'Read notices'; _actions[0].color = '#aa9a50'; actionCount = 1; }
        else if (obj && obj.type === 'system_entrance' && state.systemRevealed) { _actions[0].label = 'Enter System'; _actions[0].color = '#f80'; actionCount = 1; }

        // Adjacent NPC talk
        var entities = state.maps.town.entities;
        for (var d = 0; d < _adjDirs.length; d++) {
          var nx = p.x + _adjDirs[d][0], ny = p.y + _adjDirs[d][1];
          for (var nj = 0; nj < entities.length; nj++) {
            var adjNpc = entities[nj];
            if (adjNpc.type !== 'npc') continue;
            if (state.day >= adjNpc.appearsDay && adjNpc.x === nx && adjNpc.y === ny) {
              if (actionCount < _actions.length) {
                _actions[actionCount].label = 'Talk to ' + adjNpc.name; _actions[actionCount].color = adjNpc.color;
                actionCount++;
              }
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

      // Nearby NPC tags (town only, after actions)
      if (inTown && state.maps.town) {
        var npcEntities = state.maps.town.entities;
        var tagX = Math.max(ax + 8, 280);
        for (var ni = 0; ni < npcEntities.length; ni++) {
          var npc = npcEntities[ni];
          if (npc.type !== 'npc') continue;
          if (state.day < npc.appearsDay) continue;
          if (npc.x < 0) continue;
          var nd = Math.abs(npc.x - p.x) + Math.abs(npc.y - p.y);
          if (nd > 10) continue;
          var dimmed = nd > 5;
          ctx.globalAlpha = dimmed ? 0.4 : 0.9;
          FA.draw.rect(tagX, uiY + 37, 4, 4, npc.color);
          FA.draw.text(npc.name, tagX + 7, uiY + 36, O(dimmed ? '#665' : '#aa9', 10));
          tagX += getCW(ctx, 10) * npc.name.length + 18;
        }
        ctx.globalAlpha = 1;
      }

      // Right side of row 3: dungeon run stats
      if (!inTown) {
        FA.draw.text('DATA:' + p.gold, W - 220, uiY + 36, O('#0aa', 10));
        FA.draw.text('KILLS:' + p.kills, W - 150, uiY + 36, O('#a44', 10));
        FA.draw.text('T:' + (state.systemTurn || 0), W - 80, uiY + 36, O('#3a4a5a', 10));
      }
    }, 30);

    // ================================================================
    //  SYSTEM BUBBLE
    // ================================================================

    FA.addLayer('systemBubble', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      var sb = state.systemBubble;
      if (!sb) return;
      var ctx = FA.getCtx();
      var cw = getCW(ctx);
      var lines = sb.lines;
      var lineH = 16;
      var maxLineLen = 0;
      for (var mi = 0; mi < lines.length; mi++)
        if (lines[mi].length > maxLineLen) maxLineLen = lines[mi].length;
      var tw = Math.min(W - 40, Math.max(140, maxLineLen * cw + 24));
      var th = lines.length * lineH + 12;
      var bx, by;
      var hasSource = sb.source && typeof sb.source.x === 'number';
      if (hasSource) {
        var sx = sb.source.x * ts + ts / 2;
        var sy = sb.source.y * ts;
        bx = sx - tw / 2;
        by = sy - th - 12;
        if (bx < 4) bx = 4;
        if (bx + tw > W - 4) bx = W - tw - 4;
        if (by < 4) by = sy + ts + 10;
      } else {
        bx = W / 2 - tw / 2; by = 8;
      }
      drawBox(ctx, bx, by, tw, th, sb.color, 1);
      if (hasSource) {
        var flipped = by > sy;
        var px = Math.max(bx + 8, Math.min(bx + tw - 8, sx));
        drawPointer(ctx, px, by, th, flipped, sb.color, 1);
      }
      ctx.globalAlpha = 0.9;
      for (var li = 0; li < lines.length; li++) {
        var lineElapsed = sb.timer - li * 200;
        if (lineElapsed <= 0) continue;
        TextFX.render(ctx, lines[li], lineElapsed, bx + 12, by + 6 + li * lineH,
          FX(sb.color, '#1a3030', 11, 60, 6, 25));
      }
      if (sb.done) {
        ctx.globalAlpha = 0.3;
        FA.draw.text('[SPACE]', bx + tw - 48, by + th + 4, O(sb.color, 8));
      }
      ctx.globalAlpha = 1;
    }, 25);

    // ================================================================
    //  THOUGHT BUBBLE
    // ================================================================

    FA.addLayer('thoughtBubble', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      if (state.systemBubble) return;
      if (!state.thoughts || state.thoughts.length === 0) return;
      var thought = state.thoughts[0];
      if (!thought) return;
      if (!state.player) return;
      var ctx = FA.getCtx();
      var cw = getCW(ctx);
      var ppx = state.player.x * ts + ts / 2;
      var ppy = state.player.y * ts;
      var tw = Math.max(90, thought.text.length * cw + 24);
      var th = 26;
      var bx = ppx - tw / 2;
      var by = ppy - th - 14;
      if (bx < 4) bx = 4;
      if (bx + tw > W - 4) bx = W - tw - 4;
      var flipped = by < 4;
      if (flipped) by = ppy + ts + 10;
      drawBox(ctx, bx, by, tw, th, '#4ef', 1);
      var px = Math.max(bx + 8, Math.min(bx + tw - 8, ppx));
      drawPointer(ctx, px, by, th, flipped, '#4ef', 1);
      ctx.globalAlpha = 0.9;
      TextFX.render(ctx, thought.text, thought.timer, bx + 8, by + 7,
        FX('#4ef', '#1a4040', 11, 60, 6, 25));
      if (thought.done) {
        ctx.globalAlpha = 0.3;
        FA.draw.text('[SPACE]', bx + tw - 48, by + th + 4, O('#4ef', 8));
      }
      ctx.globalAlpha = 1;
    }, 26);

    // ================================================================
    //  CHOICE MENU
    // ================================================================

    FA.addLayer('choiceMenu', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' || !state.choiceMenu) return;
      var menu = state.choiceMenu;
      menu.timer = (menu.timer || 0);
      var ctx = FA.getCtx();
      var cw = getCW(ctx);
      var lineH = 18;
      var maxLen = menu.title.length;
      for (var oi = 0; oi < menu.options.length; oi++) {
        var optText = '[' + menu.options[oi].key + '] ' + menu.options[oi].label;
        if (optText.length > maxLen) maxLen = optText.length;
      }
      var tw = Math.min(W - 40, Math.max(180, maxLen * cw + 32));
      var th = (1 + menu.options.length) * lineH + 20;
      var bx = W / 2 - tw / 2, by = 20;
      drawBox(ctx, bx, by, tw, th, '#8878cc', 1);
      ctx.globalAlpha = 0.9;
      TextFX.render(ctx, menu.title, menu.timer, bx + 12, by + 10,
        FX('#8878cc', '#1a1530', 11, 60, 6, 25));
      for (var i = 0; i < menu.options.length; i++) {
        var opt = menu.options[i];
        var label = '[' + opt.key + '] ' + opt.label;
        var optY = by + 10 + (i + 1) * lineH;
        var optColor = opt.enabled !== false ? (opt.color || '#aa9') : '#443';
        ctx.globalAlpha = opt.enabled !== false ? 0.9 : 0.5;
        TextFX.render(ctx, label, menu.timer, bx + 16, optY,
          FX(optColor, '#1a1530', 11, 60, 4, 20));
      }
      ctx.globalAlpha = 1;
    }, 27);

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
      FA.draw.text(ending.title, W / 2, uiY / 2 - 70, O(ending.color, 28, true, 'center', 'middle'));
      var stats = state.finalStats || {};
      FA.draw.text('Days survived: ' + (stats.days || 1), W / 2, uiY / 2 - 20, O(colors.text, 14, false, 'center', 'middle'));
      FA.draw.text('System visits: ' + (stats.visits || 0), W / 2, uiY / 2 + 0, O('#f80', 14, false, 'center', 'middle'));
      FA.draw.text('Drones neutralized: ' + (stats.kills || 0), W / 2, uiY / 2 + 20, O(colors.text, 14, false, 'center', 'middle'));
      FA.draw.text('Credits: ' + (stats.credits || 0), W / 2, uiY / 2 + 40, O(colors.credits, 14, false, 'center', 'middle'));
      FA.draw.text('SCORE: ' + (state.score || 0), W / 2, uiY / 2 + 80, O('#fff', 22, true, 'center', 'middle'));
      FA.draw.text('[ R ]  Reinitialize', W / 2, uiY / 2 + 120, O(colors.dim, 16, false, 'center', 'middle'));
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
      ctx.globalAlpha = 0.12;
      ctx.drawImage(Render.scanlineCanvas, 0, 0);
      if (Math.random() > 0.95) {
        ctx.globalAlpha = 0.015; ctx.fillStyle = cs.color;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      var lineH = 24;
      var totalLines = cs.lines.length;
      var startY = Math.max(50, Math.floor((H - totalLines * lineH) / 2) - 20);
      var ld = cs.lineDelay || 200;
      for (var i = 0; i < totalLines; i++) {
        var lineElapsed = cs.timer - i * ld;
        if (lineElapsed <= 0) continue;
        var lineDone = lineElapsed >= TextFX.totalTime(cs.lines[i], FX(null, null, null, 100, 8, 30));
        if (lineDone && cs.timer - (i * ld + TextFX.totalTime(cs.lines[i], FX(null, null, null, 100, 8, 30))) > 400) ctx.globalAlpha = 0.6;
        else ctx.globalAlpha = 1;
        TextFX.render(ctx, cs.lines[i], lineElapsed, 80, startY + i * lineH,
          FX(cs.color, '#1a4a4a', 15, 100, 8, 30));
      }
      ctx.globalAlpha = 1;
      if (cs.done) {
        var now = Date.now();
        if (Math.floor(now / 600) % 2 === 0)
          FA.draw.text('[ SPACE ]', W / 2, H - 45, O('#445', 14, false, 'center', 'middle'));
      }
      ctx.globalAlpha = 0.3; ctx.fillStyle = cs.color;
      ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, H - 1, W, 1);
      ctx.globalAlpha = 1;
    }, 50);
  }

  window.RenderUI = { setup: setupUILayers };
})();
