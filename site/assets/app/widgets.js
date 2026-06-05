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

    var prm = { mu: 0.5, initErr: 0.10, offset: 0, compNoise: 0, dutyPs: 20, noise: 0.05 };

    function redraw() {
      var trace, target, layoutY, finalv, resid, unit;
      if (which === "dtc") {
        var r = P.simDtcGain({ mu: prm.mu, initErr: prm.initErr, offset: prm.offset, compNoise: prm.compNoise });
        trace = { x: r.t_us, y: r.Khat, mode: "lines", line: { color: "#1f77b4", width: 1.2 }, name: "K_DTC" };
        target = 1000; layoutY = "K_DTC estimate";
        var tail = r.Khat.slice(-1500); finalv = tail.reduce(function (a, b) { return a + b; }, 0) / tail.length;
        resid = (finalv - 1000) / 1000 * 100; unit = " codes";
      } else {
        var rv = P.simVcoDcc({ mu: prm.mu, dutyPs: prm.dutyPs, noise: prm.noise });
        trace = { x: rv.t_us, y: rv.val_ps, mode: "lines", line: { color: "#d62728", width: 1.2 }, name: "vco_dcc" };
        target = rv.target_ps; layoutY = "vco_dcc [ps]";
        finalv = rv.val_ps.slice(-1).pop(); resid = finalv - rv.target_ps; unit = " ps";
      }
      Plotly.react(plot, [trace, { x: [0, 80], y: [target, target], mode: "lines", name: "target",
        line: { color: "#000", dash: "dash", width: 1 } }], {
        margin: { t: 10, r: 10, b: 45, l: 60 },
        xaxis: { title: "time [µs]", gridcolor: "#eee" },
        yaxis: { title: layoutY, gridcolor: "#eee" },
        legend: { orientation: "h", y: -0.22 },
        shapes: [{ type: "line", x0: 30, x1: 30, y0: 0, y1: 1, yref: "paper", line: { color: "#aaa", dash: "dot" } }],
        annotations: [{ x: 30, y: 1, yref: "paper", text: "30 µs", showarrow: false, font: { size: 10, color: "#888" } }],
        paper_bgcolor: "#fff", plot_bgcolor: "#fff",
      }, { displayModeBar: false, responsive: true });
      readout.innerHTML =
        '<div class="b">final <b>' + finalv.toFixed(which === "dtc" ? 1 : 2) + unit + '</b></div>' +
        '<div class="b">' + (which === "dtc" ? "residual error" : "residual") + ' <b>' +
        (which === "dtc" ? resid.toFixed(2) + " %" : resid.toFixed(2) + " ps") + '</b></div>' +
        '<div class="b">target <b>' + target.toFixed(which === "dtc" ? 0 : 1) + unit + '</b></div>';
    }

    function buildControls() {
      controls.innerHTML = "";
      slider(controls, { cb: function (v) { prm.mu = v; redraw(); } }, "Step size µ", which === "dtc" ? 0.05 : 0.005, which === "dtc" ? 6 : 0.1, which === "dtc" ? 0.05 : 0.005, prm.mu, "");
      if (which === "dtc") {
        slider(controls, { cb: function (v) { prm.initErr = v / 100; redraw(); } }, "Initial gain error", 0, 20, 1, prm.initErr * 100, " %", function (v){return (+v).toFixed(0);});
        slider(controls, { cb: function (v) { prm.offset = v; redraw(); } }, "Uncal comparator offset", 0, 150, 5, prm.offset, "", function (v){return (+v).toFixed(0);});
        slider(controls, { cb: function (v) { prm.compNoise = v; redraw(); } }, "Comparator noise", 0, 3, 0.1, prm.compNoise, " LSB");
      } else {
        slider(controls, { cb: function (v) { prm.dutyPs = v; redraw(); } }, "VCO duty error Δt", 4, 40, 1, prm.dutyPs, " ps", function (v){return (+v).toFixed(0);});
        slider(controls, { cb: function (v) { prm.noise = v; redraw(); } }, "Comparator noise", 0, 0.3, 0.01, prm.noise, "");
      }
    }

    function tab(name, key) {
      var b = document.createElement("button"); b.className = "btn" + (which === key ? "" : " sec"); b.textContent = name;
      b.addEventListener("click", function () { which = key; sel.querySelectorAll("button").forEach(function (x) { x.className = "btn sec"; }); b.className = "btn"; buildControls(); redraw(); });
      sel.appendChild(b);
    }
    tab("DTC gain (K_DTC)", "dtc"); tab("VCO duty-cycle", "vco");
    buildControls(); redraw();
  }

  ready(function () {
    var fe = document.getElementById("freq-explorer"); if (fe) freqExplorer(fe);
    var cp = document.getElementById("cal-playground"); if (cp) calPlayground(cp);
  });
})();
