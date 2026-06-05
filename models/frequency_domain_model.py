"""
frequency_domain_model.py
=========================
Linear, small-signal, s-domain model of the proposed DTC-assisted fractional-N
sampling PLL (deck slides 5, 9, 20, 42).

What it computes
----------------
  1. Open-loop gain  G_ol(s)                                  [derivations.md Sec.1]
  2. Closed-loop NTFs: reference->out (LP) and VCO->out (HP)  [derivations.md Sec.1-2]
  3. Per-source phase-noise transfer functions to the output  [derivations.md Sec.2]
  4. Integrated-jitter contribution table (reproduces slide-42 budget)  [Slide p.42]
  5. Bode plot, NTF plot, phase-noise-budget plot (-> results/figures + site)

Design philosophy: every transfer function and noise source is tagged to a slide
page or to derivations.md. Numbers not on the slides come from docs/assumptions.md
and are tagged [A#] here too.

Run:  python models/frequency_domain_model.py
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass, field, asdict

import utils as U


# ============================================================================
#  PLL parameter set  (slide topology + docs/assumptions.md numbers)
# ============================================================================
@dataclass
class PLLParams:
    # --- given / derived from slide 42 ---
    f_out: float = 6.72e9      # VCO output [Hz]            (Slide p.42: LO 6720 MHz)
    f_ref: float = 104e6       # reference  [Hz]            (Slide p.42: REF 104 MHz)
    # --- loop design knobs (docs/assumptions.md) ---
    f_c: float = 1.5e6         # target loop bandwidth [Hz] (Assumption [A1])
    pm_deg: float = 60.0       # target phase margin   [deg](Assumption [A2])
    K_vco_hz: float = 100e6    # VCO gain [Hz/V]            (Assumption [A4])
    dsm_order: int = 2         # MASH order                 (Assumption [A5]/Slide p.15)
    # --- noise source levels (docs/assumptions.md [A12]-[A15]) ---
    # NOTE: levels are back-solved [A12-A15] to reproduce the slide-42 budget
    # (VCO 51% / REF+DTC 39% / MMD 6% / SPD+GM 4% / DSM-QN ~0%, total ~87.5 fs).
    ref_floor_dbc: float = -168.0     # CKREF white floor @ ref          [A12]
    ref_flicker_dbc: float = -143.5   # CKREF flicker level @ 10 kHz     [A12]
    ref_flicker_f: float = 10e3
    vco_dbc_at_1mhz: float = -116.5   # VCO PN @1 MHz (-20 dB/dec)       [A13] (~slide 50)
    vco_flicker_corner: float = 150e3 # VCO 1/f^3 corner                 [A13]
    spd_gm_dbc: float = -167.0        # SPD+GM input-referred floor      [A15]/Slide p.20
    dtc_qn_dbc: float = -163.0        # DTC quantization noise           Slide p.15
    dtc_thermal_dbc: float = -171.0   # DTC thermal floor                Slide p.16
    mmd_dbc: float = -165.0           # MMD (divider) input-referred     [A12]/Slide p.42
    dtc_gain_err: float = 1e-4        # residual fractional K_DTC error eps after cal [A17]
    #   -> uncancelled DSM-QE leaks as eps^2 * S_Qdsm (derivations.md Sec.7.1, replaces a magic factor)

    # --- derived (filled in __post_init__) ---
    N: float = field(init=False)
    K_vco: float = field(init=False)   # rad/s/V
    wz: float = field(init=False)
    wp: float = field(init=False)
    Kloop: float = field(init=False)

    def __post_init__(self):
        self.N = self.f_out / self.f_ref                 # divide ratio  [A3]
        self.K_vco = 2.0 * np.pi * self.K_vco_hz          # Hz/V -> rad/s/V
        self._design_type2_loop()

    # ----- type-II symmetric loop design  [Std-Gardner, derivations.md Sec.1] -----
    def _design_type2_loop(self):
        wc = 2 * np.pi * self.f_c
        pm = np.deg2rad(self.pm_deg)
        # symmetric zero/pole about wc: PM = 2*atan(k) - 90deg  ->  k = tan((PM+90)/2)
        k = np.tan((pm + np.pi / 2) / 2.0)
        self.wz = wc / k
        self.wp = wc * k
        # |G(jwc)| = 1  ->  solve gain constant K (G = K(1+s/wz)/(s^2 (1+s/wp)))
        jwc = 1j * wc
        shape = (1 + jwc / self.wz) / (jwc ** 2 * (1 + jwc / self.wp))
        self.Kloop = 1.0 / abs(shape)


# ============================================================================
#  Transfer functions
# ============================================================================
def open_loop(params: PLLParams, f):
    """G_ol(s) = Kloop * (1 + s/wz) / ( s^2 (1 + s/wp) )   [Derived, type-II]
    Two poles at origin = VCO integrator + loop integrator (Vctrl_I path, slide 39).
    The zero (Vctrl_P proportional path, slide 39) sets phase margin.
    """
    s = 1j * 2 * np.pi * np.asarray(f, dtype=float)
    return params.Kloop * (1 + s / params.wz) / (s ** 2 * (1 + s / params.wp))


def H_ref(params: PLLParams, f):
    """Reference -> output phase (low-pass), DC gain = N.   [derivations.md Sec.1]
    H_ref = N * G/(1+G).
    """
    G = open_loop(params, f)
    return params.N * G / (1 + G)


def H_vco(params: PLLParams, f):
    """VCO -> output phase (high-pass), HF gain = 1.   [derivations.md Sec.1]
    H_vco = 1/(1+G).
    """
    G = open_loop(params, f)
    return 1.0 / (1 + G)


# ----------------------------------------------------------------------------
#  Type-I sampling-loop variant (open_questions.md #1)  [Derived]
# ----------------------------------------------------------------------------
def design_type1(params: PLLParams):
    """First-order-dominant type-I loop at the same crossover f_c.
    G_I(s) = K1 / ( s (1 + s/wp) ).  Single integrator (VCO) -> one pole at origin,
    one extra pole wp for HF roll-off. PM = 90deg - atan(wc/wp).  [Derived]
    """
    wc = 2 * np.pi * params.f_c
    wp = 8.0 * wc                       # far pole -> PM ~ 90 - atan(1/8) ~ 82.9 deg
    jwc = 1j * wc
    K1 = 1.0 / abs(1.0 / (jwc * (1 + jwc / wp)))
    return {"wc": wc, "wp": wp, "K1": K1}


def open_loop_type1(params: PLLParams, f, d1):
    s = 1j * 2 * np.pi * np.asarray(f, dtype=float)
    return d1["K1"] / (s * (1 + s / d1["wp"]))


def H_ref_type1(params, f, d1):
    G = open_loop_type1(params, f, d1)
    return params.N * G / (1 + G)


def H_vco_type1(params, f, d1):
    G = open_loop_type1(params, f, d1)
    return 1.0 / (1 + G)


def H_lf(params: PLLParams, f):
    """Loop-filter / PD-output referred noise -> output (band-pass).  [derivations.md Sec.2]
    Same denominator (1+G); numerator ~ forward path after the PD = K_vco/s shaped.
    Modeled here proportional to H_vco * (wc/ ...) for shape illustration.
    """
    G = open_loop(params, f)
    s = 1j * 2 * np.pi * np.asarray(f, dtype=float)
    # noise injected after the PD sees (K_vco/s)/(1+G)
    return (params.K_vco / s) / (1 + G)


def loop_metrics(params: PLLParams):
    """Numerically extract unity-gain frequency f_c and phase margin (sanity check H)."""
    f = U.logspace(1e2, 1e9, 20000)
    G = open_loop(params, f)
    mag = np.abs(G)
    # crossover: where |G| crosses 1
    idx = np.where(np.diff(np.sign(mag - 1.0)))[0]
    if len(idx):
        i = idx[-1]
        # linear interp in log-f for the crossover
        f_c = np.interp(0.0, [np.log10(mag[i]), np.log10(mag[i + 1])],
                        [np.log10(f[i]), np.log10(f[i + 1])])
        f_c = 10 ** f_c
        ph = np.interp(np.log10(f_c), np.log10(f), np.unwrap(np.angle(G)))
        pm = 180.0 + np.rad2deg(ph)
    else:
        f_c, pm = np.nan, np.nan
    return {"f_c_Hz": float(f_c), "phase_margin_deg": float(pm)}


# ============================================================================
#  Noise source PSDs (single-sided phase PSD, rad^2/Hz)
# ============================================================================
def Sphi_reference(params: PLLParams, f):
    """CKREF phase noise: white floor + flicker (1/f).  [A12]"""
    white = U.L_to_Sphi(params.ref_floor_dbc) * np.ones_like(f)
    flick = U.L_to_Sphi(params.ref_flicker_dbc) * (params.ref_flicker_f / f)
    return white + flick


def Sphi_vco_free(params: PLLParams, f):
    """Free-running VCO phase noise: -20 dB/dec (white-FM) + 1/f^3 flicker.  [A13]"""
    s_white_fm = U.L_to_Sphi(params.vco_dbc_at_1mhz) * (1e6 / f) ** 2
    s_flicker = U.L_to_Sphi(params.vco_dbc_at_1mhz) * (1e6 / f) ** 2 * (params.vco_flicker_corner / f)
    return s_white_fm + s_flicker


def Sphi_dtc(params: PLLParams, f):
    """DTC input-referred (at CKREF) = QN + thermal, both ~white.  Slide p.15, p.16."""
    return (U.L_to_Sphi(params.dtc_qn_dbc) + U.L_to_Sphi(params.dtc_thermal_dbc)) * np.ones_like(f)


def Sphi_spd_gm(params: PLLParams, f):
    """SPD + GM input-referred noise, ~white.  Slide p.20 / [A15]."""
    return U.L_to_Sphi(params.spd_gm_dbc) * np.ones_like(f)


def Sphi_mmd(params: PLLParams, f):
    """MMD (multi-modulus divider) input-referred phase noise, ~white.  Slide p.42 / [A12].
    Distinct from DSM quantization noise: this is the divider's own thermal/flicker.
    """
    return U.L_to_Sphi(params.mmd_dbc) * np.ones_like(f)


def Sphi_dsm_at_output(params: PLLParams, f, cancelled=True):
    """DSM quantization noise referred to output phase.   [Std-Riley, Slide p.9 cancel]
    At divider input it is dsm_quant_psd (cycles^2/Hz). Referred to output:
      * multiply by (2*pi)^2  (cycles -> rad of the divided clock)
      * the DTC cancels the in-band accumulated QE (slide 9) -> residual ~ -40 dB.
    """
    s_cyc = U.dsm_quant_psd(f, params.f_ref, params.dsm_order)  # cycles^2/Hz
    s_rad = s_cyc * (2 * np.pi) ** 2
    # shaped by closed loop (low-pass, like reference path)
    shaped = s_rad * np.abs(H_ref(params, f) / params.N) ** 2 * params.N ** 2
    if cancelled:
        # residual after DTC gain cal = (fractional gain error eps)^2 of the DSM QE.
        # eps=1e-4 -> -80 dB, reproducing slide-42 "~0%". See derivations.md Sec.7.1.
        shaped = shaped * (params.dtc_gain_err ** 2)
    return shaped


# ============================================================================
#  Output-referred contributions and jitter budget
# ============================================================================
def output_contributions(params: PLLParams, f):
    """Return dict name -> S_phi at OUTPUT [rad^2/Hz] for each source, plus 'total'."""
    c = {}
    c["VCO"] = Sphi_vco_free(params, f) * np.abs(H_vco(params, f)) ** 2
    c["REF"] = Sphi_reference(params, f) * np.abs(H_ref(params, f)) ** 2
    c["DTC"] = Sphi_dtc(params, f) * np.abs(H_ref(params, f)) ** 2
    c["MMD"] = Sphi_mmd(params, f) * np.abs(H_ref(params, f)) ** 2
    c["SPD+GM"] = Sphi_spd_gm(params, f) * np.abs(H_ref(params, f)) ** 2
    c["DSM-QN (cancelled)"] = Sphi_dsm_at_output(params, f, cancelled=True)
    c["total"] = sum(v for k, v in c.items())
    return c


def jitter_budget(params: PLLParams, f_lo=1e3, f_hi=100e6):
    """Integrate each contribution -> RMS jitter (fs) and percent of total variance.
    Reproduces the slide-42 pie (VCO/REF dominate).  [Slide p.42]
    """
    f = U.logspace(f_lo, f_hi, 4000)
    c = output_contributions(params, f)
    rows = []
    var_total = U.integrate_phase_noise(f, c["total"], f_lo, f_hi) ** 2
    for name in ["VCO", "REF", "DTC", "MMD", "SPD+GM", "DSM-QN (cancelled)"]:
        sphi = U.integrate_phase_noise(f, c[name], f_lo, f_hi)
        jit = U.rms_jitter_from_sigma_phi(sphi, params.f_out)
        var = sphi ** 2
        rows.append({
            "source": name,
            "sigma_phi_rad": sphi,
            "jitter_fs": jit * 1e15,
            "percent": 100.0 * var / var_total,
        })
    sphi_tot = np.sqrt(var_total)
    jit_tot = U.rms_jitter_from_sigma_phi(sphi_tot, params.f_out)
    total = {
        "source": "TOTAL",
        "sigma_phi_rad": sphi_tot,
        "jitter_fs": jit_tot * 1e15,
        "ipn_dbc_ssb": U.ipn_dbc(sphi_tot, ssb=True),
        "percent": 100.0,
    }
    return rows, total


# ============================================================================
#  Figures
# ============================================================================
def make_figures(params: PLLParams):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    f = U.logspace(1e2, 1e9, 1200)

    # ---- Fig 1: Bode plot of open-loop gain ----
    G = open_loop(params, f)
    met = loop_metrics(params)
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(7, 6), sharex=True)
    a1.semilogx(f, U.db20(G), color="tab:blue")
    a1.axhline(0, color="gray", lw=0.8, ls=":")
    a1.axvline(met["f_c_Hz"], color="tab:red", ls="--", lw=1,
               label=f"f_c={met['f_c_Hz']/1e6:.2f} MHz")
    a1.set_ylabel("|G_ol| [dB]"); a1.grid(True, which="both", alpha=0.3); a1.legend()
    a1.set_title("Open-loop gain (type-II) — slide 5/39 + derivations §1")
    a2.semilogx(f, np.rad2deg(np.unwrap(np.angle(G))), color="tab:green")
    a2.axhline(-180, color="gray", lw=0.8, ls=":")
    a2.axvline(met["f_c_Hz"], color="tab:red", ls="--", lw=1,
               label=f"PM={met['phase_margin_deg']:.1f}°")
    a2.set_ylabel("∠G_ol [deg]"); a2.set_xlabel("Frequency [Hz]")
    a2.grid(True, which="both", alpha=0.3); a2.legend()
    U.savefig_both(fig, "fd_bode.png"); plt.close(fig)

    # ---- Fig 2: closed-loop NTFs ----
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.semilogx(f, U.db20(H_ref(params, f) / params.N), label="Href/N (ref→out, LP)")
    ax.semilogx(f, U.db20(H_vco(params, f)), label="Hvco (vco→out, HP)")
    ax.axvline(params.f_c, color="gray", ls=":", lw=1, label=f"f_c={params.f_c/1e6:.1f} MHz")
    ax.set_xlabel("Frequency [Hz]"); ax.set_ylabel("|NTF| [dB]")
    ax.set_ylim(-60, 10); ax.grid(True, which="both", alpha=0.3); ax.legend()
    ax.set_title("Noise transfer functions — derivations §2")
    U.savefig_both(fig, "fd_ntf.png"); plt.close(fig)

    # ---- Fig 3: phase-noise budget (mimics slide 42) ----
    fcont = U.logspace(1e3, 1e8, 1500)
    c = output_contributions(params, fcont)
    fig, ax = plt.subplots(figsize=(7.5, 4.6))
    styles = {"VCO": "tab:red", "REF": "tab:blue", "DTC": "tab:purple",
              "MMD": "tab:brown", "SPD+GM": "tab:green", "DSM-QN (cancelled)": "tab:orange"}
    for name, col in styles.items():
        ax.semilogx(fcont, U.Sphi_to_L(c[name]), color=col, lw=1.3, label=name)
    ax.semilogx(fcont, U.Sphi_to_L(c["total"]), color="black", lw=2.2, label="TOTAL")
    ax.set_xlabel("Offset frequency [Hz]"); ax.set_ylabel("L(f) [dBc/Hz]")
    ax.set_ylim(-170, -70); ax.grid(True, which="both", alpha=0.3); ax.legend(fontsize=8, ncol=2)
    ax.set_title("Output phase-noise budget @6.72 GHz — reproduces slide 42")
    U.savefig_both(fig, "fd_phase_noise_budget.png"); plt.close(fig)

    # ---- Fig 4: jitter pie ----
    rows, total = jitter_budget(params)
    fig, ax = plt.subplots(figsize=(5.5, 4.6))
    labels = [r["source"] for r in rows]
    sizes = [max(r["percent"], 0.01) for r in rows]
    ax.pie(sizes, labels=[f"{l}\n{s:.0f}%" for l, s in zip(labels, sizes)],
           startangle=90, colors=[styles[l] for l in labels])
    ax.set_title(f"Jitter budget — TOTAL {total['jitter_fs']:.1f} fs rms\n"
                 f"(slide 42: 87.5 fs; VCO 51% / REF 39% / MMD 6% / SPD+GM 4%)")
    U.savefig_both(fig, "fd_jitter_pie.png"); plt.close(fig)

    # ---- Fig 5: type-I vs type-II loop comparison (open_questions #1) ----
    d1 = design_type1(params)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.2))
    a1.semilogx(f, U.db20(H_ref(params, f) / params.N), label="type-II Href/N", color="tab:blue")
    a1.semilogx(f, U.db20(H_ref_type1(params, f, d1) / params.N), label="type-I Href/N", color="tab:red", ls="--")
    a1.set_title("Reference NTF (low-pass)"); a1.set_xlabel("Hz"); a1.set_ylabel("|H| [dB]")
    a1.set_ylim(-40, 8); a1.grid(True, which="both", alpha=0.3); a1.legend(fontsize=8)
    a2.semilogx(f, U.db20(H_vco(params, f)), label="type-II Hvco", color="tab:blue")
    a2.semilogx(f, U.db20(H_vco_type1(params, f, d1)), label="type-I Hvco", color="tab:red", ls="--")
    a2.set_title("VCO NTF (high-pass)"); a2.set_xlabel("Hz"); a2.set_ylabel("|H| [dB]")
    a2.set_ylim(-40, 8); a2.grid(True, which="both", alpha=0.3); a2.legend(fontsize=8)
    fig.suptitle("Type-I vs type-II at the same f_c — type-II suppresses LF ref noise harder "
                 "(2 integrators) but can peak; type-I is first-order, no peaking")
    U.savefig_both(fig, "fd_type_comparison.png"); plt.close(fig)

    return met, rows, total


# ============================================================================
#  Main
# ============================================================================
def main():
    p = PLLParams()
    met = loop_metrics(p)
    rows, total = jitter_budget(p)

    print("=" * 64)
    print("FREQUENCY-DOMAIN MODEL — proposed DTC-assisted frac-N PLL")
    print("=" * 64)
    print(f"f_out={p.f_out/1e9:.3f} GHz  f_ref={p.f_ref/1e6:.1f} MHz  N={p.N:.2f}")
    print(f"design  : f_c={p.f_c/1e6:.2f} MHz (target), PM={p.pm_deg:.0f}° (target)")
    print(f"measured: f_c={met['f_c_Hz']/1e6:.3f} MHz, PM={met['phase_margin_deg']:.1f}°")
    print(f"loop    : wz={p.wz/2/np.pi/1e3:.1f} kHz  wp={p.wp/2/np.pi/1e6:.2f} MHz  Kloop={p.Kloop:.3e}")
    print("-" * 64)
    print(f"{'source':<22}{'jitter[fs]':>12}{'percent':>10}")
    for r in rows:
        print(f"{r['source']:<22}{r['jitter_fs']:>12.2f}{r['percent']:>9.1f}%")
    print("-" * 64)
    print(f"{'TOTAL':<22}{total['jitter_fs']:>12.2f}    IPN={total['ipn_dbc_ssb']:.1f} dBc (SSB, slide-42 conv.)")
    print("=" * 64)

    make_figures(p)

    # ---- export JSON for the website ----
    U.dump_json({
        "params": {k: v for k, v in asdict(p).items()},
        "loop_metrics": met,
        "budget": rows,
        "total": total,
    }, "freq_domain.json")

    # ---- CSV exports (downloadable from the website) ----
    U.dump_csv([[r["source"], f"{r['jitter_fs']:.2f}", f"{r['percent']:.2f}"] for r in rows]
               + [["TOTAL", f"{total['jitter_fs']:.2f}", "100.00"]],
               ["source", "jitter_fs", "percent"], "jitter_budget.csv")
    fcsv = U.logspace(1e3, 1e8, 400)
    c = output_contributions(p, fcsv)
    U.dump_csv([[f"{fcsv[i]:.3f}"] + [f"{U.Sphi_to_L(c[k][i]):.3f}" for k in
                ["VCO", "REF", "DTC", "MMD", "SPD+GM", "DSM-QN (cancelled)", "total"]]
                for i in range(len(fcsv))],
               ["freq_Hz", "VCO", "REF", "DTC", "MMD", "SPD_GM", "DSM_QN", "TOTAL"],
               "phase_noise_budget.csv")
    print("figures + freq_domain.json + CSVs written.")


if __name__ == "__main__":
    main()
