"""
Calibration sanity checks (brief Section H.3).
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "models"))

import calibration_models as C


def test_dtc_gain_converges_no_noise():
    """No noise/offset -> K_DTC converges to K_true (<1% residual). (H.3)"""
    r = C.simulate_dtc_gain_cal(seed=0)
    assert abs(r["final_err_pct"]) < 1.0, r["final_err_pct"]
    assert r["settle_us"] < 30.0, r["settle_us"]      # slide 37/40: < 30 us


def test_dtc_gain_offset_causes_bias():
    """An UNCALIBRATED offset biases the sign-LMS result (slide 27). (H.3)"""
    r0 = C.simulate_dtc_gain_cal(offset=0.0, seed=0)
    r1 = C.simulate_dtc_gain_cal(offset=80.0, seed=0)
    assert abs(r1["final_err_pct"]) > 5.0          # biased
    assert abs(r0["final_err_pct"]) < 1.0          # unbiased baseline


def test_large_stepsize_more_ripple():
    """Larger step -> larger steady-state limit-cycle ripple. (H.3)"""
    small = C.simulate_dtc_gain_cal(mu=0.2, seed=7)
    large = C.simulate_dtc_gain_cal(mu=6.0, seed=7)
    rip_s = np.std(small["Khat"][-2000:])
    rip_l = np.std(large["Khat"][-2000:])
    assert rip_l > rip_s


def test_vco_dcc_converges_to_target():
    """vco_dcc -> Δt_err/2 (10 ps for a 20 ps duty error). (H.3)"""
    r = C.simulate_vco_dcc()
    assert abs(r["vco_dcc_ps"][-1] - r["target_ps"]) < 1.0, r["vco_dcc_ps"][-1]
    assert r["settle_us"] < 30.0


def test_ckref_dcc_converges():
    r = C.simulate_ckref_dcc()
    assert abs(r["ckref_dcc_ns"][-1] - r["target_ns"]) / r["target_ns"] < 0.1
    assert r["settle_us"] < 30.0


def test_offset_cal_converges():
    """Vref_adj -> offset (within the coarse 1-bit DAC residual). (H.3)"""
    r = C.simulate_offset_cal()
    assert abs(r["vref_adj_mv"][-1] - r["target_mv"]) / r["target_mv"] < 0.1
    assert r["settle_us"] < 30.0


def test_nlc_reduces_inl():
    """Polynomial NLC reduces peak INL substantially (slide 31). (H.3)"""
    r = C.simulate_polynomial_nlc()
    assert r["inl_pk_after"] < 0.2 * r["inl_pk_before"], (r["inl_pk_before"], r["inl_pk_after"])


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn(); print(f"PASS {fn.__name__}")
    print(f"\nAll {len(fns)} calibration tests passed.")
