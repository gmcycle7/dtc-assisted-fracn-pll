/* widgets.js — interactive Plotly widgets built on window.PLL.
   Mount points (created by page fragments): #freq-explorer, #cal-playground.
   Loaded after pll.js and plotly.min.js. */
(function () {
  function ready(fn){ document.readyState!=="loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  var P = window.PLL;
  var COL = { VCO:"#d62728", REF:"#1f77b4", DTC:"#9467bd", MMD:"#8c564b", SPD:"#2ca02c", DSM:"#ff7f0e", total:"#111" };

  function slider(c, key, label, min, max, step, val, unit, fmt) {
    var id = "sl-" + Math.random().toString(36).slice(2, 8);
    var div = document.createElement("div"); div.className = "ctl";
    fmt = fmt || function (v) { return (+v).toFixed(2); };
    div.innerHTML = '<label><span>' + label + '</span><b id="' + id + 'v">' + fmt(val) + (unit||"") + '</b></label>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '">';
    c.appendChild(div);
    var input = div.querySelector("input"), out = div.querySelector("#" + id + "v");
    input.addEventListener("input", function () { out.textContent = fmt(input.value) + (unit||""); key.cb(+input.value); });
    return input;
  }

  // ============ Frequency-domain explorer ============
  function freqExplorer(root) {
    if (!window.Plotly || !P) { root.innerHTML = "<p><i>Plotly not loaded.</i></p>"; return; }
    var p = P.clone(P.DEFAULTS);
    var state = { dtcOn: true, calOn: true, view: "pn" };

    var wrap = document.createElement("div"); wrap.className = "widget";
    var controls = document.createElement("div"); controls.className = "controls";
    var toggles = document.createElement("div"); toggles.className = "toggles";
    var plot = document.createElement("div"); plot.className = "plot"; plot.style.height = "420px";
    var readout = document.createElement("div"); readout.className = "readout";
    wrap.appendChild(controls); wrap.appendChild(toggles); wrap.appendChild(plot); wrap.appendChild(readout);
    root.appendChild(wrap);

    function redraw() {
      var d = P.design(p), opts = { dtcOn: state.dtcOn, calOn: state.calOn };
      var freq = P.logspace(1e3, 1e8, 600);
      var c = P.contributions(freq, p, d, opts);
      var traces;
      if (state.view === "pn") {
        traces = ["VCO","REF","DTC","MMD","SPD","DSM"].map(function (k) {
          return { x: freq, y: c[k].map(P.Sphi_to_L), name: k, mode: "lines",
            line: { color: COL[k], width: 1.3 } };
        });
        traces.push({ x: freq, y: c.total.map(P.Sphi_to_L), name: "TOTAL", mode: "lines",
          line: { color: COL.total, width: 2.6 } });
        Plotly.react(plot, traces, {
          margin: { t: 10, r: 10, b: 45, l: 55 },
          xaxis: { type: "log", title: "Offset frequency [Hz]", gridcolor: "#eee" },
          yaxis: { title: "L(f) [dBc/Hz]", range: [-175, -70], gridcolor: "#eee" },
          legend: { orientation: "h", y: -0.22 }, paper_bgcolor: "#fff", plot_bgcolor: "#fff",
        }, { displayModeBar: false, responsive: true });
      } else {
        var G = freq.map(function (f) { return P.openLoop(f, p, d); });
        var mag = G.map(function (g) { return 20 * Math.log10(P.cabs(g)); });
        var ph = G.map(function (g) { return P.cang(g) * 180 / Math.PI; });
        traces = [
          { x: freq, y: mag, name: "|G_ol| [dB]", mode: "lines", line: { color: "#1f77b4", width: 2 }, yaxis: "y" },
          { x: freq, y: ph, name: "∠G_ol [deg]", mode: "lines", line: { color: "#2ca02c", width: 2 }, yaxis: "y2" },
        ];
        Plotly.react(plot, traces, {
          margin: { t: 10, r: 55, b: 45, l: 55 },
          xaxis: { type: "log", title: "Frequency [Hz]", gridcolor: "#eee" },
          yaxis: { title: "|G| [dB]", zeroline: true },
          yaxis2: { title: "∠G [deg]", overlaying: "y", side: "right" },
          legend: { orientation: "h", y: -0.22 }, paper_bgcolor: "#fff", plot_bgcolor: "#fff",
          shapes: [{ type: "line", x0: 1e2, x1: 1e9, y0: 0, y1: 0, line: { color: "#bbb", dash: "dot" } }],
        }, { displayModeBar: false, responsive: true });
      }
      var b = P.budget(p, d, opts, 1e3, 100e6), m = P.loopMetrics(p, d);
      readout.innerHTML =
        '<div class="b">total jitter <b>' + b.total_fs.toFixed(1) + ' fs</b></div>' +
        '<div class="b">IPN <b>' + b.ipn.toFixed(1) + ' dBc</b></div>' +
        '<div class="b">measured f_c <b>' + (m.f_c/1e6).toFixed(2) + ' MHz</b></div>' +
        '<div class="b">PM <b>' + m.pm.toFixed(0) + '°</b></div>' +
        b.rows.map(function (r) { return '<div class="b">' + r.name + ' <b>' + r.pct.toFixed(0) + '%</b></div>'; }).join("");
    }

    slider(controls, { cb: function (v) { p.f_c = v * 1e6; redraw(); } }, "Loop BW f_c", 0.3, 5, 0.05, 1.5, " MHz");
    slider(controls, { cb: function (v) { p.pm_deg = v; redraw(); } }, "Phase margin", 40, 75, 1, 60, "°", function (v){return (+v).toFixed(0);});
    slider(controls, { cb: function (v) { p.vco_dbc_at_1mhz = v; redraw(); } }, "VCO PN @1MHz", -126, -108, 0.5, -116.5, " dBc/Hz", function (v){return (+v).toFixed(1);});
    slider(controls, { cb: function (v) { p.ref_flicker_dbc = v; redraw(); } }, "REF flicker @10kHz", -152, -132, 0.5, -143.5, " dBc/Hz", function (v){return (+v).toFixed(1);});
    slider(controls, { cb: function (v) { p.mmd_dbc = v; redraw(); } }, "MMD floor", -172, -156, 0.5, -165, " dBc/Hz", function (v){return (+v).toFixed(1);});

    function chk(label, init, cb) {
      var l = document.createElement("label"); l.style.cursor = "pointer";
      l.innerHTML = '<input type="checkbox" ' + (init ? "checked" : "") + '> ' + label;
      l.querySelector("input").addEventListener("change", function (e) { cb(e.target.checked); });
      toggles.appendChild(l);
    }
    chk("DTC cancels DSM-QN", true, function (v) { state.dtcOn = v; redraw(); });
    chk("Calibrations converged", true, function (v) { state.calOn = v; redraw(); });
    var vbtn = document.createElement("button"); vbtn.className = "btn sec"; vbtn.textContent = "Switch to Bode view";
    vbtn.addEventListener("click", function () { state.view = state.view === "pn" ? "bode" : "pn";
      vbtn.textContent = state.view === "pn" ? "Switch to Bode view" : "Switch to phase-noise view"; redraw(); });
    toggles.appendChild(vbtn);
    var rbtn = document.createElement("button"); rbtn.className = "btn sec"; rbtn.textContent = "Reset";
    rbtn.addEventListener("click", function () { p = P.clone(P.DEFAULTS); root.innerHTML = ""; freqExplorer(root); });
    toggles.appendChild(rbtn);

    redraw();
  }

  // ============ Calibration playground ============
  function calPlayground(root) {
    if (!window.Plotly || !P) { root.innerHTML = "<p><i>Plotly not loaded.</i></p>"; return; }
    var which = "dtc";
    var wrap = document.createElement("div"); wrap.className = "widget";
    var sel = document.createElement("div"); sel.className = "toggles";
    var controls = document.createElement("div"); controls.className = "controls";
    var plot = document.createElement("div"); plot.className = "plot"; plot.style.height = "380px";
    var readout = document.createElement("div"); readout.className = "readout";
    wrap.appendChild(sel); wrap.appendChild(controls); wrap.appendChild(plot); wrap.appendChild(readout);
    root.appendChild(wrap);

    var prm = { muDtc: 0.5, initErr: 0.10, offset: 0, compNoise: 0, halfRange: true,
                muVco: 0.02, dutyPs: 20, noise: 0.05,
                muCk: 0.02, dutyPct: 57, ckNoise: 0.05,
                muMv: 0.09, offsetMv: 32, pheNoise: 0.008 };

    function redraw() {
      var trace, target, layoutY, finalv, resid, unit, col, dp;
      if (which === "dtc") {
        var r = P.simDtcGain({ mu: prm.muDtc, initErr: prm.initErr, offset: prm.offset, compNoise: prm.compNoise, halfRange: prm.halfRange });
        col = "#1f77b4"; trace = { x: r.t_us, y: r.Khat, mode: "lines", line: { color: col, width: 1.2 }, name: "K_DTC" };
        target = 1000; layoutY = "K_DTC estimate [codes]"; unit = " codes"; dp = 1;
        var tail = r.Khat.slice(-1500); finalv = tail.reduce(function (a, b) { return a + b; }, 0) / tail.length;
        resid = (finalv - 1000) / 1000 * 100;
      } else if (which === "vco") {
        var rv = P.simVcoDcc({ mu: prm.muVco, dutyPs: prm.dutyPs, noise: prm.noise });
        col = "#d62728"; trace = { x: rv.t_us, y: rv.val_ps, mode: "lines", line: { color: col, width: 1.2 }, name: "vco_dcc" };
        target = rv.target_ps; layoutY = "vco_dcc [ps]"; unit = " ps"; dp = 2;
        finalv = rv.val_ps.slice(-1).pop(); resid = finalv - rv.target_ps;
      } else if (which === "ckref") {
        var rc = P.simCkrefDcc({ mu: prm.muCk, dutyPct: prm.dutyPct, noise: prm.ckNoise });
        col = "#0a8f5b"; trace = { x: rc.t_us, y: rc.val_ns, mode: "lines", line: { color: col, width: 1.2 }, name: "ckref_dcc" };
        target = rc.target_ns; layoutY = "ckref_dcc [ns]"; unit = " ns"; dp = 3;
        finalv = rc.val_ns.slice(-1).pop(); resid = finalv - rc.target_ns;
      } else { // offset
        var ro = P.simOffsetCal({ offsetMv: prm.offsetMv, muMv: prm.muMv, pheNoise: prm.pheNoise });
        col = "#7a3fb5"; trace = { x: ro.t_us, y: ro.vref_mv, mode: "lines", line: { color: col, width: 1.2 }, name: "Vref_adj" };
        target = ro.target_mv; layoutY = "Vref_adj [mV]"; unit = " mV"; dp = 2;
        var tlo = ro.vref_mv.slice(-1500); finalv = tlo.reduce(function (a, b) { return a + b; }, 0) / tlo.length; resid = finalv - ro.target_mv;
      }
      Plotly.react(plot, [trace, { x: [0, 80], y: [target, target], mode: "lines", name: "target",
        line: { color: "#000", dash: "dash", width: 1 } }], {
        margin: { t: 10, r: 10, b: 45, l: 62 },
        xaxis: { title: "time [µs]", gridcolor: "#eee" },
        yaxis: { title: layoutY, gridcolor: "#eee" },
        legend: { orientation: "h", y: -0.22 },
        shapes: [{ type: "line", x0: 30, x1: 30, y0: 0, y1: 1, yref: "paper", line: { color: "#aaa", dash: "dot" } }],
        annotations: [{ x: 30, y: 1, yref: "paper", text: "30 µs", showarrow: false, font: { size: 10, color: "#888" } }],
        paper_bgcolor: "#fff", plot_bgcolor: "#fff",
      }, { displayModeBar: false, responsive: true });
      readout.innerHTML =
        '<div class="b">final <b>' + finalv.toFixed(dp) + unit + '</b></div>' +
        '<div class="b">' + (which === "dtc" ? "residual error" : "residual") + ' <b>' +
        (which === "dtc" ? resid.toFixed(2) + " %" : resid.toFixed(dp) + unit) + '</b></div>' +
        '<div class="b">target <b>' + target.toFixed(which === "dtc" ? 0 : dp) + unit + '</b></div>' +
        (which === "dtc" ? '<div class="b">range <b>' + (prm.halfRange ? "½ (slide 34)" : "full") + '</b></div>' : '');
    }

    function buildControls() {
      controls.innerHTML = "";
      if (which === "dtc") {
        slider(controls, { cb: function (v) { prm.muDtc = v; redraw(); } }, "Step size µ", 0.05, 6, 0.05, prm.muDtc, "");
        slider(controls, { cb: function (v) { prm.initErr = v / 100; redraw(); } }, "Initial gain error", 0, 20, 1, prm.initErr * 100, " %", function (v){return (+v).toFixed(0);});
        slider(controls, { cb: function (v) { prm.offset = v; redraw(); } }, "Uncal comparator offset", 0, 150, 5, prm.offset, "", function (v){return (+v).toFixed(0);});
        slider(controls, { cb: function (v) { prm.compNoise = v; redraw(); } }, "Comparator noise", 0, 3, 0.1, prm.compNoise, " LSB");
        var lab = document.createElement("label"); lab.style.cssText = "cursor:pointer;font-size:13px;display:block;margin-top:4px";
        lab.innerHTML = '<input type="checkbox"' + (prm.halfRange ? " checked" : "") + '> ½-range Φ_e (slide 34) — uncheck for full-range';
        lab.querySelector("input").addEventListener("change", function (e) { prm.halfRange = e.target.checked; redraw(); });
        controls.appendChild(lab);
      } else if (which === "vco") {
        slider(controls, { cb: function (v) { prm.muVco = v; redraw(); } }, "Step size µ", 0.005, 0.1, 0.005, prm.muVco, "");
        slider(controls, { cb: function (v) { prm.dutyPs = v; redraw(); } }, "VCO duty error Δt", 4, 40, 1, prm.dutyPs, " ps", function (v){return (+v).toFixed(0);});
        slider(controls, { cb: function (v) { prm.noise = v; redraw(); } }, "Comparator noise", 0, 0.3, 0.01, prm.noise, "");
      } else if (which === "ckref") {
        slider(controls, { cb: function (v) { prm.muCk = v; redraw(); } }, "Step size µ", 0.005, 0.1, 0.005, prm.muCk, "");
        slider(controls, { cb: function (v) { prm.dutyPct = v; redraw(); } }, "CKREF duty cycle", 50, 60, 0.5, prm.dutyPct, " %", function (v){return (+v).toFixed(1);});
        slider(controls, { cb: function (v) { prm.ckNoise = v; redraw(); } }, "Comparator noise", 0, 0.3, 0.01, prm.ckNoise, "");
      } else {
        slider(controls, { cb: function (v) { prm.muMv = v; redraw(); } }, "ΔV-DAC step µ", 0.02, 0.3, 0.01, prm.muMv, " mV");
        slider(controls, { cb: function (v) { prm.offsetMv = v; redraw(); } }, "Comparator+GM offset", 0, 60, 2, prm.offsetMv, " mV", function (v){return (+v).toFixed(0);});
        slider(controls, { cb: function (v) { prm.pheNoise = v; redraw(); } }, "Locked PHE jitter", 0, 0.02, 0.001, prm.pheNoise, " rad", function (v){return (+v).toFixed(3);});
      }
    }

    function tab(name, key) {
      var b = document.createElement("button"); b.className = "btn" + (which === key ? "" : " sec"); b.textContent = name;
      b.addEventListener("click", function () { which = key; sel.querySelectorAll("button").forEach(function (x) { x.className = "btn sec"; }); b.className = "btn"; buildControls(); redraw(); });
      sel.appendChild(b);
    }
    tab("DTC gain (sign-error)", "dtc"); tab("VCO duty (sign-sign)", "vco");
    tab("CKREF duty (sign-sign)", "ckref"); tab("Offset (DC servo)", "offset");
    buildControls(); redraw();
  }

  ready(function () {
    var fe = document.getElementById("freq-explorer"); if (fe) freqExplorer(fe);
    var cp = document.getElementById("cal-playground"); if (cp) calPlayground(cp);
  });
})();
