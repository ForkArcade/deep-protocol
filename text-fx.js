// Deep Protocol — Split-flap text rendering (Solari board / COGMIND style)
// Offloads scramble computation to a Worker when available.
(function() {
  'use strict';

  var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@!<>=|{}[]~*+:';
  var CL = CHARS.length;
  var _cwCache = {};

  // --- Worker for batch scramble computation ---
  var _worker = null;
  var _workerPending = {};
  var _workerIdCounter = 0;

  function initWorker() {
    if (typeof Worker === 'undefined') return;
    try {
      var code = [
        'var C="' + CHARS + '",CL=' + CL + ';',
        'onmessage=function(e){',
        '  var d=e.data,r=[],tick=Math.floor(d.el/d.fl);',
        '  for(var li=0;li<d.lines.length;li++){',
        '    var line=d.lines[li],el=d.el-li*d.ld,s="",done=true;',
        '    if(el<=0){for(var j=0;j<line.length;j++)s+=" ";r.push({t:s,d:false});continue}',
        '    var lt=Math.floor(el/d.fl);',
        '    for(var i=0;i<line.length;i++){',
        '      var ch=line.charAt(i);',
        '      if(ch===" "){s+=" ";continue}',
        '      if(el>=d.dur+i*d.cd){s+=ch}',
        '      else{done=false;s+=C.charAt(((lt+i*13+i*i*7)%CL+CL)%CL)}',
        '    }',
        '    r.push({t:s,d:done});',
        '  }',
        '  postMessage({id:d.id,results:r});',
        '};'
      ].join('\n');
      var blob = new Blob([code], { type: 'application/javascript' });
      _worker = new Worker(URL.createObjectURL(blob));
      _worker.onmessage = function(e) {
        var cb = _workerPending[e.data.id];
        if (cb) { cb(e.data.results); delete _workerPending[e.data.id]; }
      };
    } catch (e) { _worker = null; }
  }

  // Request batch scramble from worker (non-blocking)
  function workerScramble(lines, elapsed, opts, callback) {
    if (!_worker) return false;
    var id = ++_workerIdCounter;
    _workerPending[id] = callback;
    _worker.postMessage({
      id: id,
      lines: lines,
      el: elapsed,
      cd: opts.charDelay || 8,
      dur: opts.duration || 100,
      fl: opts.flicker || 30,
      ld: opts.lineDelay || 200
    });
    return true;
  }

  // --- Main-thread scramble (fast, used as fallback and for single lines) ---

  function scramble(text, elapsed, opts) {
    if (!opts) opts = {};
    var cd = opts.charDelay || 8;
    var dur = opts.duration || 100;
    var fl = opts.flicker || 30;
    var tick = Math.floor(elapsed / fl);
    var out = '';
    var done = true;

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === ' ') { out += ' '; continue; }
      if (elapsed >= dur + i * cd) {
        out += ch;
      } else {
        done = false;
        out += CHARS.charAt(((tick + i * 13 + i * i * 7) % CL + CL) % CL);
      }
    }
    return { text: out, done: done };
  }

  // --- Char-by-char renderer with split-flap jitter ---

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
        // Settled — stable, target color
        ctx.fillStyle = color;
        ctx.fillText(ch, cx, y);
      } else {
        // Scrambling — jitter + dim color
        var idx = ((tick + i * 13 + i * i * 7) % CL + CL) % CL;
        var jitter = ((tick + i) % 3) - 1; // -1, 0, or 1
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

  function charWidth(ctx, size, bold) {
    return getCharWidth(ctx, size, bold);
  }

  // Init worker on load
  initWorker();

  window.TextFX = {
    scramble: scramble,
    render: render,
    totalTime: totalTime,
    charWidth: charWidth,
    workerScramble: workerScramble
  };
})();
