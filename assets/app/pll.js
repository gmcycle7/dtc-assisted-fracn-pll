/* pll.js — browser port of the PLL math (mirrors models/frequency_domain_model.py
   and models/calibration_models.py) so the interactive widgets recompute live and
   agree with the Python figures. No dependencies. Exposes window.PLL. */
(function () {
  // ---------- tiny complex ----------
  function cx(re, im) { return { re: re, im: im || 0 }; }
  function cadd(a, b) { return cx(a.re + b.re, a.im + b.im); }
  function cmul(a, b) { return cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
  function cdiv(a, b) { var d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); }
  function cabs(a) { return Math.hypot(a.re, a.im); }
  function cang(a) { return Math.atan2(a.im, a.re); }

  // ---------- conversions ----------
  function L_to_Sphi(Ldbc) { return 2 * Math.pow(10, Ldbc / 10); }       // dBc/Hz -> rad^2/Hz
  function Sphi_to_L(S) { return 10 * Math.log10(0.5 * Math.max(S, 1e-300)); }

  // ---------- default params (match PLLParams) ----------
  var DEFAULTS = {
    f_out: 6.72e9, f_ref: 104e6, f_c: 1.5e6, pm_deg: 60.0, K_vco_hz: 100e6, dsm_order: 2,
    ref_floor_dbc: -168.0, ref_flicker_dbc: -143.5, ref_flicker_f: 10e3,
    vco_dbc_at_1mhz: -116.5, vco_flicker_corner: 150e3,
    spd_gm_dbc: -167.0, dtc_qn_dbc: -163.0, dtc_thermal_dbc: -171.0, mmd_dbc: -165.0,
  };

  // ---------- type-II symmetric loop design ----------
  function design(p) {
    var wc = 2 * Math.PI * p.f_c;
    var pm = p.pm_deg * Math.PI / 180;
    var k = Math.tan((pm + Math.PI / 2) / 2);            // PM = 2*atan(k)-90deg
    var wz = wc / k, wp = wc * k;
    var jwc = cx(0, wc);
    // shape = (1+jwc/wz) / (jwc^2 (1+jwc/wp))
    var num = cadd(cx(1, 0), cx(0, wc / wz));
    var den = cmul(cmul(jwc, jwc), cadd(cx(1, 0), cx(0, wc / wp)));
    var Kloop = 1 / cabs(cdiv(num, den));
    return { wz: wz, wp: wp, Kloop: Kloop, N: p.f_out / p.f_ref };
  }

  function openLoop(f, p, d) {
    var w = 2 * Math.PI * f, s = cx(0, w);
    var num = cmul(cx(d.Kloop, 0), cadd(cx(1, 0), cx(0, w / d.wz)));
    var den = cmul(cmul(s, s), cadd(cx(1, 0), cx(0, w / d.wp)));
    return cdiv(num, den);
  }
  function Href(f, p, d) { var G = openLoop(f, p, d); return cmul(cx(d.N, 0), cdiv(G, cadd(cx(1, 0), G))); }
  function Hvco(f, p, d) { var G = openLoop(f, p, d); return cdiv(cx(1, 0), cadd(cx(1, 0), G)); }

  // ---------- noise source PSDs (rad^2/Hz) ----------
  function Sref(f, p) { return L_to_Sphi(p.ref_floor_dbc) + L_to_Sphi(p.ref_flicker_dbc) * (p.ref_flicker_f / f); }
  function Svco(f, p) {
    var wfm = L_to_Sphi(p.vco_dbc_at_1mhz) * Math.pow(1e6 / f, 2);
    var fl = wfm * (p.vco_flicker_corner / f);
    return wfm + fl;
  }
  function Sdtc(p) { return L_to_Sphi(p.dtc_qn_dbc) + L_to_Sphi(p.dtc_thermal_dbc); }
  function Sspd(p) { return L_to_Sphi(p.spd_gm_dbc); }
  function Smmd(p) { return L_to_Sphi(p.mmd_dbc); }
  function dsmPsd(f, p) { return (1 / 12) * (1 / p.f_ref) * Math.pow(2 * Math.sin(Math.PI * f / p.f_ref), 2 * p.dsm_order); }

  // ---------- output contributions ----------
  function contributions(freq, p, d, opts) {
    opts = opts || {};
    var dtcOn = opts.dtcOn !== false;     // DTC present (cancels DSM QE)
    var calOn = opts.calOn !== false;     // calibrations converged
    var out = { VCO: [], REF: [], DTC: [], MMD: [], SPD: [], DSM: [], total: [], f: freq };
    for (var i = 0; i < freq.length; i++) {
      var f = freq[i];
      var hr = cabs(Href(f, p, d)), hv = cabs(Hvco(f, p, d));
      var hr2 = hr * hr, hv2 = hv * hv;
      var vco = Svco(f, p) * hv2;
      var ref = Sref(f, p) * hr2;
      var dtc = Sdtc(p) * hr2;
      var mmd = Smmd(p) * hr2;
      var spd = Sspd(p) * hr2;
      // DSM: cancelled by DTC (~ -80 dB) if dtcOn; otherwise the full (huge) hump
      var dsm = dsmPsd(f, p) * Math.pow(2 * Math.PI, 2) * hr2;
      dsm *= dtcOn ? 1e-8 : 1.0;
      // a converged-cal residual penalty when cal is off: extra DTC-gain error -> partial DSM leak
      if (!calOn) dsm = dsmPsd(f, p) * Math.pow(2 * Math.PI, 2) * hr2 * 4e-3;
      out.VCO.push(vco); out.REF.push(ref); out.DTC.push(dtc);
      out.MMD.push(mmd); out.SPD.push(spd); out.DSM.push(dsm);
      out.total.push(vco + ref + dtc + mmd + spd + dsm);
    }
    return out;
  }

  function trapz(x, y, lo, hi) {
    var s = 0;
    for (var i = 1; i < x.length; i++) {
      if (x[i] < lo || x[i - 1] > hi) continue;
      s += 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1]);
    }
    return s;
  }
  function jitterFs(freq, S, fout, lo, hi) {
    var v = trapz(freq, S, lo, hi);
    var sphi = Math.sqrt(Math.max(v, 0));
    return { jitter_fs: sphi / (2 * Math.PI * fout) * 1e15, sigma_phi: sphi, var: v };
  }
  function ipnDbc(sigma_phi) { return 10 * Math.log10(0.5 * sigma_phi * sigma_phi); }

  function budget(p, d, opts, lo, hi) {
    lo = lo || 1e3; hi = hi || 100e6;
    var freq = logspace(lo, hi, 1400);
    var c = contributions(freq, p, d, opts);
    var rows = [], varTot = trapz(freq, c.total, lo, hi);
    ["VCO", "REF", "DTC", "MMD", "SPD", "DSM"].forEach(function (k) {
      var j = jitterFs(freq, c[k], p.f_out, lo, hi);
      rows.push({ name: k, jitter_fs: j.jitter_fs, pct: 100 * j.var / varTot });
    });
    var jt = jitterFs(freq, c.total, p.f_out, lo, hi);
    return { rows: rows, total_fs: jt.jitter_fs, ipn: ipnDbc(jt.sigma_phi) };
  }

  function loopMetrics(p, d) {
    var f = logspace(1e2, 1e9, 6000), prevSign = null, fc = NaN, pm = NaN;
    for (var i = 0; i < f.length; i++) {
      var m = cabs(openLoop(f[i], p, d)) - 1;
      var s = Math.sign(m);
      if (prevSign !== null && s !== prevSign && s < 0) {
        fc = f[i];
        pm = 180 + cang(openLoop(f[i], p, d)) * 180 / Math.PI;
      }
      prevSign = s;
    }
    return { f_c: fc, pm: pm };
  }

  // ---------- calibration sims (sign-error LMS) ----------
  function simDtcGain(o) {
    o = o || {};
    var n = o.n || 8000, Ktrue = 1000, Khat = Ktrue * (1 - (o.initErr != null ? o.initErr : 0.10));
    var mu = o.mu != null ? o.mu : 0.5, halfRange = o.halfRange !== false;
    var compNoise = o.compNoise || 0, offset = o.offset || 0;
    var t = [], K = [], rng = mulberry32(o.seed || 1);
    for (var k = 0; k < n; k++) {
      var phi_e = halfRange ? rng() * 0.5 : (rng() - 0.5);
      var phe = (Ktrue - Khat) / Ktrue * phi_e;
      if (compNoise) phe += (gauss(rng)) * compNoise / Ktrue;
      var e = Math.sign(phe + offset / Ktrue) || 1;
      Khat += mu * e * phi_e;
      t.push(k / 104e6 * 1e6); K.push(Khat);
    }
    return { t_us: t, Khat: K, Ktrue: Ktrue };
  }
  function simVcoDcc(o) {
    o = o || {};
    var n = o.n || 8000, dt = (o.dutyPs != null ? o.dutyPs : 20) * 1e-12, target = dt / 2;
    var mu = o.mu != null ? o.mu : 0.02, noise = o.noise != null ? o.noise : 0.05, v = 0;
    var t = [], V = [], rng = mulberry32(o.seed || 2);
    for (var k = 0; k < n; k++) {
      var sel = (k % 2 === 0) ? 1 : -1;
      var phe = sel * (dt - 2 * v) + gauss(rng) * noise * dt;
      var e = Math.sign(phe) || 1;
      v += mu * sel * e * dt;
      t.push(k / 104e6 * 1e6); V.push(v * 1e12);
    }
    return { t_us: t, val_ps: V, target_ps: target * 1e12 };
  }

  // rng + gaussian
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var tt = Math.imul(a ^ a >>> 15, 1 | a); tt = tt + Math.imul(tt ^ tt >>> 7, 61 | tt) ^ tt; return ((tt ^ tt >>> 14) >>> 0) / 4294967296; }; }
  function gauss(rng) { var u = 1 - rng(), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function logspace(a, b, n) { var r = [], la = Math.log10(a), lb = Math.log10(b); for (var i = 0; i < n; i++) r.push(Math.pow(10, la + (lb - la) * i / (n - 1))); return r; }

  window.PLL = {
    DEFAULTS: DEFAULTS, design: design, openLoop: openLoop, Href: Href, Hvco: Hvco,
    cabs: cabs, cang: cang, contributions: contributions, budget: budget, loopMetrics: loopMetrics,
    Sphi_to_L: Sphi_to_L, jitterFs: jitterFs, logspace: logspace,
    simDtcGain: simDtcGain, simVcoDcc: simVcoDcc, clone: function (o) { return JSON.parse(JSON.stringify(o)); },
  };
})();
