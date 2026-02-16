// ForkArcade Engine v1 — Audio
// ENGINE FILE — do not modify in game repos
(function(window) {
  'use strict';

  var FA = window.FA;
  var _actx = null;
  var _sounds = {};
  var _volume = 0.3;
  var _muted = false;

  function ensureContext() {
    if (!_actx) {
      try { _actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { return null; }
    }
    if (_actx.state === 'suspended') _actx.resume();
    return _actx;
  }

  // ===== API =====

  FA.defineSound = function(name, fn) {
    _sounds[name] = fn;
  };

  FA.playSound = function(name) {
    if (_muted) return;
    var actx = ensureContext();
    if (!actx || !_sounds[name]) return;
    try {
      var gain = actx.createGain();
      gain.gain.value = _volume;
      gain.connect(actx.destination);
      _sounds[name](actx, gain);
    } catch(e) {}
  };

  FA.setVolume = function(v) { _volume = FA.clamp(v, 0, 1); };
  FA.toggleMute = function() { _muted = !_muted; return _muted; };
  FA.isMuted = function() { return _muted; };

  // ===== BUILT-IN SOUNDS =====

  FA.defineSound('hit', function(actx, dest) {
    var osc = actx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, actx.currentTime + 0.1);
    osc.connect(dest);
    osc.start();
    osc.stop(actx.currentTime + 0.1);
  });

  FA.defineSound('pickup', function(actx, dest) {
    var osc = actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, actx.currentTime + 0.15);
    osc.connect(dest);
    osc.start();
    osc.stop(actx.currentTime + 0.15);
  });

  FA.defineSound('death', function(actx, dest) {
    var osc = actx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, actx.currentTime + 0.5);
    osc.connect(dest);
    osc.start();
    osc.stop(actx.currentTime + 0.5);
  });

  FA.defineSound('spell', function(actx, dest) {
    var osc = actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, actx.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(300, actx.currentTime + 0.2);
    osc.connect(dest);
    osc.start();
    osc.stop(actx.currentTime + 0.2);
  });

  FA.defineSound('step', function(actx, dest) {
    var osc = actx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, actx.currentTime + 0.05);
    var g = actx.createGain();
    g.gain.setValueAtTime(0.3, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, actx.currentTime + 0.05);
    osc.connect(g);
    g.connect(dest);
    osc.start();
    osc.stop(actx.currentTime + 0.05);
  });

  FA.defineSound('levelup', function(actx, dest) {
    var t = actx.currentTime;
    [400, 500, 600, 800].forEach(function(freq, i) {
      var osc = actx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.1);
      osc.connect(dest);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.12);
    });
  });

  // ===== AUTO-PLAY ON GAME EVENTS =====

  FA.on('entity:damaged', function() { FA.playSound('hit'); });
  FA.on('entity:killed', function() { FA.playSound('death'); });
  FA.on('item:pickup', function() { FA.playSound('pickup'); });

})(window);
