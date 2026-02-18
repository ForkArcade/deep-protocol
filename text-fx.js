// Deep Protocol — Split-flap text rendering (Solari board / COGMIND style)
(function() {
  'use strict';

  var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@!<>=|{}[]~*+:';
  var CL = CHARS.length;
  var _cwCache = {};

  function getCharWidth(ctx, size, bold) {
    var key = size + (bold ? 'b' : '');
    if (_cwCache[key]) return _cwCache[key];
    ctx.font = (bold ? 'bold ' : '') + size + 'px monospace';
    _cwCache[key] = ctx.measureText('M').width;
    return _cwCache[key];
  }

  function render(ctx, text, elapsed, x, y, opts) {
    if (!opts) opts = {};
    var cd = opts.charDelay || 8;
    var dur = opts.duration || 100;
    var fl = opts.flicker || 30;
    var size = opts.size || 14;
    var bold = opts.bold || false;
    var color = opts.color || '#4ef';
    var dimColor = opts.dimColor || '#1a5040';
    var align = opts.align || 'left';
    var baseline = opts.baseline || 'top';

    var cw = getCharWidth(ctx, size, bold);
    var tick = Math.floor(elapsed / fl);
    var font = (bold ? 'bold ' : '') + size + 'px monospace';

    var startX = x;
    if (align === 'center') startX = x - (text.length * cw) / 2;
    else if (align === 'right') startX = x - text.length * cw;

    ctx.font = font;
    ctx.textBaseline = baseline;
    ctx.textAlign = 'left';

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === ' ') continue;

      var cx = startX + i * cw;
      var settleAt = dur + i * cd;

      if (elapsed >= settleAt) {
        ctx.fillStyle = color;
        ctx.fillText(ch, cx, y);
      } else {
        var idx = ((tick + i * 13 + i * i * 7) % CL + CL) % CL;
        var jitter = ((tick + i) % 3) - 1;
        ctx.fillStyle = dimColor;
        ctx.fillText(CHARS.charAt(idx), cx, y + jitter);
      }
    }
  }

  function totalTime(text, opts) {
    if (!opts) opts = {};
    var cd = opts.charDelay || 8;
    var dur = opts.duration || 100;
    var last = 0;
    for (var i = text.length - 1; i >= 0; i--) {
      if (text.charAt(i) !== ' ') { last = i; break; }
    }
    return dur + (last + 1) * cd;
  }

  window.TextFX = {
    render: render,
    totalTime: totalTime
  };
})();
