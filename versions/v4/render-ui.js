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
    var renderCfg = FA.lookup('config', 'rendering');
    var effectsCfg = FA.lookup('config', 'effects');
    var endingsCfg = FA.lookup('config', 'endings');

    var _adjDirs = [[0,-1],[0,1],[-1,0],[1,0]];
    var _actions = [{ label: '', color: '' }, { label: '', color: '' }, { label: '', color: '' }, { label: '', color: '' }, { label: '', color: '' }];

    // ================================================================
    //  UNIFIED UI PANEL — same layout in town and dungeon
    // ================================================================

    FA.addLayer('ui', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var L = getLayout();
      var W = L.W, H = L.H, ts = L.ts;
      var uiY = L.panelY != null ? L.panelY : cfg.rows * ts;
      var p = state.player;
      var ctx = FA.getCtx();
      var inTown = !Location.isSystem(state.mapId);
      var timeCfg = FA.lookup('config', 'time');

      // Background — always the same
      FA.draw.rect(0, uiY, W, H - uiY, '#0a0c14');
      FA.draw.rect(0, uiY, W, 1, '#1a2030');

      // === ROW 1 (y+6): HP | ATK DEF | Credits | Day/Time ===
      var hpRatio = p.hp / p.maxHp;
      var hpColor = hpRatio > renderCfg.hpThresholds.mid ? colors.hpHigh : hpRatio > renderCfg.hpThresholds.low ? colors.hpMid : colors.hpLow;
      FA.draw.text('HP', 8, uiY + 6, O('#4a6a7a', 11));
      FA.draw.bar(26, uiY + 7, 80, 8, hpRatio, hpColor, colors.hpBarBg);
      FA.draw.text(p.hp + '/' + p.maxHp, 110, uiY + 6, O('#6a8a9a', 11));

      FA.draw.text('ATK:' + p.atk + ' DEF:' + p.def, 175, uiY + 6, O('#4a5a6a', 11));

      FA.draw.text(state.credits + ' cr', 310, uiY + 6, O(colors.credits, 11, true));
      FA.draw.text('-' + state.rent + '/night', 365, uiY + 6, O(colors.rent, 10));

      // Day + period + time bar (always visible — in dungeon you still burn daylight)
      var day = timeCfg.turnsPerDay;
      var _hl = FA.lookup('config', 'hudLabels');
      var timeRatio = state.timeOfDay / day;
      var periodLabel = _hl ? _hl.periods[timeRatio < 0.33 ? 0 : timeRatio < 0.66 ? 1 : 2] : 'MORNING';
      var periodColor = state.timeOfDay < day * 0.33 ? colors.periodMorning : state.timeOfDay < day * 0.66 ? colors.periodMidday : colors.periodEvening;
      if (timeRatio > renderCfg.timeThresholds.danger) { periodLabel = (_hl && _hl.curfew) || 'CURFEW'; periodColor = colors.periodCurfew; }
      FA.draw.text('DAY ' + state.day + ' ' + periodLabel, 480, uiY + 6, O(periodColor, 11));
      var timeColor = timeRatio > renderCfg.timeThresholds.danger ? colors.timeBarDanger : timeRatio > renderCfg.timeThresholds.warning ? colors.timeBarWarning : colors.timeBarNormal;
      FA.draw.bar(620, uiY + 7, 70, 8, 1 - timeRatio, timeColor, colors.timeBarBg);

      // Depth indicator (only when in dungeon)
      if (!inTown) {
        FA.draw.text(((_hl && _hl.depth) || 'D') + (state.depth || 1) + '/' + cfg.maxDepth, W - 50, uiY + 6, O(colors.stairsDown, 11, true));
      }

      // === ROW 2 (y+21): Modules | Buffs ===
      var mods = p.modules || [];
      for (var m = 0; m < 3; m++) {
        var mx = 8 + m * 130;
        if (m < mods.length) {
          FA.draw.text('[' + (m + 1) + ']', mx, uiY + 21, O(colors.slotNumber, 11));
          FA.draw.text(mods[m].name, mx + 22, uiY + 21, O(mods[m].color, 11, true));
        } else {
          FA.draw.text('[' + (m + 1) + '] ---', mx, uiY + 21, O(colors.emptySlot, 11));
        }
      }

      // Buffs (shown when active, regardless of location)
      var buffX = 420;
      if (p.cloakTurns > 0) { FA.draw.text(((_hl && _hl.buffs && _hl.buffs.cloak) || 'CLOAK:') + p.cloakTurns, buffX, uiY + 21, O(colors.buffCloak, 11, true)); buffX += 65; }
      if (p.overclockActive) { FA.draw.text((_hl && _hl.buffs && _hl.buffs.overclock) || 'OC:RDY', buffX, uiY + 21, O(colors.buffOverclock, 11, true)); buffX += 55; }
      if (p.firewallHp > 0) { FA.draw.text(((_hl && _hl.buffs && _hl.buffs.firewall) || 'FW:') + p.firewallHp, buffX, uiY + 21, O(colors.buffFirewall, 11, true)); }

      // Dives counter (always)
      if (state.systemVisits > 0) {
        FA.draw.text(((_hl && _hl.stats && _hl.stats.dives) || 'DIVES:') + state.systemVisits, W - 65, uiY + 21, O(colors.divesLabel, 10));
      }

      // === ROW 3 (y+36): Context actions + NPCs | Stats ===

      // Context actions (town: object-based + NPC talk)
      var actionCount = 0;
      if (inTown) {
        var obj = Core.getObjectAtPos(p.x, p.y);
        if (obj && obj.type === 'bed') { _actions[0].label = ((_hl && _hl.actions && _hl.actions.lodging) || 'Lodging') + ' (' + state.rent + ' cr)'; _actions[0].color = colors.actionLodging; actionCount = 1; }
        else if (obj && obj.type === 'terminal') { _actions[0].label = state.workedToday ? ((_hl && _hl.actions && _hl.actions.workDone) || 'Shift done') : ((_hl && _hl.actions && _hl.actions.work) || 'Work'); _actions[0].color = state.workedToday ? colors.actionTerminalDone : colors.actionTerminal; actionCount = 1; }
        else if (obj && obj.type === 'notice_board') { _actions[0].label = (_hl && _hl.actions && _hl.actions.notices) || 'Read notices'; _actions[0].color = colors.actionNotices; actionCount = 1; }
        else if (obj && obj.type === 'cafe_table') { var cafeCfg = FA.lookup('config', 'cafe'); if (cafeCfg) { _actions[0].label = ((_hl && _hl.actions && _hl.actions.eat) || 'Eat') + ' (' + cafeCfg.cost + ' cr)'; _actions[0].color = colors.actionCafe; actionCount = 1; } }
        else if (obj && obj.type === 'garden_bench') { var gardenCfg = FA.lookup('config', 'garden'); if (gardenCfg) { _actions[0].label = ((_hl && _hl.actions && _hl.actions.rest) || 'Rest') + ' (free)'; _actions[0].color = colors.actionGarden; actionCount = 1; } }
        else if (obj && obj.type === 'system_entrance' && state.systemRevealed) { _actions[0].label = (_hl && _hl.actions && _hl.actions.system) || 'Enter System'; _actions[0].color = colors.actionSystem; actionCount = 1; }

        // Adjacent NPC talk
        var entities = state.maps.town.entities;
        for (var d = 0; d < _adjDirs.length; d++) {
          var nx = p.x + _adjDirs[d][0], ny = p.y + _adjDirs[d][1];
          for (var nj = 0; nj < entities.length; nj++) {
            var adjNpc = entities[nj];
            if (adjNpc.type !== 'npc') continue;
            if (state.day >= adjNpc.appearsDay && adjNpc.x === nx && adjNpc.y === ny) {
              if (actionCount < _actions.length) {
                _actions[actionCount].label = ((_hl && _hl.actions && _hl.actions.talkTo) || 'Talk to ') + adjNpc.name; _actions[actionCount].color = adjNpc.color;
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
        FA.draw.text('[SPACE]', ax, uiY + 36, O(colors.keyLabel, 10));
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
          if (nd > renderCfg.npcTagDistance) continue;
          var dimmed = nd > renderCfg.npcTagDimDistance;
          ctx.globalAlpha = dimmed ? 0.4 : 0.9;
          var moodCfg = FA.lookup('config', 'moods');
          var mLow = moodCfg && moodCfg.thresholds ? moodCfg.thresholds.low : 30;
          var mHigh = moodCfg && moodCfg.thresholds ? moodCfg.thresholds.high : 70;
          var dotColor = !dimmed && npc.mood < mLow ? colors.moodLow : !dimmed && npc.mood > mHigh ? colors.moodHigh : npc.color;
          FA.draw.rect(tagX, uiY + 37, 4, 4, dotColor);
          var npcLabel = npc.name;
          if (!dimmed && npc.currentJob) npcLabel += ' [' + npc.currentJob.id + ']';
          if (!dimmed) { var mc = npc.mood > mHigh ? '+' : npc.mood < mLow ? '-' : ''; if (mc) npcLabel += mc; }
          FA.draw.text(npcLabel, tagX + 7, uiY + 36, O(dimmed ? '#665' : '#aa9', 10));
          tagX += getCW(ctx, 10) * npcLabel.length + 18;
        }
        ctx.globalAlpha = 1;
      }

      // Right side of row 3: dungeon run stats
      if (!inTown) {
        FA.draw.text(((_hl && _hl.stats && _hl.stats.data) || 'DATA:') + p.gold, W - 220, uiY + 36, O('#0aa', 10));
        FA.draw.text(((_hl && _hl.stats && _hl.stats.kills) || 'KILLS:') + p.kills, W - 150, uiY + 36, O('#a44', 10));
        FA.draw.text(((_hl && _hl.stats && _hl.stats.turn) || 'T:') + (state.systemTurn || 0), W - 80, uiY + 36, O('#3a4a5a', 10));
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
      var L = getLayout();
      var W = L.W, ts = L.ts;
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
      var _sbFx = effectsCfg.textFx.systemBubble;
      for (var li = 0; li < lines.length; li++) {
        var lineElapsed = sb.timer - li * 200;
        if (lineElapsed <= 0) continue;
        TextFX.render(ctx, lines[li], lineElapsed, bx + 12, by + 6 + li * lineH,
          FX(sb.color, _sbFx.dimColor, _sbFx.size, _sbFx.duration, _sbFx.charDelay, _sbFx.flicker));
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
      var L = getLayout();
      var W = L.W, ts = L.ts;
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
      var _thFx = effectsCfg.textFx.thought;
      drawBox(ctx, bx, by, tw, th, _thFx.color, 1);
      var px = Math.max(bx + 8, Math.min(bx + tw - 8, ppx));
      drawPointer(ctx, px, by, th, flipped, _thFx.color, 1);
      ctx.globalAlpha = 0.9;
      TextFX.render(ctx, thought.text, thought.timer, bx + 8, by + 7,
        FX(_thFx.color, _thFx.dimColor, _thFx.size, _thFx.duration, _thFx.charDelay, _thFx.flicker));
      if (thought.done) {
        ctx.globalAlpha = 0.3;
        FA.draw.text('[SPACE]', bx + tw - 48, by + th + 4, O(_thFx.color, 8));
      }
      ctx.globalAlpha = 1;
    }, 26);

    // ================================================================
    //  CHOICE MENU
    // ================================================================

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
      var lineH = 18;
      var maxLen = menu.title.length;
      for (var oi = 0; oi < menu.options.length; oi++) {
        var optText = '  ' + menu.options[oi].label;
        if (optText.length > maxLen) maxLen = optText.length;
      }
      var tw = Math.min(W - 40, Math.max(180, maxLen * cw + 32));
      var th = (1 + menu.options.length) * lineH + 34;
      var bx = W / 2 - tw / 2, by = 20;
      var _chFx = effectsCfg.textFx.choice;
      var _coFx = effectsCfg.textFx.choiceOption;
      drawBox(ctx, bx, by, tw, th, colors.choiceMenu, 1);
      ctx.globalAlpha = 0.9;
      TextFX.render(ctx, menu.title, menu.timer, bx + 12, by + 10,
        FX(colors.choiceMenu, _chFx.dimColor, _chFx.size, _chFx.duration, _chFx.charDelay, _chFx.flicker));
      for (var i = 0; i < menu.options.length; i++) {
        var opt = menu.options[i];
        var selected = i === sel;
        var prefix = selected ? '> ' : '  ';
        var label = prefix + opt.label;
        var optY = by + 10 + (i + 1) * lineH;
        var optColor = opt.enabled !== false ? (opt.color || colors.choiceOption) : colors.actionTerminalDone;
        ctx.globalAlpha = opt.enabled !== false ? (selected ? 1.0 : 0.5) : 0.3;
        TextFX.render(ctx, label, menu.timer, bx + 16, optY,
          FX(optColor, _coFx.dimColor, _coFx.size, _coFx.duration, _coFx.charDelay, _coFx.flicker));
      }
      var _hl2 = FA.lookup('config', 'hudLabels');
      ctx.globalAlpha = 0.3;
      FA.draw.text((_hl2 && _hl2.controls && _hl2.controls.choiceHelp) || '[W/S] Select  [SPACE] Confirm', bx + 12, by + th - 16, O('#665', 8));
      ctx.globalAlpha = 1;
    }, 27);

    // ================================================================
    //  GAME OVER SCREEN
    // ================================================================

    var endingTitles = endingsCfg;

    FA.addLayer('gameOver', function() {
      var state = FA.getState();
      if (state.screen !== 'victory' && state.screen !== 'shutdown') return;
      var L = getLayout();
      var W = L.W, ts = L.ts;
      var uiY = L.panelY != null ? L.panelY : cfg.rows * ts;
      FA.draw.pushAlpha(0.8);
      FA.draw.rect(0, 0, W, uiY, '#000');
      FA.draw.popAlpha();
      var ending = endingTitles[state.endingNode] || endingTitles.shutdown;
      FA.draw.text(ending.title, W / 2, uiY / 2 - 70, O(ending.color, 28, true, 'center', 'middle'));
      var stats = state.finalStats || {};
      var _hl3 = FA.lookup('config', 'hudLabels');
      var _goLabels = _hl3 && _hl3.gameOver;
      FA.draw.text((_goLabels && _goLabels.daysSurvived || 'Days survived: ') + (stats.days || 1), W / 2, uiY / 2 - 20, O(colors.text, 14, false, 'center', 'middle'));
      FA.draw.text((_goLabels && _goLabels.systemVisits || 'System visits: ') + (stats.visits || 0), W / 2, uiY / 2 + 0, O(colors.systemVisitStat, 14, false, 'center', 'middle'));
      FA.draw.text((_goLabels && _goLabels.dronesNeutralized || 'Drones neutralized: ') + (stats.kills || 0), W / 2, uiY / 2 + 20, O(colors.text, 14, false, 'center', 'middle'));
      FA.draw.text((_goLabels && _goLabels.credits || 'Credits: ') + (stats.credits || 0), W / 2, uiY / 2 + 40, O(colors.credits, 14, false, 'center', 'middle'));
      FA.draw.text((_goLabels && _goLabels.score || 'SCORE: ') + (state.score || 0), W / 2, uiY / 2 + 80, O(colors.scoreFinal, 22, true, 'center', 'middle'));

      // Memories recovered this run
      var memories = state._activeMemories;
      if (memories && memories.length > 0) {
        var memY = uiY / 2 + 110;
        FA.draw.text((_goLabels && _goLabels.memoriesHeader) || 'MEMORIES RECOVERED:', W / 2, memY, O(colors.memoryHeader, 12, true, 'center', 'middle'));
        for (var mi = 0; mi < memories.length; mi++) {
          FA.draw.text(memories[mi].text, W / 2, memY + 16 + mi * 14, O(colors.memoryText, 10, false, 'center', 'middle'));
        }
        var _reinitLabel = (_hl3 && _hl3.controls && _hl3.controls.reinitialize) || '[ R ]  Reinitialize';
        FA.draw.text(_reinitLabel, W / 2, memY + 24 + memories.length * 14, O(colors.dim, 16, false, 'center', 'middle'));
      } else {
        var _reinitLabel2 = (_hl3 && _hl3.controls && _hl3.controls.reinitialize) || '[ R ]  Reinitialize';
        FA.draw.text(_reinitLabel2, W / 2, uiY / 2 + 120, O(colors.dim, 16, false, 'center', 'middle'));
      }
    }, 40);

    // ================================================================
    //  CUTSCENE
    // ================================================================

    FA.addLayer('cutscene', function() {
      var state = FA.getState();
      if (state.screen !== 'cutscene' || !state.cutscene) return;
      var L = getLayout();
      var W = L.W, H = L.H;
      var cs = state.cutscene;
      var ctx = FA.getCtx();
      FA.draw.clear('#040810');
      if (Render.scanlineCanvas) {
        ctx.globalAlpha = 0.12;
        ctx.drawImage(Render.scanlineCanvas, 0, 0);
      }
      if (Math.random() > 0.95) {
        ctx.globalAlpha = 0.015; ctx.fillStyle = cs.color;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      var lineH = 24;
      var totalLines = cs.lines.length;
      var startY = Math.max(50, Math.floor((H - totalLines * lineH) / 2) - 20);
      var _csFx = effectsCfg.textFx.cutscene;
      var ld = cs.lineDelay || 200;
      for (var i = 0; i < totalLines; i++) {
        var lineElapsed = cs.timer - i * ld;
        if (lineElapsed <= 0) continue;
        var lineDone = lineElapsed >= TextFX.totalTime(cs.lines[i], FX(null, null, null, _csFx.duration, _csFx.charDelay, _csFx.flicker));
        if (lineDone && cs.timer - (i * ld + TextFX.totalTime(cs.lines[i], FX(null, null, null, _csFx.duration, _csFx.charDelay, _csFx.flicker))) > 400) ctx.globalAlpha = 0.6;
        else ctx.globalAlpha = 1;
        TextFX.render(ctx, cs.lines[i], lineElapsed, 80, startY + i * lineH,
          FX(cs.color, _csFx.dimColor, _csFx.size, _csFx.duration, _csFx.charDelay, _csFx.flicker));
      }
      ctx.globalAlpha = 1;
      if (cs.done) {
        var now = Date.now();
        if (Math.floor(now / effectsCfg.dream.spaceBlinkMs) % 2 === 0)
          FA.draw.text('[ SPACE ]', W / 2, H - 45, O('#445', 14, false, 'center', 'middle'));
      }
      ctx.globalAlpha = 0.3; ctx.fillStyle = cs.color;
      ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, H - 1, W, 1);
      ctx.globalAlpha = 1;
    }, 50);
  }

  window.RenderUI = { setup: setupUILayers };
})();
