"""
extras.py — v3 figures for the deep-content pages. Mirrors site/assets/app/pll_ext.js
(node-validated) so the static figures agree with the interactive widgets and the Python
core. Run:  python models/extras.py
"""
from __future__ import annotations
import numpy as np
import utils as U
from frequency_domain_model import (PLLParams, open_loop, H_ref, H_vco, output_contributions,
                                    design_type1, loop_metrics)

KB, T = 1.380649e-23, 300.0


# ============================================================
#  Loop dynamics: closed-loop poles, root locus, step response
# ============================================================
def closed_loop_poles(p: PLLParams, gain=1.0):
    """Roots of 1+G_ol=0: s^3 + wp s^2 + (K wp/wz) s + K wp = 0."""
    K = p.Kloop * gain
    return np.roots([1.0, p.wp, K * p.wp / p.wz, K * p.wp])


def zeta_wn(p: PLLParams):
    wn = np.sqrt(p.Kloop)                 # 2nd-order approx (ignore far pole wp)
    zeta = np.sqrt(p.Kloop) / (2 * p.wz)
    return zeta, wn / (2 * np.pi)


def step_response(p: PLLParams, kind="phase", df=0.0, n=4000):
    Ts, N, wc = 1 / p.f_ref, p.N, 2 * np.pi * p.f_c
    wz = wc / np.tan(np.deg2rad(p.pm_deg))
    Kc = wc / np.sqrt(1 + (wz / wc) ** 2)
    Kp, Ki, Kv = Kc * N * Ts, Kc * N * Ts * wz * Ts, 1.0
    phi = np.zeros(n); acc = 0.0; ctrl = 0.0
    ramp = 2 * np.pi * df * Ts if kind == "freq" else 0.0
    stepP = 1.0 if kind == "phase" else 0.0
    for k in range(1, n):
        phi[k] = phi[k - 1] + Kv * ctrl
        e = (stepP + ramp * k) - phi[k] / N
        acc += e; ctrl = Kp * e + Ki * acc
    final = phi[-1] if kind == "freq" else N * stepP
    y = phi / final
    over = max(0.0, (y[:n].max() - 1) * 100)
    settle = next((i for i in range(n - 1, 0, -1) if abs(y[i] - 1) > 0.01), 0)
    t_us = np.arange(n) * Ts * 1e6
    return t_us, y, over, settle * Ts * 1e6


# ============================================================
#  VCO Leeson
# ============================================================
def leeson_L(fm, f0=6.72e9, F=4.0, Q=10.0, Psig=1.67e-3, fc_flicker=150e3):
    """Leeson: L = 10log10{ (2 F kT / Psig) [1+(f0/(2Q fm))^2] (1 + fc/fm) }  [Std-Leeson]."""
    base = 2 * F * KB * T / Psig
    return 10 * np.log10(base * (1 + (f0 / (2 * Q * fm)) ** 2) * (1 + fc_flicker / fm))


# ============================================================
#  DSM / MASH simulator (matches pll_ext.simMASH)
# ============================================================
def mash_qe(frac, order, n=8192):
    acc = np.zeros(order); h1 = np.zeros(order); h2 = np.zeros(order)
    qe = np.zeros(n); run = 0.0
    binom = [[1], [1, -1], [1, -2, 1]]
    for k in range(n):
        inp = frac; carries = np.zeros(order)
        for s in range(order):
            acc[s] += inp; c = np.floor(acc[s]); acc[s] -= c; carries[s] = c; inp = acc[s]
        y = 0.0
        for s in range(order):
            cof = binom[min(s, 2)]
            v = cof[0] * carries[s]
            if len(cof) > 1: v += cof[1] * h1[s]
            if len(cof) > 2: v += cof[2] * h2[s]
            y += v
        h2 = h1.copy(); h1 = carries.copy()
        run += (y - frac); qe[k] = run
    return qe - (qe.min() + qe.max()) / 2


# ============================================================
#  Fractional spurs (INL -> spectrum), matches pll_ext.spurSpectrum
# ============================================================
def spur_spectrum(p: PLLParams, alpha=0.02, g2=0.6, g3=0.1, redux=1.0, nlc=False,
                  duty_ps=0.0, duty_cal=True, N=4096, t_res=400e-15):
    n = np.arange(N)
    x = (n * alpha) % 1.0
    u = (2 * x - 1) * redux
    inl = np.zeros(N) if nlc else (g2 * u ** 2 + g3 * u ** 3)
    dt = inl * t_res
    if (not duty_cal) and duty_ps:
        dt = dt + np.where(n % 2 == 1, 1, -1) * (duty_ps * 1e-12) / 2
    phi = 2 * np.pi * p.f_out * dt
    w = phi * np.hanning(N)
    X = np.fft.rfft(w)
    freq = np.fft.rfftfreq(N, d=1.0 / p.f_ref)
    amp = 2 * np.abs(X) / N / 0.5
    hr = np.array([abs(H_ref(p, f)) / p.N if f > 0 else 1.0 for f in freq])
    amp = amp * hr
    dbc = 20 * np.log10(amp / 2 + 1e-300)
    sel = freq > p.f_ref / N * 2
    return freq, dbc, float(dbc[sel].max())


# ============================================================
#  Calibration: misadjustment, residual floor, NLC basis
# ============================================================
def sign_lms_ripple(mu, n=20000, seed=0):
    rng = np.random.default_rng(seed); Khat = 1000.0; tr = np.empty(n)
    for k in range(n):
        phi_e = rng.uniform(0, 0.5)
        phe = (1000.0 - Khat) / 1000.0 * phi_e
        Khat += mu * (np.sign(phe) or 1) * phi_e; tr[k] = Khat
    return np.std(tr[-4000:])


def residual_floor_fs(p: PLLParams, eps):
    f = U.logspace(1e3, 100e6, 1500)
    sQ = U.dsm_quant_psd(f, p.f_ref, p.dsm_order)
    S = eps ** 2 * sQ * (2 * np.pi) ** 2 * np.abs([H_ref(p, ff) for ff in f]) ** 2
    sphi = U.integrate_phase_noise(f, S, 1e3, 100e6)
    return sphi / (2 * np.pi * p.f_out) * 1e15


def legendre_vs_monomial(n=4000, seed=0):
    """Adapt a cubic predistortion with monomial vs Legendre basis; show convergence."""
    rng = np.random.default_rng(seed)
    a = np.array([0.0, 0.18, 0.04])          # true 2nd/3rd INL to cancel (g1 err, a2, a3)
    g1t = 1.0
    # monomial regressors [D, D^2, D^3]
    gm = np.array([0.9, 0.0, 0.0]); errm = np.empty(n)
    gl = np.array([0.9, 0.0, 0.0]); errl = np.empty(n)
    mu = 0.02
    for k in range(n):
        D = rng.uniform(-1, 1)
        # monomial
        rm = np.array([D, D * D, D * D * D])
        res = (g1t - gm[0]) * D + (a[1] - gm[1]) * D**2 + (a[2] - gm[2]) * D**3
        gm = gm + mu * res * rm; errm[k] = abs(res)
        # Legendre P1=D, P2=(3D^2-1)/2, P3=(5D^3-3D)/2 (orthogonal on [-1,1])
        P = np.array([D, (3 * D**2 - 1) / 2, (5 * D**3 - 3 * D) / 2])
        # target expressed in Legendre coeffs (project the same residual)
        resl = (g1t - gl[0]) * D + (a[1] - gl[1]) * D**2 + (a[2] - gl[2]) * D**3
        gl = gl + mu * resl * P; errl[k] = abs(resl)
    return errm, errl


# ============================================================
#  Figures
# ============================================================
def make_figures():
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    p = PLLParams()
    out = {}

    # --- root locus ---
    gains = np.geomspace(0.1, 10, 40); wc = 2 * np.pi * p.f_c
    fig, ax = plt.subplots(figsize=(6, 5))
    for g in gains:
        r = closed_loop_poles(p, g) / wc
        ax.plot(r.real, r.imag, '.', color="0.8", ms=3)
    r0 = closed_loop_poles(p, 1.0) / wc
    ax.plot(r0.real, r0.imag, 'x', color="tab:red", ms=12, label="closed-loop poles (1×)")
    ax.plot([-p.wz / wc], [0], 'o', mfc='none', color="tab:blue", ms=12, label="zero ω_z")
    ax.axhline(0, color="0.6", lw=.7); ax.axvline(0, color="0.6", lw=.7)
    z, wn = zeta_wn(p)
    ax.set_title(f"Root locus (gain 0.1–10×) — ζ≈{z:.2f}, ω_n≈{wn/1e6:.2f} MHz")
    ax.set_xlabel("Re{s}/ω_c"); ax.set_ylabel("Im{s}/ω_c"); ax.legend(); ax.grid(alpha=.3)
    ax.set_xlim(-7, 1); U.savefig_both(fig, "fd_root_locus.png"); plt.close(fig)

    # --- step response ---
    t, y, over, settle = step_response(p, "phase")
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.plot(t[:2500], y[:2500], color="tab:blue"); ax.axhline(1, color="k", ls="--", lw=1)
    ax.set_title(f"Phase-step response — overshoot {over:.0f}%, 1% settle {settle:.2f} µs (ζ≈{z:.2f})")
    ax.set_xlabel("time [µs]"); ax.set_ylabel("normalized output phase"); ax.grid(alpha=.3)
    U.savefig_both(fig, "fd_step_response.png"); plt.close(fig)
    out["loop"] = {"zeta": z, "wn_mhz": wn / 1e6, "overshoot_pct": over, "settle_us": settle}

    # --- VCO Leeson ---
    fm = U.logspace(1e3, 1e8, 400)
    fig, ax = plt.subplots(figsize=(7, 4.3))
    ax.semilogx(fm, leeson_L(fm), color="tab:red", lw=2, label="Leeson (F=4, Q=10, P=1.67 mW)")
    ax.semilogx(fm, U.Sphi_to_L(U.L_to_Sphi(p.vco_dbc_at_1mhz) * (1e6 / fm) ** 2 *
                (1 + p.vco_flicker_corner / fm)), color="tab:blue", ls="--",
                label="back-solved model [A13]")
    ax.axvline(150e3, color="0.6", ls=":", lw=1, label="flicker corner 150 kHz")
    ax.set_title("VCO phase noise — Leeson reproduces the 51.8%-budget curve")
    ax.set_xlabel("offset [Hz]"); ax.set_ylabel("L(f) [dBc/Hz]"); ax.grid(alpha=.3, which="both")
    ax.legend(fontsize=8); U.savefig_both(fig, "vco_leeson.png"); plt.close(fig)

    # --- DSM MASH QE ---
    fig, ax = plt.subplots(figsize=(7, 4))
    for m, c in [(1, "tab:green"), (2, "tab:blue"), (3, "tab:red")]:
        qe = mash_qe(0.123, m, 8192)
        ax.plot(qe[:300], color=c, lw=.9, label=f"MASH-1^{m}  (range {qe.max()-qe.min():.1f} T_vco)")
    ax.set_title("Accumulated ΔΣ quantization error the DTC must cancel (slide 6)")
    ax.set_xlabel("reference cycle n"); ax.set_ylabel("Φ_QE [T_vco]"); ax.legend(fontsize=8); ax.grid(alpha=.3)
    U.savefig_both(fig, "dsm_mash.png"); plt.close(fig)

    # --- spurs ---
    fig, ax = plt.subplots(figsize=(7.5, 4.3))
    for lbl, kw, c in [("full range", dict(redux=1), "tab:red"),
                       ("½ range (2φ)", dict(redux=0.5), "tab:orange"),
                       ("1/8 range (8φ)", dict(redux=0.125), "tab:green"),
                       ("½ + NLC", dict(redux=0.5, nlc=True), "tab:blue")]:
        f, dbc, mx = spur_spectrum(p, alpha=0.02, g2=0.6, g3=0.1, **kw)
        mxl = f"{mx:.0f} dBc" if mx > -140 else "cancelled"
        ax.semilogx(f, np.clip(dbc, -135, None), color=c, lw=1, label=f"{lbl}  (worst {mxl})")
    ax.set_title("Fractional spurs vs DTC range-reduction & NLC (INL ±0.6/0.1 LSB, α=0.02)")
    ax.set_xlabel("spur offset [Hz]"); ax.set_ylabel("spur [dBc]"); ax.set_ylim(-130, -30)
    ax.grid(alpha=.3, which="both"); ax.legend(fontsize=8); U.savefig_both(fig, "spur_inl.png"); plt.close(fig)
    out["spur"] = {"full_dbc": spur_spectrum(p, alpha=0.02, g2=0.6, g3=0.1, redux=1)[2]}

    # --- misadjustment ---
    mus = np.geomspace(0.05, 6, 12)
    rip = [sign_lms_ripple(mu) for mu in mus]
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.loglog(mus, rip, 'o-', color="tab:purple")
    ax.set_title("Sign-LMS steady-state ripple ∝ µ (misadjustment ↑ with step size)")
    ax.set_xlabel("step size µ"); ax.set_ylabel("std(K_DTC) ripple [codes]"); ax.grid(alpha=.3, which="both")
    U.savefig_both(fig, "cal_misadjustment.png"); plt.close(fig)

    # --- residual floor vs eps ---
    eps = np.geomspace(1e-5, 0.05, 30); rf = [residual_floor_fs(p, e) for e in eps]
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.loglog(eps * 100, rf, color="tab:red")
    ax.axhline(87.6, color="0.5", ls="--", lw=1, label="total budget 87.6 fs")
    ax.set_title("In-band floor from residual K_DTC gain error ε (how accurate cal must be)")
    ax.set_xlabel("|gain error| ε [%]"); ax.set_ylabel("added jitter [fs]"); ax.legend(); ax.grid(alpha=.3, which="both")
    U.savefig_both(fig, "cal_residual_floor.png"); plt.close(fig)

    # --- NLC basis ---
    em, el = legendre_vs_monomial()
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.semilogy(np.convolve(em, np.ones(50) / 50, "same")[:3000], color="tab:red", label="monomial [D,D²,D³] (coupled)")
    ax.semilogy(np.convolve(el, np.ones(50) / 50, "same")[:3000], color="tab:green", label="Legendre P₁,P₂,P₃ (orthogonal)")
    ax.set_title("Polynomial NLC: orthogonal basis converges cleaner (eigenvalue spread)")
    ax.set_xlabel("LMS iteration"); ax.set_ylabel("|residual| (smoothed)"); ax.legend(fontsize=8); ax.grid(alpha=.3)
    U.savefig_both(fig, "cal_nlc_basis.png"); plt.close(fig)

    # --- FoM scatter (iso-FoM lines + this work; SoTA region illustrative) ---
    P_mw = np.geomspace(1, 100, 50)
    fig, ax = plt.subplots(figsize=(7, 4.5))
    for fom in [-240, -245, -250, -255]:
        jit = np.sqrt(10 ** (fom / 10) / P_mw) * 1e15
        ax.loglog(P_mw, jit, color="0.7", lw=.8)
        ax.text(P_mw[-1], jit[-1], f"{fom} dB", fontsize=7, color="0.5")
    ax.loglog([14.2], [87.6], '*', color="tab:red", ms=18,
              label="this work: 87.6 fs, 14.2 mW → FoM −249.6 dB")
    ax.axhspan(60, 200, alpha=0.05, color="tab:blue")
    ax.set_title("Jitter–power FoM (iso-FoM diagonals; shaded ≈ low-jitter frac-N regime)")
    ax.set_xlabel("power [mW]"); ax.set_ylabel("RMS jitter [fs]"); ax.legend(fontsize=8); ax.grid(alpha=.3, which="both")
    U.savefig_both(fig, "fom_scatter.png"); plt.close(fig)
    out["fom_db"] = 10 * np.log10((87.6e-15) ** 2 * 14.2)

    # --- jitter taxonomy weighting ---
    f = U.logspace(1e3, 50e6, 600)
    c = output_contributions(p, f)
    T0 = 1 / p.f_out
    Wper = np.abs(1 - np.exp(-1j * 2 * np.pi * f * T0)) ** 2
    fig, ax = plt.subplots(figsize=(7, 4.3))
    ax.loglog(f, c["total"], color="k", label="S_φ (absolute)")
    ax.loglog(f, c["total"] * Wper, color="tab:orange", label="period-jitter weighting ×|1−z⁻¹|²")
    ax.set_title("Jitter taxonomy: period/c2c high-pass-weight the same PSD")
    ax.set_xlabel("offset [Hz]"); ax.set_ylabel("weighted S_φ [rad²/Hz]"); ax.legend(fontsize=8); ax.grid(alpha=.3, which="both")
    U.savefig_both(fig, "jitter_taxonomy.png"); plt.close(fig)

    return out


def main():
    print("=" * 60); print("EXTRAS — v3 figures"); print("=" * 60)
    o = make_figures()
    print(f"loop: zeta={o['loop']['zeta']:.3f} wn={o['loop']['wn_mhz']:.2f}MHz "
          f"overshoot={o['loop']['overshoot_pct']:.0f}% settle={o['loop']['settle_us']:.2f}us")
    print(f"spur full-range worst: {o['spur']['full_dbc']:.1f} dBc")
    print(f"FoM: {o['fom_db']:.1f} dB")
    U.dump_json(o, "extras.json")
    print("figures + extras.json written.")


if __name__ == "__main__":
    main()
