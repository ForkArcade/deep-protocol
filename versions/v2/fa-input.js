// ForkArcade Engine v1 — Input
// ENGINE FILE — do not modify in game repos
(function(window) {
  'use strict';

  var FA = window.FA;
  var _keys = {};
  var _justPressed = {};
  var _bindings = {};
  var _mouseX = 0, _mouseY = 0;
  var _mouseClicked = false;
  var _clickX = 0, _clickY = 0;

  // ===== KEY BINDINGS =====

  FA.bindKey = function(action, keys) {
    _bindings[action] = Array.isArray(keys) ? keys : [keys];
  };

  FA.isAction = function(action) {
    var keys = _bindings[action];
    if (!keys) return false;
    for (var i = 0; i < keys.length; i++) {
      if (_justPressed[keys[i]]) return true;
    }
    return false;
  };

  FA.isHeld = function(action) {
    var keys = _bindings[action];
    if (!keys) return false;
    for (var i = 0; i < keys.length; i++) {
      if (_keys[keys[i]]) return true;
    }
    return false;
  };

  FA.isKeyPressed = function(key) {
    return !!_justPressed[key];
  };

  // ===== MOUSE =====

  FA.getMouse = function() {
    return { x: _mouseX, y: _mouseY };
  };

  FA.consumeClick = function() {
    if (_mouseClicked) {
      _mouseClicked = false;
      return { x: _clickX, y: _clickY };
    }
    return null;
  };

  // ===== FRAME RESET =====

  FA.clearInput = function() {
    _justPressed = {};
    _mouseClicked = false;
  };

  // ===== EVENT LISTENERS =====

  document.addEventListener('keydown', function(e) {
    if (!_keys[e.key]) _justPressed[e.key] = true;
    _keys[e.key] = true;

    for (var action in _bindings) {
      var keys = _bindings[action];
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] === e.key) {
          FA.emit('input:action', { action: action, key: e.key, event: e });
          e.preventDefault();
          return;
        }
      }
    }
  });

  document.addEventListener('keyup', function(e) {
    _keys[e.key] = false;
  });

  var _canvasEl = null;

  function resolveCanvas() {
    if (!_canvasEl) _canvasEl = FA.getCanvas();
    return _canvasEl;
  }

  function canvasCoords(e) {
    var c = resolveCanvas();
    if (!c) return null;
    var rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height)
    };
  }

  document.addEventListener('mousemove', function(e) {
    var pos = canvasCoords(e);
    if (!pos) return;
    _mouseX = pos.x;
    _mouseY = pos.y;
    FA.emit('input:mousemove', { x: _mouseX, y: _mouseY });
  });

  document.addEventListener('click', function(e) {
    var pos = canvasCoords(e);
    if (!pos) return;
    _clickX = pos.x;
    _clickY = pos.y;
    _mouseClicked = true;
    FA.emit('input:click', { x: _clickX, y: _clickY });
  });

  FA.on('state:reset', function() {
    _keys = {};
    _justPressed = {};
    _mouseClicked = false;
    _canvasEl = null;
  });

})(window);
