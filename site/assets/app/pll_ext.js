/* pll_ext.js — v3 math extensions. Loads AFTER pll.js and augments window.PLL with:
   closed-loop poles / root-locus, zeta-wn, transient step response, MASH simulator,
   FFT + fractional-spur spectrum, EVM, jitter decomposition, BW optimizer, residual
   floor, FoM. Pure JS, no deps. Validated in node against the Python models. */
(function () {
  var P = window.PLL;
  if (!P) { console.error('pll.js must load before pll_ext.js'); return; }

  // ---------------- polynomial roots (Durand-Kerner) ----------------
  // coeffs highest-degree first, real. returns array of {re,im}.
  function polyRoots(coeffs) {
    var a = coeffs.slice();
    while (a.length > 1 && Math.abs(a[0]) < 1e-300) a.shift();
    var n = a.length - 1;
    if (n < 1) return [];
    var lead = a[0]; a = a.map(function (c) { return c / lead; });
    var roots = [];
    for (var i = 0; i < n; i++) {
      var ang = 2 * Math.PI * i / n + 0.4;          // spread initial guesses
      roots.push({ re: 0.4 * Math.cos(ang), im: 0.4 * Math.sin(ang), s: 1 + 0.0 * i });
    }
    // scale guesses by rough root magnitude
    var scale = Math.pow(Math.abs(a[n]) || 1, 1 / n) + 1;
    roots = roots.map(function (r) { return { re: r.re * scale, im: r.im * scale }; });
    function evalPoly(x) { // Horner, complex
      var re = a[0], im = 0;
      for (var k = 1; k <= n; k++) {
        var nre = re * x.re - im * x.im + a[k];
        var nim = re * x.im + im * x.re;
        re = nre; im = nim;
      }
      return { re: re, im: im };
    }
    for (var it = 0; it < 200; it++) {
      var maxd = 0;
      for (var j = 0; j < n; j++) {
        var num = evalPoly(roots[j]);
        var den = { re: 1, im: 0 };
        for (var k2 = 0; k2 < n; k2++) {
          if (k2 === j) continue;
          var dr = roots[j].re - roots[k2].re, di = roots[j].im - roots[k2].im;
          var nr = den.re * dr - den.im * di, ni = den.re * di + den.im * dr;
          den.re = nr; den.im = ni;
        }
        var dd = den.re * den.re + den.im * den.im;
        var qr = (num.re * den.re + num.im * den.im) / dd;
        var qi = (num.im * den.re - num.re * den.im) / dd;
        roots[j].re -= qr; roots[j].im -= qi;
        maxd = Math.max(maxd, Math.hypot(qr, qi));
      }
      if (maxd < 1e-12) break;
    }
    return roots.map(function (r) { return { re: r.re, im: Math.abs(r.im) < 1e-9 ? 0 : r.im }; });
  }

  // ---------------- closed-loop poles & damping ----------------
  // G_ol = Kloop(1+s/wz)/(s^2 (1+s/wp));  1+G=0  ->  s^3 + wp s^2 + (Kloop wp/wz) s + Kloop wp = 0
  function closedLoopPoles(p, d, gainMul) {
    var K = d.Kloop * (gainMul || 1);
    var c = [1, d.wp, K * d.wp / d.wz, K * d.wp];
    return polyRoots(c);
  }
  // Type-II second-order parameters (textbook, ignoring the far pole wp):
  //   s^2 + (Kloop/wz) s + Kloop = 0  ->  wn = sqrt(Kloop),  zeta = sqrt(Kloop)/(2 wz).
  // The loop also has a zero at wz that ADDS overshoot beyond the pole damping, so we also
  // return the exact 3rd-order closed-loop poles and let the caller measure overshoot/peaking.
  function loopZetaWn(p, d) {
    var wn = Math.sqrt(d.Kloop);
    var zeta = Math.sqrt(d.Kloop) / (2 * d.wz);
    return { zeta: zeta, wn_hz: wn / (2 * Math.PI), poles: closedLoopPoles(p, d, 1) };
  }
  function peakingDb(p, d) {
    var f = P.logspace(1e3, 1e8, 1500), mx = -1e9;
    for (var i = 0; i < f.length; i++) mx = Math.max(mx, P.cabs(P.Href(f[i], p, d)) / d.N);
    return 20 * Math.log10(mx);
  }
  function rootLocus(p, d, gains) {
    return gains.map(function (g) { return { g: g, poles: closedLoopPoles(p, d, g) }; });
  }

  // ---------------- discrete loop (matches time_domain_noise_model DTLoop) ----------------
  function designDT(p) {
    var Ts = 1 / p.f_ref, N = p.f_out / p.f_ref, wc = 2 * Math.PI * p.f_c;
    var wz = wc / Math.tan(p.pm_deg * Math.PI / 180);
    var Kc = wc / Math.sqrt(1 + (wz / wc) * (wz / wc));
    var Kv = 1, Kp = Kc * N * Ts / Kv, Ki = Kp * wz * Ts;
    return { Ts: Ts, N: N, Kp: Kp, Ki: Ki, Kv: Kv, wz: wz };
  }
  // step response: type 'phase' (unit phase step at ref) or 'freq' (freq step df_hz at VCO)
  function stepResponse(p, type, df_hz, n) {
    n = n || 4000; var L = designDT(p);
    var phi = new Array(n).fill(0), acc = 0, ctrl = 0;
    var target;
    // freq step: reference phase ramps at 2*pi*df*Ts per step (referred through /N as df/N at PD)
    var ramp = type === 'freq' ? 2 * Math.PI * (df_hz) * L.Ts : 0;
    var stepPhase = type === 'phase' ? 1.0 : 0;        // 1 rad phase step
    for (var k = 1; k < n; k++) {
      phi[k] = phi[k - 1] + L.Kv * ctrl;
      var phi_ref = stepPhase + ramp * k;              // input excess phase at the reference
      var e = phi_ref - phi[k] / L.N;
      acc += e; ctrl = L.Kp * e + L.Ki * acc;
    }
    // normalize to final value for metrics
    var final = type === 'freq' ? phi[n - 1] : L.N * stepPhase; // freq step: output ramps; use last as ref
    var y = phi.map(function (v) { return final !== 0 ? v / final : v; });
    // overshoot & 1% settling on the normalized response (phase step is the clean 2nd-order test)
    var ymax = Math.max.apply(null, y.slice(0, Math.min(n, 4000)));
    var overshoot = Math.max(0, (ymax - 1) * 100);
    var settle = 0;
    for (var i = n - 1; i > 0; i--) { if (Math.abs(y[i] - 1) > 0.01) { settle = i; break; } }
    return {
      t_us: phi.map(function (_, i) { return i * L.Ts * 1e6; }),
      y: y, overshoot_pct: overshoot, settle_us: settle * L.Ts * 1e6,
    };
  }

  // ---------------- FFT (iterative radix-2) ----------------
  function fft(re, im, inverse) {
    var n = re.length; if (n <= 1) return;
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { var tr = re[i]; re[i] = re[j]; re[j] = tr; var ti = im[i]; im[i] = im[j]; im[j] = ti; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = (inverse ? 2 : -2) * Math.PI / len;
      var wr = Math.cos(ang), wi = Math.sin(ang);
      for (var s = 0; s < n; s += len) {
        var cwr = 1, cwi = 0;
        for (var k = 0; k < len / 2; k++) {
          var ur = re[s + k], ui = im[s + k];
          var vr = re[s + k + len / 2] * cwr - im[s + k + len / 2] * cwi;
          var vi = re[s + k + len / 2] * cwi + im[s + k + len / 2] * cwr;
          re[s + k] = ur + vr; im[s + k] = ui + vi;
          re[s + k + len / 2] = ur - vr; im[s + k + len / 2] = ui - vi;
          var nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
        }
      }
    }
    if (inverse) for (var x = 0; x < n; x++) { re[x] /= n; im[x] /= n; }
  }

  // ---------------- MASH-1^m delta-sigma simulator ----------------
  // returns the accumulated quantization error Phi_QE[n] (in VCO cycles) the DTC must cancel,
  // the divide-modulus dither, peak-to-peak range, and the (Welch) PSD of the divider noise.
  function simMASH(frac, order, n) {
    n = n || 4096; frac = frac - Math.floor(frac);
    var acc = new Array(order).fill(0);
    var modulus = new Array(n), qe = new Array(n);
    var hist1 = new Array(order).fill(0), hist2 = new Array(order).fill(0); // carry[n-1], carry[n-2]
    var run = 0;
    var binom = [[1], [1, -1], [1, -2, 1]];   // (1-z^-1)^s coefficients for s=0,1,2
    for (var k = 0; k < n; k++) {
      // cascade of 1st-order error-feedback stages
      var inp = frac, carries = new Array(order);
      for (var s = 0; s < order; s++) {
        acc[s] += inp; var c = Math.floor(acc[s]); acc[s] -= c; carries[s] = c; inp = acc[s];
      }
      // MASH combine: y = c1 + (1-z^-1)c2 + (1-z^-1)^2 c3  (apply (1-z^-1)^s to stage s)
      var y = 0;
      for (var s2 = 0; s2 < order; s2++) {
        var cof = binom[Math.min(s2, 2)];
        var v = cof[0] * carries[s2];
        if (cof.length > 1) v += cof[1] * hist1[s2];
        if (cof.length > 2) v += cof[2] * hist2[s2];
        y += v;
      }
      hist2 = hist1.slice(); hist1 = carries.slice();
      modulus[k] = y;                       // integer divide-ratio dither (mean = frac)
      run += (y - frac);                    // accumulated modulus deviation = phase the DTC cancels
      qe[k] = run;                          // in VCO cycles
    }
    // center & range
    var mn = Math.min.apply(null, qe), mx = Math.max.apply(null, qe);
    var qec = qe.map(function (v) { return v - (mn + mx) / 2; });
    // PSD of modulus dither (proportional to divider phase noise spectrum)
    var psd = welch(modulus.map(function (v) { return v - frac; }), 1.0);
    return { qe: qec, modulus: modulus, range_pp: mx - mn, psd: psd, frac: frac, order: order };
  }
  // simple periodogram (normalized freq 0..0.5), returns {f, db}
  function welch(x, fs) {
    var n = 1; while (n * 2 <= x.length) n *= 2;
    var re = x.slice(0, n), im = new Array(n).fill(0);
    var w = re.map(function (v, i) { return v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))); });
    fft(w, im, false);
    var half = n / 2, f = [], db = [];
    for (var k = 1; k < half; k++) { f.push(k / n * fs); db.push(10 * Math.log10((re[k] * re[k] + im[k] * im[k]) / n + 1e-300)); }
    return { f: f, db: db };
  }

  // ---------------- fractional-spur spectrum ----------------
  // INL polynomial delta_t = t_res*(g2*u^2 + g3*u^3), u in [-1,1] scaled by range-reduction.
  // output phase spur amplitude phi = 2*pi*f_out*delta_t; level dBc = 20log10(phi_pk/2).
  function spurSpectrum(opts) {
    var p = P.clone(P.DEFAULTS);
    var alpha = opts.alpha != null ? opts.alpha : 0.123;     // fractional offset
    var g2 = opts.g2 != null ? opts.g2 : 0.6;                // 2nd-order INL (LSB)
    var g3 = opts.g3 != null ? opts.g3 : 0.1;                // 3rd-order INL (LSB)
    var t_res = 400e-15;
    var redux = opts.redux || 1;                            // 1, 0.5 (1/2), 0.125 (1/8)
    var dutyPs = opts.dutyErrPs || 0, dutyCal = opts.dutyCal !== false;
    var nlc = opts.nlc === true;                            // NLC removes g2,g3
    var N = 4096;
    var re = new Array(N), im = new Array(N).fill(0);
    for (var k = 0; k < N; k++) {
      var x = (k * alpha) % 1;            // accumulated QE sawtooth in [0,1)
      var u = (2 * x - 1) * redux;        // centered, range-reduced [-redux, redux]
      var inl = nlc ? 0 : (g2 * u * u + g3 * u * u * u);    // residual INL in LSB
      var dt = inl * t_res;
      // VCO duty error: alternating +-dt_err/2 every other cycle, cancelled if dutyCal
      if (!dutyCal && dutyPs) dt += ((k % 2) ? 1 : -1) * (dutyPs * 1e-12) / 2;
      re[k] = 2 * Math.PI * p.f_out * dt;  // output phase error [rad]
      im[k] = 0;
    }
    // window + FFT
    var w = re.map(function (v, i) { return v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))); });
    var wim = new Array(N).fill(0);
    fft(w, wim, false);
    var d = P.design(p);
    var freq = [], dbc = [], maxSpur = -200;
    var cohgain = 0.5; // Hann coherent gain
    for (var kk = 1; kk < N / 2; kk++) {
      var fo = kk / N * p.f_ref;                 // spur offset frequency
      var amp = 2 * Math.hypot(w[kk], wim[kk]) / N / cohgain;  // peak phase amplitude [rad]
      // shape by loop (reference-path spur sees |Href/N|)
      amp *= P.cabs(P.Href(fo, p, d)) / d.N;
      var L = 20 * Math.log10(amp / 2 + 1e-300);  // dBc
      freq.push(fo); dbc.push(L);
      if (L > maxSpur && fo > p.f_ref / N * 2) maxSpur = L;
    }
    return { freq: freq, dbc: dbc, maxSpur: maxSpur };
  }

  // ---------------- jitter -> EVM constellation ----------------
  function evmScatter(sigma_phi, snr_db, order, nsym) {
    nsym = nsym || 600; var rng = mul(12345);
    var m = Math.sqrt(order), lvls = [];
    for (var i = 0; i < m; i++) lvls.push(2 * i - (m - 1));      // e.g. -3,-1,1,3
    var nstd = Math.pow(10, -snr_db / 20) * (m - 1);            // AWGN per axis (rough)
    var I = [], Q = [], err2 = 0, sig2 = 0;
    for (var s = 0; s < nsym; s++) {
      var ai = lvls[Math.floor(rng() * m)], aq = lvls[Math.floor(rng() * m)];
      var th = gss(rng) * sigma_phi;                           // phase rotation
      var ci = ai * Math.cos(th) - aq * Math.sin(th) + gss(rng) * nstd;
      var cq = ai * Math.sin(th) + aq * Math.cos(th) + gss(rng) * nstd;
      I.push(ci); Q.push(cq);
      err2 += (ci - ai) * (ci - ai) + (cq - aq) * (cq - aq); sig2 += ai * ai + aq * aq;
    }
    return { I: I, Q: Q, evm_pct: 100 * Math.sqrt(err2 / sig2) };
  }

  // ---------------- jitter decomposition (absolute / period / c2c) ----------------
  function jitterDecompose(p, d) {
    // synthesize output excess phase from the analytic PSD via random-phase iFFT (band 1k..fref/2)
    var fs = p.f_ref, N = 1 << 15, rng = mul(7);
    var re = new Array(N).fill(0), im = new Array(N).fill(0);
    var c = P.contributions(P.logspace(1, fs / 2, 2), p, d, { dtcOn: true, calOn: true }); // warm
    for (var k = 1; k < N / 2; k++) {
      var f = k / N * fs;
      var sphi = totalSphi(p, d, f);
      // synthesize from one-sided PSD: setting |X[k]|=|X[N-k]|=amp gives
      // var(x) = (2/N^2) sum amp^2 = sum S1(f_k)*(fs/N)  =>  amp = sqrt(S1*fs*N/2)
      var amp = Math.sqrt(sphi * fs * N / 2);
      var ph = 2 * Math.PI * rng();
      re[k] = amp * Math.cos(ph); im[k] = amp * Math.sin(ph);
      re[N - k] = re[k]; im[N - k] = -im[k];
    }
    fft(re, im, true);
    var phi = re;                          // rad
    var twopifo = 2 * Math.PI * p.f_out;
    var abs_fs = std(phi) / twopifo * 1e15;
    var per = []; for (var i = 1; i < N; i++) per.push((phi[i] - phi[i - 1]) / twopifo);
    var c2c = []; for (var i2 = 1; i2 < per.length; i2++) c2c.push(per[i2] - per[i2 - 1]);
    return {
      phi: phi, abs_fs: abs_fs,
      period_fs: std(per) * 1e15, c2c_fs: std(c2c) * 1e15,
      per: per.map(function (v) { return v * 1e15; }),
      band: [1e3, fs / 2],
    };
  }
  function totalSphi(p, d, f) {
    var hr = P.cabs(P.Href(f, p, d)), hv = P.cabs(P.Hvco(f, p, d));
    var L2S = function (db) { return 2 * Math.pow(10, db / 10); };
    var ref = (L2S(p.ref_floor_dbc) + L2S(p.ref_flicker_dbc) * (p.ref_flicker_f / f)) * hr * hr;
    var vco = (L2S(p.vco_dbc_at_1mhz) * Math.pow(1e6 / f, 2) * (1 + p.vco_flicker_corner / f)) * hv * hv;
    var dtc = (L2S(p.dtc_qn_dbc) + L2S(p.dtc_thermal_dbc)) * hr * hr;
    var mmd = L2S(p.mmd_dbc) * hr * hr, spd = L2S(p.spd_gm_dbc) * hr * hr;
    return ref + vco + dtc + mmd + spd;
  }

  // ---------------- BW optimizer (REF-vs-VCO U-curve) ----------------
  function optimizeBW(p, fcMin, fcMax, nfc) {
    nfc = nfc || 60; var fcs = P.logspace(fcMin, fcMax, nfc);
    var rows = fcs.map(function (fc) {
      var pp = P.clone(p); pp.f_c = fc; var dd = P.design(pp);
      var b = P.budget(pp, dd, { dtcOn: true, calOn: true }, 1e3, 100e6);
      var vco = b.rows.find(function (r) { return r.name === 'VCO'; });
      var ref = b.rows.find(function (r) { return r.name === 'REF'; });
      var dtc = b.rows.find(function (r) { return r.name === 'DTC'; });
      var refdtc = Math.sqrt(ref.jitter_fs * ref.jitter_fs + dtc.jitter_fs * dtc.jitter_fs);
      return { fc: fc, total: b.total_fs, vco: vco.jitter_fs, refdtc: refdtc };
    });
    var best = rows.reduce(function (a, b) { return b.total < a.total ? b : a; });
    return { rows: rows, fc_opt: best.fc, min_fs: best.total };
  }

  // ---------------- DTC gain-error residual floor (replaces magic 4e-3) ----------------
  // Returns the leaked residual PSD S_resid(f)=eps^2 (2pi)^2 S_Qdsm |H_ref|^2 AND its
  // integrated RMS jitter. eps = residual fractional DTC-gain error.
  function residualFloorSpectrum(p, eps) {
    var d = P.design(p), f = P.logspace(1e3, 100e6, 1500);
    var S = f.map(function (ff) {
      var sQ = (1 / 12) * (1 / p.f_ref) * Math.pow(2 * Math.sin(Math.PI * ff / p.f_ref), 2 * p.dsm_order);
      return eps * eps * sQ * Math.pow(2 * Math.PI, 2) * Math.pow(P.cabs(P.Href(ff, p, d)), 2);
    });
    var v = 0; for (var i = 1; i < f.length; i++) v += 0.5 * (S[i] + S[i - 1]) * (f[i] - f[i - 1]);
    return { f: f, sphi: S, jitter_fs: Math.sqrt(v) / (2 * Math.PI * p.f_out) * 1e15 };
  }
  function residualFloorJitter(p, eps) { return residualFloorSpectrum(p, eps).jitter_fs; }

  // ---------------- calibration loop sims (sign-LMS), ported from calibration_models.py ----------------
  var FREF = 104e6;
  // Offset DC-servo: a 1-bit dV-DAC integrates sign(e) to drive mean(e)->0 (slide 28).
  function simOffsetCal(o) {
    o = o || {};
    var n = o.n || 8000, offMv = o.offsetMv != null ? o.offsetMv : 32, kspd = o.kSpd != null ? o.kSpd : 9.18;
    var muMv = o.muMv != null ? o.muMv : 0.09, pheN = o.pheNoise != null ? o.pheNoise : 0.008;
    var osRad = (offMv * 1e-3) / kspd, vref = 0, run = 0, rng = mul(o.seed || 3);
    var t = [], V = [], em = [];
    for (var k = 0; k < n; k++) {
      var phe = gss(rng) * pheN, eff = osRad - (vref * 1e-3) / kspd;
      var e = Math.sign(phe + eff) || 1;
      vref += muMv * e; run = 0.98 * run + 0.02 * e;
      t.push(k / FREF * 1e6); V.push(vref); em.push(run);
    }
    return { t_us: t, vref_mv: V, target_mv: offMv, e_mean: em };
  }
  // CKREF duty-cycle: sign-sign LMS on even_cycle(+-1) converges to dt_ref/2 (slide 40).
  function simCkrefDcc(o) {
    o = o || {};
    var n = o.n || 8000, duty = o.dutyPct != null ? o.dutyPct : 57, mu = o.mu != null ? o.mu : 0.02, noise = o.noise != null ? o.noise : 0.05;
    var Tref = 1 / FREF, dtRef = (duty - 50) / 100 * Tref, target = dtRef / 2, v = 0, rng = mul(o.seed || 4);
    var t = [], V = [];
    for (var k = 0; k < n; k++) {
      var ec = (k % 2 === 0) ? 1 : -1;
      var phe = ec * (dtRef - 2 * v) + gss(rng) * noise * dtRef;
      var e = Math.sign(phe) || 1; v += mu * ec * e * dtRef;
      t.push(k / FREF * 1e6); V.push(v * 1e9);
    }
    return { t_us: t, val_ns: V, target_ns: target * 1e9 };
  }
  // Offset-FIRST race: the offset servo's residual feeds the K_DTC sign-error LMS each cycle.
  // Under half-range E{Phi_e}=0.25!=0, so a biased e[k] leaks into K_DTC; full-range cancels it.
  // mode: 'first' (offset pre-converged) | 'concurrent' | 'off' (offset never corrected).
  function simOffsetRace(o) {
    o = o || {};
    var n = o.n || 11000, Ktrue = 1000, Khat = Ktrue * (1 - (o.initErr != null ? o.initErr : 0.10));
    var mu = o.mu != null ? o.mu : 0.5, muOff = o.muOff != null ? o.muOff : 0.06;  // offset servo is SLOWER than gain
    var offset = o.offset != null ? o.offset : 80;     // comparator offset (simDtcGain units; 80 -> +22.6% half-range)
    var half = o.halfRange !== false, mode = o.mode || 'concurrent';
    var srv = 0, rng = mul(o.seed || 5);
    if (mode === 'first') {                              // pre-converge the offset servo before the gain loop starts
      for (var w = 0; w < 6000; w++) { var ef0 = offset - srv; srv += muOff * (Math.sign(gss(rng) * 4 + ef0) || 1); }
    }
    var t = [], K = [], OFF = [];
    for (var k = 0; k < n; k++) {
      var eff = offset - srv;                            // residual uncorrected offset
      if (mode !== 'off') srv += muOff * (Math.sign(gss(rng) * 4 + eff) || 1);  // servo keeps adapting
      var phi_e = half ? rng() * 0.5 : (rng() - 0.5);
      var phe = (Ktrue - Khat) / Ktrue * phi_e;
      var e = Math.sign(phe + eff / Ktrue) || 1;         // gain loop sees the CURRENT effective offset
      Khat += mu * e * phi_e;
      t.push(k / FREF * 1e6); K.push(Khat); OFF.push(eff);
    }
    var tail = K.slice(-2000), fin = tail.reduce(function (a, b) { return a + b; }, 0) / tail.length;
    return { t_us: t, Khat: K, Ktrue: Ktrue, effOffset: OFF, finalErrPct: 100 * (fin - Ktrue) / Ktrue };
  }

  // ---------------- type-I loop (single integrator) — for the type-I vs type-II widget ----------------
  function designType1(p) { var wc = 2 * Math.PI * p.f_c, wp = 8 * wc; return { wc: wc, wp: wp, K1: wc * Math.sqrt(1 + (wc / wp) * (wc / wp)) }; }
  // open-loop G_I(jw)=K1/(s(1+s/wp)); return magnitude + Re/Im (denominator = -w^2/wp + j w)
  function olType1(f, d1) {
    var w = 2 * Math.PI * f, dre = -w * w / d1.wp, dim = w, d2 = dre * dre + dim * dim;
    return { mag: d1.K1 / Math.sqrt(d2), re: d1.K1 * dre / d2, im: -d1.K1 * dim / d2 };
  }
  function hrefType1N(f, d1) { var g = olType1(f, d1), m1 = Math.sqrt((1 + g.re) * (1 + g.re) + g.im * g.im); return g.mag / m1; } // |H_ref/N|
  function hvcoType1(f, d1) { var g = olType1(f, d1); return 1 / Math.sqrt((1 + g.re) * (1 + g.re) + g.im * g.im); }
  function pmType1(p, d1) { var wc = d1.wc; return 90 - Math.atan(wc / d1.wp) * 180 / Math.PI; }   // PM = 90 - atan(wc/wp)

  // ---------------- monomial vs Legendre NLC convergence (port extras.legendre_vs_monomial) ----------------
  function legendreVsMonomial(n, seed) {
    n = n || 4000; var rng = mul(seed || 1), a2 = 0.18, a3 = 0.04, g1t = 1.0;
    var gm = [0.9, 0, 0], gl = [0.9, 0, 0], errm = [], errl = [], mu = 0.02;
    for (var k = 0; k < n; k++) {
      var D = 2 * rng() - 1;
      var rm = [D, D * D, D * D * D];
      var res = (g1t - gm[0]) * D + (a2 - gm[1]) * D * D + (a3 - gm[2]) * D * D * D;
      for (var i = 0; i < 3; i++) gm[i] += mu * res * rm[i]; errm.push(Math.abs(res));
      var Pl = [D, (3 * D * D - 1) / 2, (5 * D * D * D - 3 * D) / 2];
      var rl = (g1t - gl[0]) * D + (a2 - gl[1]) * D * D + (a3 - gl[2]) * D * D * D;
      for (var j = 0; j < 3; j++) gl[j] += mu * rl * Pl[j]; errl.push(Math.abs(rl));
    }
    return { errm: errm, errl: errl };
  }

  // ---------------- sign-error LMS with optional gear-shift (mu schedule) ----------------
  function simGearShift(o) {
    o = o || {};
    var n = o.n || 9000, Ktrue = 1000, Khat = Ktrue * (1 - (o.initErr != null ? o.initErr : 0.10));
    var muHi = o.muHi != null ? o.muHi : 1.0, muLo = o.muLo != null ? o.muLo : muHi;
    var kSw = o.kSwitch != null ? o.kSwitch : 1e9, rng = mul(o.seed || 7);
    var t = [], K = [];
    for (var k = 0; k < n; k++) {
      var mu = k < kSw ? muHi : muLo;
      var phi_e = rng() * 0.5;                       // half-range Phi_e in [0,0.5]
      var phe = (Ktrue - Khat) / Ktrue * phi_e;
      var e = Math.sign(phe) || 1;
      Khat += mu * e * phi_e;
      t.push(k / 104e6 * 1e6); K.push(Khat);
    }
    var tail = K.slice(-1500), ripple = std(tail) / Ktrue * 100;   // steady-state misadjustment [%]
    return { t_us: t, Khat: K, Ktrue: Ktrue, ripple_pct: ripple };
  }
  // speed/accuracy trade: settling vs ripple as mu sweeps (the tau*M=const curve)
  function lmsTradeoff(mus) {
    return mus.map(function (mu) {
      var r = simGearShift({ muHi: mu, n: 9000 });
      var tgt = r.Ktrue, sm = r.Khat, settle = 0;
      for (var i = sm.length - 1; i > 0; i--) { if (Math.abs(sm[i] - tgt) / tgt > 0.03) { settle = i; break; } }
      return { mu: mu, settle_us: r.t_us[settle] || 0, ripple_pct: r.ripple_pct };
    });
  }

  // ---------------- discrete-time noise simulation (port time_domain_noise_model) ----------------
  function simTimeDomain(o) {
    o = o || {}; var p = o.p || P.clone(P.DEFAULTS), n = o.n || 16384, fs = p.f_ref;
    var on = o.sources || { vco: true, ref: true, dtc: true, mmd: true, spd: true };
    var L = P.designDT(p), rng = mul(o.seed || 0);
    var whiteStd = function (dbc) { return Math.sqrt(Math.pow(10, dbc / 10) * fs); }; // var = S_phi*fs/2, S_phi=2*10^(dbc/10)
    // VCO white-FM: per-sample freq step sigma s.t. S_phi(1MHz)=L_to_Sphi(vco@1MHz)
    var vcoSig = Math.sqrt(2 * Math.pow(10, p.vco_dbc_at_1mhz / 10) * Math.pow(2 * Math.PI * 1e6, 2) / fs);
    var phi = new Float64Array(n), acc = 0, ctrl = 0;
    var Kp = L.Kp, Ki = L.Ki, Kv = L.Kv, N = L.N;
    for (var k = 1; k < n; k++) {
      var vstep = on.vco ? gss(rng) * vcoSig : 0;
      phi[k] = phi[k - 1] + Kv * ctrl + vstep;
      var phi_fb = phi[k] / N + (on.mmd ? gss(rng) * whiteStd(p.mmd_dbc) : 0);
      var phi_ref = (on.ref ? gss(rng) * whiteStd(p.ref_floor_dbc) : 0) +
                    (on.dtc ? gss(rng) * whiteStd(p.dtc_qn_dbc) + gss(rng) * whiteStd(p.dtc_thermal_dbc) : 0);
      var e = phi_ref - phi_fb + (on.spd ? gss(rng) * whiteStd(p.spd_gm_dbc) : 0);
      acc += e; ctrl = Kp * e + Ki * acc;
    }
    // detrend (remove mean + slope) then PSD via Welch; jitter from in-band integral
    var arr = Array.prototype.slice.call(phi);
    var m = arr.reduce(function (s, x) { return s + x; }, 0) / n;
    for (var i = 0; i < n; i++) arr[i] -= m;
    var psd = welch(arr, fs);                              // {f (Hz), db (periodogram)}
    // integrate variance over [1 kHz, fs/2] from the periodogram (calibrated to rad^2/Hz)
    var df = fs / arr.length, v = 0;
    for (var j = 0; j < psd.f.length; j++) if (psd.f[j] >= 1e3) v += Math.pow(10, psd.db[j] / 10) * 1; // periodogram already ~PSD*?
    // robust jitter: in-band RMS via time-domain high-pass (1 kHz) is overkill; use detrended std (loop suppresses LF)
    var v2 = arr.reduce(function (s, x) { return s + x * x; }, 0) / n;
    var jit = Math.sqrt(v2) / (2 * Math.PI * p.f_out) * 1e15;
    return { f: psd.f, db: psd.db, jitter_fs: jit, n: n };
  }

  // ---------------- FoM ----------------
  function fomJitter(sigma_t_s, P_mw) { return 10 * Math.log10(Math.pow(sigma_t_s, 2) * P_mw); }

  // ---------------- helpers ----------------
  function mul(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gss(rng) { var u = 1 - rng(), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function std(a) { var m = a.reduce(function (s, x) { return s + x; }, 0) / a.length; var v = a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / a.length; return Math.sqrt(v); }

  Object.assign(P, {
    polyRoots: polyRoots, closedLoopPoles: closedLoopPoles, loopZetaWn: loopZetaWn,
    peakingDb: peakingDb, rootLocus: rootLocus, designDT: designDT, stepResponse: stepResponse,
    fft: fft, simMASH: simMASH, spurSpectrum: spurSpectrum, evmScatter: evmScatter,
    jitterDecompose: jitterDecompose, optimizeBW: optimizeBW, residualFloorJitter: residualFloorJitter,
    residualFloorSpectrum: residualFloorSpectrum, simOffsetCal: simOffsetCal,
    simCkrefDcc: simCkrefDcc, simOffsetRace: simOffsetRace, fomJitter: fomJitter,
    designType1: designType1, olType1: olType1, hrefType1N: hrefType1N, hvcoType1: hvcoType1, pmType1: pmType1,
    legendreVsMonomial: legendreVsMonomial, simGearShift: simGearShift, lmsTradeoff: lmsTradeoff,
    simTimeDomain: simTimeDomain,
  });
})();
