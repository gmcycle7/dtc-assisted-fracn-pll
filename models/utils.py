"""
utils.py — Shared constants, phase-noise/jitter conversions, PSD tools, and I/O helpers
for the DTC-assisted fractional-N PLL teaching models.

Cross-references (see docs/derivations.md):
  - Phase-noise <-> jitter conversions ....... derivations.md  Section 8   [Std]
  - Welch PSD normalization ................... derivations.md  Section 9   [Std-Welch]
  - DSM quantization-noise PSD ................ derivations.md  Section 2   [Std-Riley]

All physical quantities are SI: phase in rad, time in s, frequency in Hz.
This module has NO dependency on matplotlib so it can be imported headlessly.
"""
from __future__ import annotations
import json
import os
import numpy as np

# ----------------------------------------------------------------------------
# Physical constants
# ----------------------------------------------------------------------------
# numpy>=2.0 renamed trapz -> trapezoid; support both
_trapz = getattr(np, "trapezoid", getattr(np, "trapz", None))

KB = 1.380649e-23          # Boltzmann constant [J/K]
T_KELVIN = 300.0           # room temperature [K]
KT = KB * T_KELVIN         # kT [J]

# ----------------------------------------------------------------------------
# Project paths (so scripts can be run from anywhere)
# ----------------------------------------------------------------------------
PKG_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(PKG_DIR)
RESULTS_FIG = os.path.join(ROOT_DIR, "results", "figures")
RESULTS_TAB = os.path.join(ROOT_DIR, "results", "tables")
SITE_FIG = os.path.join(ROOT_DIR, "site", "assets", "figures")
SITE_DATA = os.path.join(ROOT_DIR, "site", "assets", "data")
for _d in (RESULTS_FIG, RESULTS_TAB, SITE_FIG, SITE_DATA):
    os.makedirs(_d, exist_ok=True)


def savefig_both(fig, name):
    """Save a matplotlib figure to BOTH results/figures and site/assets/figures (PNG)."""
    for d in (RESULTS_FIG, SITE_FIG):
        fig.savefig(os.path.join(d, name), dpi=130, bbox_inches="tight")
    return os.path.join(SITE_FIG, name)


def dump_json(obj, name):
    """Write a JSON data file the website can fetch (results/tables + site/assets/data)."""
    for d in (RESULTS_TAB, SITE_DATA):
        with open(os.path.join(d, name), "w") as f:
            json.dump(obj, f, indent=2, default=_json_default)
    return os.path.join(SITE_DATA, name)


def _json_default(o):
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(f"not serializable: {type(o)}")


# ----------------------------------------------------------------------------
# Phase-noise <-> jitter conversions   [Std, derivations.md Sec.8]
# ----------------------------------------------------------------------------
def Sphi_to_L(Sphi):
    """Single-sided phase PSD S_phi [rad^2/Hz]  ->  L(f) [dBc/Hz].
    L(f) = 10*log10( 0.5 * S_phi )   (SSB-from-DSB, Leeson/IEEE-1139 convention).  [A19]
    """
    Sphi = np.asarray(Sphi, dtype=float)
    return 10.0 * np.log10(0.5 * np.clip(Sphi, 1e-300, None))


def L_to_Sphi(L_dbc):
    """L(f) [dBc/Hz] -> single-sided phase PSD S_phi [rad^2/Hz]."""
    return 2.0 * 10.0 ** (np.asarray(L_dbc, dtype=float) / 10.0)


def integrate_phase_noise(freq, Sphi, f_lo=None, f_hi=None):
    """Integrate S_phi over [f_lo, f_hi] -> RMS phase (rad).
    sigma_phi^2 = integral S_phi(f) df   [Std]. Uses trapezoid on a (usually log) grid.
    """
    freq = np.asarray(freq, dtype=float)
    Sphi = np.asarray(Sphi, dtype=float)
    m = np.ones_like(freq, dtype=bool)
    if f_lo is not None:
        m &= freq >= f_lo
    if f_hi is not None:
        m &= freq <= f_hi
    var = _trapz(Sphi[m], freq[m])
    return float(np.sqrt(var))


def rms_jitter_from_sigma_phi(sigma_phi, f_out):
    """sigma_t = sigma_phi / (2*pi*f_out)   [s]   [Std]."""
    return sigma_phi / (2.0 * np.pi * f_out)


def integrated_jitter(freq, Sphi, f_out, f_lo=1e3, f_hi=100e6):
    """One-shot: PSD -> RMS phase -> RMS jitter (s). Default band 1 kHz..100 MHz [A16]."""
    sphi = integrate_phase_noise(freq, Sphi, f_lo, f_hi)
    return rms_jitter_from_sigma_phi(sphi, f_out), sphi


def ipn_dbc(sigma_phi, ssb=True):
    """Integrated phase noise in dBc from RMS phase sigma_phi (rad).   [Std]
    Two common conventions (differ by 3 dB):
      ssb=True  : IPN = 10*log10(0.5 * sigma_phi^2)  <- matches deck slide 42
                  (87.5 fs @6.72 GHz -> -51.7 dBc, verified).
      ssb=False : IPN = 10*log10(sigma_phi^2)        (double-sideband total variance).
    See docs/derivations.md Sec.8 and the [Needs citation] note in references.md.
    """
    base = 10.0 * np.log10(sigma_phi ** 2)
    return base + (10.0 * np.log10(0.5) if ssb else 0.0)


# ----------------------------------------------------------------------------
# Welch PSD for the time-domain model   [Std-Welch, derivations.md Sec.9]
# ----------------------------------------------------------------------------
def welch_psd(x, fs, nseg=8, window="hann"):
    """Single-sided PSD of x sampled at fs, averaged over nseg overlapping (50%) segments.
    Returns (freq[Hz], Sxx[unit^2/Hz]).  Normalization satisfies  integral Sxx df ~ var(x).
    """
    x = np.asarray(x, dtype=float)
    x = x - x.mean()
    N = len(x)
    nperseg = N // nseg
    if nperseg < 16:
        nperseg = N
    step = nperseg // 2 if nperseg < N else nperseg  # 50% overlap
    if window == "hann":
        w = np.hanning(nperseg)
    else:
        w = np.ones(nperseg)
    U = np.mean(w ** 2)                     # window power normalization
    segs = []
    start = 0
    while start + nperseg <= N:
        seg = x[start:start + nperseg] * w
        X = np.fft.rfft(seg)
        P = (np.abs(X) ** 2) / (fs * nperseg * U)
        P[1:-1] *= 2.0                      # single-sided (double interior bins)
        segs.append(P)
        start += step
    if not segs:                            # fallback: single segment
        seg = x * (np.hanning(N))
        U = np.mean(np.hanning(N) ** 2)
        X = np.fft.rfft(seg)
        P = (np.abs(X) ** 2) / (fs * N * U)
        P[1:-1] *= 2.0
        segs = [P]
    Pxx = np.mean(segs, axis=0)
    freq = np.fft.rfftfreq(nperseg, d=1.0 / fs)
    return freq, Pxx


# ----------------------------------------------------------------------------
# Noise-shape generators (time-domain)   [Std]
# ----------------------------------------------------------------------------
def gen_white_phase(n, level_dbc, fs, rng):
    """White phase noise samples with single-sided PSD = level_dbc [dBc/Hz].
    var = S_phi * (fs/2)  (white over the simulated Nyquist band).  [Derived from Sec.9]
    """
    sphi = L_to_Sphi(level_dbc)
    var = sphi * (fs / 2.0)
    return rng.normal(0.0, np.sqrt(var), n)


def gen_flicker_phase(n, level_dbc_at, f_at, fs, rng, slope_db_per_dec=-30.0):
    """Approximate 1/f^a phase noise by filtering white noise.
    Anchored so that S_phi(f_at) = L_to_Sphi(level_dbc_at). slope -30 dB/dec ~ flicker phase.
    Implementation: shape white spectrum in frequency domain by 1/f^(a/2). [Derived]
    """
    a = -slope_db_per_dec / 10.0           # power-law exponent on PSD
    w = rng.normal(0.0, 1.0, n)
    W = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, d=1.0 / fs)
    f[0] = f[1] if len(f) > 1 else 1.0
    shape = f ** (-a / 2.0)
    shape[0] = shape[1]
    Wsh = W * shape
    y = np.fft.irfft(Wsh, n=n)
    # normalize so S_phi(f_at) matches target
    fr, P = welch_psd(y, fs, nseg=4)
    idx = np.argmin(np.abs(fr - f_at))
    target = L_to_Sphi(level_dbc_at)
    cur = max(P[idx], 1e-300)
    y *= np.sqrt(target / cur)
    return y


def gen_vco_phase(n, level_dbc_at_1mhz, fs, rng, flicker_corner=150e3):
    """Free-running VCO phase noise sequence: white-FM (-20 dB/dec) + 1/f^3 flicker.
    White-FM is a random walk of phase (cumsum of white frequency steps); the result is
    normalized so S_phi(1 MHz) = L_to_Sphi(level_dbc_at_1mhz).  [Derived from Sec.9]
    """
    # white FM -> random-walk phase (1/f^2)
    df = rng.normal(0.0, 1.0, n)
    phi_wfm = np.cumsum(df)
    # flicker FM -> stronger low-freq (filter white by 1/f^0.5 then integrate)
    fl = gen_flicker_phase(n, level_dbc_at_1mhz - 10, 1e6, fs, rng, slope_db_per_dec=-30.0)
    phi = phi_wfm
    # normalize white-FM part to target @1 MHz
    fr, P = welch_psd(phi, fs, nseg=4)
    idx = np.argmin(np.abs(fr - 1e6))
    target = L_to_Sphi(level_dbc_at_1mhz)
    phi = phi * np.sqrt(target / max(P[idx], 1e-300))
    # add a flicker bump below the corner
    fr, Pf = welch_psd(fl, fs, nseg=4)
    idxc = np.argmin(np.abs(fr - flicker_corner))
    tgt_c = L_to_Sphi(level_dbc_at_1mhz) * (1e6 / flicker_corner) ** 2  # white-FM level at corner
    fl = fl * np.sqrt(tgt_c / max(Pf[idxc], 1e-300))
    return phi + fl


def dsm_quant_psd(freq, f_ref, order=2):
    """MASH-order DSM quantization-noise PSD at the divider input [cycles^2/Hz].
    S = (1/12)*(1/f_ref)*[2*sin(pi*f/f_ref)]^(2*order)   [Std-Riley, derivations.md Sec.2]
    """
    freq = np.asarray(freq, dtype=float)
    return (1.0 / 12.0) * (1.0 / f_ref) * (2.0 * np.sin(np.pi * freq / f_ref)) ** (2 * order)


# ----------------------------------------------------------------------------
# Small numeric helpers
# ----------------------------------------------------------------------------
def db10(x):
    return 10.0 * np.log10(np.clip(np.asarray(x, dtype=float), 1e-300, None))


def db20(x):
    return 20.0 * np.log10(np.clip(np.abs(np.asarray(x)), 1e-300, None))


def logspace(f_lo, f_hi, n=600):
    return np.logspace(np.log10(f_lo), np.log10(f_hi), n)
