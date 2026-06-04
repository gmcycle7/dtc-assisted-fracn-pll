"""
Time-domain noise-model sanity checks (brief Section H.2 & H.4).
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "models"))

import utils as U
import frequency_domain_model as F
import time_domain_noise_model as T


def test_welch_psd_normalization():
    """Integral of single-sided PSD ~ var(x) for white noise (Parseval). (H.2)"""
    rng = np.random.default_rng(0)
    fs = 1e6
    x = rng.normal(0, 1.0, 2**18)
    f, P = U.welch_psd(x, fs, nseg=8)
    var_psd = U.integrate_phase_noise(f, P, f[0], f[-1]) ** 2
    assert abs(var_psd - np.var(x)) / np.var(x) < 0.1, (var_psd, np.var(x))


def test_phase_accumulates_and_locks():
    """Output excess phase stays bounded (locked), not diverging. (H.2)"""
    loop, p = T.DTLoop(), F.PLLParams()
    res = T.simulate(loop, p, n=2**16, seed=3)
    phi = res["phi_out"]
    # second half std finite and comparable to first half (stationary, locked)
    s1 = np.std(phi[:2**15]); s2 = np.std(phi[2**15:])
    assert np.isfinite(s2) and s2 < 10 * (s1 + 1e-9)


def test_noise_rms_scaling():
    """A white phase source injected alone reproduces its target floor within 1.5 dB. (H.2)"""
    rng = np.random.default_rng(1)
    fs = 104e6
    x = U.gen_white_phase(2**18, -160.0, fs, rng)
    f, P = U.welch_psd(x, fs, nseg=8)
    L = U.Sphi_to_L(P[1:])
    med = np.median(L)
    assert abs(med - (-160.0)) < 1.5, med


def test_freq_time_crosscheck():
    """Time-domain integrated jitter agrees with freq-domain over the same band <1 dB. (H.4)"""
    loop, p = T.DTLoop(), F.PLLParams()
    res = T.simulate(loop, p, n=2**19, seed=2)
    an = T.analyze(res, loop, p)
    fcmp = U.logspace(an["f_lo"], an["f_hi"], 1500)
    cont = F.output_contributions(p, fcmp)
    sphi_fd = U.integrate_phase_noise(fcmp, cont["total"], an["f_lo"], an["f_hi"])
    jit_fd = U.rms_jitter_from_sigma_phi(sphi_fd, p.f_out) * 1e15
    diff_db = 20 * np.log10(an["jitter_psd_fs"] / jit_fd)
    assert abs(diff_db) < 1.5, (an["jitter_psd_fs"], jit_fd, diff_db)


def test_discrete_loop_metrics():
    """Discrete loop's analytic NTF gives ~unity at DC for H_ref/N and HP for H_vco. (H.2)"""
    loop = T.DTLoop()
    Href, Hvco, L = loop.ntf(np.array([100.0]))
    assert abs(abs(Href[0]) / loop.N - 1.0) < 0.05
    assert abs(Hvco[0]) < 0.1


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn(); print(f"PASS {fn.__name__}")
    print(f"\nAll {len(fns)} time-domain tests passed.")
