"""
Frequency-domain sanity checks (brief Section H.1).
Run:  python -m pytest tests/ -q     (or)     python tests/test_frequency_domain.py
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "models"))

import utils as U
import frequency_domain_model as F


def test_loop_bandwidth_and_phase_margin():
    """f_c and PM measured from |G_ol| match the design targets (H.1)."""
    p = F.PLLParams()
    m = F.loop_metrics(p)
    assert abs(m["f_c_Hz"] - p.f_c) / p.f_c < 0.05, m
    assert abs(m["phase_margin_deg"] - p.pm_deg) < 3.0, m


def test_closed_loop_dc_gain_is_N():
    """H_ref(0) -> N (reference tracked, scaled by N). Low-freq sanity (H.1)."""
    p = F.PLLParams()
    h = F.H_ref(p, np.array([10.0]))[0]   # 10 Hz ~ DC
    assert abs(abs(h) - p.N) / p.N < 0.02, abs(h)


def test_vco_ntf_highpass():
    """H_vco -> 0 at low freq (suppressed) and -> 1 at high freq (passes). (H.1)"""
    p = F.PLLParams()
    lo = abs(F.H_vco(p, np.array([100.0]))[0])
    hi = abs(F.H_vco(p, np.array([1e9]))[0])
    assert lo < 0.05, lo
    assert hi > 0.9, hi


def test_ref_ntf_lowpass():
    """H_ref/N -> 1 at low freq, -> 0 at high freq (low-pass). (H.1)"""
    p = F.PLLParams()
    lo = abs(F.H_ref(p, np.array([100.0]))[0]) / p.N
    hi = abs(F.H_ref(p, np.array([1e9]))[0]) / p.N
    assert lo > 0.95 and hi < 0.05, (lo, hi)


def test_jitter_budget_matches_slide42():
    """Total ~87.5 fs and VCO/REF dominate (slide 42). (H.1)"""
    p = F.PLLParams()
    rows, total = F.jitter_budget(p)
    assert 75.0 < total["jitter_fs"] < 100.0, total
    assert -53.0 < total["ipn_dbc_ssb"] < -50.0, total
    d = {r["source"]: r["percent"] for r in rows}
    assert d["VCO"] > 40.0, d                 # VCO dominant (~51%)
    ref_bucket = d["REF"] + d["DTC"]
    assert 30.0 < ref_bucket < 45.0, d        # REF+DTC ~39%
    assert d["DSM-QN (cancelled)"] < 1.0, d   # cancelled ~0%


def test_dsm_psd_highpass_shape():
    """DSM quant-noise PSD rises with frequency (high-pass shaped). (H.1)"""
    f = np.array([1e3, 1e6])
    s = U.dsm_quant_psd(f, 104e6, order=2)
    assert s[1] > s[0]


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn(); print(f"PASS {fn.__name__}")
    print(f"\nAll {len(fns)} frequency-domain tests passed.")
