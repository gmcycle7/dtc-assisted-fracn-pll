# DTC-Assisted High-Performance Fractional-N PLL — Interactive Study Companion

A complete teaching package that reads, models, and explains the **proposed architecture,
methods, calibrations, and noise models** in the deck
*“Design of DTC-Assisted High Performance Fractional-N PLLs”* (Wanghua Wu, Samsung, 2024-11-10),
**slides 1 → 42**.

> **Page numbering:** PDF page N = slide page N (verified by the printed page numbers). All
> citations are written “PDF p.X / slide p.X”.

It contains (a) a slide-by-slide inventory, (b) runnable Python models for the frequency-domain
linear PLL, the time-domain noise simulation, and every calibration, (c) auto-generated figures,
(d) a test suite of sanity checks, and (e) a static, browser-openable teaching website.

**v2 additions:** the website is now **fully offline** (KaTeX/Prism/Plotly vendored locally),
**interactive** (live phase-noise/Bode explorer + calibration playground whose JS math is a
validated port of the Python model — reproduces 87.6 fs), has **native SVG block diagrams**,
three extra pages (**Notation & Glossary**, **DTC Topologies**, **Validation & Limits**),
**self-check quizzes**, a sticky table-of-contents, mobile nav, a print stylesheet, downloadable
CSV/JSON data, and a **GitHub Actions** workflow that rebuilds and redeploys on every push.

---

## What was found in the deck (slides 1–42)

**Proposed architecture** — a *DTC-assisted analog sampling fractional-N PLL*: a Digital-to-Time
Converter (DTC) in the reference path cancels the accumulated ΔΣ (DSM) quantization error so the
phase detector sees ~0 error (integer-N-like, slide 9), enabling a high-gain low-noise sampling PD
(slide 20). The full system is on slide 39; the calibrations on slide 40.

**Proposed calibrations (all background, sign-LMS):**
1. **DTC gain** `K_DTC` (slides 26–28, 40)
2. **VCO duty-cycle** `vco_dcc` (slides 35–37, 40)
3. **CKREF duty-cycle** `ckref_dcc` (slide 40)
4. **Comparator/GM offset** via ΔV-DAC on `Vref_adj` (slides 27–28, 40)

Plus DTC **range-reduction** (½-range via two VCO phases, slide 34; 1/8-range via 8 RO phases,
slide 38) and survey NLC techniques (polynomial, slide 31; reverse-concavity, slide 32).

**Validation target (slide 42):** at LO 6720 MHz / REF 104 MHz the integrated jitter is
**87.5 fs (−51.7 dBc)** with VCO 51 % / REF(+DTC) 39 % / MMD 6 % / SPD+GM 4 % / ΣΔM-QE ≈ 0 %.
**Our frequency-domain model reproduces 87.6 fs / −51.6 dBc** with the same split, and the
**time-domain simulation cross-checks to 88.2 fs (+0.08 dB).**

---

## Repository layout

```
DTC_PLL_RXPLL/
├── README.md
├── Design of DTC-Assisted ... .pdf      # source deck
├── docs/
│   ├── slide_inventory.md               # per-page analysis table (slides 1-42)
│   ├── assumptions.md                   # every engineering assumption [A1..A20]
│   ├── derivations.md                   # all transfer functions & math, tagged by source
│   ├── references.md                    # 4-bucket citation policy (no invented cites)
│   └── open_questions.md                # genuine ambiguities needing your input
├── models/
│   ├── utils.py                         # PN<->jitter, Welch PSD, noise generators
│   ├── frequency_domain_model.py        # linear PLL: G_ol, NTFs, Bode, jitter budget
│   ├── time_domain_noise_model.py       # discrete-time sim + freq<->time cross-check
│   ├── calibration_models.py            # all 4 cals + polynomial NLC
│   └── run_all.py                       # regenerate every figure + JSON
├── results/
│   ├── figures/                         # PNG figures (also copied into site/)
│   └── tables/                          # JSON data (also copied into site/)
├── tests/
│   ├── test_frequency_domain.py         # H.1 sanity checks
│   ├── test_time_domain_noise.py        # H.2 & H.4 sanity checks + cross-check
│   └── test_calibrations.py             # H.3 sanity checks
└── site/
    ├── build_site.py                    # assembles the static site
    ├── index.html, *.html               # 10 teaching pages (generated)
    ├── _content/                        # per-page HTML fragments
    └── assets/{style.css, figures/, slides/, data/}
```

## Install dependencies

Only NumPy, SciPy, and Matplotlib are required for the models; PyMuPDF only to (re)render slides.

```bash
python3 -m pip install numpy scipy matplotlib pymupdf
```

(Tested with numpy 2.x — the code handles the `np.trapz` → `np.trapezoid` rename.)

## Run the models / regenerate figures

```bash
cd models
python3 run_all.py                 # runs all three models, writes figures + JSON (~4 s)
# or individually:
python3 frequency_domain_model.py  # prints the jitter budget, writes fd_*.png + freq_domain.json
python3 calibration_models.py      # writes cal_*.png + calibrations.json
python3 time_domain_noise_model.py # writes td_*.png + time_domain.json, prints cross-check
```

Figures land in both `results/figures/` and `site/assets/figures/`; data in `results/tables/` and
`site/assets/data/`.

## Re-render the slide images (optional)

```bash
python3 -c "import fitz; d=fitz.open('Design of DTC-Assisted High Performance Fractional-N PLLs 20241110.pdf'); [d[i].get_pixmap(dpi=150).save(f'site/assets/slides/slide_{i+1:02d}.png') for i in range(42)]"
```

## Verify results (sanity checks, Section H)

```bash
python3 -m pytest tests/ -q        # 18 checks, ~0.5 s
# or without pytest:
for t in tests/test_*.py; do python3 "$t"; done
```

Checks include: loop BW/PM extraction, closed-loop DC gain → N, VCO high-pass suppression,
budget ≈ slide 42, Welch PSD normalization (Parseval), **frequency↔time cross-check < 1.5 dB**,
calibration convergence (no-noise → target; offset → bias; large step → ripple), NLC reduces INL.

## Launch the website

The site is plain static HTML (KaTeX + Prism via CDN — open while online for math/code rendering):

```bash
python3 site/build_site.py         # (re)assemble pages from site/_content/ fragments
# then open site/index.html in a browser, or serve:
cd site && python3 -m http.server 8000   # -> http://localhost:8000
```

Pages: **Home · Slide-by-slide Map · Architecture · Block Models · Calibrations ·
Frequency-Domain · Time-Domain Noise · Code Walkthrough · Numerical Examples ·
DTC Topologies · Notation & Glossary · Validation & Limits · References.**

The site renders **offline** (all of KaTeX, Prism and Plotly are vendored under
`site/assets/vendor/`). The interactive widgets live in `site/assets/app/` (`pll.js` is a
browser port of the Python model; `widgets.js` drives the Plotly explorers). A push to `main`
triggers `.github/workflows/deploy.yml`, which regenerates figures, rebuilds the HTML, and
publishes `site/` to the `gh-pages` branch.

---

## Provenance discipline (no hallucination)

Every claim carries one of: **slide pX** (from the deck), **derived** (in `docs/derivations.md`),
**textbook** (named standard theory), **assumption** (`docs/assumptions.md`, `[A#]`), or
**needs citation** (standard but unpinned). Assumptions and open questions are isolated in
`docs/assumptions.md` and `docs/open_questions.md` — they are never blended into slide facts.

## Known limitations (see `docs/open_questions.md`)

- Time-domain model is sampled at `f_ref` (Nyquist 52 MHz); jitter cross-check uses the
  1 kHz–52 MHz band. The freq-domain 100-MHz number is slightly higher (VCO tail).
- Per-source absolute noise floors are back-solved to match slide-42 percentages (the slide gives
  only percentages); they are plausible but not unique.
- DSM-noise referral magnitude is illustrative; the DTC-cancelled residual is the load-bearing value.
- Type-II vs type-I loop, the exact `Φ_DTC,QN` 3-dB convention, and the modified-DSM internals are
  flagged as open questions.
