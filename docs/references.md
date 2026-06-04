# References & citation policy

Citations are split into four buckets exactly as required. **No citation is invented.** Where a result is standard but I cannot pin a specific page/source, it is marked **[Needs external citation]** so you can supply it.

## 1. Directly from the slide deck (primary source)
- **[DECK]** W. Wu, *Design of DTC-Assisted High Performance Fractional-N PLLs*, Samsung Semiconductor, 2024/11/10. All "Slide pX" tags point here.

## 2. Papers explicitly cited *on* the in-scope slides (p.1–42)
These appear as bracketed citations on the slides themselves (names/years read off the slides; full entries are on deck p.54–57 which are out of scope but transcribed here for convenience):
- **[Wu'19]** W. Wu et al., "A 28-nm 75-fs_rms Analog Fractional-N Sampling PLL With a Highly Linear DTC Incorporating Background DTC Gain Calibration and Reference Clock Duty Cycle Correction," *IEEE JSSC*, vol. 54, no. 5, pp. 1254–1265, May 2019. — *slides 11, 16, 20, 27, 28* (the proposed analog SPD PLL, DTC gain cal, CKREF DCC).
- **[Wu'21]** W. Wu et al., ISSCC 2021 (DTC range reduction with two VCO phases, VCO duty-cycle calibration, modified DSM). — *slides 34, 35, 36, 37, 39, 40, 41*.
- **[Wu'23]** W. Wu et al., RFIC 2023 (low-jitter frac-N PLL directly at mmW; dual-core VCO). — *slides 47, 48 (out of scope)*.
- **[Gao'09]** X. Gao, E. Klumperink, P. Geraedts, B. Nauta, "Jitter analysis and a benchmarking figure-of-merit for PLLs," *IEEE TCAS-II*, vol. 56, pp. 117–121, Feb. 2009. — *slide 4 (FoM)*.
- **[Tasca'11]** D. Tasca et al., "A 2.9-to-4.0 GHz fractional-N digital PLL with bang-bang phase detector…," *IEEE JSSC*, Dec. 2011. — *slide 10*.
- **[Pavlovic'11]** N. Pavlovic, ISSCC 2011 — *slide 10*.
- **[Gao'16]** X. Gao, ISSCC 2016 — *slide 10*.
- **[Raczkowski'15]** K. Raczkowski, *IEEE JSSC*, May 2015 (sampling PLL) — *slide 11*.
- **[Ru'15]** J. Z. Ru, *IEEE JSSC*, June 2015 (constant-slope I/C DTC) — *slide 21*.
- **[Dartizio'23]** S. M. Dartizio, ISSCC 2023 (inverse-constant-slope DTC) — *slide 22*.
- **[Xu'24]** D. Xu, ISSCC 2024 (pseudo-differential DTC) — *slide 23*.
- **[Park'21]** H. Park, ISSCC 2021 (polynomial DTC NLC) — *slide 31*.
- **[Rossoni'24]** M. Rossoni, ISSCC 2024 (reverse-concavity variable-slope DTC) — *slide 32*.
- **[Renukaswamy'23]** P. Renukaswamy, ISSCC 2023 (POC-DTC zero-mean PHE) — *slides 29, 30*.
- **[Hwang'22]** C. Hwang, H. Park, T. Seong, J. Choi, "A 188fs_rms-Jitter … 1/8 DTC-Range-Reduction … Quadruple-Timing-Margin Phase Selector," ISSCC 2022, pp. 378–380. — *slide 38*.
- **[Murphy'18]** D. Murphy, *IEEE JSSC*, Nov. 2018 (low-PN multi-core LC oscillator) — *slide 49 (out of scope)*.

## 3. Standard PLL/CDR/DSP theory used in the models (textbooks/app-notes)
- **[Std-Razavi]** B. Razavi, *Design of CMOS Phase-Locked Loops*, Cambridge, 2020 — linear PLL model, type-II loop filter, NTFs.
- **[Std-Gardner]** F. M. Gardner, *Phaselock Techniques*, 3rd ed., Wiley, 2005 — open-loop gain, phase margin, ω_c=√(ω_z ω_p).
- **[Std-Riley]** T. Riley, M. Copeland, T. Kwasniewski, "Delta-sigma modulation in fractional-N frequency synthesis," *IEEE JSSC*, vol. 28, no. 5, May 1993 — DSM noise `(1/12)(1/f_ref)[2 sin(πf/f_ref)]^{2m}`.
- **[Std-Widrow]** B. Widrow, S. Stearns, *Adaptive Signal Processing*, Prentice-Hall, 1985 — LMS / sign-sign-LMS update law and convergence bound `0<µ<2/E{x²}`.
- **[Std-Welch]** P. Welch, "The use of FFT for the estimation of power spectra," *IEEE Trans. Audio Electroacoust.*, 1967 — PSD normalization.
- **[Std-Bennett]** W. R. Bennett, "Spectra of quantized signals," *Bell Syst. Tech. J.*, 1948 — quantization variance `Δ²/12`.

## 4. Standard but unpinned → needs you to confirm a source
- **[Needs external citation]** Exact single-sided vs double-sided convention constant in `ℒ(f)=10log10(½ S_φ)` (Leeson / IEEE-1139-1999 — *likely* IEEE Std 1139, but verify the ½).
- **[Needs external citation]** The exact `/12` (vs `/6`) prefactor in slide-15's `Φ_DTC,QN` (single/double-sided). Reproduces −163 dBc/Hz with `/12`; confirm against [Wu'19].
- **[Needs external citation]** FoM_jitter definition on slide 4 (named, not shown). Standard form `FoM = 10log10[(σ_t/1s)²·(P/1mW)]` is from [Gao'09]; confirm exact constant.

## Derived-in-this-work (no external source needed)
All convergence-time constants, the parabolic INL spur model, the s-domain↔z-domain sampling-PLL bridge, and every numerical example are tagged **[Derived]** in `derivations.md` and in the code.
