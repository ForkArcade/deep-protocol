// Deep Protocol — Audio System (rich synthesis, data-driven)
// Reads sound definitions from FA.lookup('config','sounds')
// FM synthesis, reverb, delay, noise shaping, multi-osc patches
(function() {
  'use strict';
  var FA = window.FA;
  var _ctx = null;
  var _master = null;    // master gain → destination
  var _reverb = null;    // ConvolverNode (impulse response)
  var _reverbGain = null;
  var _dryGain = null;
  var _delay = null;     // DelayNode for echo
  var _delayFb = null;   // feedback gain
  var _delayWet = null;  // wet level
  var _ambients = {};
  var _pollId = null;
  var _soundCfg = null;

  // --- Master bus: dry + reverb + delay ---

  function _buildMasterBus() {
    if (!_ctx || _master) return;

    _master = _ctx.createGain();
    _master.gain.value = 0.8;

    // Dry path
    _dryGain = _ctx.createGain();
    _dryGain.gain.value = 0.7;
    _dryGain.connect(_ctx.destination);

    // Reverb path (algorithmic IR)
    _reverbGain = _ctx.createGain();
    _reverbGain.gain.value = 0.35;
    _reverb = _buildReverb(2.2, 3.5);
    if (_reverb) {
      _reverb.connect(_reverbGain);
      _reverbGain.connect(_ctx.destination);
    }

    // Delay path
    _delay = _ctx.createDelay(1.0);
    _delay.delayTime.value = 0.22;
    _delayFb = _ctx.createGain();
    _delayFb.gain.value = 0.3;
    _delayWet = _ctx.createGain();
    _delayWet.gain.value = 0.2;
    var delayFilter = _ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2000;
    _delay.connect(delayFilter);
    delayFilter.connect(_delayFb);
    _delayFb.connect(_delay); // feedback loop
    delayFilter.connect(_delayWet);
    _delayWet.connect(_ctx.destination);

    // Master routes to all three paths
    _master.connect(_dryGain);
    if (_reverb) _master.connect(_reverb);
    _master.connect(_delay);
  }

  function _buildReverb(decay, len) {
    if (!_ctx) return null;
    try {
      var rate = _ctx.sampleRate;
      var samples = Math.floor(rate * len);
      var buf = _ctx.createBuffer(2, samples, rate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch);
        for (var i = 0; i < samples; i++) {
          // Exponential decay with early reflections
          var t = i / rate;
          var env = Math.exp(-t / decay);
          // Add some early reflection spikes
          var early = (i < rate * 0.08) ? 0.6 : 1.0;
          d[i] = (Math.random() * 2 - 1) * env * early;
        }
      }
      var conv = _ctx.createConvolver();
      conv.buffer = buf;
      return conv;
    } catch (e) { return null; }
  }

  // --- Output node (routes through master bus) ---

  function _out() {
    return _master || _ctx.destination;
  }

  // --- Waveshaper for subtle harmonics ---

  function _makeShaper(amount) {
    if (!_ctx) return null;
    var k = amount || 2;
    var n = 256, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = i * 2 / n - 1;
      curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    var ws = _ctx.createWaveShaper();
    ws.curve = curve;
    ws.oversample = '2x';
    return ws;
  }

  // --- Rich synthesis: patch types ---

  // Type: "fm" — FM synthesis (carrier + modulator)
  function _playFM(def) {
    var t = _ctx.currentTime;
    var v = def.vol || 0.04;
    var a = def.attack || 0.01;
    var r = def.release || 0.3;
    var cFreq = def.carrier || def.freq || 200;
    var mFreq = def.modulator || cFreq * 2;
    var mDepth = def.modDepth || cFreq * 0.5;

    // Modulator
    var mod = _ctx.createOscillator();
    var modGain = _ctx.createGain();
    mod.type = 'sine';
    mod.frequency.value = mFreq;
    modGain.gain.setValueAtTime(mDepth, t);
    modGain.gain.linearRampToValueAtTime(mDepth * 0.1, t + a + r);
    mod.connect(modGain);

    // Carrier
    var car = _ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = cFreq;
    modGain.connect(car.frequency); // FM connection

    // Filter
    var flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(def.filterFreq || cFreq * 4, t);
    flt.frequency.linearRampToValueAtTime(def.filterEnd || cFreq * 0.5, t + a + r);
    flt.Q.value = def.filterQ || 1;

    // Envelope
    var g = _ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    // Sustain phase
    var sustain = def.sustain || 0;
    if (sustain > 0) {
      g.gain.setValueAtTime(v * 0.7, t + a + sustain * 0.1);
      g.gain.linearRampToValueAtTime(0, t + a + sustain + r);
    } else {
      g.gain.linearRampToValueAtTime(0, t + a + r);
    }

    var dur = a + sustain + r;
    car.connect(flt);
    flt.connect(g);
    g.connect(_out());
    mod.start(t); car.start(t);
    mod.stop(t + dur + 0.05);
    car.stop(t + dur + 0.05);
  }

  // Type: "noise" — filtered noise burst (impacts, steps, whooshes)
  function _playNoise(def) {
    var t = _ctx.currentTime;
    var v = def.vol || 0.04;
    var a = def.attack || 0.005;
    var r = def.release || 0.15;

    // Generate noise buffer
    var len = Math.floor(_ctx.sampleRate * (a + r + 0.1));
    var buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    var src = _ctx.createBufferSource();
    src.buffer = buf;

    // Bandpass filter shapes the noise character
    var flt = _ctx.createBiquadFilter();
    flt.type = def.filterType || 'bandpass';
    flt.frequency.setValueAtTime(def.filterFreq || 800, t);
    if (def.filterEnd) {
      flt.frequency.linearRampToValueAtTime(def.filterEnd, t + a + r);
    }
    flt.Q.value = def.filterQ || 2;

    // Optional second filter for more shaping
    var flt2 = null;
    if (def.filter2Freq) {
      flt2 = _ctx.createBiquadFilter();
      flt2.type = 'lowpass';
      flt2.frequency.value = def.filter2Freq;
      flt2.Q.value = 0.5;
    }

    var g = _ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.001, t + a + r);

    src.connect(flt);
    if (flt2) { flt.connect(flt2); flt2.connect(g); }
    else { flt.connect(g); }
    g.connect(_out());
    src.start(t);
    src.stop(t + a + r + 0.05);
  }

  // Type: "pad" — multi-oscillator detuned pad with filter
  function _playPad(def) {
    var t = _ctx.currentTime;
    var v = def.vol || 0.03;
    var a = def.attack || 0.2;
    var r = def.release || 1.0;
    var freq = def.freq || 220;
    var voices = def.voices || 3;
    var detune = def.detune || 8; // cents spread
    var dur = a + (def.sustain || 0) + r;

    var flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(def.filterFreq || freq * 3, t);
    flt.frequency.linearRampToValueAtTime(def.filterEnd || freq, t + dur);
    flt.Q.value = def.filterQ || 0.7;

    // Subtle waveshaping for warmth
    var ws = _makeShaper(def.drive || 1.5);

    var g = _ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (def.sustain) {
      g.gain.setValueAtTime(v * 0.6, t + a + 0.01);
      g.gain.linearRampToValueAtTime(0, t + a + def.sustain + r);
    } else {
      g.gain.linearRampToValueAtTime(0, t + a + r);
    }

    var oscs = [];
    for (var i = 0; i < voices; i++) {
      var o = _ctx.createOscillator();
      o.type = def.wave || 'sine';
      var spread = (i - (voices - 1) / 2) * detune;
      o.frequency.value = freq;
      o.detune.value = spread;
      if (def.freqEnd) {
        o.frequency.setValueAtTime(freq, t);
        o.frequency.linearRampToValueAtTime(def.freqEnd, t + dur * 0.8);
      }
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.1);
      oscs.push(o);
    }

    if (ws) { flt.connect(ws); ws.connect(g); }
    else { flt.connect(g); }
    g.connect(_out());

    // Optional sub-oscillator
    if (def.sub) {
      var sub = _ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = freq * 0.5;
      var sg = _ctx.createGain();
      sg.gain.setValueAtTime(0, t);
      sg.gain.linearRampToValueAtTime(v * 0.3, t + a);
      sg.gain.linearRampToValueAtTime(0, t + a + (def.sustain || 0) + r);
      sub.connect(sg);
      sg.connect(_out());
      sub.start(t);
      sub.stop(t + dur + 0.1);
    }
  }

  // Type: "tone" — enhanced single/dual tone (backwards compat)
  function _playTone(def) {
    var t = _ctx.currentTime;
    var v = def.vol || 0.03;
    var a = def.attack || 0.01;
    var r = def.release || 0.2;
    var freq = def.freq || 300;

    var o = _ctx.createOscillator();
    o.type = def.wave || 'sine';
    o.frequency.value = freq;
    if (def.freqEnd) {
      o.frequency.setValueAtTime(def.freqStart || freq, t);
      o.frequency.linearRampToValueAtTime(def.freqEnd, t + a + r * 0.8);
    }

    var flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(def.filterFreq || freq * 3, t);
    flt.frequency.linearRampToValueAtTime(def.filterEnd || freq * 0.5, t + a + r);
    flt.Q.value = def.filterQ || 0.7;

    var g = _ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.001, t + a + r);

    o.connect(flt);
    flt.connect(g);
    g.connect(_out());
    o.start(t);
    o.stop(t + a + r + 0.1);

    // Second voice (harmony)
    if (def.freq2) {
      var o2 = _ctx.createOscillator();
      o2.type = def.wave || 'sine';
      o2.frequency.value = def.freq2;
      var flt2 = _ctx.createBiquadFilter();
      flt2.type = 'lowpass';
      flt2.frequency.value = def.freq2 * 2;
      flt2.Q.value = 0.5;
      var g2 = _ctx.createGain();
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(v * 0.6, t + a * 1.5);
      g2.gain.exponentialRampToValueAtTime(0.001, t + a + r * 1.3);
      o2.connect(flt2);
      flt2.connect(g2);
      g2.connect(_out());
      o2.start(t);
      o2.stop(t + a + r * 1.3 + 0.1);
    }
  }

  // --- Dispatch: play a sound definition ---

  function _playFromDef(def) {
    if (!def || !_ctx) return;
    _buildMasterBus();

    var type = def.type || 'tone';

    if (type === 'fm') return _playFM(def);
    if (type === 'noise') return _playNoise(def);
    if (type === 'pad') return _playPad(def);

    // Chord: multiple pad voices
    if (def.chord) {
      for (var i = 0; i < def.chord.length; i++) {
        var chordDef = {};
        for (var k in def) chordDef[k] = def[k];
        chordDef.freq = def.chord[i];
        chordDef.type = 'pad';
        chordDef.voices = 2;
        chordDef.detune = 6;
        chordDef.vol = (def.vol || 0.03) / def.chord.length;
        _playPad(chordDef);
      }
      return;
    }

    // Sweep: tone with freqStart/freqEnd
    if (def.freqStart && def.freqEnd) {
      return _playTone(def);
    }

    return _playTone(def);
  }

  function _play(name) {
    try {
      if (!_soundCfg) _soundCfg = FA.lookup('config', 'sounds');
      var def = _soundCfg && _soundCfg.oneshot && _soundCfg.oneshot[name];
      if (def) _playFromDef(def);
    } catch (e) {}
  }

  // --- FA.defineSound overrides ---
  FA.defineSound('_boot', function(ctx) { _ctx = ctx; });

  // Step: reads state._stepTile and state._stepInSystem for floor-dependent sound
  // Overworld: 0=floor(concrete), 2=indoor(wood), 3=garden(soft), 4=sidewalk(stone)
  // Dungeon: all metal grate
  // Step: two footfalls per move ("tok-tok"), surface-dependent
  // Much lower + longer than typing clicks — foot impact, not key switch
  var _stepNoiseBuf = null;
  var _stepFoot = 0; // alternates 0/1 for slight L/R variation

  function _getStepNoise() {
    if (_stepNoiseBuf) return _stepNoiseBuf;
    if (!_ctx) return null;
    var len = Math.floor(_ctx.sampleRate * 0.06); // longer buffer for footsteps
    _stepNoiseBuf = _ctx.createBuffer(1, len, _ctx.sampleRate);
    var d = _stepNoiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return _stepNoiseBuf;
  }

  // Single footfall: kick-drum synthesis — damped sine = real impact feel
  // Like Hired Guns / Minecraft: pitch drops fast (200→60Hz), short decay
  // Routed DRY
  function _footfall(t, s, loudness) {
    var dest = _ctx.destination;

    // === Kick body: sine with fast pitch drop — THE footstep ===
    var o = _ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(s[0], t);                        // start freq (impact)
    o.frequency.exponentialRampToValueAtTime(s[1], t + s[2]);   // drop to resting freq
    var g = _ctx.createGain();
    g.gain.setValueAtTime(s[3] * loudness, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + s[4]);      // decay
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + s[4] + 0.02);

    // === Click transient: tiny noise pop at the very start ===
    var buf = _getStepNoise();
    if (buf) {
      var ns = _ctx.createBufferSource();
      ns.buffer = buf;
      var flt = _ctx.createBiquadFilter();
      flt.type = 'highpass'; flt.frequency.value = s[5]; flt.Q.value = 0.5;
      var ng = _ctx.createGain();
      ng.gain.setValueAtTime(s[6] * loudness, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.008);
      ns.connect(flt); flt.connect(ng); ng.connect(dest);
      ns.start(t); ns.stop(t + 0.015);
    }

    // === Floor resonance: barely-there low sine tail — hard surfaces only ===
    if (s[7] > 0) {
      var ro = _ctx.createOscillator();
      ro.type = 'sine';
      ro.frequency.value = s[7];
      var rg = _ctx.createGain();
      rg.gain.setValueAtTime(s[8] * loudness, t + s[2]); // starts after pitch drop
      rg.gain.exponentialRampToValueAtTime(0.0001, t + s[4] * 2.5); // fades longer
      ro.connect(rg); rg.connect(dest);
      ro.start(t + s[2]); ro.stop(t + s[4] * 2.5 + 0.02);
    }
  }

  FA.defineSound('step', function() {
    if (!_ctx) return;
    _buildMasterBus();
    var state = FA.getState();
    var tile = state && state._stepTile !== undefined ? state._stepTile : 0;
    var inSystem = state && state._stepInSystem;
    var t = _ctx.currentTime;

    // [startF, endF, pitchT, vol, decay, clickHP, clickVol, resFreq, resVol]
    // resFreq/resVol = floor resonance undertone. 0 = no resonance (soft ground)
    var s;
    if (inSystem) {
      // Metal grate: rings, clear resonance
      s = [320 + Math.random() * 60, 100, 0.015, 0.06, 0.06, 2000, 0.02, 90, 0.012];
    } else if (tile === 2) {
      // Indoor wood: warm hollow resonance
      s = [220 + Math.random() * 40, 70,  0.025, 0.05, 0.08, 1200, 0.012, 65, 0.008];
    } else if (tile === 3) {
      // Garden dirt: NO resonance — soft ground absorbs
      s = [150 + Math.random() * 30, 50,  0.03,  0.04, 0.06, 800,  0.015, 0, 0];
    } else if (tile === 4) {
      // Sidewalk stone: hard, subtle resonance
      s = [280 + Math.random() * 50, 80,  0.012, 0.055, 0.045, 1800, 0.018, 75, 0.01];
    } else {
      // Default concrete: solid, mild resonance
      s = [250 + Math.random() * 40, 65,  0.02,  0.055, 0.06, 1500, 0.015, 55, 0.007];
    }

    // Two footfalls: left-right
    _stepFoot = 1 - _stepFoot;
    var gap = 0.08 + Math.random() * 0.04;
    _footfall(t, s, _stepFoot ? 1.0 : 0.8);
    _footfall(t + gap, s, _stepFoot ? 0.75 : 0.95);
  });

  var _names = ['hit','kill','pickup','hack','module','door','bubble',
    'thought','choice','confirm','curfew','dream','cutscene','gameover'];
  for (var ni = 0; ni < _names.length; ni++) {
    (function(n) { FA.defineSound(n, function() { _play(n); }); })(_names[ni]);
  }

  // --- Typing click generator (terminal + bubble text) ---
  // Each click: Cogmind-style mechanical key — low thock + noise transient
  var _typingQueue = 0;

  // Shared noise buffer — reused across clicks to save allocations
  var _clickNoiseBuf = null;

  function _getClickNoise() {
    if (_clickNoiseBuf) return _clickNoiseBuf;
    if (!_ctx) return null;
    var len = Math.floor(_ctx.sampleRate * 0.015); // 15ms of noise
    _clickNoiseBuf = _ctx.createBuffer(1, len, _ctx.sampleRate);
    var d = _clickNoiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return _clickNoiseBuf;
  }

  function _typeClick(delay, vol) {
    if (!_ctx) return;
    _buildMasterBus();
    var t = _ctx.currentTime + (delay || 0);
    var v = (vol || 0.02) * (0.7 + Math.random() * 0.5);
    var buf = _getClickNoise();
    if (!buf) return;

    // === Layer 1: Click — short noise through resonant bandpass ===
    // This IS the keyboard sound — no oscillators, pure impact
    var src = _ctx.createBufferSource();
    src.buffer = buf;
    var bp = _ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000 + Math.random() * 2000; // 3-5kHz — keycap resonance
    bp.Q.value = 3 + Math.random() * 4; // sharp resonance = "tck" character
    var g = _ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006 + Math.random() * 0.004); // 6-10ms — gone
    src.connect(bp); bp.connect(g); g.connect(_out());
    src.start(t); src.stop(t + 0.02);

    // === Layer 2: Body — lower noise for the housing thump (60% chance) ===
    if (Math.random() < 0.6) {
      var src2 = _ctx.createBufferSource();
      src2.buffer = buf;
      var lp = _ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600 + Math.random() * 400; // 600-1000Hz
      lp.Q.value = 1;
      var g2 = _ctx.createGain();
      var t2 = t + 0.001 + Math.random() * 0.003; // 1-4ms after click
      g2.gain.setValueAtTime(v * 0.4, t2);
      g2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.012 + Math.random() * 0.008); // 12-20ms
      src2.connect(lp); lp.connect(g2); g2.connect(_out());
      src2.start(t2); src2.stop(t2 + 0.03);
    }

    // === Layer 3: Key bottom-out beep — irregular like real typing ===
    // Human typing: some keys hit harder (beep), some barely touch (silent)
    // Clusters of 2-4 beeps then silence — not uniform random
    if (!_typeClick._beepState) _typeClick._beepState = { streak: 0, cooldown: 0 };
    var bs = _typeClick._beepState;
    if (bs.cooldown > 0) {
      bs.cooldown--;
    } else if (Math.random() < 0.55) {
      // Start a beep streak (1-3 consecutive beeps, then 2-5 silent)
      bs.streak++;
      var bt = t + 0.002 + Math.random() * 0.025; // 2-27ms jitter — very irregular
      var bo = _ctx.createOscillator();
      bo.type = 'sine';
      bo.frequency.value = 2200 + Math.random() * 600; // 2200-2800Hz
      var bg = _ctx.createGain();
      var beepVol = v * (0.15 + Math.random() * 0.1); // 15-25% of click vol — audible!
      bg.gain.setValueAtTime(0, bt);
      bg.gain.linearRampToValueAtTime(beepVol, bt + 0.003);
      bg.gain.exponentialRampToValueAtTime(0.0001, bt + 0.03 + Math.random() * 0.025);
      bo.connect(bg); bg.connect(_out());
      bo.start(bt); bo.stop(bt + 0.08);
      // After 1-3 beeps in a row, go silent for 2-5 clicks
      if (bs.streak >= 1 + Math.floor(Math.random() * 3)) {
        bs.cooldown = 2 + Math.floor(Math.random() * 4);
        bs.streak = 0;
      }
    } else {
      // Miss — simulates lighter keypress
      bs.streak = 0;
    }
  }

  // Play a burst of N typing clicks spread over ~duration seconds
  function _typingBurst(count, vol, spread) {
    spread = spread || 0.15;
    for (var i = 0; i < count; i++) {
      var delay = i * (spread / count) + Math.random() * 0.02;
      _typeClick(delay, vol);
    }
  }

  // --- Spatial Ambient System ---

  function _dist(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  // Siren: two-tone alarm, gain driven directly by render loop via window._sirenPulse
  var _sirenNode = null;

  function _ensureSiren(name, cfg) {
    if (_sirenNode) return _sirenNode;
    if (!_ctx) return null;
    var f1 = cfg.freq || 180;
    var f2 = cfg.freq2 || 260;
    var mid = (f1 + f2) / 2;
    var spread = (f2 - f1) / 2;

    var o1 = _ctx.createOscillator();
    o1.type = 'sawtooth'; o1.frequency.value = mid;
    var o2 = _ctx.createOscillator();
    o2.type = 'sine'; o2.frequency.value = mid * 1.005;

    // Pitch LFO: wailing between f1 and f2
    var lfo = _ctx.createOscillator(), lfoG = _ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = cfg.lfoRate || 0.5;
    lfoG.gain.value = spread;
    lfo.connect(lfoG);
    lfoG.connect(o1.frequency);
    lfoG.connect(o2.frequency);

    var flt = _ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = cfg.filterFreq || 600;
    flt.Q.value = cfg.Q || 1.5;

    var g = _ctx.createGain(); g.gain.value = 0;
    o1.connect(flt); o2.connect(flt);
    flt.connect(g); g.connect(_out());
    o1.start(); o2.start(); lfo.start();
    _sirenNode = { nodes: [o1, o2, lfo], gain: g, vol: cfg.vol || 0.05 };
    _ambients[name] = _sirenNode;
    return _sirenNode;
  }

  // Called by render.js curfew effect every frame: window._sirenPulse(t * pulse)
  window._sirenPulse = function(intensity) {
    if (!_ctx || !_sirenNode) {
      // Lazy init from config
      if (!_ctx) return;
      _buildMasterBus();
      if (!_soundCfg) _soundCfg = FA.lookup('config', 'sounds');
      var ambDefs = _soundCfg && _soundCfg.ambient;
      if (ambDefs && ambDefs.curfew_siren) _ensureSiren('curfew_siren', ambDefs.curfew_siren);
      if (!_sirenNode) return;
    }
    _sirenNode.gain.gain.setValueAtTime(intensity * _sirenNode.vol, _ctx.currentTime);
  };

  function _ensureAmbient(name, cfg) {
    if (_ambients[name]) return _ambients[name];
    if (!_ctx || !cfg) return null;
    _buildMasterBus();
    if (cfg.ambType === 'noise') return _ensureNoiseAmb(name, cfg);
    if (cfg.ambType === 'typing') return null; // handled in poll, no oscillator nodes
    if (cfg.ambType === 'siren') return _ensureSiren(name, cfg);

    // --- Regular drone below ---
    var freq = cfg.freq || 55;
    var o1 = _ctx.createOscillator(), o2 = _ctx.createOscillator(), o3 = _ctx.createOscillator();
    o1.type = 'sine'; o1.frequency.value = freq;
    o2.type = 'sine'; o2.frequency.value = freq * 1.003;
    o3.type = 'triangle'; o3.frequency.value = freq * 0.5;

    var flt = _ctx.createBiquadFilter();
    flt.type = cfg.filter || 'lowpass';
    flt.frequency.value = cfg.filterFreq || 200;
    flt.Q.value = cfg.Q || 0.7;

    // LFO on filter only (timbral movement, not volume)
    var lfo = _ctx.createOscillator(), lfoG = _ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = cfg.lfoRate || 0.1;
    lfoG.gain.value = cfg.lfoDepth || 50;
    lfo.connect(lfoG); lfoG.connect(flt.frequency);

    var g = _ctx.createGain(); g.gain.value = 0;
    o1.connect(flt); o2.connect(flt); o3.connect(flt);
    flt.connect(g);
    g.connect(_out());
    o1.start(); o2.start(); o3.start(); lfo.start();
    _ambients[name] = { nodes: [o1, o2, o3, lfo], gain: g };
    return _ambients[name];
  }

  function _ensureNoiseAmb(name, cfg) {
    if (_ambients[name]) return _ambients[name];
    if (!_ctx) return null;
    var len = _ctx.sampleRate * 2;
    var buf = _ctx.createBuffer(2, len, _ctx.sampleRate); // stereo noise
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    var src = _ctx.createBufferSource();
    src.buffer = buf; src.loop = true;

    // Dual filter: bandpass + lowpass for warmth
    var flt1 = _ctx.createBiquadFilter();
    flt1.type = 'lowpass';
    flt1.frequency.value = cfg.filterFreq || 300;
    flt1.Q.value = cfg.Q || 0.5;

    var flt2 = _ctx.createBiquadFilter();
    flt2.type = 'highpass';
    flt2.frequency.value = cfg.highpass || 40;
    flt2.Q.value = 0.3;

    // Slow filter modulation
    var lfo = _ctx.createOscillator(), lfoG = _ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 0.05;
    lfoG.gain.value = cfg.filterFreq ? cfg.filterFreq * 0.3 : 80;
    lfo.connect(lfoG); lfoG.connect(flt1.frequency);

    var g = _ctx.createGain(); g.gain.value = 0;
    src.connect(flt1); flt1.connect(flt2); flt2.connect(g);
    g.connect(_out());
    src.start(); lfo.start();
    _ambients[name] = { nodes: [src, lfo], gain: g };
    return _ambients[name];
  }

  function _setGain(name, target) {
    var a = _ambients[name];
    if (!a || !_ctx) return;
    a.gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(target, 0.12)), _ctx.currentTime + 0.8);
  }

  function _stopAllAmbients() {
    for (var k in _ambients) {
      var nodes = _ambients[k].nodes;
      for (var i = 0; i < nodes.length; i++) try { nodes[i].stop(); } catch (e) {}
    }
    _ambients = {};
  }

  // --- Breathing: each ambient fades to full silence then returns ---
  // Unique phase per name so they don't sync up
  var _breathPhases = {};

  function _nameHash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h & 0x7fffffff) / 0x7fffffff; // 0..1
  }

  // Returns 0..1 breathing envelope for given ambient name
  // Spends ~60% of cycle present, ~40% silent, with smooth transitions
  function _breath(name, now) {
    if (!_breathPhases[name]) {
      // Each ambient gets unique cycle length (25-50s) and phase offset
      var h = _nameHash(name);
      _breathPhases[name] = {
        period: 25 + h * 25,       // 25-50 second full cycle
        offset: h * 100            // random start offset
      };
    }
    var bp = _breathPhases[name];
    var phase = ((now + bp.offset) % bp.period) / bp.period; // 0..1

    // Shape: 0→0.3 ramp up, 0.3→0.7 hold, 0.7→0.85 fade out, 0.85→1.0 silence
    if (phase < 0.3) return phase / 0.3;                      // fade in
    if (phase < 0.7) return 1.0;                               // hold full
    if (phase < 0.85) return 1.0 - (phase - 0.7) / 0.15;     // fade out
    return 0;                                                   // silence
  }

  // --- Universal TextFX typing: monkey-patch TextFX.render ---
  // Tracks characters revealed per text string, plays clicks for new ones.
  // Covers ALL screens: start, cutscene, bubbles, thoughts, menus, dreams.
  var _typingTimers = {};   // per-terminal: last burst time
  var _tfxChars = {};       // key → last known char count
  var _tfxThrottle = 0;     // throttle: max clicks per frame

  if (window.TextFX && window.TextFX.render) {
    var _origRender = window.TextFX.render;
    window.TextFX.render = function(ctx, text, elapsed, x, y, opts) {
      // Call original first
      _origRender.call(this, ctx, text, elapsed, x, y, opts);
      // Calculate how many chars are visible
      if (!_ctx || !text || text.length === 0) return;
      try {
        var charDelay = (opts && opts.charDelay) || 30;
        var revealed = Math.min(text.length, Math.floor(elapsed / charDelay));
        // Key by text content (first 20 chars) + position to disambiguate
        var key = text.substring(0, 20) + '|' + Math.round(x) + '|' + Math.round(y);
        var prev = _tfxChars[key] || 0;
        if (revealed > prev && revealed <= text.length) {
          var newChars = revealed - prev;
          // Cap at 4 clicks per render call to avoid overload
          if (newChars > 0 && newChars <= 4 && _tfxThrottle < 6) {
            for (var c = 0; c < newChars; c++) {
              _typeClick(c * 0.02, 0.04);
              _tfxThrottle++;
            }
          }
        }
        _tfxChars[key] = revealed;
        // If text is fully revealed, eventually clean up
        if (revealed >= text.length && prev >= text.length) {
          // Keep entry but don't play more
        }
      } catch (e) {}
    };
  }

  // Reset throttle each frame (called from poll at 200ms, but we reset per rAF)
  var _lastFrame = 0;
  function _resetThrottle() {
    var now = Date.now();
    if (now - _lastFrame > 15) { // new frame
      _tfxThrottle = 0;
      _lastFrame = now;
    }
  }

  // Clean stale TextFX tracking entries periodically
  function _cleanTfxChars() {
    var keys = Object.keys(_tfxChars);
    if (keys.length > 50) {
      // Remove oldest half
      for (var i = 0; i < 25; i++) delete _tfxChars[keys[i]];
    }
  }

  function _ambientPoll() {
    var state = FA.getState();
    _resetThrottle();

    if (!state || state.screen === 'victory' || state.screen === 'shutdown') {
      for (var k in _ambients) _setGain(k, 0);
      return;
    }

    // Non-playing screens: only TextFX hook handles typing (auto)
    if (!state.player || state.screen !== 'playing') {
      for (var k2 in _ambients) _setGain(k2, 0);
      return;
    }
    if (!_soundCfg) _soundCfg = FA.lookup('config', 'sounds');
    var ambDefs = _soundCfg && _soundCfg.ambient;
    if (!ambDefs) return;

    var now = _ctx ? _ctx.currentTime : 0;
    var px = state.player.x, py = state.player.y;
    var isSystem = window.Location && window.Location.isSystem(state.mapId);
    var objects = state.maps && state.maps.town ? state.maps.town.objects : null;

    for (var name in ambDefs) {
      var def = ambDefs[name];
      var target = def.target || '';

      // --- Siren: skip in poll, driven by render.js via window._sirenPulse ---
      if (def.ambType === 'siren') continue;

      // --- Typing ambients: intermittent bursts, NOT constant drone ---
      if (def.ambType === 'typing') {
        if (target.indexOf('object:') === 0 && !isSystem && objects) {
          var objType = target.slice(7);
          var range = def.range || 10;
          var minDist = 999;
          for (var i = 0; i < objects.length; i++) {
            if (objects[i].type === objType) {
              var d = _dist(px, py, objects[i].x, objects[i].y);
              if (d < minDist) minDist = d;
            }
          }
          if (minDist < range) {
            // Frequent bursts — someone is typing at that terminal
            var lastBurst = _typingTimers[name] || 0;
            var gap = now - lastBurst;
            // Shorter gap (0.3s), higher chance (50%), louder, gentler falloff
            if (gap > 0.3 && Math.random() < 0.5) {
              var distVol = (def.vol || 0.02) / (1 + minDist * 0.15);
              var count = 3 + Math.floor(Math.random() * 6); // 3-8 clicks
              _typingBurst(count, distVol, 0.1 + Math.random() * 0.15);
              _typingTimers[name] = now;
            }
          }
        }
        continue; // skip normal drone logic
      }

      // --- Normal drone ambients ---
      var vol = 0;
      if (target.indexOf('zone:') === 0) {
        var zone = target.slice(5);
        if (zone === 'dungeon') vol = isSystem ? (def.vol || 0.04) : 0;
        else vol = isSystem ? 0 : (def.vol || 0.035);
      } else if (target.indexOf('object:') === 0 && !isSystem && objects) {
        var objType2 = target.slice(7);
        var range2 = def.range || 10;
        var minDist2 = 999;
        for (var j = 0; j < objects.length; j++) {
          if (objects[j].type === objType2) {
            var d2 = _dist(px, py, objects[j].x, objects[j].y);
            if (d2 < minDist2) minDist2 = d2;
          }
        }
        vol = minDist2 < range2 ? (def.vol || 0.03) / (1 + minDist2 * 0.4) : 0;
      }

      // Apply breathing envelope
      vol *= _breath(name, now);

      _ensureAmbient(name, def);
      _setGain(name, vol);
    }

    // Periodic cleanup of TextFX tracking
    _cleanTfxChars();
  }

  // --- Bootstrap & Restart ---

  function _registerHooks() {
    FA.on('entity:damaged', function() { _play('hit'); });
    FA.on('entity:killed', function() { _play('kill'); });
    FA.on('item:pickup', function() { _play('pickup'); });
  }

  document.addEventListener('keydown', function _bootOnce() {
    FA.playSound('_boot');
    document.removeEventListener('keydown', _bootOnce);
    if (!_pollId) _pollId = setInterval(_ambientPoll, 200);
  });

  FA.on('state:reset', function() {
    _registerHooks();
    _soundCfg = null;
    _typingTimers = {};
    _tfxChars = {};
    _tfxThrottle = 0;
    _sirenNode = null;
    _stopAllAmbients();
    _master = null;
    _reverb = null;
  });

  _registerHooks();
})();
