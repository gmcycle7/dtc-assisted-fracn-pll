"""
build_site.py — assemble the static teaching site.

Reads content fragments from site/_content/<key>.html and wraps each in a shared
shell (sidebar nav + KaTeX + Prism). Writes site/<key>.html (home -> index.html).

KaTeX is configured to accept $...$, $$...$$, \\(...\\), \\[...\\] so content fragments
can use any common delimiter. Prism highlights ```<pre><code class="language-python">```.

Usage:  python site/build_site.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(HERE, "_content")

# (key, filename, nav-number, nav-title)
PAGES = [
    ("home",         "index.html",        "",   "Home"),
    ("slides",       "slides.html",       "2",  "Slide-by-slide Map"),
    ("architecture", "architecture.html", "3",  "Architecture"),
    ("blocks",       "blocks.html",       "4",  "Block Models"),
    ("calibrations", "calibrations.html", "5",  "Calibrations"),
    ("frequency",    "frequency.html",    "6",  "Frequency-Domain"),
    ("timedomain",   "timedomain.html",   "7",  "Time-Domain Noise"),
    ("codewalk",     "codewalk.html",     "8",  "Code Walkthrough"),
    ("examples",     "examples.html",     "9",  "Numerical Examples"),
    ("references",   "references.html",   "10", "References"),
]

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · DTC-Assisted Frac-N PLL</title>
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css">
</head>
<body>
<div class="wrap">
{nav}
<main>
{body}
{btnrow}
<div class="footer">
  Teaching companion to <i>“Design of DTC-Assisted High Performance Fractional-N PLLs”</i>
  (W. Wu, Samsung, 2024-11-10), slides 1–42. Built from the slides + first-principles models.
  Every claim is tagged: <span class="tag t-slide">slide pX</span>
  <span class="tag t-derive">derived</span> <span class="tag t-std">textbook</span>
  <span class="tag t-assume">assumption</span> <span class="tag t-need">needs citation</span>.
</div>
</main>
</div>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-clike.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function(){{
  renderMathInElement(document.body, {{
    delimiters:[
      {{left:"$$",right:"$$",display:true}},
      {{left:"\\\\[",right:"\\\\]",display:true}},
      {{left:"$",right:"$",display:false}},
      {{left:"\\\\(",right:"\\\\)",display:false}}
    ],
    throwOnError:false
  }});
}});
</script>
</body>
</html>
"""


def nav_html(active_key):
    items = ['<nav class="side">',
             '<div class="brand">DTC-Assisted<br>Fractional-N PLL</div>',
             '<div class="sub">Interactive study of slides 1–42</div>']
    for key, fn, num, title in PAGES:
        cls = "active" if key == active_key else ""
        n = f'<span class="n">{num}</span>' if num else '<span class="n">1</span>'
        items.append(f'<a class="{cls}" href="{fn}">{n}{title}</a>')
    items.append("</nav>")
    return "\n".join(items)


def btnrow_html(idx):
    prev_a = next_a = ""
    if idx > 0:
        k, fn, n, t = PAGES[idx - 1]
        prev_a = f'<a href="{fn}">← {t}</a>'
    if idx < len(PAGES) - 1:
        k, fn, n, t = PAGES[idx + 1]
        next_a = f'<a href="{fn}">{t} →</a>'
    return f'<div class="btnrow"><div>{prev_a}</div><div>{next_a}</div></div>'


def build():
    n = 0
    for idx, (key, fn, num, title) in enumerate(PAGES):
        frag_path = os.path.join(CONTENT, f"{key}.html")
        if not os.path.exists(frag_path):
            body = f"<h1>{title}</h1><p><i>content pending</i></p>"
        else:
            with open(frag_path, encoding="utf-8") as f:
                body = f.read()
        html = HEAD.format(title=title, nav=nav_html(key), body=body,
                           btnrow=btnrow_html(idx))
        with open(os.path.join(HERE, fn), "w", encoding="utf-8") as f:
            f.write(html)
        n += 1
        print(f"wrote {fn}")
    print(f"\n{n} pages built. Open site/index.html in a browser.")


if __name__ == "__main__":
    build()
