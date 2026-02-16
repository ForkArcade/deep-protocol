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

  // Input handling
  FA.on('input:action', function(data) {
    var state = FA.getState();

    // Start screen
    if (state.screen === 'start' && data.action === 'start') {
      Game.begin();
      return;
    }

    // Game over screens
    if ((state.screen === 'extraction' || state.screen === 'shutdown') && data.action === 'restart') {
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
  });

  FA.setRender(function() {
    FA.draw.clear(colors.bg);
    FA.renderLayers();
  });

  // Start
  Render.setup();
  Game.start();

  if (typeof ForkArcade !== 'undefined') {
    ForkArcade.onReady(function() {});
  }

  FA.start();
})();
