"""
time_domain_noise_model.py
==========================
Discrete-time (sampled at f_ref) behavioral simulation of the proposed DTC-assisted
fractional-N sampling PLL, to SHOW how each noise source enters, is shaped by the loop,
and becomes output phase noise / jitter -- and to CROSS-CHECK the frequency-domain model.

Pipeline (every line maps to a circuit / equation; see derivations.md):
  reference phase  ->  DTC (cancels DSM QE, adds DTC noise)  ->  SPD (phase error)
  ->  digital PI loop filter (type-II)  ->  VCO phase accumulation  ->  MMD (/N) feedback

Sampling note: the SPD samples once per reference cycle, so fs = f_ref = 104 MHz and the
model's Nyquist is f_ref/2 = 52 MHz. Jitter is therefore integrated over [1 kHz, 52 MHz]
for the time<->freq cross-check; the freq-domain 100-MHz number is slightly higher (VCO
tail 52-100 MHz). This limitation is stated in docs/open_questions.md.

Run:  python models/time_domain_noise_model.py
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass
import utils as U
from frequency_domain_model import PLLParams, output_contributions, H_ref, H_vco


# ============================================================================
#  Discrete-time loop design (z-domain) matched to the freq-domain BW/PM
# ============================================================================
@dataclass
class DTLoop:
    """Discrete type-II PLL: two integrators (VCO + PI-integral) + one zero (PI-prop)."""
    f_ref: float = 104e6
    f_out: float = 6.72e9
    f_c: float = 1.5e6          # target loop BW  [A1]
    pm_deg: float = 60.0        # target phase margin [A2]

    def __post_init__(self):
        self.Ts = 1.0 / self.f_ref
        self.N = self.f_out / self.f_ref
        wc = 2 * np.pi * self.f_c
        # type-II L(s) = Kc (s+wz)/s^2 ; PM = atan(wc/wz) -> wz = wc/tan(PM)
        self.wz = wc / np.tan(np.deg2rad(self.pm_deg))
        Kc = wc / np.sqrt(1 + (self.wz / wc) ** 2)      # |L(jwc)|=1
        # map to discrete PI gains (Kv absorbed = 1): Kc = Kp/(N Ts); Ki/Kp = wz Ts
        self.Kv = 1.0
        self.Kp = Kc * self.N * self.Ts / self.Kv
        self.Ki = self.Kp * self.wz * self.Ts

    # ---- analytic z-domain NTFs for the cross-check ----
    def ntf(self, f):
        z = np.exp(1j * 2 * np.pi * np.asarray(f) * self.Ts)
        zi = 1.0 / z
        PI = self.Kp + self.Ki / (1 - zi)               # loop filter
        VCO = self.Kv * zi / (1 - zi)                   # VCO accumulator (phase)
        A = VCO * PI                                     # forward gain
        L = A / self.N                                   # open loop
        H_ref = A / (1 + L)                              # reference -> out
        H_vco = 1.0 / (1 + L)                            # vco -> out
        return H_ref, H_vco, L


# ============================================================================
#  Time-domain simulation
# ============================================================================
def simulate(loop: DTLoop, params: PLLParams, n=2**20, seed=0,
             sources=("vco", "ref", "dtc", "mmd", "spd")):
    """Run the discrete-time PLL with the chosen noise sources active.
    Returns output excess phase phi_out[k] (rad) and the control signal.
    """
    rng = np.random.default_rng(seed)
    fs = loop.f_ref
    on = lambda s: s in sources

    # ---- noise-source sequences (rad, referred to their injection node) ----
    # reference phase noise: white floor + flicker (1/f -> -10 dB/dec, matches freq model) [A12]
    ref_noise = (U.gen_white_phase(n, params.ref_floor_dbc, fs, rng) +
                 U.gen_flicker_phase(n, params.ref_flicker_dbc, params.ref_flicker_f, fs, rng,
                                     slope_db_per_dec=-10.0)) \
        if on("ref") else np.zeros(n)
    # DTC quantization + thermal, ~white, at the reference path  Slide p.15/16
    dtc_noise = (U.gen_white_phase(n, params.dtc_qn_dbc, fs, rng) +
                 U.gen_white_phase(n, params.dtc_thermal_dbc, fs, rng)) if on("dtc") else np.zeros(n)
    # SPD + GM input-referred, ~white  Slide p.20
    spd_noise = U.gen_white_phase(n, params.spd_gm_dbc, fs, rng) if on("spd") else np.zeros(n)
    # MMD (divider) input-referred, ~white  Slide p.42
    mmd_noise = U.gen_white_phase(n, params.mmd_dbc, fs, rng) if on("mmd") else np.zeros(n)
    # free-running VCO phase noise (injected at the VCO accumulator)  [A13]
    vco_noise = U.gen_vco_phase(n, params.vco_dbc_at_1mhz, fs, rng,
                                params.vco_flicker_corner) if on("vco") else np.zeros(n)
    # VCO noise enters as the increment between consecutive samples
    vco_step = np.diff(vco_noise, prepend=vco_noise[0])

    # ---- loop state ----
    phi_out = np.zeros(n)     # VCO excess phase  [rad]
    acc = 0.0                 # PI integral accumulator
    ctrl = 0.0
    Kp, Ki, Kv, N = loop.Kp, loop.Ki, loop.Kv, loop.N

    for k in range(1, n):
        # 1) VCO phase accumulation: previous control integrates into phase, plus VCO noise
        #    phi_out[k] = phi_out[k-1] + Kv*ctrl + vco_step[k]
        phi_out[k] = phi_out[k - 1] + Kv * ctrl + vco_step[k]
        # 2) feedback divider (/N), with MMD noise added at the divider output
        phi_fb = phi_out[k] / N + mmd_noise[k]
        # 3) reference path = reference noise + DTC noise (DTC cancels DSM QE -> not added)
        phi_ref = ref_noise[k] + dtc_noise[k]
        # 4) sampling phase detector: error = ref - feedback, + SPD/GM noise
        e = phi_ref - phi_fb + spd_noise[k]
        # 5) PI loop filter (type-II): proportional + integral
        acc += e
        ctrl = Kp * e + Ki * acc
    return {"phi_out": phi_out, "fs": fs}


# ============================================================================
#  Analysis: PSD, phase noise, jitter
# ============================================================================
def analyze(res, loop: DTLoop, params: PLLParams, f_lo=1e3, f_hi=None):
    fs = res["fs"]
    if f_hi is None:
        f_hi = fs / 2 * 0.95
    freq, Sxx = U.welch_psd(res["phi_out"], fs, nseg=8)
    # drop DC bin
    freq, Sxx = freq[1:], Sxx[1:]
    L = U.Sphi_to_L(Sxx)
    sigma_phi_psd = U.integrate_phase_noise(freq, Sxx, f_lo, f_hi)
    jit_psd = U.rms_jitter_from_sigma_phi(sigma_phi_psd, params.f_out) * 1e15
    # Parseval cross-check: integral of PSD over the FULL resolved band ~ var(time series)
    var_psd_full = U.integrate_phase_noise(freq, Sxx, freq[0], freq[-1]) ** 2
    var_time = float(np.var(res["phi_out"]))
    return {"freq": freq, "L": L, "Sxx": Sxx,
            "sigma_phi_psd": sigma_phi_psd, "jitter_psd_fs": jit_psd,
            "var_psd_full": var_psd_full,
            "var_time": var_time, "f_lo": f_lo, "f_hi": f_hi}


# ============================================================================
#  Figures
# ============================================================================
def make_figures():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    loop = DTLoop()
    params = PLLParams()
    summary = {"loop": {"Kp": loop.Kp, "Ki": loop.Ki,
                        "wz_khz": loop.wz / 2 / np.pi / 1e3}}

    # ---- full-system run ----
    res = simulate(loop, params, n=2**20, seed=1)
    an = analyze(res, loop, params)

    # frequency-domain prediction over the SAME band (1k..Nyquist)
    fcmp = U.logspace(an["f_lo"], an["f_hi"], 1500)
    cont = output_contributions(params, fcmp)
    sphi_fd = U.integrate_phase_noise(fcmp, cont["total"], an["f_lo"], an["f_hi"])
    jit_fd = U.rms_jitter_from_sigma_phi(sphi_fd, params.f_out) * 1e15

    # ---- Fig: time-domain PSD vs analytic discrete NTF vs continuous freq-domain ----
    Href_z, Hvco_z, _ = loop.ntf(fcmp)
    # analytic discrete prediction = sum of source PSD * |NTF|^2
    S_pred = (U.Sphi_to_L(
        U.L_to_Sphi(params.vco_dbc_at_1mhz) * (1e6 / fcmp) ** 2 * np.abs(Hvco_z) ** 2 +
        (U.L_to_Sphi(params.ref_floor_dbc) +
         U.L_to_Sphi(params.ref_flicker_dbc) * (params.ref_flicker_f / fcmp) +
         U.L_to_Sphi(params.dtc_qn_dbc) + U.L_to_Sphi(params.dtc_thermal_dbc) +
         U.L_to_Sphi(params.spd_gm_dbc) + U.L_to_Sphi(params.mmd_dbc)) * np.abs(Href_z) ** 2))
    fig, ax = plt.subplots(figsize=(8, 4.8))
    ax.semilogx(an["freq"], an["L"], color="0.6", lw=0.7, label="time-domain (Welch PSD)")
    ax.semilogx(fcmp, S_pred, color="tab:blue", lw=2, label="analytic discrete NTF")
    ax.semilogx(fcmp, U.Sphi_to_L(cont["total"]), color="tab:red", lw=1.6, ls="--",
                label="continuous freq-domain model")
    ax.set_xlabel("Offset frequency [Hz]"); ax.set_ylabel("L(f) [dBc/Hz]")
    ax.set_ylim(-170, -70); ax.set_xlim(an["f_lo"], an["f_hi"])
    ax.grid(True, which="both", alpha=0.3); ax.legend(fontsize=8)
    ax.set_title("Time-domain PSD vs analytic vs frequency-domain (cross-check)")
    U.savefig_both(fig, "td_phase_noise.png"); plt.close(fig)

    # ---- Fig: time-series of output excess phase & jitter ----
    t = np.arange(len(res["phi_out"])) / res["fs"] * 1e6
    fig, ax = plt.subplots(figsize=(8, 3.6))
    seg = slice(0, 20000)
    ax.plot(t[seg], res["phi_out"][seg] * 1e3, lw=0.6)
    ax.set_xlabel("time [µs]"); ax.set_ylabel("output excess phase [mrad]")
    ax.set_title("Time-domain output phase (locked, noise-driven)")
    ax.grid(alpha=0.3)
    U.savefig_both(fig, "td_timeseries.png"); plt.close(fig)

    # ---- Fig: per-source contributions (run each alone) ----
    fig, ax = plt.subplots(figsize=(8, 4.8))
    per = {}
    for src, col in [("vco", "tab:red"), ("ref", "tab:blue"), ("dtc", "tab:purple"),
                     ("mmd", "tab:brown"), ("spd", "tab:green")]:
        r = simulate(loop, params, n=2**19, seed=5, sources=(src,))
        a = analyze(r, loop, params)
        ax.semilogx(a["freq"], a["L"], color=col, lw=0.8, label=f"{src} ({a['jitter_psd_fs']:.1f} fs)")
        per[src] = a["jitter_psd_fs"]
    ax.set_xlabel("Offset frequency [Hz]"); ax.set_ylabel("L(f) [dBc/Hz]")
    ax.set_ylim(-180, -80); ax.grid(True, which="both", alpha=0.3); ax.legend(fontsize=8)
    ax.set_title("Per-source output phase noise (each source simulated alone)")
    U.savefig_both(fig, "td_per_source.png"); plt.close(fig)

    summary.update({
        "jitter_time_fs": an["jitter_psd_fs"],
        "jitter_freq_fs_same_band": jit_fd,
        "band": [an["f_lo"], an["f_hi"]],
        "per_source_fs": per,
        "parseval_var_time": an["var_time"],
        "parseval_var_psd": an["var_psd_full"],
    })
    return summary


def main():
    print("=" * 64)
    print("TIME-DOMAIN NOISE MODEL — discrete-time PLL + cross-check")
    print("=" * 64)
    s = make_figures()
    band = s["band"]
    print(f"loop: Kp={s['loop']['Kp']:.3f}  Ki={s['loop']['Ki']:.4f}  wz={s['loop']['wz_khz']:.0f} kHz")
    print(f"integration band: {band[0]:.0f} Hz .. {band[1]/1e6:.1f} MHz  (Nyquist-limited)")
    print("-" * 64)
    print(f"  time-domain  RMS jitter = {s['jitter_time_fs']:.1f} fs")
    print(f"  freq-domain  RMS jitter = {s['jitter_freq_fs_same_band']:.1f} fs  (same band)")
    diff = 20 * np.log10(s['jitter_time_fs'] / s['jitter_freq_fs_same_band'])
    print(f"  cross-check difference  = {diff:+.2f} dB")
    print(f"  Parseval: var(time)={s['parseval_var_time']:.3e}  var(PSD)={s['parseval_var_psd']:.3e}")
    print("-" * 64)
    print("per-source (fs):", {k: round(v, 1) for k, v in s["per_source_fs"].items()})
    U.dump_json(s, "time_domain.json")
    print("figures + time_domain.json written.")


if __name__ == "__main__":
    main()
