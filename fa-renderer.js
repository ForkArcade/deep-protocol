// ForkArcade Engine v1 — Renderer
// ENGINE FILE — do not modify in game repos
(function(window) {
  'use strict';

  var FA = window.FA;
  var _canvas = null;
  var _ctx = null;
  var _layers = [];

  // ===== CANVAS =====

  FA.initCanvas = function(canvasId, width, height) {
    _canvas = document.getElementById(canvasId);
    _canvas.width = width;
    _canvas.height = height;
    _ctx = _canvas.getContext('2d');
    return _ctx;
  };

  FA.getCtx = function() { return _ctx; };
  FA.getCanvas = function() { return _canvas; };

  // ===== LAYERS =====

  FA.addLayer = function(name, drawFn, order) {
    _layers.push({ name: name, draw: drawFn, order: order || 0 });
    _layers.sort(function(a, b) { return a.order - b.order; });
  };

  FA.removeLayer = function(name) {
    _layers = _layers.filter(function(l) { return l.name !== name; });
  };

  FA.renderLayers = function() {
    for (var i = 0; i < _layers.length; i++) {
      _layers[i].draw(_ctx);
    }
  };

  // ===== SPRITE RUNTIME =====

  window.drawSprite = function(ctx, spriteDef, x, y, size, frame) {
    if (!spriteDef) return false;
    frame = frame || 0;
    frame = frame % spriteDef.frames.length;
    var key = size + '_' + frame;
    if (!spriteDef._c) spriteDef._c = {};
    if (!spriteDef._c[key]) {
      var cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      var cc = cv.getContext('2d');
      var pixels = spriteDef.frames[frame];
      var pw = size / spriteDef.w;
      var ph = size / spriteDef.h;
      for (var row = 0; row < spriteDef.h; row++) {
        var line = pixels[row];
        for (var col = 0; col < spriteDef.w; col++) {
          var ch = line[col];
          if (ch === '.') continue;
          var color = spriteDef.palette[ch];
          if (!color) continue;
          cc.fillStyle = color;
          cc.fillRect(col * pw, row * ph, Math.ceil(pw), Math.ceil(ph));
        }
      }
      spriteDef._c[key] = cv;
    }
    var ox = spriteDef.origin[0] * (size / spriteDef.w);
    var oy = spriteDef.origin[1] * (size / spriteDef.h);
    ctx.drawImage(spriteDef._c[key], x - ox, y - oy);
    return true;
  };

  window.getSprite = function(category, name) {
    return typeof SPRITE_DEFS !== 'undefined' && SPRITE_DEFS[category] && SPRITE_DEFS[category][name] || null;
  };

  window.spriteFrames = function(spriteDef) {
    return spriteDef ? spriteDef.frames.length : 0;
  };

  // ===== DRAW HELPERS =====

  FA.draw = {
    clear: function(color) {
      _ctx.fillStyle = color || '#000';
      _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
    },

    rect: function(x, y, w, h, color) {
      _ctx.fillStyle = color;
      _ctx.fillRect(x, y, w, h);
    },

    strokeRect: function(x, y, w, h, color, lineWidth) {
      _ctx.strokeStyle = color;
      _ctx.lineWidth = lineWidth || 1;
      _ctx.strokeRect(x, y, w, h);
    },

    circle: function(x, y, r, color) {
      _ctx.beginPath();
      _ctx.arc(x, y, r, 0, Math.PI * 2);
      _ctx.fillStyle = color;
      _ctx.fill();
    },

    strokeCircle: function(x, y, r, color, lineWidth) {
      _ctx.beginPath();
      _ctx.arc(x, y, r, 0, Math.PI * 2);
      _ctx.strokeStyle = color;
      _ctx.lineWidth = lineWidth || 1;
      _ctx.stroke();
    },

    text: function(text, x, y, opts) {
      opts = opts || {};
      _ctx.fillStyle = opts.color || '#fff';
      _ctx.font = (opts.bold ? 'bold ' : '') + (opts.size || 12) + 'px monospace';
      _ctx.textAlign = opts.align || 'left';
      _ctx.textBaseline = opts.baseline || 'top';
      _ctx.fillText(text, x, y);
    },

    bar: function(x, y, w, h, ratio, fg, bg) {
      _ctx.fillStyle = bg || '#222';
      _ctx.fillRect(x, y, w, h);
      _ctx.fillStyle = fg || '#4f4';
      _ctx.fillRect(x, y, w * FA.clamp(ratio, 0, 1), h);
    },

    gradientBar: function(x, y, w, h, ratio, colors, bg) {
      _ctx.fillStyle = bg || '#222';
      _ctx.fillRect(x, y, w, h);
      var fillW = w * FA.clamp(ratio, 0, 1);
      if (fillW > 0) {
        var grad = _ctx.createLinearGradient(x, 0, x + fillW, 0);
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(1, colors[1]);
        _ctx.fillStyle = grad;
        _ctx.fillRect(x, y, fillW, h);
      }
    },

    hex: function(cx, cy, size, fill, stroke, lineWidth) {
      _ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var angle = Math.PI / 180 * (60 * i - 30);
        var hx = cx + size * Math.cos(angle);
        var hy = cy + size * Math.sin(angle);
        if (i === 0) _ctx.moveTo(hx, hy); else _ctx.lineTo(hx, hy);
      }
      _ctx.closePath();
      if (fill) { _ctx.fillStyle = fill; _ctx.fill(); }
      if (stroke) { _ctx.strokeStyle = stroke; _ctx.lineWidth = lineWidth || 1; _ctx.stroke(); }
    },

    sprite: function(category, name, x, y, size, fallbackChar, fallbackColor, frame) {
      var sprite = getSprite(category, name);
      if (sprite) {
        drawSprite(_ctx, sprite, x, y, size, frame);
      } else if (fallbackChar) {
        _ctx.fillStyle = fallbackColor || '#fff';
        _ctx.font = Math.floor(size * 0.8) + 'px monospace';
        _ctx.textAlign = 'center';
        _ctx.textBaseline = 'middle';
        _ctx.fillText(fallbackChar, x + size / 2, y + size / 2);
      }
    },

    withAlpha: function(alpha, fn) {
      var prev = _ctx.globalAlpha;
      _ctx.globalAlpha = alpha;
      fn(_ctx);
      _ctx.globalAlpha = prev;
    },

    pushAlpha: function(alpha) {
      _ctx._prevAlpha = _ctx.globalAlpha;
      _ctx.globalAlpha = alpha;
    },

    popAlpha: function() {
      _ctx.globalAlpha = _ctx._prevAlpha !== undefined ? _ctx._prevAlpha : 1;
    },

    withClip: function(clipFn, drawFn) {
      _ctx.save();
      clipFn(_ctx);
      _ctx.clip();
      drawFn(_ctx);
      _ctx.restore();
    }
  };

  // ===== CAMERA =====

  FA.camera = {
    x: 0,
    y: 0,
    follow: function(targetX, targetY, mapW, mapH, viewW, viewH) {
      this.x = FA.clamp(targetX - viewW / 2, 0, Math.max(0, mapW - viewW));
      this.y = FA.clamp(targetY - viewH / 2, 0, Math.max(0, mapH - viewH));
    },
    reset: function() {
      this.x = 0;
      this.y = 0;
    }
  };

  // ===== VISUAL EFFECTS QUEUE =====

  var _effects = [];

  FA.addEffect = function(effect) {
    _effects.push(effect);
  };

  FA.updateEffects = function(dt) {
    for (var i = _effects.length - 1; i >= 0; i--) {
      _effects[i].life -= dt;
      if (_effects[i].onUpdate) _effects[i].onUpdate(_effects[i], dt);
      if (_effects[i].life <= 0) _effects.splice(i, 1);
    }
  };

  FA.getEffects = function() { return _effects; };

  FA.clearEffects = function() { _effects = []; };

  // ===== FLOATING MESSAGES =====

  var _floats = [];

  FA.addFloat = function(x, y, text, color, duration) {
    _floats.push({ x: x, y: y, text: text, color: color, life: duration || 1000, maxLife: duration || 1000 });
  };

  FA.updateFloats = function(dt) {
    for (var i = _floats.length - 1; i >= 0; i--) {
      _floats[i].life -= dt;
      _floats[i].y -= dt * 0.03;
      if (_floats[i].life <= 0) _floats.splice(i, 1);
    }
  };

  FA.drawFloats = function() {
    for (var i = 0; i < _floats.length; i++) {
      var f = _floats[i];
      FA.draw.pushAlpha(FA.clamp(f.life / f.maxLife, 0, 1));
      FA.draw.text(f.text, f.x, f.y, { color: f.color, size: 14, bold: true, align: 'center', baseline: 'middle' });
      FA.draw.popAlpha();
    }
  };

})(window);
