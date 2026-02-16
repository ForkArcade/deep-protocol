// Roguelike — Entry Point
// Keybindings, event wiring, game loop, ForkArcade integration
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

  // Input handling
  FA.on('input:action', function(data) {
    var state = FA.getState();
    if (data.action === 'restart' && state.gameOver) { Game.init(); return; }
    if (state.gameOver) return;
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
  });

  FA.setRender(function() {
    FA.draw.clear(colors.bg);
    FA.renderLayers();
  });

  // Start
  Render.setup();
  Game.init();

  if (typeof ForkArcade !== 'undefined') {
    ForkArcade.onReady(function() {});
  }

  FA.start();

})();
