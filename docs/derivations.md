# Derivations

Every block is tagged with one of:
**[Slide pX]** verbatim from the deck · **[Derived]** derived in this work from slide content ·
**[Std]** standard PLL/CDR/DSP theory (textbook/app-note named) · **[Needs citation]** standard but I could not pin an exact source.

Notation: `s = jω`, `ω = 2πf`. Phases in **rad**, time in **s**, frequency in **Hz**. `T_ref = 1/f_ref`, `T_vco = 1/f_vco`. The PLL divide ratio is `N` (≈ f_vco/f_ref, fractional). Reference (sampling) update rate = `f_ref`.

---

## 1. Linear PLL frequency-domain model  [Slide p.5] + [Std]

The phase-domain block diagram on slide 5 is the canonical linear model. Define:

- `K_PD` — phase-detector gain. **Units depend on PD type.** For the sampling PD (SPD): `K_SPD = K_slope/(2π f_ref)` **[V/rad, Slide p.20]**. For a generic charge-pump model we keep a lumped `K_PD` in A/rad and a transimpedance loop filter.
- `H_LF(s)` — loop-filter transfer function.
- `K_VCO` — VCO gain in **rad/s/V** (so the VCO is `K_VCO/s` from control voltage to **phase**). Note: data sheets quote `K_VCO` in Hz/V; then the phase gain is `2π·K_VCO[Hz/V]/s`.
- `1/N` — feedback divider.

**Forward gain** (control voltage → output phase): `K_PD · H_LF(s) · K_VCO/s`.

**Open-loop gain** [Derived]:
```
G_ol(s) = K_PD · H_LF(s) · (K_VCO/s) · (1/N)
```

**Closed-loop reference→output transfer** (low-pass) [Std, Razavi/Gardner]:
```
H_ref(s) = Φout/Φref = N · G_ol(s) / (1 + G_ol(s))        ... ×N because the input is compared after ÷N
        = K_PD H_LF(s) K_VCO/s / (1 + G_ol(s))    (with the N already in G_ol)
```
At DC, `H_ref(0) = N` (the output phase tracks the reference, scaled by N). This is the **low-frequency closed-loop behavior sanity check** (Section H of the brief).

**VCO→output transfer** (high-pass) [Std]:
```
H_vco(s) = Φout/Φvco = 1 / (1 + G_ol(s))
```
At high frequency `G_ol→0` ⇒ `H_vco→1` (VCO noise passes); at low frequency `H_vco→0` (loop suppresses VCO noise). This is the **high-frequency VCO-noise-suppression sanity check**.

### Type-II second-order loop filter [Std]
For a charge-pump type-II PLL with series `R_z, C_z` and parallel `C_p`:
```
Z_LF(s) = (1 + s R_z C_z) / ( s C_z (1 + s R_z C_z C_p/(C_z+C_p)) )   ≈ (1 + s R_z C_z)/(s(C_z+C_p)(1 + s R_z C_z C_p/(C_z+C_p)))
```
Open loop `G_ol(s) = (I_cp K_VCO)/(2π N) · Z_LF(s)/s`. The zero `ω_z = 1/(R_z C_z)` sets phase margin; the pole `ω_p = (C_z+C_p)/(R_z C_z C_p)` cleans HF ripple.

**Loop bandwidth / phase margin** [Std, Gardner "Phaselock Techniques"]:
- Unity-gain frequency `ω_c`: `|G_ol(jω_c)| = 1`.
- Phase margin `PM = 180° + ∠G_ol(jω_c)`. Maximized when `ω_c = √(ω_z ω_p)`.

### Type-I sampling PLL note  [Slide p.20] + [Derived]
The proposed analog PLL is a **sampling (Type-I-ish) PLL**: the SPD output `Vsmp` is a **ZOH → 1st-order IIR** with pole near `f_ref·(loop gain)`. In s-domain we approximate the sampled path by its continuous-time equivalent `K_SPD · 1/(1+s/ω_iir)` for `f ≪ f_ref/2`. (A fully rigorous treatment uses the z-domain; we provide both — see `frequency_domain_model.py`.)

---

## 2. Noise transfer functions (NTFs) to output phase  [Derived from Slide p.5] + [Std]

Each source enters at a different node; its shaping is its NTF. With `G = G_ol(s)`:

| Source | enters at | NTF to Φout | LF (f→0) | HF (f→∞) | character |
|---|---|---|---|---|---|
| Reference phase `Φref` | input | `N·G/(1+G)` → `N` (×Φref) | `→ N` | `→ 0` | low-pass, ×N |
| PD/SPD input-referred `Φpd` | input (after÷N) | `N·G/(1+G)` (same path as ref, referred to PD input it is `1/(K_PD)·...`); to output: low-pass ×N | `→ N` | `→ 0` | low-pass |
| Divider phase `Φdiv` | feedback | `−N·G/(1+G)` | `→ −N` | `→ 0` | low-pass |
| DSM quant. `Q_DSM` (÷ratio) | feedback (×2π) | `N·G/(1+G)` but **shaped by `(1−z⁻¹)^m`** (m=DSM order) before the loop | low-pass×HPF | rolls off | band-pass-ish |
| **DTC QN / thermal** | reference path | same as `Φref`: `N·G/(1+G)` | `→ N` | `→ 0` | low-pass (inband) |
| Loop-filter noise `V_lf` | after PD | `(K_VCO/s)/(1+G)` | high-pass-ish | → 0 fast | band-pass |
| VCO phase `Φvco` | output | `1/(1+G)` | `→ 0` | `→ 1` | high-pass |
| Calibration residual `Φcal` | reference path (DTC code) | `N·G/(1+G)` | `→ N` | `→ 0` | low-pass |

**DSM quantization noise** [Std, Riley JSSC'93]: a MASH-m modulator produces quantization noise with PSD (single-sided, at the divider input, in cycles²/Hz)
```
S_Qdsm(f) = (1/12) · (1/f_ref) · [2 sin(π f/f_ref)]^{2m}
```
Referred to output phase it is multiplied by `(2π)²` (cycles→rad) and by `|H_ref(f)/N|²·N²`... → it is **low-pass filtered by the loop but high-pass shaped by the DSM**, giving the classic "hump". **The DTC cancels the in-band part** of this (slide 9), pushing the residual to ≈0 (slide 42: ΣΔM QE ≈ 0 %).

---

## 3. DTC quantization noise  [Slide p.15] + [Derived]

**Verbatim [Slide p.15]:**
```
T_res = ln2 · R · C_LSB
Φ_DTC,QN = (2π·T_res)² / 12 · f_ref          [single-sided phase-noise PSD, rad²/Hz ≈ dBc/Hz]
```
**Numeric check [Derived]:** `T_res=400 fs`, `f_ref=104 MHz`:
```
(2π·400e-15)² /12 · 104e6
= (2.513e-12)² /12 · 1.04e8
= 6.317e-24 /12 · 1.04e8
= 5.264e-25 · 1.04e8
= 5.47e-17  → 10·log10(5.47e-17) = −162.6 dBc/Hz ✓ (slide says −163)
```

**Standard derivation & the 3-dB convention note [Std, Bennett quantization + Std jitter theory]:**
A uniform time quantizer with step `T_res` has timing-error variance `σ_t² = T_res²/12`. The DTC quantizes once per reference cycle, so the error sequence is white sampled at `f_ref`. Convert timing to **reference phase**: `φ = 2π·f_ref·Δt` ⇒ `σ_φ² = (2π f_ref T_res)²/12`. Spreading this variance over the Nyquist band gives a flat PSD. **Whether you divide by `f_ref` (double-sided over [−f_ref/2, f_ref/2]) or `f_ref/2` (single-sided) is a factor-2 (3 dB) choice.** The slide's `(2π T_res)²/12 · f_ref` equals `σ_φ²/f_ref` (i.e. variance ÷ full Nyquist span `f_ref`), which is the convention that reproduces −163 dBc/Hz. We adopt the **slide's convention** in code and flag the ±3 dB single/double-sided ambiguity. → marked **[Needs citation]** for the exact convention.

---

## 4. DTC thermal noise  [Slide p.16] verbatim
```
ℒ ≅ 10·log10[ (1/2)·(2π f_ref / k_slew)² · S_v^folded(f_m) ],   k_slew = 1/(2RC) at VDD/2,
S_v^folded(f_m) ≅ (kT/C)/(f_out/2)
⇒ ℒ ≅ 10·log10[ 2kT · f_ref · (2π/ln2)² · 2ⁿ T_res² / C_LSB ]   (mid-code)
```
Physical reading: slew-rate `k_slew` converts the sampled voltage noise `kT/C` into a **timing jitter** `σ_t = σ_v/k_slew`; the `(2π f_ref)²` converts timing to reference phase. Larger `C_LSB` ⇒ less `kT/C` ⇒ lower noise (but more area/power). `ℒ ∝ DR` because `2ⁿ T_res²/C_LSB ∝ DR·R` (slide 33).

## 5. DTC range / power tradeoff recap  [Slide p.33] verbatim
```
DR = 2ⁿ · t_res = 2ⁿ · ln2 · R · C_LSB
DTC QN ∝ t_res²
ℒ ≅ 10·log10[ 2kT · f_ref · (2π)²/ln2 · DR · R ]
DTC power ∝ DR²
```
⇒ **DR↓ ⇒ fewer bits, faster slope, lower noise & power, more linear.** This is *why* the proposed ½-range (p.34) and 1/8-range (p.38) techniques exist.

## 6. Sampling-PD gain  [Slide p.20] verbatim + numeric [Derived]
```
K_SPD = K_slope / (2π f_ref)
```
`K_slope=6 GV/s, f_ref=104 MHz` ⇒ `K_slope/f_ref = 57.7` ⇒ **K_SPD = 57.7/(2π) = 9.19 V/rad** (slide rounds "57/2π"). Units: a phase error of `φ` rad at the reference ⇒ a time error `φ/(2π f_ref)` s ⇒ a sampled voltage `K_slope·φ/(2π f_ref) = K_SPD·φ`. The large `K_SPD` is why GM/comparator noise is suppressed.

---

## 7. LMS / sign-sign-LMS calibration  [Slide p.26,36,40] + [Std, Widrow & Stearns *Adaptive Signal Processing*]

**Generic LMS** (slide 26 integrator `µ·z⁻¹/(1−z⁻¹)`):
```
w[k+1] = w[k] + µ · e[k] · x[k]              (LMS)
```
**Sign-sign LMS** (1-bit error & 1-bit reference, used because `e[k]=sign(PHE)` and the regressors are ±1):
```
w[k+1] = w[k] + µ · sign(e[k]) · sign(x[k])
```

### 7.1 DTC gain calibration [Slide p.26-28,40] + [Derived convergence]
Plant: residual phase error `PHE[k] = (1/K_DTC_true − 1/K_DTC[k])·Φe[k]·(...)`. Modeled as
```
e[k] = sign( PHE[k] ),  PHE[k] ∝ (g − ĝ[k])·Φe[k] + offset + noise
K_DTC[k+1] = K_DTC[k] + µ2 · e[k] · Φe[k−n]
```
**Convergence [Derived]:** taking expectations, `E{e·Φe} ∝ (g−ĝ)·E{Φe²}` (if `e` zero-mean), so `ĝ` follows a 1st-order recursion with time constant `τ ≈ 1/(µ2·E{Φe²}·2 f_ref·η)` (η = sign-LMS slope factor `√(2/π)/σ` for Gaussian, [Std]). Converges iff `0 < µ2 < 2/(E{Φe²})` (LMS stability bound). **Offset bias [Slide p.27]:** if `e[k]` has nonzero mean `m`, the update acquires a bias term `µ2·m·E{Φe}` → the ΔV-DAC offset cal (p.28) removes `m`.

### 7.2 VCO duty-cycle calibration [Slide p.35-36,40] + [Derived]
```
Δt_err = Δt − T_vco/2
e[k] correlated with SEL_CKFB[k] (±1):
vco_dcc[k+1] = vco_dcc[k] + µ1 · SEL_CKFB[k] · (e[k] − e[k−1])     (the (1−z⁻¹) on e[k])
DTC_code += vco_dcc · SEL_CKFB     (push/pull ±Δt_err/2)
```
Correlating with `SEL_CKFB` isolates the *alternating* duty-error component from random noise (which is uncorrelated with the deterministic ±1 sequence). Converges to `vco_dcc → Δt_err/2`.

### 7.3 CKREF duty-cycle calibration [Slide p.40] + [Derived]
Same structure, regressor = `even_cycle (±1)` (alternates every reference cycle):
```
ckref_dcc[k+1] = ckref_dcc[k] + µ3 · even_cycle[k] · (e[k]−e[k−1])
FCW' = FCW + ckref_dcc · even_cycle      (corrects alternating-cycle period error)
```

### 7.4 Comparator/GM offset (zero-mean PHE) calibration [Slide p.28,40] + [Derived]
```
Vref_adj[k+1] = Vref_adj[k] + µ_os · e[k]        (drive mean of e[k] to 0)
```
A ΔΣ-dithered 1-bit DAC realizes fine `Vref_adj` steps. This is a **DC-servo / sign-LMS on the mean**.

### 7.5 Polynomial NLC (survey) [Slide p.31] verbatim
```
D_DCW = g1·D_AQ + g2·D_AQ² + g3·D_AQ³,   D_AQ = accumulated DSM phase
```
Three parallel LMS loops adapt `g1=K_DTC, g2, g3` (each correlates `e[k]` with `D_AQ, D_AQ², D_AQ³`). We model the concept in `calibration_models.py`.

---

## 8. Phase-noise ↔ jitter conversions  [Std] + [Needs citation for exact constant]
```
S_φ(f)      : single-sided phase PSD             [rad²/Hz]
ℒ(f) = 10·log10( ½ · S_φ(f) )                    [dBc/Hz]   (small-angle, SSB)             [Std]
σ_φ²  = ∫ S_φ(f) df  (over integration band)     [rad²]   = total integrated phase variance [Std]
σ_t   = σ_φ / (2π f_out)                          [s]   (RMS jitter)                       [Std]
IPN_deck(dBc) = 10·log10( ½ · σ_φ² )   ← the convention the DECK uses (reproduces slide 42)  [matched]
IPN_total(dBc) = 10·log10( σ_φ² )       ← total-variance convention, 3 dB higher              [Std]
```
The deck's "IPN" applies the same `½` (one-sideband) factor as `ℒ(f)`. To stay self-consistent,
`utils.ipn_dbc(sigma_phi, ssb=True)` returns `10log10(½ σ_φ²)` = the deck value, and `ssb=False`
returns the 3-dB-higher total. The exact factor is **[Needs citation]** (IEEE-1139 / Leeson).

**Worked example [Derived, anchored to slide 42]:** `f_out = 6.72 GHz`, `σ_t = 87.5 fs` ⇒
`σ_φ = 2π·6.72e9·87.5e-15 = 3.69e-3 rad` ⇒ `σ_φ² = 1.365e-5 rad²`.
- `IPN_total = 10log10(1.365e-5) = −48.65 dBc`
- `IPN_deck  = 10log10(½·1.365e-5) = −51.66 dBc` ✓ **matches slide 42's −51.7 dBc.**
This closes the loop between slide 42's "87.5 fs / −51.7 dBc" and our conversion formulas. Our
frequency-domain model outputs **87.6 fs / −51.6 dBc** (same convention).

---

## 9. FFT/PSD normalization for the time-domain model  [Std, Welch 1967]
For a length-`M` phase-error sequence `φ[k]` sampled at `f_s`:
```
Welch PSD (single-sided): S_φ(f) = (2/(f_s·M·U)) · |FFT(w·φ)|²,   U = mean(w²) (window power)
∫ S_φ(f) df  ≈  var(φ)   (Parseval check)
```
We verify `∫S_φ df ≈ var(φ)` to ≤0.5 dB as the **PSD-normalization sanity check**, and that `σ_t(from PSD integral) ≈ σ_t(from time-domain std)` as the **frequency↔time cross-check**.
