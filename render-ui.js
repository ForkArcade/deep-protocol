// Deep Protocol — UI Rendering
// Single consistent panel, bubbles, menus, overlays — same layout everywhere
(function() {
  'use strict';
  var FA = window.FA;

  function setupUILayers() {
    var cfg = FA.lookup('config', 'game');
    var colors = FA.lookup('config', 'colors');
    var ts = cfg.tileSize;
    var W = cfg.canvasWidth;
    var H = cfg.canvasHeight;
    var uiY = cfg.rows * ts;

    // ================================================================
    //  UNIFIED UI PANEL — same layout in town and dungeon
    // ================================================================

    FA.addLayer('ui', function() {
      var state = FA.getState();
      if (state.screen !== 'playing' && state.screen !== 'victory' && state.screen !== 'shutdown') return;
      if (!state.player) return;
      var p = state.player;
      var ctx = FA.getCtx();
      var inTown = state.mapId === 'town';
      var timeCfg = FA.lookup('config', 'time');

      // Background — always the same
      FA.draw.rect(0, uiY, W, H - uiY, '#0a0c14');
      FA.draw.rect(0, uiY, W, 1, '#1a2030');

      // === ROW 1 (y+6): HP | ATK DEF | Credits | Day/Time ===
      var hpRatio = p.hp / p.maxHp;
      var hpColor = hpRatio > 0.5 ? '#4f4' : hpRatio > 0.25 ? '#fa4' : '#f44';
      FA.draw.text('HP', 8, uiY + 6, { color: '#4a6a7a', size: 11 });
      FA.draw.bar(26, uiY + 7, 80, 8, hpRatio, hpColor, '#0a1a0a');
      FA.draw.text(p.hp + '/' + p.maxHp, 110, uiY + 6, { color: '#6a8a9a', size: 11 });

      FA.draw.text('ATK:' + p.atk + ' DEF:' + p.def, 175, uiY + 6, { color: '#4a5a6a', size: 11 });

      FA.draw.text(state.credits + ' cr', 310, uiY + 6, { color: colors.credits, size: 11, bold: true });
      FA.draw.text('-' + state.rent + '/night', 365, uiY + 6, { color: '#a65', size: 10 });

      // Day + period + time bar (always visible — in dungeon you still burn daylight)
      var day = timeCfg.turnsPerDay;
      var period = state.timeOfDay < day * 0.33 ? 'MORNING' : state.timeOfDay < day * 0.66 ? 'MIDDAY' : 'EVENING';
      var periodColor = state.timeOfDay < day * 0.33 ? '#d8b060' : state.timeOfDay < day * 0.66 ? '#e0a030' : '#c06030';
      var timeRatio = state.timeOfDay / day;
      if (timeRatio > 0.95) { period = 'CURFEW'; periodColor = '#f44'; }
      FA.draw.text('DAY ' + state.day + ' ' + period, 480, uiY + 6, { color: periodColor, size: 11 });
      var timeColor = timeRatio > 0.95 ? '#f44' : timeRatio > 0.75 ? '#e08030' : '#c8a050';
      FA.draw.bar(620, uiY + 7, 70, 8, 1 - timeRatio, timeColor, '#1a1610');

      // Depth indicator (only when in dungeon)
      if (!inTown) {
        FA.draw.text('D' + (state.depth || 1) + '/' + cfg.maxDepth, W - 50, uiY + 6, { color: colors.stairsDown, size: 11, bold: true });
      }

      // === ROW 2 (y+21): Modules | Buffs ===
      var mods = p.modules || [];
      for (var m = 0; m < 3; m++) {
        var mx = 8 + m * 130;
        if (m < mods.length) {
          FA.draw.text('[' + (m + 1) + ']', mx, uiY + 21, { color: '#3a5060', size: 11 });
          FA.draw.text(mods[m].name, mx + 22, uiY + 21, { color: mods[m].color, size: 11, bold: true });
        } else {
          FA.draw.text('[' + (m + 1) + '] ---', mx, uiY + 21, { color: '#1a2530', size: 11 });
        }
      }

      // Buffs (shown when active, regardless of location)
      var buffX = 420;
      if (p.cloakTurns > 0) { FA.draw.text('CLOAK:' + p.cloakTurns, buffX, uiY + 21, { color: '#88f', size: 11, bold: true }); buffX += 65; }
      if (p.overclockActive) { FA.draw.text('OC:RDY', buffX, uiY + 21, { color: '#f44', size: 11, bold: true }); buffX += 55; }
      if (p.firewallHp > 0) { FA.draw.text('FW:' + p.firewallHp, buffX, uiY + 21, { color: '#4f4', size: 11, bold: true }); }

      // Dives counter (always)
      if (state.systemVisits > 0) {
        FA.draw.text('DIVES:' + state.systemVisits, W - 65, uiY + 21, { color: '#664', size: 10 });
      }

      // === ROW 3 (y+36): Context actions + NPCs | Stats ===

      // Context actions (town: tile-based + NPC talk)
      var actions = [];
      if (inTown) {
        var tile = state.map[p.y] ? state.map[p.y][p.x] : 0;
        if (tile === 6) actions.push({ key: 'SPACE', label: 'Lodging (' + state.rent + ' cr)', color: '#8878cc' });
        else if (tile === 7) actions.push({ key: 'SPACE', label: state.workedToday ? 'Shift done' : 'Work', color: state.workedToday ? '#443' : '#88aa66' });
        else if (tile === 4) actions.push({ key: 'SPACE', label: 'Read notices', color: '#aa9a50' });
        else if (tile === 8 && state.systemRevealed) actions.push({ key: 'SPACE', label: 'Enter System', color: '#f80' });

        // Adjacent NPC talk
        var entities = state.maps.town.entities;
        var adjDirs = [[0,-1],[0,1],[-1,0],[1,0]];
        for (var d = 0; d < adjDirs.length; d++) {
          var nx = p.x + adjDirs[d][0], ny = p.y + adjDirs[d][1];
          for (var nj = 0; nj < entities.length; nj++) {
            var adjNpc = entities[nj];
            if (adjNpc.type !== 'npc') continue;
            if (state.day >= adjNpc.appearsDay && adjNpc.x === nx && adjNpc.y === ny) {
              actions.push({ key: 'SPACE', label: 'Talk to ' + adjNpc.name, color: adjNpc.color });
              break;
            }
          }
        }
      }

      var ax = 8;
      for (var ai = 0; ai < actions.length; ai++) {
        var act = actions[ai];
        FA.draw.text('[' + act.key + ']', ax, uiY + 36, { color: '#554', size: 10 });
        ax += ctx.measureText('[' + act.key + ']').width + 4;
        FA.draw.text(act.label, ax, uiY + 36, { color: act.color, size: 10 });
        ax += ctx.measureText(act.label).width + 12;
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
          ctx.save();
          ctx.globalAlpha = dimmed ? 0.4 : 0.9;
          FA.draw.rect(tagX, uiY + 37, 4, 4, npc.color);
          FA.draw.text(npc.name, tagX + 7, uiY + 36, { color: dimmed ? '#665' : '#aa9', size: 10 });
          ctx.restore();
          tagX += ctx.measureText(npc.name).width + 18;
        }
      }

      // Right side of row 3: dungeon run stats
      if (!inTown) {
        FA.draw.text('DATA:' + p.gold, W - 220, uiY + 36, { color: '#0aa', size: 10 });
        FA.draw.text('KILLS:' + p.kills, W - 150, uiY + 36, { color: '#a44', size: 10 });
        FA.draw.text('T:' + (state.systemTurn || 0), W - 80, uiY + 36, { color: '#3a4a5a', size: 10 });
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
      if (sb.done && sb.life > 1500) {
        ctx.save(); ctx.globalAlpha = 0.3 * alpha;
        FA.draw.text('[SPACE]', bx + tw - 48, by + th + 4, { color: sb.color, size: 8 }); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = 0.04 * alpha; ctx.fillStyle = '#000';
      for (var sl = by; sl < by + th; sl += 2) ctx.fillRect(bx, sl, tw, 1);
      ctx.restore();
    }, 25);

    // ================================================================
    //  THOUGHT BUBBLE
    // ================================================================

    FA.addLayer('terminal', function() {
      var state = FA.getState();
      if (state.screen !== 'playing') return;
      if (state.systemBubble) return;
      if (!state.thoughts || state.thoughts.length === 0) return;
      var thought = null;
      for (var ti = state.thoughts.length - 1; ti >= 0; ti--) {
        var t = state.thoughts[ti];
        if (!(t.done && t.life <= 0)) { thought = t; break; }
      }
      if (!thought) return;
      if (!state.player) return;
      var ctx = FA.getCtx();

      var ppx = state.player.x * ts + ts / 2;
      var ppy = state.player.y * ts;
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
        FA.draw.text('[SPACE]', bx + tw - 48, by + th + 4, { color: '#4ef', size: 8 }); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = 0.04 * alpha; ctx.fillStyle = '#000';
      for (var sl = by; sl < by + th; sl += 2) ctx.fillRect(bx, sl, tw, 1);
      ctx.restore();
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
      var lineH = 18, charW = 6.5;
      var titleLen = menu.title.length;
      var maxLen = titleLen;
      for (var oi = 0; oi < menu.options.length; oi++) {
        var optText = '[' + menu.options[oi].key + '] ' + menu.options[oi].label;
        if (optText.length > maxLen) maxLen = optText.length;
      }
      var tw = Math.min(W - 40, Math.max(180, maxLen * charW + 32));
      var th = (1 + menu.options.length) * lineH + 20;
      var bx = W / 2 - tw / 2, by = 20;

      ctx.save(); ctx.globalAlpha = 0.88; ctx.fillStyle = '#060a12';
      ctx.fillRect(bx, by, tw, th); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.4; ctx.strokeStyle = '#8878cc'; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.04; ctx.fillStyle = '#000';
      for (var sl = by; sl < by + th; sl += 2) ctx.fillRect(bx, sl, tw, 1);
      ctx.restore();

      ctx.save(); ctx.globalAlpha = 0.9;
      TextFX.render(ctx, menu.title, menu.timer, bx + 12, by + 10, {
        color: '#8878cc', dimColor: '#1a1530', size: 11, duration: 60, charDelay: 6, flicker: 25
      }); ctx.restore();

      for (var i = 0; i < menu.options.length; i++) {
        var opt = menu.options[i];
        var label = '[' + opt.key + '] ' + opt.label;
        var optY = by + 10 + (i + 1) * lineH;
        var optColor = opt.enabled !== false ? (opt.color || '#aa9') : '#443';
        ctx.save(); ctx.globalAlpha = opt.enabled !== false ? 0.9 : 0.5;
        TextFX.render(ctx, label, menu.timer, bx + 16, optY, {
          color: optColor, dimColor: '#1a1530', size: 11, duration: 60, charDelay: 4, flicker: 20
        }); ctx.restore();
      }
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

  window.RenderUI = { setup: setupUILayers };
})();
