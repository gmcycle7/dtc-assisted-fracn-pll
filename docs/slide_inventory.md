# Slide Inventory — *Design of DTC-Assisted High Performance Fractional-N PLLs*

**Source deck:** `Design of DTC-Assisted High Performance Fractional-N PLLs 20241110.pdf`
**Author:** Wanghua Wu, Samsung Semiconductor, 2024/11/10 (tutorial / review talk)
**Scope of this study:** slide 1 → slide 42 (the architecture / DTC / calibration / noise material). Slides 43–57 (5G-NR LO chain example, VCO design, references) are **out of scope** by request and are not modeled here.

## Page-number convention

> **PDF page N = Slide page N.** Verified by reading the printed page number in the bottom-right corner of each rendered page (e.g. PDF p.3 prints "3", PDF p.42 prints "42"). There is **no offset**. Throughout the project I still write both as **"PDF p.X / slide p.X"** as requested.

## What is "proposed" in this deck?

This is a **tutorial**, so it mixes (a) general PLL background, (b) a literature survey of DTC techniques from many groups, and (c) **the author's own line of work** — *W. Wu, JSSC 2019* / *W. Wu, ISSCC 2021* / *W. Wu, RFIC 2023*. The "**proposed architecture / method / calibration / model**" that this project implements is the **author's DTC-assisted analog sampling fractional-N PLL with a stack of background digital calibrations**, which is the through-line of the talk and is fully assembled on **PDF p.39–40 / slide p.39–40**. Survey-only techniques (POC-DTC p.29–30, ICS-DTC p.22, pseudo-diff DTC p.23, polynomial NLC p.31, reverse-concavity DTC p.32, 8-phase RO reduction p.38) are documented in the inventory and described conceptually, but the *models / code* focus on the proposed Wu architecture and its 4 calibrations.

The **4 proposed calibrations** (all background, all sign-sign-LMS style) are:
1. **DTC gain calibration** (`K_DTC`) — p.26–28, p.39–40
2. **CKREF (reference clock) duty-cycle calibration** (`ckref_dcc`) — p.39–40
3. **VCO duty-cycle calibration** (`vco_dcc`) — p.35–37, p.39–40
4. **Comparator/GM offset (PHE zero-mean) calibration** via ΔV-DAC on `Vref_adj` — p.27–28, p.39–40

Plus two structural "**range-reduction**" techniques that make the DTC linear enough: **½-range using two VCO phases** (p.34, proposed) and **1/8-range using 8 RO phases** (p.38, survey [C. Hwang ISSCC 2022]).

---

## Master analysis table (slide 1 → 42)

Legend for the "Type" column: **BG** = background/intro, **ARCH** = architecture, **DTC** = DTC circuit/noise, **CAL** = calibration, **RESULT** = sim/measured result.

| PDF/slide | Type | Main topic | Block / system | Equations on page | Calibration | Model / transfer fn | Sim/Meas target | Useful parameters | Assumptions we add |
|---|---|---|---|---|---|---|---|---|---|
| 1 | BG | Title | — | — | — | — | — | — | — |
| 2 | BG | Outline | — | — | — | — | — | — | — |
| 3 | BG | Demand for low-jitter frac-N | LO spec table | — | — | — | RMS jitter target <100 fs | DSB-IPN vs QAM: 64-QAM −30 dBc, 256-QAM −33, 1k-QAM −44, 4k-QAM −47 dBc; jitter @29.5/40/43/47/7.125 GHz; integ. 1 kHz→100 MHz | none |
| 4 | BG | SoTA low-jitter frac-N PLLs | FoM_jitter survey | FoM = jitter/power benchmark (ref [1]) | — | — | <100 fs, FoM vs int-N | DTC-assisted PD → lower jitter, better FoM | FoM eq. only named, not shown → see derivations |
| 5 | ARCH | Major noise sources in any PLL | PFD/CP, LF, VCO, ÷N, MMDIV+DSM | **linear PLL phase-domain model** Φout = f(Φref,ΦVCO,ΦPD…); K_PD·H_LF(s)·K_VCO/s, 1/N | — | **Linear s-domain PLL NTFs** (this is THE freq-domain model) | SSB PN @6-GHz: VCO 51%, REF 39%, PD 4%, DIV 6% | K_PD, H_LF(s), K_VCO, N | values from p.42 example |
| 6 | BG | Extra challenges in frac-N | MMD+DSM, PD nonlinearity | MASH ranges: MASH1 Φe∈[−Tvco/2,+Tvco/2]; MASH1-1 [−Tvco,+Tvco]; MASH1-1-1 [−2Tvco,+2Tvco] | — | DSM quantization-error (QE) range model | fractional spurs, noise folding | DSM order vs Φe range | MASH order → DTC DR |
| 7 | ARCH | Major PLL topologies | (a) analog PFD-CP (b) DPLL TDC (c) **DTC-assisted PD** | — | — | PD design metrics: noise, linearity over DR, Pdc, area | — | three topologies | DTC-assisted = focus |
| 8 | BG | Outline | — | — | — | — | — | — | — |
| 9 | ARCH | **Advantages of DTC-assisted PD** | DTC in ref path, ÷N, DSM, PD, LF, VCO | **K_DTC = Tvco/Δt_DTC**; Φ_QE[n] cancelled by DTC | (sets up K_DTC cal) | DTC cancels accumulated DSM QE → ~0 PD phase error (integer-N-like) | Δt[n] staircase = Tvco·(QE) | K_DTC, Δt_DTC, Tvco, Φ_QE[n] | DTC code = K_DTC·Φe |
| 10 | ARCH | DTC-based **digital** PLL variants | digital sampling / ADPLL / bang-bang | Φe = 1- or n-bit word | LMS K_DTC cal mentioned | BBPD gain linearization | — | refs: Tasca'11, Pavlovic'11, Gao'16 | — |
| 11 | ARCH | DTC-based **analog** PLL variants | sampling PD (SPD) & sub-sampling PD (SSPD) | K_PD high; Φe(n) path | — | (sets up analog cal) | SPD = sample/hold; SSPD | refs: Raczkowski'15, Wu'19 | SPD chosen as proposed |
| 12 | DTC | **DTC vs TDC** as PD | TDC delay-line vs DTC | TDC QN Δt~8 ps (14 nm); DTC Δt~100 fs (14 nm) | — | QN-limited inband noise | — | τ resolution | why DTC wins |
| 13 | BG | Outline (DTC section) | — | — | — | — | — | — | — |
| 14 | DTC | **RC-delay variable-slope DTC** | CKREF→buf→R,C_LSB(n-bit)→Vdly ramp→comparator | Δt_cmp; K_DTC=Tvco/Δt_DTC | — | DTC→IPN: RMS jitter, QN, NL→spurs/folding | εqn/εdtc/εpd INL decomposition | R, C_LSB, n-bit, Vdly slope | — |
| 15 | DTC | **DTC quantization noise** | RC ramp + comparator | **T_res = ln2·R·C_LSB**; **Φ_DTC,QN = (2π·T_res)²/12 · f_ref** | — | DTC QN PSD (input-referred at CKREF) | −163 dBc/Hz | **T_res=400 fs, f_ref=104 MHz → −163 dBc/Hz; 10-bit → DR=400 ps, 2nd-order DSM, fvco>5 GHz** | single/double-sided 3-dB note |
| 16 | DTC | **DTC thermal noise** | delay stage + INV buffer | **ℒ ≅ 10log₁₀[ (1/2)(2πf_ref/k_slew)² · S_v^folded(fm) ]**, k_slew=1/(2RC) @VDD/2, S_v^folded≅(kT/C)/(fout/2); → **ℒ≅10log₁₀[2kT·f_ref·(2π/ln2)²·2ⁿT_res²/C_LSB]** | — | DTC thermal-noise PSD | <−171 dBc/Hz (PN floor) | C_LSB≥2 fF; INV-buffer width 100s of µm | — |
| 17 | DTC | **DTC NL — static distortion** | cap array + comparator | code/slope-dependent Δt_cmp → INL | (motivates NLC) | static INL model (parabolic) | INL: fixed cap → <2 LSB; DEM → DNL ±0.2 LSB (10-bit) | C_LSB≥2 fF | parabolic INL shape |
| 18 | DTC | **DTC NL — dynamic distortion** | supply settling, memory effect | code-dependent supply settling → INL, memory | (motivates regulator/reset) | dynamic INL w/ memory | INL ±0.6 LSB scatter (meas) | per-cycle supply dip | hard to model exactly |
| 19 | DTC | High-perf DTC design example | master-slave regulator, bleeding current, prog. R | — | DTC code reset to "1" each cycle | regulator settling vs bleed-I | 0.3 LSB variation over temp; INL vs bleed-I | bleeding current 0–800 µA | — |
| 20 | ARCH | **DTC-assisted PD in analog PLL (SPD)** | DTC→SPD(sample/hold)→GM→LF→VCO→MMD→DSM | **Vsmp = ZOH → 1st-order IIR**; **K_SPD = K_slope/(2π·f_ref)**; K_slope=6 GV/s → **K_SPD=57/2π ≈ 9.2 V/rad** | — | SPD = 1st-order IIR; K_SPD≫K_PD(PFD-CP) | <−170 dBc/Hz | **K_slope=6 GV/s, f_ref=104 MHz, C_I,2≈200 fF** | GM µA-level |
| 21 | DTC | **Constant-slope DTC (I/C)** | IDAC, RDAC, CL | Δt_DTC = ∫dV·CL(V)/(K·I) (const slope) | — | const-slope nonlinearity sources | — | needs high VDD (1.5 V) | survey [Ru'15] |
| 22 | DTC | **Inverse-constant-slope (ICS) DTC** | coarse-fine, DFF+mux @fvco | Δt_DTC = ∫ CL(V)dV/(K·I_G(V)) → immune to I_G(V),C(V) | — | ICS linearity | — | needs fine DTC | survey [Dartizio'23] |
| 23 | DTC | **Pseudo-differential DTC** | two half-range DTCs | even-symmetric INL cancels | — | INL cancellation | — | — | survey [Xu'24] |
| 24 | DTC | Digital-assisted linear-DTC menu | NLC / reverse-concavity / range reduction | — | (forward pointer) | — | — | — | — |
| 25 | BG | Outline (calibration section) | — | — | — | — | — | — | — |
| 26 | CAL | **Adaptive (LMS) filter for cal** | DPLL: TDC, DLF, DCO, MMD, DSM, LMS | **LMS: h(k+1)=h(k)+µ·e(k)·x(k)**; integrator µ·Z⁻¹/(1−Z⁻¹) | **DTC gain (K_DTC)** | LMS system-ID mapping: x=Φe, e=PHE, y=CKDTC phase, d=CKFB phase, h=K_DTC | — | µ step size | LMS = system identification |
| 27 | CAL | **DTC gain CAL in analog SPD PLL [1]** | SPD, GM, comparator | e[k]=sign(PHE); offsets V_Gm_os, V_cmp_os | **K_DTC (sign-LMS)** | offset shifts mean of e[k] → bias | shows e[k] waveform vs offset sign | V_Gm_os, V_cmp_os | sign-LMS needs zero-mean e[k] |
| 28 | CAL | **DTC gain CAL [2] + offset cal** | + ΔV-DAC on Vref1 | adjust Vref1 to zero-mean e[k]; 1-bit ΔV-DAC | **K_DTC + offset cal** | offset-cancel LMS | — | 1-bit ΔV-DAC | [Wu'19] proposed |
| 29 | CAL | POC-DTC zero-mean PHE [1] | PFD-CP + DTC + coarse-fine DTC | ΔTof varies w/ PVT; Error_Sign[k] zero-mean | phase-offset-cal DTC | POC-DTC tracks ΔTof | — | coarse+fine DTC, 1-b TDC | survey [Renukaswamy'23] |
| 30 | CAL | POC-DTC zero-mean PHE [2] | (same, detail) | (same) | (same) | (same) | — | — | survey |
| 31 | CAL | **DTC NLC — polynomial CAL** | LMS on g1,g2,g3 | **D_DCW = g1·D_AQ + g2·D_AQ² + g3·D_AQ³**; D_AQ=accum DSM phase | **NLC (g1,g2,g3 LMS)** | polynomial pre-distortion | max INL 50 fs (after NLC) | g1=K_DTC,g2,g3 | survey [Park'21]; we model concept |
| 32 | CAL | Reverse-concavity variable-slope DTC | change R_U via voltage DAC | adaptation loop finds DAC code | NL cal via R_U | reverse-concavity INL cancel | — | R_U DAC | survey [Rossoni'24] |
| 33 | DTC | **DTC range-reduction tradeoffs (recap)** | — | **DR=2ⁿ·t_res=2ⁿ·ln2·R·C_LSB**; QN∝t_res²; **ℒ≅10log₁₀[2kT·f_ref·(2π)²/ln2·DR·R]**; power∝DR² | — | DR vs noise/power/linearity | — | n bits, DR | DR↓ ⇒ better all-round |
| 34 | CAL | **½-DTC-range with 2 VCO phases** | modified MMD+DSM, SEL_CKFB, ÷2 | switching CKFB1→CKFB2 = +½Tvco delay; modified DSM ½-range QE | **DTC range reduction (proposed)** | modified-DSM ½-range model; MASH1/MASH1-1 SEL_CKFB & Φe(n) waveforms | — | SEL_CKFB ±1; Φe∈[0,0.5Tvco] | [Wu ISSCC'21] proposed |
| 35 | CAL | **VCO duty-cycle error disrupts K_DTC** | MMD, DFF1/2, MUX, inverter Δt_inv | **Δt_err = Δt − Tvco/2**; ideal Δt=Tvco/2=83 ps@6 GHz | (motivates VCO DCC) | duty-error model on CKFB2 | K_DTC drifts w/ 12% duty error | Δt1,Δt2,Δt_inv | [Wu ISSCC'21] |
| 36 | CAL | **VCO duty-cycle calibration** | sign-LMS, α·Z⁻¹/(1−Z⁻¹) | **vco_dcc**: SEL_CKFB=+1→push CKDTC by Δt_err/2; =−1→pull-in Δt_err/2 | **VCO DCC (sign-LMS, proposed)** | sign-LMS on SEL_CKFB×e[k] | — | α step size | [Wu ISSCC'21] proposed |
| 37 | RESULT | Simulated K_DTC CAL & DTC code | — | — | K_DTC + range red. | convergence | **K_DTC converges <30 µs even w/ 12% VCO duty error; DTC code range halved; FCAL 23 µs, FLL 91 µs** | — | sim cross-check target |
| 38 | CAL | **1/8-DTC-range using 8 RO phases** | 8:1 MUX, window gen, QTM-PS, 1st-order ΔΣM | DR reduced by 1/8 | **DTC gain + RO phase mismatch (DRPEC) LMS** | RO phase-error calibrator (RPEC) | — | 8 RO phases SOUT[7:0] | survey [Hwang ISSCC'22] |
| 39 | ARCH | **Low-jitter sampling analog PLL example (full system)** | DTC, SPD, slope-gen, GM, dual-core VCO, MMD, modified-DSM, **all cals** | (assembles all) | **K_DTC + VCO DCC + CKREF DCC + offset(ΔV-DAC)** | **complete proposed system block diagram** | 14 nm FinFET, core 0.31 mm²; power: VCO 12 mW, DTC 1.2 mW, MMD 0.5 mW, rest 0.5 mW | α1,α2; Vref_adj; ½-range DSM | [Wu ISSCC'21] proposed |
| 40 | RESULT/CAL | **Simulated background calibration** | full cal block diagram (µ1,µ2,µ3) | sign-LMS×3 + offset | **all 4 cals together** | **complete digital cal block diagram** | **all converge <30 µs; 20 ps VCO duty err, 32 mV cmp offset, 1 ns (57%) CKREF duty err; robust int & frac** | µ1(vco_dcc),µ2(K_DTC),µ3(ckref_dcc) | sim cross-check target |
| 41 | RESULT | **Measured frac-N spurs & jitter** | — | fVCO=35×153.6 MHz+Δf | (effect of cals) | — | **frac spurs −70…−85 dBc; RMS jitter ~80–120 fs vs fVCO 5–7 GHz; with/without range-red & VCO DCC** | — | [Wu ISSCC'21] meas |
| 42 | RESULT | **PN contributors in low-jitter DTC PLL** | — | — | (post-cal budget) | **noise-budget pie / PN plot** | **@LO 6720 MHz, REF 104 MHz: TOTAL 87.5 fs (−51.7 dBc); VCO 51%, REF(+DTC) 39%, MMDIV 6%, SPD+GM 4%, ΣΔM QE ~0%** | fout=6.72 GHz, fref=104 MHz | the validation target |

---

## Detailed notes on the technically rich slides

### p.5 / slide 5 — Linear PLL phase-domain model (the frequency-domain backbone)
Block diagram (phase domain): `|Φref| → (Σ) → K_PD(s) → H_LF(s) → K_VCO/s → |Φout|`, with feedback `÷N` returning `Φdiv,n`. Noise injections drawn at the summing node: `Φref,n`, `ΦPD,n`, `ΦVCO,n`, `Φdiv,n`, plus DSM `ΔM` quantization `QE` into the MMDIV. This is the canonical **type-II charge-pump-style linear model** and is the basis of `models/frequency_domain_model.py`. The bar example (SSB PN at a low-jitter 6-GHz PLL): **VCO 51 %, REF 39 %, PD 4 %, DIV 6 %** — VCO and REF dominate.

### p.9 / slide 9 — DTC-assisted PD principle
DTC sits in the **reference path** and adds a programmable delay `Δt[n] = K_DTC⁻¹ · Φ_QE[n]` (a staircase that tracks the *accumulated* DSM quantization error `Φ_QE`). Because the divider's CKFB edge in a frac-N PLL wanders by up to ±(order)·Tvco/2 relative to CKREF, delaying CKREF by exactly that amount makes the PD see **≈0 phase error after lock — just like integer-N**. Key relation: **K_DTC = Tvco / Δt_DTC** (codes per VCO period). This lets you use a **high-gain, small-dynamic-range PD** → lower inband noise, better linearity, lower power.

### p.15 / slide 15 — DTC quantization noise (verbatim formulas)
- Unit delay: **T_res = ln2 · R · C_LSB**
- Input-referred (at CKREF) phase-noise PSD: **Φ_DTC,QN = (2π·T_res)² / 12 · f_ref**
- Worked number: T_res = 400 fs, f_ref = 104 MHz ⇒ **−163 dBc/Hz**. (Reproduced numerically in `derivations.md`; matches with the `/12` convention.)
- 10-bit ⇒ total **DR = 400 ps**, supports 2nd-order DSM with fvco > 5 GHz.

### p.16 / slide 16 — DTC thermal noise (verbatim)
`ℒ ≅ 10·log₁₀[ ½ · (2π f_ref / k_slew)² · S_v^folded(f_m) ]`, with `k_slew = 1/(2RC)` at `VDD/2`, and `S_v^folded(f_m) ≅ (kT/C)/(f_out/2)`.
Simplifies to **`ℒ ≅ 10·log₁₀[ 2kT·f_ref·(2π/ln2)² · 2ⁿ·T_res²/C_LSB ]`** at mid-code. Needs `C_LSB ≥ 2 fF` for PN floor < −171 dBc/Hz. INV-buffer thermal noise dominates if buffer width is too large.

### p.20 / slide 20 — Sampling PD (SPD) gain & dynamics (verbatim)
- `Vsmp` is a **zero-order-hold → behaves as a 1st-order IIR filter** in the loop.
- **`K_SPD = K_slope / (2π·f_ref)`**. With `K_slope = 6 GV/s`, `f_ref = 104 MHz` ⇒ `K_SPD = 57/(2π) ≈ 9.2 V/rad` ≫ K_PD of a PFD-CP.
- GM can be µA-level; its noise is suppressed by the high K_SPD. With `C_{I,2} ≈ 200 fF` ⇒ < −170 dBc/Hz.

### p.26–28 / slide 26–28 — DTC gain calibration (LMS)
System-identification view (p.26): the unknown "plant" is the mapping from accumulated QE `Φe` to the residual phase error; the **adaptive weight `h(k)` IS `K_DTC`**. Update is an LMS integrator `µ·Z⁻¹/(1−Z⁻¹)`:
`K_DTC[k+1] = K_DTC[k] + µ · e[k] · x[k]`, with `x[k]=Φe[k]`, `e[k]=`phase error (sign in the analog case).
p.27 shows that **comparator/GM offsets bias the mean of `e[k]`** (sign-LMS converges only when `e[k]` is zero-mean). p.28's fix: a **1-bit ΔV-DAC adjusts `Vref1`** to null the offset → zero-mean sign(PHE).

### p.34–37 / slide 34–37 — ½-range + VCO duty-cycle calibration
- **½-range (p.34):** a *modified MMD + DSM* selects between two VCO phases (CKFB1, CKFB2 = CKFB1 delayed by ½Tvco) via `SEL_CKFB`, halving the residual QE range the DTC must cover (Φe ∈ [0, 0.5Tvco] instead of [−Tvco/2,+Tvco/2]). Smaller DR ⇒ more linear, lower-noise, lower-power DTC.
- **Problem (p.35):** if the VCO duty cycle ≠ 50 %, the two phases are *not* exactly ½Tvco apart: `Δt_err = Δt − Tvco/2 ≠ 0`. This injects a **`SEL_CKFB`-correlated error** that corrupts K_DTC cal and re-introduces a spur.
- **Fix (p.36):** a **sign-LMS** correlates `e[k]` with `SEL_CKFB (±1)` to estimate `Δt_err`, producing `vco_dcc`. `SEL_CKFB=+1 → push CKDTC back by Δt_err/2`; `=−1 → pull-in by Δt_err/2`. Added into the DTC code.
- **Result (p.37):** K_DTC converges < 30 µs even with **12 % VCO duty error**; DTC code range is halved.

### p.39–40 / slide 39–40 — The complete proposed system + all calibrations
**Signal chain (p.39):** `CKREF (×2 → CKREFX2) → DTC → CKDTC → SPD (slope-gen + sample) → V1/V2 → GM (Vref) → Vctrl_P/Vctrl_I → dual-core VCO → CKVCO → MMD (÷N) → CKFB`, with the **modified ΣΔ-modulator (½-range)** driving `NDIV` and `SEL_CKFB`.
**Digital calibrations (p.40), three sign-LMS integrators sharing the 1-bit error `e[k]=sign(PHE)`:**
- `µ2` branch (**K_DTC**): `K_DTC[k+1]=K_DTC[k]+µ2·e[k]·Φe[k−n]`. DTC code main term `= K_DTC·Φe[n]`.
- `µ3` branch (**ckref_dcc**): `even_cycle(±1)` correlated with `(1−Z⁻¹)e[k]`, integrated, multiplied by `even_cycle` → injected into the **FCW path before the modified DSM** (corrects the alternating-cycle error from a non-50 % *reference* duty cycle).
- `µ1` branch (**vco_dcc**): `Sign(SEL_CKFB)(±1)` correlated with `(1−Z⁻¹)e[k]`, integrated, multiplied by `Sign(SEL_CKFB)` → **added to the DTC code** (corrects VCO duty error).
- **offset/`Vref_adj`** branch: a `ΔΣ`-controlled `ΔV-DAC` keeps `e[k]` zero-mean (cancels comparator + GM offset).
Final **`DTC code = quantize( K_DTC·Φe[n] + vco_dcc + offset )`**, and **`FCW' = FCW + ckref_dcc`** into the modified DSM.
**Sim (p.40):** all converge < 30 µs and track PVT for *both* integer and fractional channels, with **20 ps VCO duty error, 32 mV comparator offset, 1 ns (57 %) CKREF duty error** injected.

### p.42 / slide 42 — Post-calibration noise budget (the validation target)
At **LO = 6720 MHz, REF = 104.0 MHz**, after suppressing PD/DSM-QN/MMD noise, the integrated PN is dominated by **CKREF and VCO**. **TOTAL = 87.5 fs (−51.7 dBc)**, broken down as **VCO 51 %, REF(+DTC thermal&QN) 39 %, MMDIV 6 %, SPD+GM 4 %, ΣΔM QE ≈ 0 %**. PLL bandwidth is chosen to trade off REF vs VCO — *common to all PLLs*. These numbers anchor the `frequency_domain_model.py` jitter-contribution table and the time-domain cross-check.
