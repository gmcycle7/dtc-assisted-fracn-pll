# Assumptions

Every assumption below is **NOT** stated in the slides (or not stated with a number) but is needed to build runnable models. Each has a rationale and is tagged `[A#]`. In code and on the website these appear as **"Assumption [A#]"**. Anything the slide *does* give is used as-is and tagged to its slide page elsewhere.

## Loop / system parameters (slide gives topology, not all numbers)

- **[A1] Loop bandwidth ≈ 1.5 MHz.** Slide 42 says "PLL BW is chosen to trade off REF vs VCO" but gives no number. For a 104-MHz reference, a 6.72-GHz output, and the VCO/REF crossover visible in the slide-42 PN plot (~1–2 MHz), 1.5 MHz is the standard choice (BW ≈ f_ref/70). Used for all frequency-domain plots.
- **[A2] Phase margin ≈ 60°.** Not given. 60° is the textbook target for a well-damped type-II PLL (≈ critically damped, minimal peaking). Sets the loop-filter zero/pole spacing.
- **[A3] Divide ratio N ≈ 64.6** (= 6720 MHz / 104 MHz). Computed from slide-42 numbers; fractional part exercises the DSM/DTC.
- **[A4] VCO gain K_VCO = 2π·100 MHz/V** (100 MHz/V). Typical for a 6-GHz LC-VCO with a switched-cap bank for coarse tuning and a small varactor for the loop. Only the *product* with loop filter sets BW, so this is a representative split.
- **[A5] DSM order m = 2** (MASH or 2nd-order). Slide 15 says "can support 2nd-order DSM"; slide 6 lists MASH1/MASH1-1/MASH1-1-1. We default to m=2 (MASH1-1) and make it a parameter.

## DTC parameters

- **[A6] DTC resolution T_res = 400 fs, n = 10 bits, DR = 400 ps.** Directly from slide 15 (these ARE on the slide; used as the nominal design point).
- **[A7] R = 5 kΩ, C_LSB = 115 aF (≈0.115 fF) per LSB** chosen so `T_res = ln2·R·C_LSB = 400 fs`. Slide 16 says `C_LSB ≥ 2 fF`; we therefore instead set **C_LSB = 2 fF, R = 289 Ω** as the noise-driven point and keep T_res=400 fs. (Two self-consistent choices; we use C_LSB=2 fF, R such that ln2·R·C_LSB=400 fs ⇒ R≈289 Ω.) This only affects the *thermal-noise* number, computed with slide-16's formula.
- **[A8] DTC INL shape = parabolic (2nd-order dominant), peak ±0.6 LSB.** Slide 17/18 say "strong 2nd-order NL", scatter ±0.6 LSB. We model `INL(code) = a2·(code−mid)²` normalized to ±0.6 LSB for spur simulations. Survey NLC (slide 31) targets residual 50 fs.

## PD / loop-filter parameters

- **[A9] K_SPD = 9.19 V/rad** (slide 20 gives the formula and K_slope=6 GV/s, f_ref=104 MHz → this number). Used as the PD gain.
- **[A10] Loop-filter caps C_I,2 = 200 fF** (slide 20 mentions ~200 fF). Used for the GM-noise estimate.
- **[A11] GM = 100 µS, comparator/GM input-referred offset σ = 32 mV** (slide 40 injects "32 mV comparator offset"). Used in the offset-cal model.

## Noise PSD levels (slide gives *budget percentages*, not absolute floors except DTC)

> The absolute floors below are **back-solved to reproduce the slide-42 percentage split**
> (VCO 51 % / REF+DTC 39 % / MMD 6 % / SPD+GM 4 %, total 87.5 fs). The slide gives only the
> percentages, so these numbers are plausible but not unique. The values listed here are the
> exact ones used in `models/frequency_domain_model.py` (`PLLParams`) — docs and code agree.

- **[A12] Reference (CKREF) phase noise**: white floor `−168 dBc/Hz` + flicker `−143.5 dBc/Hz @ 10 kHz` (1/f, −10 dB/dec). Inside the loop the reference is multiplied by `N²` (+36 dB), so these reference-referred levels make REF contribute ≈ the slide-42 REF share. A 104-MHz XO of this class is typical. **MMD (divider) own noise** `−165 dBc/Hz` (white) gives the slide-42 MMD ≈6 % bucket — distinct from the DSM quantization noise.
- **[A13] VCO phase noise**: `−116.5 dBc/Hz @ 1 MHz` (−20 dB/dec, white-FM) + 1/f³ flicker corner `150 kHz`. Slide 50 (out of scope) measures −120 dBc/Hz @ 1 MHz @ 6 GHz (single-core) / −122.5 (dual-core); our −116.5 @ 6.72 GHz is ~3–4 dB higher, attributable to the higher output frequency (≈ +1 dB) and to back-fitting the VCO to its ≈51 % budget share. Clearly an assumption, not the slide-50 measurement.
- **[A14] DTC thermal-noise floor `−171 dBc/Hz`** (slide 16 target) and **QN `−163 dBc/Hz`** (slide 15). Both are on-slide; lumped into the REF/DTC 39 % bucket.
- **[A15] SPD+GM noise → −167 dBc/Hz** (slide 20 mentions <−170 dBc/Hz; we use −167 referred to PD input so SPD+GM contributes ≈4 %).
- **[A16] Integration band = 1 kHz → 100 MHz** for all RMS-jitter numbers (slide 3 uses this band; slide 42 implies it).

## Calibration step sizes / timing

- **[A17] Sign-LMS step sizes µ1=µ2=µ3 chosen for ~30-µs convergence** at f_ref=104 MHz (≈3120 reference cycles in 30 µs). We pick µ so the loop time constant τ≈5–8 µs (matches slide 37/40 "converge < 30 µs"). Exact values in `calibration_models.py`.
- **[A18] Injected impairments for cal demos:** 20 ps VCO duty error, 1 ns (57 %) CKREF duty error, 32 mV comparator offset — **all taken verbatim from slide 40**; initial K_DTC error 10 %.

## Conventions

- **[A19] Single-sided phase-noise convention** with `ℒ(f)=10log10(½ S_φ)`. The ±3 dB SSB/DSB ambiguity (see derivations §3, §8) is acknowledged; numbers are reported single-sided unless a slide value is explicitly DSB (slide 42 IPN is DSB).
- **[A20] All "background" calibrations run continuously after lock** (slide 40 "background"). Foreground variants are discussed but not the default.

## Design-exercise / illustrative inputs

- **[A21] The 80-fs synthesis target** on the Design Walkthrough is a *self-chosen* spec, deliberately tighter than slide-42's 87.5 fs so the walkthrough has to tighten something. It is the only invented number on that page; everything downstream is computed from it with slide formulas.
- **[A22] State-of-the-art jitter/power cloud** on the System FoM scatter is an *illustrative* envelope of fractional-N synthesizer results, not specific cited papers; it exists only to show where the iso-FoM diagonals fall. The design's own point (87.6 fs / 14.2 mW → −249.6 dB) and the iso-FoM lines are exact.
- **[A23] DSM fractional accumulator bit-width L.** The deck gives the DTC resolution (10-bit → 400 fs DR, slide 15) and the DSM order (2nd, slide 15) but **not** the fractional accumulator word length or the channel raster. The fraction→bits worked examples use **L = 24** as a representative value (channel resolution f_ref/2²⁴ ≈ 6.2 Hz), and show L = 20 (≈99 Hz) alongside to make the bit-width↔resolution trade explicit. FCW = round(α·2^L) and the resolution f_ref/2^L are exact given L; only L itself is assumed.
