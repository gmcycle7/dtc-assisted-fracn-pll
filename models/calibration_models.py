"""
calibration_models.py
======================
Behavioral models of the FOUR proposed background calibrations of the DTC-assisted
analog sampling fractional-N PLL (deck slides 26-40), plus the survey polynomial NLC
(slide 31). Each calibration is a sign-LMS loop running at the reference rate f_ref.

Calibrations modeled
--------------------
  1. DTC gain  K_DTC        sign-error LMS, regressor = Phi_e            slides 26-28, 40
  2. VCO duty-cycle (vco_dcc) sign LMS, regressor = SEL_CKFB (+-1)       slides 35-37, 40
  3. CKREF duty-cycle (ckref_dcc) sign LMS, regressor = even_cycle (+-1) slide 40
  4. Comparator/GM offset (Vref_adj) DC-servo on mean(e[k])             slides 27-28, 40
  5. Polynomial NLC (g1,g2,g3) — survey concept                          slide 31

Common update law (derivations.md Sec.7):  w[k+1] = w[k] + mu * e[k] * x[k]
with e[k] = sign(PHE[k]) (1-bit comparator) and x[k] the regressor.

Run:  python models/calibration_models.py
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass
import utils as U


# ----------------------------------------------------------------------------
# Shared knobs
# ----------------------------------------------------------------------------
F_REF = 104e6           # reference rate [Hz]        (Slide p.42)
F_OUT = 6.72e9          # VCO output [Hz]            (Slide p.42)
T_VCO = 1.0 / F_OUT     # VCO period [s]


def cycles_for_time(t):
    """Number of reference cycles in t seconds (the cal update rate is f_ref)."""
    return int(round(t * F_REF))


# ============================================================================
# 1. DTC GAIN CALIBRATION  (slides 26-28, 40)
# ============================================================================
def simulate_dtc_gain_cal(
    n_cycles=8000,
    K_true=1000.0,         # true DTC gain = T_vco/LSB  [codes/cycle] (~slide 35 plot)
    K_init_err=0.10,       # initial gain error (fraction)            [A18]
    mu=0.5,                # sign-error LMS step                      [A17]
    half_range=True,       # ½-range DSM -> Phi_e in [0,0.5] (slide 34)
    comp_noise_lsb=0.0,    # comparator input noise (in LSB of residual)
    offset=0.0,            # residual e[k] mean bias (uncalibrated offset) slide 27
    seed=0,
):
    """Model the DTC-gain sign-LMS loop.

    Physics (derivations.md Sec.7.1):
      residual phase error  PHE[k] = (K_true - Khat[k]) * Phi_e[k] / K_true   (+ noise + offset)
      1-bit comparator      e[k]   = sign(PHE[k] + offset + noise)
      sign-error LMS        Khat[k+1] = Khat[k] + mu * e[k] * Phi_e[k]
    The DTC cancels accumulated DSM QE (slide 9); a wrong Khat leaves a residual
    proportional to Phi_e -> reappears as in-band noise / spur.
    """
    rng = np.random.default_rng(seed)
    Khat = K_true * (1.0 - K_init_err)         # start low by K_init_err
    traj = np.empty(n_cycles)
    res = np.empty(n_cycles)
    for k in range(n_cycles):
        # accumulated DSM quantization error this cycle (cycles units)
        phi_e = rng.uniform(0.0, 0.5) if half_range else rng.uniform(-0.5, 0.5)
        # residual phase error from gain mismatch (normalized)
        phe = (K_true - Khat) / K_true * phi_e
        if comp_noise_lsb:
            phe += rng.normal(0.0, comp_noise_lsb / K_true)
        e = np.sign(phe + offset / K_true) or 1.0   # 1-bit comparator (slide 27)
        Khat += mu * e * phi_e                       # sign-error LMS update
        traj[k] = Khat
        res[k] = phe
    return {
        "k": np.arange(n_cycles),
        "t_us": np.arange(n_cycles) / F_REF * 1e6,
        "Khat": traj,
        "K_true": K_true,
        "residual": res,
        "final_err_pct": 100.0 * (traj[-cycles_for_time(5e-6):].mean() - K_true) / K_true,
        "settle_us": _settle_time(traj, K_true, tol=0.01) / F_REF * 1e6,
    }


def _settle_time(traj, target, tol=0.01, smooth=None):
    """First cycle index after which the (smoothed) trajectory stays within tol of target.

    The instantaneous sign-LMS output dithers (limit cycle) and is randomly kicked by
    comparator noise; the *useful* cal output is the smoothed/averaged value, so we
    measure settling on a moving-average of the trajectory (smooth = window length).
    """
    if abs(target) < 1e-30:
        return 0
    if smooth is None:
        smooth = max(8, len(traj) // 100)
    from scipy.ndimage import uniform_filter1d
    sm = uniform_filter1d(traj.astype(float), size=smooth, mode="nearest")
    err = np.abs(sm - target) / abs(target)
    idx = np.where(err >= tol)[0]
    return (idx[-1] + 1) if len(idx) and idx[-1] + 1 < len(traj) else 0


# ============================================================================
# 2. VCO DUTY-CYCLE CALIBRATION (slides 35-37, 40)
# ============================================================================
def simulate_vco_dcc(
    n_cycles=8000,
    duty_err_ps=20.0,      # VCO duty error -> Δt_err (slide 40: 20 ps)
    mu=0.02,               # sign-LMS step (alpha)              [A17]
    comp_noise=0.05,       # comparator residual noise (rad-ish)
    seed=1,
):
    """VCO duty-cycle cal: estimate Δt_err/2 by correlating e[k] with SEL_CKFB(+-1).

    Physics (slide 35-36, derivations.md Sec.7.2):
      Δt_err = Δt - T_vco/2 (non-50% VCO duty makes the two phases not Tvco/2 apart)
      When SEL_CKFB picks the 'other' VCO phase, it injects +-Δt_err into PHE.
      residual PHE[k] = SEL_CKFB[k]*(Δt_err - 2*vco_dcc[k]) + noise
      vco_dcc[k+1] = vco_dcc[k] + mu*SEL_CKFB[k]*e[k]    -> converges to Δt_err/2
    """
    rng = np.random.default_rng(seed)
    dt_err = duty_err_ps * 1e-12
    target = dt_err / 2.0
    vco_dcc = 0.0
    traj = np.empty(n_cycles)
    for k in range(n_cycles):
        sel = 1.0 if (k % 2 == 0) else -1.0          # SEL_CKFB toggles each cycle
        phe = sel * (dt_err - 2.0 * vco_dcc)         # uncorrected duty error
        phe += rng.normal(0.0, comp_noise * dt_err)  # comparator noise
        e = np.sign(phe) or 1.0
        vco_dcc += mu * sel * e * (dt_err)           # sign-LMS (scaled by dt_err for units)
        traj[k] = vco_dcc
    return {
        "k": np.arange(n_cycles),
        "t_us": np.arange(n_cycles) / F_REF * 1e6,
        "vco_dcc_ps": traj * 1e12,
        "target_ps": target * 1e12,
        "settle_us": _settle_time(traj, target, tol=0.05, smooth=200) / F_REF * 1e6,
    }


# ============================================================================
# 3. CKREF DUTY-CYCLE CALIBRATION (slide 40)
# ============================================================================
def simulate_ckref_dcc(
    n_cycles=8000,
    ckref_duty_pct=57.0,   # CKREF duty (slide 40: 57% -> 1 ns error)
    mu=0.02,
    comp_noise=0.05,
    seed=2,
):
    """CKREF duty-cycle cal: correlate e[k] with even_cycle(+-1).
    A non-50% reference duty makes alternate reference periods long/short ->
    an alternating-cycle phase error that even_cycle isolates (derivations.md Sec.7.3).
    """
    rng = np.random.default_rng(seed)
    T_ref = 1.0 / F_REF
    # period asymmetry: 57% duty -> half-periods differ; map to a timing error
    dt_ref = (ckref_duty_pct - 50.0) / 100.0 * T_ref   # e.g. 7% of 9.6 ns ~ 0.67 ns
    target = dt_ref / 2.0
    ckref_dcc = 0.0
    traj = np.empty(n_cycles)
    for k in range(n_cycles):
        ec = 1.0 if (k % 2 == 0) else -1.0          # even_cycle toggles each cycle
        phe = ec * (dt_ref - 2.0 * ckref_dcc)
        phe += rng.normal(0.0, comp_noise * dt_ref)
        e = np.sign(phe) or 1.0
        ckref_dcc += mu * ec * e * dt_ref
        traj[k] = ckref_dcc
    return {
        "k": np.arange(n_cycles),
        "t_us": np.arange(n_cycles) / F_REF * 1e6,
        "ckref_dcc_ns": traj * 1e9,
        "target_ns": target * 1e9,
        "settle_us": _settle_time(traj, target, tol=0.05, smooth=200) / F_REF * 1e6,
    }


# ============================================================================
# 4. COMPARATOR / GM OFFSET CALIBRATION (Vref_adj, slides 27-28, 40)
# ============================================================================
def simulate_offset_cal(
    n_cycles=8000,
    offset_mv=32.0,        # comparator+GM offset (slide 40: 32 mV)
    K_spd=9.19,            # SPD gain [V/rad] (slide 20)
    mu_mv=0.09,            # DC-servo step [mV]                 [A17]
    phe_noise_rad=0.008,   # locked PHE jitter [rad]
    seed=3,
):
    """Offset cal: a 1-bit ΔV-DAC adjusts Vref_adj to drive mean(e[k]) -> 0 (slide 28).
    Without it, e[k] is biased and the sign-LMS DTC-gain loop converges to a WRONG K_DTC
    (slide 27). Update: Vref_adj[k+1] = Vref_adj[k] + mu*e[k]  (DC servo).
    """
    rng = np.random.default_rng(seed)
    os_rad = (offset_mv * 1e-3) / K_spd          # offset referred to phase [rad]
    vref_adj = 0.0                                # in mV
    traj = np.empty(n_cycles)
    emean = np.empty(n_cycles)
    run = 0.0
    for k in range(n_cycles):
        phe = rng.normal(0.0, phe_noise_rad)     # zero-mean PHE (locked)
        eff_offset = os_rad - (vref_adj * 1e-3) / K_spd
        e = np.sign(phe + eff_offset) or 1.0
        vref_adj += mu_mv * e                     # DC servo toward zero-mean e
        traj[k] = vref_adj
        run = 0.98 * run + 0.02 * e               # leaky mean of e[k]
        emean[k] = run
    return {
        "k": np.arange(n_cycles),
        "t_us": np.arange(n_cycles) / F_REF * 1e6,
        "vref_adj_mv": traj,
        "target_mv": offset_mv,
        "e_mean": emean,
        # tol=0.08: the offset cal uses a coarse 1-bit ΔV-DAC (slide 28) -> ~few-% residual
        "settle_us": _settle_time(traj, offset_mv, tol=0.08, smooth=400) / F_REF * 1e6,
    }


# ============================================================================
# 5. POLYNOMIAL DTC NLC  (survey, slide 31)
# ============================================================================
def simulate_polynomial_nlc(
    n_cycles=20000,
    g1_true=1.0,                # ideal (wanted) linear gain
    a2=0.18, a3=0.04,           # DTC intrinsic 2nd/3rd-order INL (normalized) [A8]
    g1_init_err=0.10,           # initial gain error
    mu=(0.03, 0.02, 0.01),      # LMS steps for (g1, g2, g3)
    seed=4,
):
    """DTC NLC: 3 parallel LMS loops adapt the correction coefficients (g1,g2,g3) of
    D_DCW = g1*D + g2*D^2 + g3*D^3 so the *total* delay is linear in D_AQ (slide 31).

    Model (derivations.md Sec.7.5):
      The DTC's intrinsic static INL (applied to a plain linear code) is  a2*D^2 + a3*D^3.
      The NLC adds correction terms g2*D^2 + g3*D^3 that cancel it, and g1 fixes the gain.
      residual phase error:  e = (g1_true-g1)*D + (a2-g2)*D^2 + (a3-g3)*D^3   -> drive to 0
      LMS:  g_i[k+1] = g_i[k] + mu_i * e[k] * regressor_i,  regressor = [D, D^2, D^3]
      converges to g -> (g1_true, a2, a3).
    """
    rng = np.random.default_rng(seed)
    g = np.array([g1_true * (1.0 - g1_init_err), 0.0, 0.0])  # only coarse gain at start
    traj = np.empty((n_cycles, 3))
    for k in range(n_cycles):
        D = rng.uniform(-1.0, 1.0)                            # normalized accumulated DSM phase
        regress = np.array([D, D**2, D**3])
        residual = (g1_true - g[0]) * D + (a2 - g[1]) * D**2 + (a3 - g[2]) * D**3
        g = g + np.array(mu) * residual * regress            # 3 parallel LMS
        traj[k] = g
    # INL curves before (no NLC: g2=g3=0, g1 off) vs after (converged g)
    Dg = np.linspace(-1, 1, 201)
    inl_before = a2 * Dg**2 + a3 * Dg**3                      # uncorrected DTC INL
    inl_after = (g1_true - g[0]) * Dg + (a2 - g[1]) * Dg**2 + (a3 - g[2]) * Dg**3
    return {
        "k": np.arange(n_cycles),
        "g_traj": traj,
        "g_final": g,
        "g_true": np.array([g1_true, a2, a3]),
        "D": Dg,
        "inl_before": inl_before,
        "inl_after": inl_after,
        "inl_pk_before": float(np.max(np.abs(inl_before))),
        "inl_pk_after": float(np.max(np.abs(inl_after))),
    }


# ============================================================================
# Convergence-analysis helpers (Section H sanity checks)
# ============================================================================
def stepsize_sweep(mus=(0.1, 0.5, 2.0, 6.0)):
    """Show step-size effect: small -> slow, large -> overshoot/limit-cycle/instability."""
    out = {}
    for mu in mus:
        r = simulate_dtc_gain_cal(n_cycles=6000, mu=mu, seed=10)
        out[mu] = r
    return out


# ============================================================================
# Figures
# ============================================================================
def make_figures():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    summary = {}

    # ---- Fig: DTC gain convergence (ideal / noisy / with-offset) ----
    r_ideal = simulate_dtc_gain_cal(seed=0)
    r_noisy = simulate_dtc_gain_cal(comp_noise_lsb=2.0, seed=0)
    r_offset = simulate_dtc_gain_cal(offset=80.0, seed=0)   # uncalibrated offset -> bias
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.plot(r_ideal["t_us"], r_ideal["Khat"], label="ideal (no noise/offset)")
    ax.plot(r_noisy["t_us"], r_noisy["Khat"], alpha=0.8, label="+comparator noise")
    ax.plot(r_offset["t_us"], r_offset["Khat"], alpha=0.8, label="+uncal offset (BIAS!)")
    ax.axhline(1000.0, color="k", ls="--", lw=1, label="K_true=1000")
    ax.axvline(30, color="gray", ls=":", lw=1, label="30 µs (slide 37/40)")
    ax.set_xlabel("time [µs]"); ax.set_ylabel("K_DTC estimate [codes/cycle]")
    ax.set_title("DTC gain calibration — sign-error LMS (slides 26-28)")
    ax.legend(fontsize=8); ax.grid(alpha=0.3)
    U.savefig_both(fig, "cal_dtc_gain.png"); plt.close(fig)
    summary["dtc_gain"] = {"settle_us": r_ideal["settle_us"],
                           "final_err_pct": r_ideal["final_err_pct"],
                           "offset_bias_pct": r_offset["final_err_pct"]}

    # ---- Fig: step-size sweep ----
    sw = stepsize_sweep()
    fig, ax = plt.subplots(figsize=(7, 4.2))
    for mu, r in sw.items():
        ax.plot(r["t_us"], r["Khat"], label=f"µ={mu}")
    ax.axhline(1000.0, color="k", ls="--", lw=1)
    ax.set_xlabel("time [µs]"); ax.set_ylabel("K_DTC estimate")
    ax.set_title("Step-size trade-off: small=slow, large=overshoot/limit-cycle")
    ax.legend(fontsize=8); ax.grid(alpha=0.3); ax.set_ylim(880, 1120)
    U.savefig_both(fig, "cal_stepsize.png"); plt.close(fig)

    # ---- Fig: VCO duty-cycle cal ----
    rv = simulate_vco_dcc()
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.plot(rv["t_us"], rv["vco_dcc_ps"], color="tab:red")
    ax.axhline(rv["target_ps"], color="k", ls="--", lw=1,
               label=f"target Δt_err/2 = {rv['target_ps']:.1f} ps")
    ax.set_xlabel("time [µs]"); ax.set_ylabel("vco_dcc [ps]")
    ax.set_title("VCO duty-cycle calibration (slides 35-36, 20 ps error)")
    ax.legend(); ax.grid(alpha=0.3)
    U.savefig_both(fig, "cal_vco_dcc.png"); plt.close(fig)
    summary["vco_dcc"] = {"settle_us": rv["settle_us"], "target_ps": rv["target_ps"],
                          "final_ps": float(rv["vco_dcc_ps"][-1])}

    # ---- Fig: CKREF duty-cycle cal ----
    rc = simulate_ckref_dcc()
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.plot(rc["t_us"], rc["ckref_dcc_ns"], color="tab:green")
    ax.axhline(rc["target_ns"], color="k", ls="--", lw=1,
               label=f"target = {rc['target_ns']:.2f} ns")
    ax.set_xlabel("time [µs]"); ax.set_ylabel("ckref_dcc [ns]")
    ax.set_title("CKREF duty-cycle calibration (slide 40, 57% duty)")
    ax.legend(); ax.grid(alpha=0.3)
    U.savefig_both(fig, "cal_ckref_dcc.png"); plt.close(fig)
    summary["ckref_dcc"] = {"settle_us": rc["settle_us"], "target_ns": rc["target_ns"],
                            "final_ns": float(rc["ckref_dcc_ns"][-1])}

    # ---- Fig: offset cal ----
    ro = simulate_offset_cal()
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(7, 5), sharex=True)
    a1.plot(ro["t_us"], ro["vref_adj_mv"], color="tab:purple")
    a1.axhline(ro["target_mv"], color="k", ls="--", lw=1, label=f"offset={ro['target_mv']} mV")
    a1.set_ylabel("Vref_adj [mV]"); a1.legend(); a1.grid(alpha=0.3)
    a1.set_title("Comparator/GM offset cal — ΔV-DAC servo (slides 27-28)")
    a2.plot(ro["t_us"], ro["e_mean"], color="tab:orange")
    a2.axhline(0, color="k", ls="--", lw=1)
    a2.set_ylabel("mean(e[k])"); a2.set_xlabel("time [µs]"); a2.grid(alpha=0.3)
    U.savefig_both(fig, "cal_offset.png"); plt.close(fig)
    summary["offset"] = {"settle_us": ro["settle_us"], "target_mv": ro["target_mv"],
                         "final_mv": float(ro["vref_adj_mv"][-1])}

    # ---- Fig: polynomial NLC INL before/after ----
    rn = simulate_polynomial_nlc()
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4))
    a1.plot(rn["D"], rn["inl_before"], label=f"before (pk {rn['inl_pk_before']:.3f})")
    a1.plot(rn["D"], rn["inl_after"], label=f"after  (pk {rn['inl_pk_after']:.4f})")
    a1.set_xlabel("normalized DTC code D_AQ"); a1.set_ylabel("INL (norm.)")
    a1.set_title("DTC INL before/after polynomial NLC (slide 31)")
    a1.legend(); a1.grid(alpha=0.3)
    a2.plot(rn["k"], rn["g_traj"][:, 0], label="g1 (gain)")
    a2.plot(rn["k"], rn["g_traj"][:, 1], label="g2 (2nd)")
    a2.plot(rn["k"], rn["g_traj"][:, 2], label="g3 (3rd)")
    a2.set_xlabel("LMS iteration"); a2.set_ylabel("coefficient")
    a2.set_title("g1,g2,g3 LMS convergence"); a2.legend(); a2.grid(alpha=0.3)
    U.savefig_both(fig, "cal_polynomial_nlc.png"); plt.close(fig)
    summary["nlc"] = {"inl_pk_before": rn["inl_pk_before"], "inl_pk_after": rn["inl_pk_after"]}

    # ---- Fig: all background cals together (mimics slide 40) ----
    fig, axs = plt.subplots(4, 1, figsize=(7.5, 8), sharex=True)
    axs[0].plot(r_ideal["t_us"], r_ideal["Khat"]); axs[0].axhline(1000, color="k", ls="--", lw=1)
    axs[0].set_ylabel("K_DTC"); axs[0].set_title("Background calibrations all converge < 30 µs (slide 40)")
    axs[1].plot(rv["t_us"], rv["vco_dcc_ps"], color="tab:red"); axs[1].axhline(rv["target_ps"], color="k", ls="--", lw=1)
    axs[1].set_ylabel("vco_dcc [ps]")
    axs[2].plot(rc["t_us"], rc["ckref_dcc_ns"], color="tab:green"); axs[2].axhline(rc["target_ns"], color="k", ls="--", lw=1)
    axs[2].set_ylabel("ckref_dcc [ns]")
    axs[3].plot(ro["t_us"], ro["vref_adj_mv"], color="tab:purple"); axs[3].axhline(ro["target_mv"], color="k", ls="--", lw=1)
    axs[3].set_ylabel("Vref_adj [mV]"); axs[3].set_xlabel("time [µs]")
    for a in axs:
        a.axvline(30, color="gray", ls=":", lw=1); a.grid(alpha=0.3)
    U.savefig_both(fig, "cal_background_all.png"); plt.close(fig)

    return summary


def main():
    print("=" * 64)
    print("CALIBRATION MODELS — 4 proposed background cals + survey NLC")
    print("=" * 64)
    s = make_figures()
    for name, d in s.items():
        print(f"[{name}] " + ", ".join(f"{k}={v:.3f}" if isinstance(v, float) else f"{k}={v}"
                                       for k, v in d.items()))
    U.dump_json(s, "calibrations.json")
    print("-" * 64)
    print("figures + calibrations.json written.")


if __name__ == "__main__":
    main()
