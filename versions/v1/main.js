// Deep Protocol — Entry Point
(function() {
  'use strict';
  var FA = window.FA;
  var cfg = FA.lookup('config', 'game');
  var colors = FA.lookup('config', 'colors');

  FA.initCanvas('game', cfg.canvasWidth, cfg.canvasHeight);

  // Keybindings
  FA.bindKey('up',    ['ArrowUp',    'w']);
  FA.bindKey('down',  ['ArrowDown',  's']);
  FA.bindKey('left',  ['ArrowLeft',  'a']);
  FA.bindKey('right', ['ArrowRight', 'd']);
  FA.bindKey('restart', ['r']);
  FA.bindKey('start',   [' ', 'Enter']);
  FA.bindKey('mod1', ['1']);
  FA.bindKey('mod2', ['2']);
  FA.bindKey('mod3', ['3']);

  // Input handling
  FA.on('input:action', function(data) {
    var state = FA.getState();

    // Start screen
    if (state.screen === 'start' && data.action === 'start') {
      Game.begin();
      return;
    }

    // Cutscene — Space to skip/dismiss
    if (state.screen === 'cutscene' && data.action === 'start') {
      Game.dismissCutscene();
      return;
    }

    // Game over screens
    if ((state.screen === 'victory' || state.screen === 'shutdown') && data.action === 'restart') {
      Game.start();
      return;
    }

    // Playing
    if (state.screen !== 'playing') return;
    switch (data.action) {
      case 'up':    Game.movePlayer(0, -1); break;
      case 'down':  Game.movePlayer(0, 1);  break;
      case 'left':  Game.movePlayer(-1, 0); break;
      case 'right': Game.movePlayer(1, 0);  break;
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
    // Narrative message timer
    var state = FA.getState();
    if (state.narrativeMessage && state.narrativeMessage.life > 0) {
      state.narrativeMessage.life -= dt;
    }
    // Cutscene typewriter
    if (state.screen === 'cutscene' && state.cutscene && !state.cutscene.done) {
      state.cutscene.timer += dt;
      if (state.cutscene.timer >= state.cutscene.totalChars * state.cutscene.speed) {
        state.cutscene.done = true;
      }
    }
    // Screen shake decay
    if (state.shake > 0) {
      state.shakeX = (Math.random() - 0.5) * state.shake;
      state.shakeY = (Math.random() - 0.5) * state.shake;
      state.shake -= dt * 0.012;
      if (state.shake < 0) { state.shake = 0; state.shakeX = 0; state.shakeY = 0; }
    }
    // Kill particles
    if (state.particles) {
      for (var pi = state.particles.length - 1; pi >= 0; pi--) {
        var pt = state.particles[pi];
        pt.x += pt.vx * dt / 1000;
        pt.y += pt.vy * dt / 1000;
        pt.vx *= 0.97; pt.vy *= 0.97;
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

  // Start
  Render.setup();
  Game.start();

  if (typeof ForkArcade !== 'undefined') {
    ForkArcade.onReady(function() {});
  }

  FA.start();
})();
