// Deep Protocol — Entry Point (Unified World)
(function() {
  'use strict';
  var FA = window.FA;
  var cfg = FA.lookup('config', 'game');
  var colors = FA.lookup('config', 'colors');
  var combatCfg = FA.lookup('config', 'combat');
  var fovCfg = FA.lookup('config', 'fov');

  // Dimensions set initially; ResizeObserver in gameLoader overrides to actual container size
  var canvasEl = document.getElementById('game');
  FA.initCanvas('game', canvasEl.width || 800, canvasEl.height || 600);

  // Keybindings
  FA.bindKey('forward',     ['ArrowUp',    'w']);
  FA.bindKey('back',        ['ArrowDown',  's']);
  FA.bindKey('rotateLeft',  ['ArrowLeft',  'a']);
  FA.bindKey('rotateRight', ['ArrowRight', 'd']);
  FA.bindKey('strafeLeft',  ['q']);
  FA.bindKey('strafeRight', ['e']);
  FA.bindKey('restart', ['r']);
  FA.bindKey('start',   [' ', 'Enter']);
  FA.bindKey('mod1', ['1']);
  FA.bindKey('mod2', ['2']);
  FA.bindKey('mod3', ['3']);

  // Input — direct keydown (FA event bus broken on platform)
  var _keyMap = {
    'ArrowUp': 'forward', 'w': 'forward',
    'ArrowDown': 'back', 's': 'back',
    'ArrowLeft': 'rotateLeft', 'a': 'rotateLeft',
    'ArrowRight': 'rotateRight', 'd': 'rotateRight',
    'q': 'strafeLeft', 'e': 'strafeRight',
    ' ': 'start', 'Enter': 'start',
    'r': 'restart',
    '1': 'mod1', '2': 'mod2', '3': 'mod3'
  };

  document.addEventListener('keydown', function(e) {
    var action = _keyMap[e.key];
    if (!action) return;
    var state = FA.getState();

    if (state.screen === 'start' && action === 'start') {
      e.preventDefault(); Game.begin(); return;
    }
    if (state.screen === 'cutscene' && action === 'start') {
      e.preventDefault(); Game.dismissCutscene(); return;
    }
    if (state.screen === 'dream' && action === 'start') {
      e.preventDefault(); Game.dismissDream(); return;
    }
    if ((state.screen === 'victory' || state.screen === 'shutdown') && action === 'restart') {
      e.preventDefault(); Game.start(); return;
    }
    if (state.screen !== 'playing') return;
    e.preventDefault();

    if (state.choiceMenu) {
      if (action === 'forward') { FA.playSound('choice'); Game.choiceUp(); }
      else if (action === 'back') { FA.playSound('choice'); Game.choiceDown(); }
      else if (action === 'start') { FA.playSound('confirm'); Game.confirmChoice(); }
      return;
    }
    if (action === 'start') {
      if ((state.thoughts && state.thoughts.length > 0) || state.systemBubble) {
        Game.dismissBubbles();
      } else {
        Game.interact();
      }
      return;
    }
    switch (action) {
      case 'forward': case 'back': case 'strafeLeft': case 'strafeRight':
      case 'rotateLeft': case 'rotateRight':
        Game.movePlayer(action); break;
      case 'mod1':  Game.useModule(0); break;
      case 'mod2':  Game.useModule(1); break;
      case 'mod3':  Game.useModule(2); break;
    }
  });

  // Score submission
  FA.on('game:over', function(data) {
    if (typeof ForkArcade !== 'undefined') {
      ForkArcade.submitScore(data.score);
    }
  });

  // Game loop
  FA.setUpdate(function(dt) {
    FA.updateEffects(dt);
    FA.updateFloats(dt);
    var state = FA.getState();
    // Choice menu timer
    if (state.choiceMenu) {
      state.choiceMenu.timer += dt;
    }
    // System bubble scramble timing (fade is turn-based via Core.tickBubbles)
    if (state.systemBubble) {
      var sb = state.systemBubble;
      if (!sb.done) {
        sb.timer += dt;
        var sbLD = 200;
        var sbLastIdx = sb.lines.length - 1;
        var sbEnd = sbLastIdx * sbLD + TextFX.totalTime(sb.lines[sbLastIdx]);
        if (sb.timer >= sbEnd) sb.done = true;
      }
    }
    // Cutscene scramble timing
    if (state.screen === 'cutscene' && state.cutscene && !state.cutscene.done) {
      state.cutscene.timer += dt;
      var cs = state.cutscene;
      var ld = cs.lineDelay || 200;
      var lastIdx = cs.lines.length - 1;
      var endTime = lastIdx * ld + TextFX.totalTime(cs.lines[lastIdx]);
      if (cs.timer >= endTime) cs.done = true;
    }
    // Thought scramble timing (fade is turn-based via Core.tickBubbles)
    if (state.thoughts) {
      for (var ti = state.thoughts.length - 1; ti >= 0; ti--) {
        var th = state.thoughts[ti];
        if (!th.done) {
          th.timer += dt;
          if (th.timer >= TextFX.totalTime(th.text)) th.done = true;
        }
      }
    }
    // Dream timer
    if (state.screen === 'dream') {
      state.dreamTimer = (state.dreamTimer || 0) + dt;
    }
    // Screen shake decay
    if (state.shake > 0) {
      state.shakeX = (Math.random() - 0.5) * state.shake;
      state.shakeY = (Math.random() - 0.5) * state.shake;
      state.shake -= dt * combatCfg.shakeDecay;
      if (state.shake < 0) { state.shake = 0; state.shakeX = 0; state.shakeY = 0; }
    }
    // Kill particles
    if (state.particles) {
      for (var pi = state.particles.length - 1; pi >= 0; pi--) {
        var pt = state.particles[pi];
        pt.x += pt.vx * dt / 1000;
        pt.y += pt.vy * dt / 1000;
        pt.vx *= combatCfg.particleDrag; pt.vy *= combatCfg.particleDrag;
        pt.life -= dt;
        if (pt.life <= 0) state.particles.splice(pi, 1);
      }
    }
    // Sound waves
    if (state.soundWaves) {
      for (var wi = state.soundWaves.length - 1; wi >= 0; wi--) {
        state.soundWaves[wi].life -= dt;
        if (state.soundWaves[wi].life <= 0) state.soundWaves.splice(wi, 1);
      }
    }
  });

  FA.setRender(function() {
    FA.draw.clear(colors.bg);
    var state = FA.getState();
    var ctx = FA.getCtx();
    var sx = state.shakeX || 0, sy = state.shakeY || 0;
    if (sx || sy) ctx.translate(sx, sy);
    FA.renderLayers();
    if (sx || sy) ctx.translate(-sx, -sy);
  });

  // Hot-reload maps from editor (fa-map-update dispatched by SDK)
  window.addEventListener('fa-map-update', function(e) {
    var state = FA.getState();
    if (!state.maps) return;
    var mapDefs = e.detail;
    if (!mapDefs) return;
    if (mapDefs.overworld && mapDefs.overworld.grid) {
      var grid = mapDefs.overworld.grid.map(function(row) {
        return row.split('').map(Number);
      });
      var objects = mapDefs.overworld.objects || [];
      for (var bi = 0; bi < objects.length; bi++) {
        if (objects[bi].blocking) {
          grid[objects[bi].y][objects[bi].x] = 9;
        }
      }
      state.maps.town.grid = grid;
      state.maps.town.objects = objects;
      if (mapDefs.overworld.frameGrid) {
        var C = '0123456789abcdefghij';
        state.maps.town._frameGrid = mapDefs.overworld.frameGrid.map(function(row) {
          return row.split('').map(function(c) { return C.indexOf(c); });
        });
      } else {
        state.maps.town._frameGrid = null;
      }
      if (!Location.isSystem(state.mapId)) {
        state.map = grid;
        if (state.player) {
          state.visible = Core.computeVisibility(grid, state.player.x, state.player.y, fovCfg.overworld);
        }
      }
      state.mapVersion = (state.mapVersion || 0) + 1;
    }
  });

  // Start
  Render.setup();
  RenderUI.setup();
  Game.start();

  if (typeof ForkArcade !== 'undefined') {
    ForkArcade.onReady(function() {});
  }

  FA.start();
})();
