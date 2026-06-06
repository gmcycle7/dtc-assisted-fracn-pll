"""
build_site.py — assemble the static teaching site (v2).

Reads content fragments from site/_content/<key>.html and wraps each in a shared shell:
sidebar nav + mobile hamburger + sticky TOC rail + back-to-top, with VENDORED (offline)
KaTeX + Prism, and Plotly + the interactive widgets only on pages that need them.

Usage:  python site/build_site.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(HERE, "_content")

# (key, filename, nav-number, nav-title, needs_plotly, needs_ext_widgets, meta-description)
PAGES = [
    ("home",          "index.html",         "",   "Home",                  False, False,
     "Interactive study companion for W. Wu's DTC-assisted high-performance fractional-N PLL (slides 1-42): architecture, calibrations, and noise models."),
    ("slides",        "slides.html",        "2",  "Slide-by-slide Map",    False, False,
     "Per-slide analysis table (p.1-42) mapping each slide to its formulas, calibrations, models, and parameters."),
    ("architecture",  "architecture.html",  "3",  "Architecture",          False, False,
     "Overall DTC-assisted sampling fractional-N PLL: signal flow, noise-injection flow, and calibration flow."),
    ("blocks",        "blocks.html",        "4",  "Block Models",          False, False,
     "Per-block time- and frequency-domain models: DTC, sampling PD, GM/loop filter, VCO (Leeson), MMD/DSM, with non-idealities."),
    ("calibrations",  "calibrations.html",  "5",  "Calibrations",          True,  False,
     "The four proposed background sign-LMS calibrations plus polynomial NLC: convergence, misadjustment, orthogonality, and an interactive playground."),
    ("frequency",     "frequency.html",     "6",  "Frequency-Domain",      True,  True,
     "Open/closed-loop transfer functions, noise transfer functions, jitter budget, plus an interactive phase-noise explorer, pole-zero/root-locus, and a bandwidth optimizer."),
    ("loopdyn",       "loopdyn.html",       "7",  "Loop Dynamics & Lock",  True,  True,
     "Closed-loop poles, root locus, zeta/omega_n, peaking, sampled-loop stability, step response, and FLL->PLL acquisition."),
    ("timedomain",    "timedomain.html",    "8",  "Time-Domain Noise",     False, False,
     "Discrete-time PLL noise simulation, PSD/jitter extraction, and the frequency<->time cross-check."),
    ("spurs",         "spurs.html",         "9",  "Fractional Spurs",      True,  True,
     "How DTC INL and duty errors become fractional spurs: the Fourier theory, noise folding, spur-in-budget, and an interactive spur explorer."),
    ("system",        "system.html",        "10", "System Impact",         True,  True,
     "Why sub-100 fs: jitter->EVM->QAM SNR, reciprocal mixing, the jitter FoM and SoTA, jitter taxonomy, and an EVM constellation demo."),
    ("codewalk",      "codewalk.html",      "11", "Code Walkthrough",      False, False,
     "Line-by-line walkthrough of the Python models, mapping every line to a formula and a circuit."),
    ("examples",      "examples.html",      "12", "Numerical Examples",    False, False,
     "Every number-checkable worked example: DTC QN, K_SPD, loop design, jitter budget, calibration convergence."),
    ("designex",      "designex.html",      "13", "Design Walkthrough",    True,  True,
     "End-to-end capstone: design a 6.72 GHz fractional-N PLL to a <80 fs target -- budget allocation, optimal loop BW, DTC sizing, cal steps."),
    ("problems",      "problems.html",      "14", "Design Problems",       False, False,
     "Open-ended design problems (with hidden worked solutions) that exercise judgment beyond the recall quizzes."),
    ("dtctopologies", "dtctopologies.html", "15", "DTC Topologies",        False, False,
     "Survey of DTC circuit topologies and digital-assist linearization techniques from the deck (p.21-24, 29-32, 38), with a decision matrix."),
    ("glossary",      "glossary.html",      "16", "Notation & Glossary",   False, False,
     "Every symbol, its definition, units, and where it is used across the models and pages."),
    ("validation",    "validation.html",    "17", "Validation & Limits",   False, False,
     "Sanity checks, slide-42 budget match, time<->frequency cross-check, test results, assumptions-to-challenge, and known limitations."),
    ("references",    "references.html",    "18", "References",            False, False,
     "Four-bucket citation policy, the full assumptions list, and open questions."),
]

KATEX_CSS = "assets/vendor/katex/katex.min.css"
PRISM_CSS = "assets/vendor/prism/prism-tomorrow.min.css"

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · DTC-Assisted Frac-N PLL</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title} · DTC-Assisted Fractional-N PLL">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="{katex_css}">
<link rel="stylesheet" href="{prism_css}">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="topbar"><button class="ham" aria-label="Open menu">&#9776;</button><span class="ttl">{title}</span></div>
<div class="scrim"></div>
<div class="wrap">
{nav}
<main>
<div class="article">
{body}
</div>
<aside class="toc-rail" aria-label="On this page"></aside>
{btnrow}
<div class="footer">
  Teaching companion to <i>“Design of DTC-Assisted High Performance Fractional-N PLLs”</i>
  (W. Wu, Samsung, 2024-11-10), slides 1–42. Built from the slides + first-principles models.
  Provenance tags: <span class="tag t-slide">slide pX</span>
  <span class="tag t-derive">derived</span> <span class="tag t-std">textbook</span>
  <span class="tag t-assume">assumption</span> <span class="tag t-need">needs citation</span>.
</div>
</main>
</div>
<button id="toTop" aria-label="Back to top">&#8593;</button>
<script src="assets/vendor/katex/katex.min.js"></script>
<script src="assets/vendor/katex/contrib/auto-render.min.js"></script>
<script src="assets/vendor/prism/prism-core.min.js"></script>
<script src="assets/vendor/prism/prism-clike.min.js"></script>
<script src="assets/vendor/prism/prism-python.min.js"></script>
{plotly}
<script src="assets/app/site.js"></script>
</body>
</html>
"""

PLOTLY_BASE = ('<script src="assets/vendor/plotly/plotly.min.js"></script>\n'
               '<script src="assets/app/pll.js"></script>\n'
               '<script src="assets/app/widgets.js"></script>')
EXT_BLOCK = ('<script src="assets/vendor/plotly/plotly.min.js"></script>\n'
             '<script src="assets/app/pll.js"></script>\n'
             '<script src="assets/app/pll_ext.js"></script>\n'
             '<script src="assets/app/widgets.js"></script>\n'
             '<script src="assets/app/widgets_ext.js"></script>')


def scripts_for(needs_plotly, needs_ext):
    if needs_ext:
        return EXT_BLOCK          # superset: base widgets + the v3 extension widgets
    if needs_plotly:
        return PLOTLY_BASE
    return ""


def nav_html(active_key):
    items = ['<nav class="side" aria-label="Site sections">',
             '<a class="brand" href="index.html" style="text-decoration:none">DTC-Assisted<br>Fractional-N PLL</a>',
             '<div class="sub">Interactive study of slides 1–42</div>']
    for key, fn, num, title, _np, _ext, _d in PAGES:
        cls = "active" if key == active_key else ""
        n = f'<span class="n">{num or "1"}</span>'
        items.append(f'<a class="{cls}" href="{fn}">{n}{title}</a>')
    items.append("</nav>")
    return "\n".join(items)


def btnrow_html(idx):
    prev_a = next_a = ""
    if idx > 0:
        _k, fn, _n, t, _p, _e, _d = PAGES[idx - 1]
        prev_a = f'<a href="{fn}">← {t}</a>'
    if idx < len(PAGES) - 1:
        _k, fn, _n, t, _p, _e, _d = PAGES[idx + 1]
        next_a = f'<a href="{fn}">{t} →</a>'
    return f'<div class="btnrow"><div>{prev_a}</div><div>{next_a}</div></div>'


def build():
    n = 0
    for idx, (key, fn, num, title, needs_plotly, needs_ext, desc) in enumerate(PAGES):
        frag_path = os.path.join(CONTENT, f"{key}.html")
        if os.path.exists(frag_path):
            with open(frag_path, encoding="utf-8") as f:
                body = f.read()
        else:
            body = f"<h1>{title}</h1><p><i>content pending</i></p>"
        html = HEAD.format(title=title, desc=desc, katex_css=KATEX_CSS, prism_css=PRISM_CSS,
                           nav=nav_html(key), body=body, btnrow=btnrow_html(idx),
                           plotly=scripts_for(needs_plotly, needs_ext))
        with open(os.path.join(HERE, fn), "w", encoding="utf-8") as f:
            f.write(html)
        n += 1
        tag = "  [+ext widgets]" if needs_ext else ("  [+plotly]" if needs_plotly else "")
        print(f"wrote {fn}{tag}")
    print(f"\n{n} pages built. Open site/index.html in a browser.")


if __name__ == "__main__":
    build()
