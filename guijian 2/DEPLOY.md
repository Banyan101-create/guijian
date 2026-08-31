# Deploying

## Option A — Vercel (recommended, free, what the reference site uses)

1. Create a GitHub repo and push this folder:
   ```
   git init
   git add .
   git commit -m "Parametric Chinese architecture generator"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Go to vercel.com → New Project → import the repo.
3. Framework preset: **Other**. Build command: leave blank. Output directory: `.`
4. Deploy. It's static, so there's nothing to build.

## Option B — GitHub Pages
Settings → Pages → Source: `main`, folder `/ (root)`. Live in ~1 minute.

## Option C — test locally first
```
python3 -m http.server 8000
```
then open http://localhost:8000

`http.server` sends no cache headers, so Chrome applies heuristic caching and will
happily keep running an old `src/*.js` after you edit it — a plain refresh does not
always revalidate. If a change seems to have no effect, hard-refresh (⌘⇧R / Ctrl-F5).
Deployed builds are unaffected: `vercel.json` sets `must-revalidate` on every path.

## Notes
- `index.html` + `src/` is the modular version, and the one to edit.
- `standalone.html` is the single-file version — works by double-clicking, no
  server. It is **generated**, not hand-edited: run `python3 build-standalone.py`
  after any change to inline `style.css` and `src/*.js` back into it.
- Three.js loads from CDN, so there are no dependencies to install.
