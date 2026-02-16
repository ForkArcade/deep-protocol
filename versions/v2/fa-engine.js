// ForkArcade Engine v1 — Core
// ENGINE FILE — do not modify in game repos
(function(window) {
  'use strict';

  var FA = window.FA || {};
  window.FA = FA;

  FA.ENGINE_VERSION = 1;

  // ===== EVENT BUS =====

  var _listeners = {};

  FA.on = function(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  };

  FA.off = function(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(function(f) { return f !== fn; });
  };

  FA.emit = function(event, data) {
    var list = _listeners[event];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      list[i](data);
    }
  };

  // ===== STATE MANAGER =====

  var _state = {};

  FA.getState = function() { return _state; };

  FA.setState = function(key, value) {
    var prev = _state[key];
    _state[key] = value;
    FA.emit('state:changed', { key: key, value: value, prev: prev });
  };

  FA.resetState = function(initial) {
    _state = initial || {};
    FA.emit('state:reset', _state);
  };

  // ===== GAME LOOP =====

  var _updateFn = null;
  var _renderFn = null;
  var _running = false;
  var _lastTime = 0;
  var _accumulator = 0;
  var FIXED_DT = 1000 / 60;

  FA.setUpdate = function(fn) { _updateFn = fn; };
  FA.setRender = function(fn) { _renderFn = fn; };

  FA.start = function() {
    _running = true;
    _lastTime = performance.now();
    _accumulator = 0;
    _tick();
  };

  FA.stop = function() { _running = false; };

  function _tick() {
    if (!_running) return;
    var now = performance.now();
    var elapsed = Math.min(now - _lastTime, 100);
    _lastTime = now;
    _accumulator += elapsed;

    while (_accumulator >= FIXED_DT) {
      if (_updateFn) _updateFn(FIXED_DT);
      _accumulator -= FIXED_DT;
    }

    if (_renderFn) _renderFn();
    requestAnimationFrame(_tick);
  }

  // ===== REGISTRY =====

  var _registries = {};

  FA.register = function(registryName, id, def) {
    if (!_registries[registryName]) _registries[registryName] = {};
    _registries[registryName][id] = def;
  };

  FA.lookup = function(registryName, id) {
    return _registries[registryName] && _registries[registryName][id];
  };

  FA.lookupAll = function(registryName) {
    return _registries[registryName] || {};
  };

  // ===== UTILS =====

  FA.rand = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  FA.clamp = function(val, min, max) {
    return Math.max(min, Math.min(max, val));
  };

  FA.pick = function(arr) {
    return arr[FA.rand(0, arr.length - 1)];
  };

  FA.shuffle = function(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = FA.rand(0, i);
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  };

  FA.uid = function() {
    return Math.random().toString(36).substr(2, 9);
  };

})(window);
