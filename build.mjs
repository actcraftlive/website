#!/usr/bin/env node
// Builds the static site for actcraft.org into _site/.
//
// Inputs:
//   site/            static files copied as they are (CSS, images, CNAME, robots.txt)
//   content/         page bodies wrapped in the shared layout
//   site.config.json operator details for the Impressum and the privacy page
//   an ActCraft checkout (--source, default ./actcraft): ROADMAP.md and the git history are
//   read from it, nothing in it is changed
//
// Usage: node build.mjs [--source DIR] [--out DIR] [--allow-incomplete]
// No dependencies; the generated pages contain no JavaScript and load nothing from elsewhere.

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_URL = 'https://github.com/actcraftlive/ActCraft';

// ---------------------------------------------------------------------------------------------
// Arguments

function parseArgs(argv) {
  const opts = { source: join(ROOT, 'actcraft'), out: join(ROOT, '_site'), allowIncomplete: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') opts.source = resolve(argv[++i]);
    else if (a === '--out') opts.out = resolve(argv[++i]);
    else if (a === '--allow-incomplete') opts.allowIncomplete = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

// ---------------------------------------------------------------------------------------------
// Helpers

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Every character as a numeric entity: keeps the address readable for people, not for simple scrapers.
const entities = (s) => [...s].map((c) => `&#${c.codePointAt(0)};`).join('');

const dateDe = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('de-DE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

// Small Markdown subset used in the roadmap: `code`, **bold**, [text](url).
function inlineMd(text) {
  const parts = text.split(/(`[^`]+`)/);
  return parts
    .map((p) => {
      if (p.startsWith('`') && p.endsWith('`') && p.length > 1) return `<code>${esc(p.slice(1, -1))}</code>`;
      let h = esc(p);
      h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
        let href = url;
        if (!/^https?:\/\//.test(url)) {
          if (url.includes(':')) return label; // no other schemes
          href = `${REPO_URL}/blob/main/${url.replace(/^\.?\//, '')}`;
        }
        return `<a href="${href}">${label}</a>`;
      });
      return h;
    })
    .join('');
}

function git(source, args) {
  return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
}

// ---------------------------------------------------------------------------------------------
// Roadmap

const STATUS = { '✅': 'done', '🔶': 'partial', '⬜': 'planned' };
const STATUS_RE = /(✅|🔶|⬜)/u;

// German titles for the milestones. `en` is the roadmap's wording when the German text was
// written; when the roadmap changes its wording the page shows the roadmap's text instead, so
// the German text can never describe something the roadmap no longer says.
const MILESTONES_DE = {
  M0: { title: 'Fundament', text: 'Befehle, Kommandozeile, Steuerkanal, MCP und die automatische Prüfung jedes Builds', en: 'Foundation: commands, CLI, control channel, MCP, build gate' },
  M1: { title: 'Audio und Bibliothek', text: 'Audio-Engine, Mixer, Ausgänge, Metronom, Bibliothek, Playlists und Warteschlange', en: 'Audio engine, mixer, outputs, metronome, library, playlists, queue' },
  M2: { title: 'Songtexte, Regionen, Noten', text: 'Regionen, Songtexte mit Akkorden, Noten als PDF, Texteditor und zweiter Bildschirm', en: 'Regions, lyrics and chords, sheet music (PDF), lyrics editor, second screen' },
  M3: { title: 'MIDI und Fernsteuerung', text: 'MIDI ein, aus und Sync, Makros, Fernsteuer-Aktionen und frei belegbare Bedienelemente', en: 'MIDI in/out/sync, macros, remote actions, assignable on-screen controls' },
  M4: { title: 'Licht: DMX-Ausgabe', text: 'DMX über Art-Net, sACN und USB, Scheinwerfer und Patch, Gerätebibliothek, DMX-Monitor', en: 'DMX output (Art-Net, sACN, USB), fixtures and patch, fixture library, DMX monitor' },
  M5: { title: 'Licht: Programmieren', text: '2D-Bühnenvorschau, Programmierung, Presets, Sequenzen und Effekt-Engine', en: '2D stage preview, programming, presets, sequences, effects engine' },
  M6: { title: 'Licht: Cues', text: 'Cues, Cue-Listen, Bedienseiten, Blind und Freeze, Beat-Sync', en: 'Cues, cue lists, control pages, blind and freeze, beat sync' },
  M7: { title: 'Eine Show', text: 'Lichtspur auf der Zeitachse des Songs, eine gemeinsame Uhr für Ton und Licht', en: 'One show: lighting lane on the song timeline, shared clock' },
  M8: { title: 'Netzwerk und Ausfallsicherheit', text: 'Band-Netzwerk, Backup-Rechner, OSC, DMX-Eingang, Joystick und Philips Hue', en: 'Band network, backup machine, OSC, DMX input, joystick, Hue' },
  M9: { title: 'Installer', text: 'Installationspakete: MSI und ZIP, DMG, AppImage, DEB, RPM und Tarball', en: 'Installers: MSI and zip, DMG, AppImage/DEB/RPM/tarball' },
};

// Roadmap section headings that are not a single milestone; unknown headings stay as they are.
const SECTION_TITLES_DE = {
  Languages: 'Sprachen',
  'M4–M6 Lighting': 'M4–M6 Licht',
  'M7–M9': 'M7–M9 Eine Show, Netzwerk, Installer',
};

function sectionTitle(s) {
  if (s.from !== null && s.from === s.to && MILESTONES_DE[`M${s.from}`]) return `M${s.from} ${MILESTONES_DE[`M${s.from}`].title}`;
  return SECTION_TITLES_DE[s.heading] ?? s.heading;
}

function parseRoadmap(md) {
  const lines = md.split(/\r?\n/);
  const milestones = [];
  const sections = [];
  let cur = null;
  let inItem = false;

  for (const line of lines) {
    const row = line.match(/^\|\s*(M\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (row) {
      const mark = row[3].match(STATUS_RE);
      milestones.push({
        id: row[1],
        scope: row[2],
        status: mark ? STATUS[mark[1]] : 'planned',
        inProgress: /progress/i.test(row[3]),
      });
      continue;
    }
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      const mark = h[1].match(STATUS_RE);
      const heading = h[1].replace(STATUS_RE, '').replace(/\s+in progress\s*$/i, '').trim();
      const range = heading.match(/^M(\d+)(?:[–-]M(\d+))?\b/);
      cur = {
        heading,
        status: mark ? STATUS[mark[1]] : null,
        from: range ? Number(range[1]) : null,
        to: range ? Number(range[2] ?? range[1]) : null,
        items: [],
        text: [],
      };
      sections.push(cur);
      inItem = false;
      continue;
    }
    if (!cur) continue;
    const item = line.match(/^-\s+(✅|🔶|⬜)\s*(.*)$/u);
    if (item) {
      cur.items.push({ status: STATUS[item[1]], text: item[2].trim() });
      inItem = true;
    } else if (inItem && /^\s{2,}\S/.test(line)) {
      cur.items[cur.items.length - 1].text += ` ${line.trim()}`;
    } else if (line.trim() === '') {
      inItem = false;
    } else {
      inItem = false;
      cur.text.push(line.trim());
    }
  }

  // Paragraphs: join consecutive text lines.
  for (const s of sections) s.paragraph = s.text.join(' ');

  // Items per milestone: only from a section that covers exactly that milestone.
  for (const m of milestones) {
    const n = Number(m.id.slice(1));
    const sec = sections.find((s) => s.from === n && s.to === n);
    m.items = sec ? sec.items : [];
  }
  return { milestones, sections };
}

function progressOf(items) {
  if (!items.length) return null;
  const done = items.filter((i) => i.status === 'done').length;
  const partial = items.filter((i) => i.status === 'partial').length;
  return { done, partial, total: items.length, pct: Math.round(((done + partial / 2) / items.length) * 100) };
}

// Progress bar as SVG: geometry lives in attributes, so the strict CSP needs no inline styles.
function bar(p, label, big = false) {
  const done = (p.done / p.total) * 100;
  const partial = (p.partial / p.total) * 100;
  return `<svg class="bar${big ? ' bar-big' : ''}" viewBox="0 0 100 1" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">` +
    `<rect class="bar-rest" width="100" height="1"/>` +
    `<rect class="bar-done" width="${done.toFixed(2)}" height="1"/>` +
    `<rect class="bar-partial" x="${done.toFixed(2)}" width="${partial.toFixed(2)}" height="1"/></svg>`;
}

function statusLabel(m) {
  if (m.status === 'done') return 'Fertig';
  if (m.status === 'partial') return m.inProgress ? 'In Arbeit' : 'Teilweise fertig';
  return 'Geplant';
}

// ---------------------------------------------------------------------------------------------
// Git history

function readHistory(source) {
  const log = git(source, ['log', '--no-merges', '-n', '15', '--format=%H%x1f%cs%x1f%s']);
  const recent = log
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, date, subject] = l.split('\x1f');
      const pr = subject.match(/\(#(\d+)\)\s*$/);
      return {
        hash,
        date,
        subject: subject.replace(/\s*\(#\d+\)\s*$/, ''),
        url: pr ? `${REPO_URL}/pull/${pr[1]}` : `${REPO_URL}/commit/${hash}`,
        ref: pr ? `#${pr[1]}` : hash.slice(0, 7),
      };
    });
  const subjects = git(source, ['log', '--format=%s']).split('\n');
  const prs = subjects
    .map((s) => s.match(/\(#(\d+)\)\s*$/) || s.match(/^Merge pull request #(\d+)/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return {
    recent,
    commits: Number(git(source, ['rev-list', '--count', 'HEAD'])),
    pullRequests: prs.length ? Math.max(...prs) : 0,
    first: git(source, ['log', '--reverse', '--format=%cs']).split('\n')[0],
    last: git(source, ['log', '-1', '--format=%cs']),
    roadmapDate: git(source, ['log', '-1', '--format=%cs', '--', 'ROADMAP.md']),
  };
}

// ---------------------------------------------------------------------------------------------
// Layout

function layout({ title, description, path, body, base = '', active = '' }) {
  const nav = [
    ['fortschritt', 'Fortschritt', `${base}index.html#fortschritt`],
    ['funktionen', 'Funktionen', `${base}index.html#funktionen`],
    ['aenderungen', 'Änderungen', `${base}index.html#aenderungen`],
  ];
  const fullTitle = title ? `${title} – ActCraft` : 'ActCraft – Showsteuerung für Live-Musiker';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0d0e10">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="https://actcraft.org/${path}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://actcraft.org/${path}">
<meta property="og:image" content="https://actcraft.org/img/actcraft-logo.jpg">
<meta property="og:locale" content="de_DE">
<link rel="icon" type="image/png" sizes="32x32" href="${base}img/favicon-32.png">
<link rel="apple-touch-icon" href="${base}img/apple-touch-icon.png">
<link rel="stylesheet" href="${base}style.css">
</head>
<body>
<a class="skip" href="#inhalt">Zum Inhalt springen</a>
<header class="top">
  <div class="wrap top-inner">
    <a class="brand" href="${base}index.html"><img src="${base}img/actcraft-icon-96.png" alt="" width="36" height="36">ActCraft</a>
    <nav aria-label="Hauptnavigation">
${nav.map(([key, label, href]) => `      <a href="${href}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`).join('\n')}
      <a href="${REPO_URL}" class="ext">GitHub</a>
    </nav>
  </div>
</header>
<main id="inhalt">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-inner">
    <p class="foot-brand"><img src="${base}img/actcraft-icon-96.png" alt="" width="28" height="28"><span>ActCraft · Open Source unter MIT oder Apache-2.0</span></p>
    <nav aria-label="Rechtliches">
      <a href="${base}impressum.html">Impressum</a>
      <a href="${base}datenschutz.html">Datenschutz</a>
      <a href="${REPO_URL}">Quellcode</a>
    </nav>
    <p class="foot-note">Diese Seite setzt keine Cookies, enthält keine Tracker und lädt nichts von fremden Servern.</p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Home page

const FEATURES = [
  ['Multitrack-Playbacks', 'WAV, AIFF, FLAC, MP3, Ogg, Opus und M4A. Bis zu 64 Spuren pro Song laufen sample-genau synchron; Dateien werden im Hintergrund dekodiert, das Fenster friert nie ein.'],
  ['Mixer und Ausgänge', 'Lautstärke, Panorama, 4-Band-EQ, Mute und Farbe pro Spur, 16 Ausgangsbusse auf die Ausgänge des Audio-Interfaces, sechs benannte Mute-Gruppen.'],
  ['Metronom und Tempo', 'Klick auf eigenem Bus, Einzähler pro Song, Start auf dem Schlag, rein optischer Modus. Tempo wird erkannt, getappt oder eingetippt; Taktraster auf der Wellenform.'],
  ['Bibliothek und Setlisten', 'Suche mit AND, OR, NOT, Feldern und Phrasen. Playlists mit Sets, Smart-Playlists, Warteschlange und Verlauf; Autoplay, Crossfade und Fade-out.'],
  ['Songtexte und Akkorde', 'Akkorde im ChordPro-Format, Transponieren und Kapo. Zeitcodierte Zeilen laufen mit der Musik mit – auch in einem eigenen Fenster für den zweiten Bildschirm.'],
  ['Regionen und Ansagen', 'Bis zu 64 Regionen pro Song zum Loopen, Überspringen und Anhalten, live anspringbar. Die Computerstimme sagt Songtitel und Songteile an: „Chorus“, „End 3 2 1“.'],
  ['Noten als PDF', 'Eine PDF pro Song im Reiter Noten: Seiten werden im Hintergrund gerendert, mit Zoom, invertierten Farben für dunkle Bühnen und Mitscrollen.'],
  ['Eine Show-Datei', 'Alles steckt in einer .actcraft-Datei, ältere Dateien laden weiter. Show-Pakete nehmen alle Audiodateien mit – für Backup oder den Umzug auf einen anderen Rechner.'],
  ['Fernsteuerung', 'Jede Aktion ist ein Befehl: aus dem Fenster, von der Kommandozeile, über einen lokalen JSON-Kanal oder von einem KI-Assistenten über MCP.'],
];

function renderMilestone(m) {
  const de = MILESTONES_DE[m.id];
  const useDe = de && de.en === m.scope;
  const title = useDe ? de.title : m.id;
  const text = useDe ? esc(de.text) : inlineMd(m.scope);
  const p = progressOf(m.items);
  const progress = p
    ? `
        ${bar(p, `${p.done} von ${p.total} Punkten fertig, ${p.partial} teilweise`)}
        <p class="bar-note">${p.done} von ${p.total} Punkten fertig${p.partial ? `, ${p.partial} teilweise` : ''}</p>`
    : '';
  return `      <li class="ms ms-${m.status}">
        <div class="ms-head">
          <span class="ms-id">${esc(m.id)}</span>
          <h3>${esc(title)}</h3>
          <span class="chip chip-${m.status}">${statusLabel(m)}</span>
        </div>
        <p class="ms-text">${text}</p>${progress}
      </li>`;
}

function renderSectionDetails(s) {
  const title = sectionTitle(s);
  const items = s.items.length
    ? `<ul class="items">
${s.items.map((i) => `          <li class="it-${i.status}"><span class="it-mark" aria-label="${{ done: 'fertig', partial: 'teilweise', planned: 'offen' }[i.status]}"></span><span lang="en">${inlineMd(i.text)}</span></li>`).join('\n')}
        </ul>`
    : '';
  const para = s.paragraph ? `<p lang="en">${inlineMd(s.paragraph)}</p>` : '';
  const p = progressOf(s.items);
  const count = p ? `<span class="sum-count">${p.done}/${p.total}</span>` : '';
  return `      <details class="detail">
        <summary><span>${esc(title)}</span>${count}</summary>
        ${items}${para}
      </details>`;
}

function renderHome(roadmap, hist) {
  const { milestones, sections } = roadmap;
  const allItems = sections.flatMap((s) => s.items);
  const total = progressOf(allItems);
  const msDone = milestones.filter((m) => m.status === 'done').length;
  const current = milestones.find((m) => m.inProgress) ?? milestones.find((m) => m.status === 'partial');
  const currentDe = current && MILESTONES_DE[current.id];

  const stats = [
    [`${msDone} von ${milestones.length}`, 'Meilensteinen fertig'],
    [`${total.done} von ${total.total}`, 'Roadmap-Punkten erledigt'],
    [String(hist.pullRequests), 'Pull Requests'],
    [dateDe(hist.last).replace(/ \d{4}$/, ''), 'letzte Änderung'],
  ];

  const detailSections = sections.filter((s) => s.items.length || s.paragraph);

  return `<section class="hero">
  <div class="wrap hero-inner">
    <div class="hero-text">
      <p class="eyebrow">Open Source · Windows, macOS, Linux</p>
      <h1>Showsteuerung für Live-Musiker.</h1>
      <p class="lead">ActCraft spielt deine Multitrack-Playbacks und steuert bald auch dein Bühnenlicht – aus einem Programm, mit einer Show-Datei, auf einer gemeinsamen Uhr. Song, Audio, Text und Lichtcues gehören zusammen.</p>
      <p class="status-line"><span class="dot"></span>Frühe Phase: Playback läuft, Songtexte, MIDI und Licht entstehen gerade.${current ? ` Aktuell in Arbeit: <strong>${esc(current.id)}${currentDe ? ` ${esc(currentDe.title)}` : ''}</strong>.` : ''}</p>
      <p class="actions"><a class="btn btn-primary" href="#fortschritt">Zum Fortschritt</a><a class="btn" href="${REPO_URL}">Quellcode auf GitHub</a></p>
    </div>
    <img class="hero-logo" src="img/actcraft-logo.jpg" alt="ActCraft-Logo: ein gezeichneter Oktopus" width="512" height="512">
  </div>
</section>

<section class="stats" aria-label="Kennzahlen">
  <div class="wrap">
    <dl class="stat-grid">
${stats.map(([v, l]) => `      <div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
    </dl>
  </div>
</section>

<section id="fortschritt" class="block">
  <div class="wrap">
    <h2>Fortschritt</h2>
    <p class="section-lead">Die Meilensteine laufen der Reihe nach. Jeder endet erst, wenn alle automatischen Prüfungen grün sind. Stand der Roadmap: ${dateDe(hist.roadmapDate)}.</p>
    <div class="overall" aria-label="Gesamtfortschritt">
      ${bar(total, `${total.done} von ${total.total} Roadmap-Punkten fertig, ${total.partial} teilweise`, true)}
      <p class="legend"><span class="lg lg-done"></span>fertig ${total.done} <span class="lg lg-partial"></span>teilweise ${total.partial} <span class="lg lg-planned"></span>offen ${total.total - total.done - total.partial}</p>
    </div>
    <ol class="milestones">
${milestones.map(renderMilestone).join('\n')}
    </ol>

    <h3 class="sub">Alle Punkte im Detail</h3>
    <p class="section-lead small">Direkt aus der <a href="${REPO_URL}/blob/main/ROADMAP.md">Roadmap im Repository</a> übernommen, daher im englischen Original.</p>
    <div class="details">
${detailSections.map(renderSectionDetails).join('\n')}
    </div>
  </div>
</section>

<section id="funktionen" class="block">
  <div class="wrap">
    <h2>Was heute schon geht</h2>
    <p class="section-lead">ActCraft ist eine native Desktop-App, geschrieben in Rust. Die Oberfläche gibt es auf Englisch und Deutsch.</p>
    <div class="cards">
${FEATURES.map(([t, d]) => `      <article class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join('\n')}
    </div>
    <div class="next">
      <h3>Was noch kommt</h3>
      <p>MIDI und Fernsteuerung, dann das Licht: DMX über Art-Net, sACN und USB, Scheinwerfer, Effekte und Cues, die dem Tempo des Songs folgen. Am Ende steht eine Show mit Lichtspur auf der Zeitachse, ein Band-Netzwerk mit Backup-Rechner und fertige Installer für alle Systeme.</p>
    </div>
  </div>
</section>

<section id="aenderungen" class="block">
  <div class="wrap">
    <h2>Letzte Änderungen</h2>
    <p class="section-lead">${hist.commits} Commits seit dem ${dateDe(hist.first)}. Die neuesten Einträge, wie sie im Repository stehen:</p>
    <ol class="changes">
${hist.recent.map((c) => `      <li><time datetime="${c.date}">${dateDe(c.date)}</time><a href="${c.url}"><span lang="en">${esc(c.subject)}</span> <span class="ref">${esc(c.ref)}</span></a></li>`).join('\n')}
    </ol>
    <p><a class="more" href="${REPO_URL}/commits/main">Alle Änderungen auf GitHub</a></p>
  </div>
</section>

<section class="block">
  <div class="wrap mitmachen">
    <h2>Selbst ausprobieren</h2>
    <p>Fertige Installer kommen mit Meilenstein M9. Bis dahin lässt sich ActCraft mit einer Rust-Toolchain (1.95 oder neuer) aus dem Quellcode bauen:</p>
    <pre><code>git clone ${REPO_URL}.git
cd ActCraft
cargo run -p actcraft --release --bin actcraft</code></pre>
    <p>Fehler, Ideen und Pull Requests sind willkommen – Hinweise dazu stehen im <a href="${REPO_URL}#readme">README</a> des Projekts.</p>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------------------------
// Legal pages

// The e-mail address is stored in two parts so the public repository holds no harvestable address.
const REQUIRED = ['name', 'street', 'postcode_city', 'email_user', 'email_domain'];

function fillLegal(html, config, allowIncomplete) {
  const missing = REQUIRED.filter((k) => !config[k] || !String(config[k]).trim());
  if (missing.length && !allowIncomplete) {
    throw new Error(
      `site.config.json lacks ${missing.join(', ')}: the Impressum must be complete before the site is published ` +
        '(pass --allow-incomplete for a local preview).',
    );
  }
  const val = (k) => (config[k] && String(config[k]).trim()) || `[${k} fehlt]`;
  // Written out in words, no mailto link: readable for people, useless for address harvesters.
  const local = val('email_user');
  const domain = val('email_domain');
  const mail = entities(
    `${local} [das At-Zeichen, wie es auf der deutschen Tastatur mit AltGr + Q entsteht] ` +
      domain.split('.').join(' [ein einfacher Punkt] '),
  );
  return html
    .replace(/\{\{name\}\}/g, esc(val('name')))
    .replace(/\{\{street\}\}/g, esc(val('street')))
    .replace(/\{\{postcode_city\}\}/g, esc(val('postcode_city')))
    .replace(/\{\{email\}\}/g, mail);
}

// ---------------------------------------------------------------------------------------------
// Main

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const roadmapPath = join(opts.source, 'ROADMAP.md');
  if (!existsSync(roadmapPath)) throw new Error(`no ROADMAP.md in ${opts.source}: check out ActCraft there or pass --source`);

  const roadmap = parseRoadmap(readFileSync(roadmapPath, 'utf8'));
  if (!roadmap.milestones.length) throw new Error('ROADMAP.md: no milestone table found');
  const hist = readHistory(opts.source);
  const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));

  rmSync(opts.out, { recursive: true, force: true });
  mkdirSync(opts.out, { recursive: true });
  cpSync(join(ROOT, 'site'), opts.out, { recursive: true });

  const pages = [
    {
      file: 'index.html',
      path: '',
      title: '',
      description: 'ActCraft spielt Multitrack-Playbacks und steuert Bühnenlicht aus einer Show-Datei. Open Source für Windows, macOS und Linux – hier steht, wie weit die Arbeit ist.',
      body: renderHome(roadmap, hist),
    },
    {
      file: 'impressum.html',
      path: 'impressum.html',
      title: 'Impressum',
      description: 'Impressum von actcraft.org',
      body: fillLegal(readFileSync(join(ROOT, 'content', 'impressum.html'), 'utf8'), config, opts.allowIncomplete),
    },
    {
      file: 'datenschutz.html',
      path: 'datenschutz.html',
      title: 'Datenschutz',
      description: 'Datenschutzerklärung von actcraft.org: keine Cookies, keine Tracker, keine fremden Inhalte.',
      body: fillLegal(readFileSync(join(ROOT, 'content', 'datenschutz.html'), 'utf8'), config, opts.allowIncomplete),
    },
    {
      // Served for every unknown path, so its links are absolute.
      file: '404.html',
      path: '404.html',
      title: 'Seite nicht gefunden',
      description: 'Diese Seite gibt es nicht.',
      base: '/',
      body: readFileSync(join(ROOT, 'content', '404.html'), 'utf8'),
    },
  ];

  for (const p of pages) writeFileSync(join(opts.out, p.file), layout(p));
  console.log(
    `built ${pages.length} pages into ${opts.out}: ${roadmap.milestones.length} milestones, ` +
      `${roadmap.sections.reduce((n, s) => n + s.items.length, 0)} roadmap items, ${hist.commits} commits`,
  );
}

main();
