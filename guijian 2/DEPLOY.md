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

## Notes
- `standalone.html` is the single-file version — works by double-clicking, no server.
- `index.html` + `src/` is the modular version for ongoing development.
- Keep both in sync, or delete `standalone.html` once you're working in `src/`.
- Three.js loads from CDN, so there are no dependencies to install.
