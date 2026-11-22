# actcraft.org

Project site for [ActCraft](https://github.com/actcraftlive/ActCraft): what it is and how far the
work has come. Served by GitHub Pages at <https://actcraft.org>.

## Privacy by construction

- No JavaScript, no cookies, no analytics, no trackers.
- Nothing is loaded from other servers: system fonts only, one local stylesheet, local images.
- A Content Security Policy (`default-src 'none'; img-src 'self'; style-src 'self'`) enforces
  this in the browser, and `referrer` is set to `no-referrer`.
- Impressum (`impressum.html`) and privacy statement (`datenschutz.html`) in German.

## How it works

`build.mjs` (Node, no dependencies) reads `ROADMAP.md` and the git history from a checkout of the
ActCraft repository and writes the site to `_site/`. The ActCraft repository is only read.

| Path | What it is |
|---|---|
| `build.mjs` | Generator: milestone overview, progress bars, roadmap details, recent changes |
| `content/` | Bodies of the Impressum, privacy and 404 pages |
| `site/` | Static files copied as they are: stylesheet, images, `CNAME`, `robots.txt` |
| `site.config.json` | Operator name, address and e-mail for Impressum and privacy page |
| `.github/workflows/pages.yml` | Builds and deploys on push, every six hours and on demand |

The build refuses to run while `site.config.json` is incomplete, so the site never goes out
without a full Impressum.

German milestone titles live in `MILESTONES_DE` in `build.mjs`. Each entry keeps the roadmap's
English wording it was written for; when the roadmap rewords a milestone, the page shows the
roadmap's text until the German entry is updated.

## Local preview

```sh
git clone https://github.com/actcraftlive/ActCraft.git actcraft
node build.mjs                      # add --allow-incomplete while site.config.json is empty
# open _site/index.html in a browser
```

## Deployment

Repository settings: Pages → Source "GitHub Actions", custom domain `actcraft.org`, "Enforce
HTTPS". DNS for `actcraft.org`: `A` records to `185.199.108.153`, `185.199.109.153`,
`185.199.110.153`, `185.199.111.153` (and `AAAA` to `2606:50c0:8000::153` … `8003::153`);
`www` as `CNAME` to `actcraftlive.github.io`.
