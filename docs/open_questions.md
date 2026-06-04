# Open questions / ambiguities (need your input or the source papers)

These are points where the slides are genuinely ambiguous and I chose **not** to guess silently. Each lists what I assumed (if anything) so you can correct it.

1. **Type-I vs Type-II loop.** Slide 39 shows both a `Vctrl_P` and a `Vctrl_I` path (proportional + integral) into the VCO, suggesting a **type-II sampling PLL**, but slide 20 describes the SPD path as a 1st-order IIR (type-I-like). I model a **type-II** loop (with a programmable proportional path) and also expose a type-I switch. *Confirm which the measured chip used.*

2. **Exact `Φ_DTC,QN` convention (slide 15).** The printed `(2π T_res)²/12·f_ref` reproduces −163 dBc/Hz only with the `/12` (double-sided-ish) reading; the textbook single-sided result has `/6`. → ±3 dB. *Confirm against [Wu'19].* (Also in `references.md` §4.)

3. **`K_DTC` numeric units in the convergence plots (slide 35/37).** The plot shows `K_DTC ≈ 900–1013`. If `K_DTC = T_vco/Δt_DTC`, then at 6 GHz (T_vco=166.7 ps) a value of 1000 implies an *effective* LSB of ~167 fs (not the 400 fs of slide 15). I assume the 400 fs is the **coarse** DTC and the cal operates on an **effective finer** step; *confirm the exact LSB used in the cal loop.*

4. **`even_cycle` vs `SEL_CKFB` regressors (slide 40).** Both CKREF-DCC and VCO-DCC use a ±1 "every-other-cycle" regressor. I assume `even_cycle` toggles every **reference** cycle and `SEL_CKFB` toggles per the **modified DSM** phase-select pattern. *Confirm the exact toggling.*

5. **Modified-DSM internals (slide 34).** The "×2 / ÷2 / Acc / Z⁻¹" network that produces `NDIV_tmp`, `SEL_CKFB`, and the ½-range `Φe(n)` is only sketched. I implement a behavioral MASH1-1 that outputs `(NDIV, SEL_CKFB, Φe∈[0,0.5Tvco])` consistent with the waveforms, but the exact register-level structure is not fully specified.

6. **Reference doubler (CKREFX2, slide 39).** Slide 39 shows `CKREF → ×2 → CKREFX2 → DTC`. Is the *effective* `f_ref` for the cals 104 MHz or 208 MHz? I assume the DTC/PD run at the **doubled** rate where shown but report budget numbers at 104 MHz (slide 42). *Confirm.*

7. **Absolute noise floors.** Slide 42 gives only **percentages** of the 87.5-fs budget (VCO 51 %, REF 39 %, …), not absolute dBc/Hz for each source (except DTC QN/thermal). My per-source PSD levels [A12–A15] are *back-solved* to reproduce those percentages; they are plausible but not unique. *If you have the per-source PN curves, I can lock them exactly.*

8. **Spur mechanism magnitudes (slide 41).** Measured frac spurs −70…−85 dBc. My parabolic-INL spur model [A8] reproduces the *trend* (worse without range reduction / VCO DCC) but the absolute spur level depends on the true INL profile, which slide 17/18 show only qualitatively.

9. **FoM_jitter constant (slide 4).** The benchmarking FoM is referenced ([Gao'09]) but the formula is not on the slide. I use the standard `FoM=10log10[(σ_t)²·(P/1mW)]` but flag it.
