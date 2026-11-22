# actcraft.org

Project site for [ActCraft](https://github.com/actcraftlive/ActCraft): what it is and how far the
work has come. Served by GitHub Pages at <https://actcraft.org>, in English (`/`) and German (`/de/`).

## Privacy by construction

- No JavaScript, no cookies, no analytics, no trackers.
- Nothing is loaded from other servers: system fonts only, one local stylesheet, local images.
- A Content Security Policy (`default-src 'none'; img-src 'self'; style-src 'self'`) enforces
  this in the browser, and `referrer` is set to `no-referrer`.
- Links to other sites (GitHub and the like) open in a new tab with `rel="noopener noreferrer"`
  and say so to screen readers.
- The language switch (EN / DE in the header) is a plain link to the same page in the other
  language. Nothing is stored and there is no automatic redirect.
- Legal notice (`impressum.html`) and privacy policy (`datenschutz.html`) in both languages; the
  German versions under `/de/` are the legally binding ones.

## Pages

| English | German |
|---|---|
| `/index.html` | `/de/index.html` |
| `/impressum.html` (Legal notice) | `/de/impressum.html` (Impressum) |
| `/datenschutz.html` (Privacy policy) | `/de/datenschutz.html` (Datenschutzerklärung) |
| `/404.html` (both languages) | |
| `/sitemap.xml` (every page in both languages, with `hreflang` links; named in `robots.txt`) | |

## How it works

`build.mjs` (Node, no dependencies) reads `ROADMAP.md` and the git history from a checkout of the
ActCraft repository and writes the site. The ActCraft repository is only read. Without a checkout
it falls back to `data/snapshot.json`, a copy of the same data, so the site also builds offline.

| Path | What it is |
|---|---|
| `build.mjs` | Generator: milestone overview, progress bars, roadmap details, recent changes, sitemap; all texts in English and German |
| `content/en/`, `content/de/` | Bodies of the legal pages per language |
| `content/404.html` | The bilingual "not found" page |
| `site/` | Static files copied as they are: stylesheet, images, `CNAME`, `robots.txt` |
| `site.config.json` | Operator name, address and e-mail (in two parts) for the legal pages |
| `data/snapshot.json` | Roadmap and history snapshot for builds without a checkout |
| `.github/workflows/pages.yml` | Builds and deploys on push, every six hours and on demand |

The build refuses to run while `site.config.json` is incomplete, so the site never goes out
without a full legal notice.

Milestone titles live in `MILESTONES` in `build.mjs`. Each entry keeps the roadmap's English
wording it was written for; when the roadmap rewords a milestone, the page shows the roadmap's
text until the entry is updated.

## Local preview

```sh
git clone https://github.com/actcraftlive/ActCraft.git actcraft
npm run build          # writes dist/; add -- --allow-incomplete while site.config.json is empty
npm run snapshot       # optional: refresh data/snapshot.json from the checkout
# open dist/index.html in a browser
```

## Publishing a change

```sh
npm run build                 # check that it builds
git add -A
git commit -m "Describe the change"
git push origin main          # GitHub Actions builds with live ActCraft data and deploys
```

The workflow also runs every six hours, so new work in the ActCraft repository appears on the
site without a push here. `data/snapshot.json` is only used for builds without a checkout.

## Deployment

Repository settings: Pages → Source "GitHub Actions", custom domain `actcraft.org`, "Enforce
HTTPS". DNS for `actcraft.org`: `A` records to `185.199.108.153`, `185.199.109.153`,
`185.199.110.153`, `185.199.111.153` (and `AAAA` to `2606:50c0:8000::153` … `8003::153`);
`www` as `CNAME` to `actcraftlive.github.io`.
