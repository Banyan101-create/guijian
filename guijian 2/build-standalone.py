#!/usr/bin/env python3
"""Generate standalone.html from index.html + style.css + src/*.js.

The single-file build is the double-click version -- no server needed. It used
to be maintained by hand and drifted badly from src/; regenerate it with
`python3 build-standalone.py` after any change instead.
"""
import io, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
read = lambda p: io.open(os.path.join(here, p), encoding='utf-8').read()

html = read('index.html')

# inline the stylesheet
html = html.replace(
    '<link rel="stylesheet" href="style.css">',
    '<style>\n' + read('style.css').rstrip() + '\n</style>')

# inline every local script, leaving the three.js CDN tags alone
def inline(m):
    src = m.group(1)
    if src.startswith('http'):
        return m.group(0)
    return '<script>\n/* ---- ' + src + ' ---- */\n' + read(src).rstrip() + '\n</script>'

html = re.sub(r'<script src="([^"]+)"></script>', inline, html)

if 'src="src/' in html:
    sys.exit('a local script was not inlined')

io.open(os.path.join(here, 'standalone.html'), 'w', encoding='utf-8').write(html)
print('standalone.html: %d bytes' % len(html.encode('utf-8')))
