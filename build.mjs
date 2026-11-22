#!/usr/bin/env node
// Builds the static site for actcraft.org: English at the top level, German under /de/.
//
// Inputs:
//   site/              static files copied as they are (CSS, images, CNAME, robots.txt)
//   content/<lang>/    page bodies of the legal pages, wrapped in the shared layout
//   content/404.html   the bilingual "not found" page
//   site.config.json   operator details for the legal notice and the privacy page
//   an ActCraft checkout (--source, default ./actcraft): ROADMAP.md and the git history are read
//   from it, nothing in it is changed. Without a checkout, data/snapshot.json is used instead.
//
// Usage:
//   node build.mjs [--source DIR] [--out DIR] [--allow-incomplete]
//   node build.mjs --source DIR --write-snapshot data/snapshot.json
// No dependencies; the generated pages contain no JavaScript and load nothing from elsewhere.

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_URL = 'https://github.com/actcraftlive/ActCraft';
const SITE_URL = 'https://actcraft.org/';

// ---------------------------------------------------------------------------------------------
// Arguments

function parseArgs(argv) {
  const opts = { source: null, out: join(ROOT, 'dist'), allowIncomplete: false, writeSnapshot: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') opts.source = resolve(argv[++i]);
    else if (a === '--out') opts.out = resolve(argv[++i]);
    else if (a === '--allow-incomplete') opts.allowIncomplete = true;
    else if (a === '--write-snapshot') opts.writeSnapshot = resolve(argv[++i]);
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

const formatDate = (iso, lang) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', {
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
// Texts in both languages

const STATUS = { '✅': 'done', '🔶': 'partial', '⬜': 'planned' };
const STATUS_RE = /(✅|🔶|⬜)/u;

// Short titles and descriptions of the milestones. `en` is the roadmap's wording when the text was
// written; when the roadmap changes its wording the page shows the roadmap's text instead, so the
// page can never describe something the roadmap no longer says.
const MILESTONES = {
  M0: {
    en: 'Foundation: commands, CLI, control channel, MCP, build gate',
    title: { en: 'Foundation', de: 'Fundament' },
    text: {
      en: 'Commands, command line, control channel, MCP and an automatic check of every build',
      de: 'Befehle, Kommandozeile, Steuerkanal, MCP und die automatische Prüfung jedes Builds',
    },
  },
  M1: {
    en: 'Audio engine, mixer, outputs, metronome, library, playlists, queue',
    title: { en: 'Audio and library', de: 'Audio und Bibliothek' },
    text: {
      en: 'Audio engine, mixer, outputs, metronome, library, playlists and queue',
      de: 'Audio-Engine, Mixer, Ausgänge, Metronom, Bibliothek, Playlists und Warteschlange',
    },
  },
  M2: {
    en: 'Regions, lyrics and chords, sheet music (PDF, MusicXML notes and tab), lyrics editor, second screen',
    title: { en: 'Lyrics, regions, sheet music', de: 'Songtexte, Regionen, Noten' },
    text: {
      en: 'Regions, lyrics with chords, sheet music as PDF and as MusicXML notes and tablature, lyrics editor and a second screen',
      de: 'Regionen, Songtexte mit Akkorden, Noten als PDF und als MusicXML-Notensatz mit Tabulatur, Texteditor und zweiter Bildschirm',
    },
  },
  M3: {
    en: 'MIDI in/out/sync, macros, remote actions, assignable on-screen controls',
    title: { en: 'MIDI and remote control', de: 'MIDI und Fernsteuerung' },
    text: {
      en: 'MIDI in, out and sync, macros, remote actions and assignable on-screen controls',
      de: 'MIDI ein, aus und Sync, Makros, Fernsteuer-Aktionen und frei belegbare Bedienelemente',
    },
  },
  M4: {
    en: 'DMX output (Art-Net, sACN, USB), fixtures and patch, fixture library, DMX monitor',
    title: { en: 'Lighting: DMX output', de: 'Licht: DMX-Ausgabe' },
    text: {
      en: 'DMX over Art-Net, sACN and USB, fixtures and patch, fixture library, DMX monitor',
      de: 'DMX über Art-Net, sACN und USB, Scheinwerfer und Patch, Gerätebibliothek, DMX-Monitor',
    },
  },
  M5: {
    en: '2D stage preview, programming, presets, sequences, effects engine',
    title: { en: 'Lighting: programming', de: 'Licht: Programmieren' },
    text: {
      en: '2D stage preview, programming, presets, sequences and an effects engine',
      de: '2D-Bühnenvorschau, Programmierung, Presets, Sequenzen und Effekt-Engine',
    },
  },
  M6: {
    en: 'Cues, cue lists, control pages, blind and freeze, beat sync',
    title: { en: 'Lighting: cues', de: 'Licht: Cues' },
    text: {
      en: 'Cues, cue lists, control pages, blind and freeze, beat sync',
      de: 'Cues, Cue-Listen, Bedienseiten, Blind und Freeze, Beat-Sync',
    },
  },
  M7: {
    en: 'One show: lighting lane on the song timeline, shared clock',
    title: { en: 'One show', de: 'Eine Show' },
    text: {
      en: 'A lighting lane on the song timeline, one shared clock for sound and light',
      de: 'Lichtspur auf der Zeitachse des Songs, eine gemeinsame Uhr für Ton und Licht',
    },
  },
  M8: {
    en: 'Band network, backup machine, OSC, DMX input, joystick, Hue',
    title: { en: 'Network and failover', de: 'Netzwerk und Ausfallsicherheit' },
    text: {
      en: 'Band network, backup machine, OSC, DMX input, joystick and Philips Hue',
      de: 'Band-Netzwerk, Backup-Rechner, OSC, DMX-Eingang, Joystick und Philips Hue',
    },
  },
  M9: {
    en: 'Installers: MSI and zip, DMG, AppImage/DEB/RPM/tarball',
    title: { en: 'Installers', de: 'Installer' },
    text: {
      en: 'Installation packages: MSI and ZIP, DMG, AppImage, DEB, RPM and tarball',
      de: 'Installationspakete: MSI und ZIP, DMG, AppImage, DEB, RPM und Tarball',
    },
  },
};

// Roadmap section headings that are not a single milestone; unknown headings stay as they are.
const SECTION_TITLES = {
  en: { 'M7–M9': 'M7–M9 One show, network, installers' },
  de: {
    Languages: 'Sprachen', 'M4–M6 Lighting': 'M4–M6 Licht', 'M7–M9': 'M7–M9 Eine Show, Netzwerk, Installer',
    'Next up': 'Als Nächstes', 'Quality and open questions': 'Qualität und offene Fragen',
  },
};

const FEATURES = {
  en: [
    ['Multitrack playback', 'WAV, AIFF, FLAC, MP3, Ogg, Opus and M4A. Up to 64 tracks per song run sample-accurately in sync; files are decoded in the background, so the window never freezes.'],
    ['Mixer and outputs', 'Volume, pan, 4-band EQ, mute and colour per track, 16 output buses to the outputs of your audio interface, six labelled mute groups.'],
    ['Metronome and tempo', 'Click on its own bus, count-in per song, start on the beat, a visual-only mode. Tempo is detected, tapped or typed in; a beat grid on the waveform.'],
    ['Library and set lists', 'Search with AND, OR, NOT, fields and phrases. Playlists with sets, smart playlists, queue and history; autoplay, crossfade and fade-out.'],
    ['Lyrics and chords', 'Chords in ChordPro format, transpose and capo. Timecoded lines follow the music – also in a window of their own for a second screen.'],
    ['Regions and spoken cues', 'Up to 64 regions per song to loop, skip and stop, jumpable live. The computer\'s voice announces song titles and song parts: “Chorus”, “End 3 2 1”.'],
    ['Sheet music and tablature', 'A PDF per song with zoom, inverted colours for dark stages and scrolling with playback. MusicXML scores are drawn as staves and tablature; the playing bar is marked and a click on a bar plays from there.'],
    ['One show file', 'Everything lives in one .actcraft file, and older files keep loading. Show packages take all audio files along – for backup or moving to another computer.'],
    ['Remote control', 'Every action is a command: from the window, from the command line, through a local JSON channel or from an AI assistant via MCP.'],
  ],
  de: [
    ['Multitrack-Playbacks', 'WAV, AIFF, FLAC, MP3, Ogg, Opus und M4A. Bis zu 64 Spuren pro Song laufen sample-genau synchron; Dateien werden im Hintergrund dekodiert, das Fenster friert nie ein.'],
    ['Mixer und Ausgänge', 'Lautstärke, Panorama, 4-Band-EQ, Mute und Farbe pro Spur, 16 Ausgangsbusse auf die Ausgänge des Audio-Interfaces, sechs benannte Mute-Gruppen.'],
    ['Metronom und Tempo', 'Klick auf eigenem Bus, Einzähler pro Song, Start auf dem Schlag, rein optischer Modus. Tempo wird erkannt, getappt oder eingetippt; Taktraster auf der Wellenform.'],
    ['Bibliothek und Setlisten', 'Suche mit AND, OR, NOT, Feldern und Phrasen. Playlists mit Sets, Smart-Playlists, Warteschlange und Verlauf; Autoplay, Crossfade und Fade-out.'],
    ['Songtexte und Akkorde', 'Akkorde im ChordPro-Format, Transponieren und Kapo. Zeitcodierte Zeilen laufen mit der Musik mit – auch in einem eigenen Fenster für den zweiten Bildschirm.'],
    ['Regionen und Ansagen', 'Bis zu 64 Regionen pro Song zum Loopen, Überspringen und Anhalten, live anspringbar. Die Computerstimme sagt Songtitel und Songteile an: „Chorus“, „End 3 2 1“.'],
    ['Noten und Tabulatur', 'Eine PDF pro Song mit Zoom, invertierten Farben für dunkle Bühnen und Mitscrollen. MusicXML-Partituren erscheinen als Notenzeilen und Tabulatur; der laufende Takt ist markiert, ein Klick auf einen Takt spielt ab dort.'],
    ['Eine Show-Datei', 'Alles steckt in einer .actcraft-Datei, ältere Dateien laden weiter. Show-Pakete nehmen alle Audiodateien mit – für Backup oder den Umzug auf einen anderen Rechner.'],
    ['Fernsteuerung', 'Jede Aktion ist ein Befehl: aus dem Fenster, von der Kommandozeile, über einen lokalen JSON-Kanal oder von einem KI-Assistenten über MCP.'],
  ],
};

const T = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_GB',
    langName: 'English',
    siteTitle: 'ActCraft – Show control for live musicians',
    skip: 'Skip to content',
    navLabel: 'Main navigation',
    langLabel: 'Language',
    ids: { progress: 'progress', features: 'features', changes: 'changes' },
    nav: { progress: 'Progress', features: 'Features', changes: 'Changes' },
    legalLabel: 'Legal',
    imprint: 'Legal notice',
    privacy: 'Privacy',
    source: 'Source code',
    footBrand: 'ActCraft · Open source under MIT or Apache-2.0',
    footNote: 'This site sets no cookies, contains no trackers and loads nothing from other servers.',
    homeDescription: 'ActCraft plays multitrack backing tracks and controls stage lighting from one show file. Open source for Windows, macOS and Linux – this is how far the work has come.',
    imprintTitle: 'Legal notice',
    imprintDescription: 'Legal notice (Impressum) of actcraft.org',
    privacyTitle: 'Privacy policy',
    privacyDescription: 'Privacy policy of actcraft.org: no cookies, no trackers, no third-party content.',
    status: { done: 'Done', partial: 'Partly done', progress: 'In progress', planned: 'Planned' },
    itemMark: { done: 'done', partial: 'partly done', planned: 'open' },
    pointsDone: (p) => `${p.done} of ${p.total} items done${p.partial ? `, ${p.partial} partly` : ''}`,
    barLabel: (p) => `${p.done} of ${p.total} items done, ${p.partial} partly`,
    overallLabel: (p) => `${p.done} of ${p.total} roadmap items done, ${p.partial} partly`,
    statsLabel: 'Key figures',
    stats: (msDone, msTotal, total, prs, last) => [
      [`${msDone} of ${msTotal}`, 'milestones done'],
      [`${total.done} of ${total.total}`, 'roadmap items done'],
      [String(prs), 'pull requests'],
      [last.replace(/ \d{4}$/, ''), 'last change'],
    ],
    eyebrow: 'Open source · Windows, macOS, Linux',
    h1: 'Show control for live musicians.',
    lead: 'ActCraft plays your multitrack backing tracks and will soon control your stage lighting too – from one program, with one show file, on one shared clock. Song, audio, lyrics and lighting cues belong together.',
    statusLine: 'Early stage: playback works; lyrics, MIDI and lighting are under way.',
    currently: 'Currently in progress:',
    toProgress: 'View progress',
    toGithub: 'Code on GitHub',
    logoAlt: 'ActCraft logo: a drawn octopus',
    progressH2: 'Progress',
    progressLead: (date) => `The milestones run in order. Each one ends only when all automatic checks pass. Roadmap as of ${date}.`,
    overallAria: 'Overall progress',
    legend: (t) => ['done', t.done, 'partly', t.partial, 'open', t.total - t.done - t.partial],
    detailH3: 'Every item in detail',
    detailLead: `Taken directly from the <a href="${REPO_URL}/blob/main/ROADMAP.md">roadmap in the repository</a>.`,
    detailLang: null,
    stepsLead: 'The open work in the order it is planned; each step is a pull request of its own.',
    featuresH2: 'What works today',
    featuresLead: 'ActCraft is a native desktop app written in Rust. Its interface is available in English and German.',
    nextH3: 'What comes next',
    nextText: 'MIDI and remote control, then lighting: DMX over Art-Net, sACN and USB, fixtures, effects and cues that follow the tempo of the song. At the end there will be a show with a lighting lane on the timeline, a band network with a backup machine and ready-made installers for every system.',
    changesH2: 'Recent changes',
    changesLead: (n, first) => `${n} commits since ${first}. The newest entries, as they appear in the repository:`,
    allChanges: 'All changes on GitHub',
    commitLang: null,
    tryH2: 'Try it yourself',
    tryLead: 'Ready-made installers arrive with milestone M9. Until then, ActCraft can be built from source with a Rust toolchain (1.95 or newer):',
    tryOutro: `Bug reports, ideas and pull requests are welcome – see the project's <a href="${REPO_URL}#readme">README</a> for how to contribute.`,
    // Spelled out as a sentence, with no "[at]"/"[dot]" tokens that harvesters know how to undo.
    email: (local, domain) =>
      `${local}, followed by the at sign (the one you type with Shift + 2 on an English keyboard), ` +
      `followed by ${domain.split('.').join(', then a single full stop, then ')}`,
    missing: (k) => `[${k} missing]`,
  },
  de: {
    htmlLang: 'de',
    ogLocale: 'de_DE',
    langName: 'Deutsch',
    siteTitle: 'ActCraft – Showsteuerung für Live-Musiker',
    skip: 'Zum Inhalt springen',
    navLabel: 'Hauptnavigation',
    langLabel: 'Sprache',
    ids: { progress: 'fortschritt', features: 'funktionen', changes: 'aenderungen' },
    nav: { progress: 'Fortschritt', features: 'Funktionen', changes: 'Änderungen' },
    legalLabel: 'Rechtliches',
    imprint: 'Impressum',
    privacy: 'Datenschutz',
    source: 'Quellcode',
    footBrand: 'ActCraft · Open Source unter MIT oder Apache-2.0',
    footNote: 'Diese Seite setzt keine Cookies, enthält keine Tracker und lädt nichts von fremden Servern.',
    homeDescription: 'ActCraft spielt Multitrack-Playbacks und steuert Bühnenlicht aus einer Show-Datei. Open Source für Windows, macOS und Linux – hier steht, wie weit die Arbeit ist.',
    imprintTitle: 'Impressum',
    imprintDescription: 'Impressum von actcraft.org',
    privacyTitle: 'Datenschutz',
    privacyDescription: 'Datenschutzerklärung von actcraft.org: keine Cookies, keine Tracker, keine fremden Inhalte.',
    status: { done: 'Fertig', partial: 'Teilweise fertig', progress: 'In Arbeit', planned: 'Geplant' },
    itemMark: { done: 'fertig', partial: 'teilweise', planned: 'offen' },
    pointsDone: (p) => `${p.done} von ${p.total} Punkten fertig${p.partial ? `, ${p.partial} teilweise` : ''}`,
    barLabel: (p) => `${p.done} von ${p.total} Punkten fertig, ${p.partial} teilweise`,
    overallLabel: (p) => `${p.done} von ${p.total} Roadmap-Punkten fertig, ${p.partial} teilweise`,
    statsLabel: 'Kennzahlen',
    stats: (msDone, msTotal, total, prs, last) => [
      [`${msDone} von ${msTotal}`, 'Meilensteinen fertig'],
      [`${total.done} von ${total.total}`, 'Roadmap-Punkten erledigt'],
      [String(prs), 'Pull Requests'],
      [last.replace(/ \d{4}$/, ''), 'letzte Änderung'],
    ],
    eyebrow: 'Open Source · Windows, macOS, Linux',
    h1: 'Showsteuerung für Live-Musiker.',
    lead: 'ActCraft spielt deine Multitrack-Playbacks und steuert bald auch dein Bühnenlicht – aus einem Programm, mit einer Show-Datei, auf einer gemeinsamen Uhr. Song, Audio, Text und Lichtcues gehören zusammen.',
    statusLine: 'Frühe Phase: Playback läuft, Songtexte, MIDI und Licht entstehen gerade.',
    currently: 'Aktuell in Arbeit:',
    toProgress: 'Zum Fortschritt',
    toGithub: 'Quellcode auf GitHub',
    logoAlt: 'ActCraft-Logo: ein gezeichneter Oktopus',
    progressH2: 'Fortschritt',
    progressLead: (date) => `Die Meilensteine laufen der Reihe nach. Jeder endet erst, wenn alle automatischen Prüfungen grün sind. Stand der Roadmap: ${date}.`,
    overallAria: 'Gesamtfortschritt',
    legend: (t) => ['fertig', t.done, 'teilweise', t.partial, 'offen', t.total - t.done - t.partial],
    detailH3: 'Alle Punkte im Detail',
    detailLead: `Direkt aus der <a href="${REPO_URL}/blob/main/ROADMAP.md">Roadmap im Repository</a> übernommen, daher im englischen Original.`,
    detailLang: 'en',
    stepsLead: 'Die offene Arbeit in der geplanten Reihenfolge; jeder Schritt ist ein eigener Pull Request. Aus der Roadmap, daher auf Englisch.',
    featuresH2: 'Was heute schon geht',
    featuresLead: 'ActCraft ist eine native Desktop-App, geschrieben in Rust. Die Oberfläche gibt es auf Englisch und Deutsch.',
    nextH3: 'Was noch kommt',
    nextText: 'MIDI und Fernsteuerung, dann das Licht: DMX über Art-Net, sACN und USB, Scheinwerfer, Effekte und Cues, die dem Tempo des Songs folgen. Am Ende steht eine Show mit Lichtspur auf der Zeitachse, ein Band-Netzwerk mit Backup-Rechner und fertige Installer für alle Systeme.',
    changesH2: 'Letzte Änderungen',
    changesLead: (n, first) => `${n} Commits seit dem ${first}. Die neuesten Einträge, wie sie im Repository stehen:`,
    allChanges: 'Alle Änderungen auf GitHub',
    commitLang: 'en',
    tryH2: 'Selbst ausprobieren',
    tryLead: 'Fertige Installer kommen mit Meilenstein M9. Bis dahin lässt sich ActCraft mit einer Rust-Toolchain (1.95 oder neuer) aus dem Quellcode bauen:',
    tryOutro: `Fehler, Ideen und Pull Requests sind willkommen – Hinweise dazu stehen im <a href="${REPO_URL}#readme">README</a> des Projekts.`,
    email: (local, domain) =>
      `${local} [das At-Zeichen, wie es auf der deutschen Tastatur mit AltGr + Q entsteht] ` +
      domain.split('.').join(' [ein einfacher Punkt] '),
    missing: (k) => `[${k} fehlt]`,
  },
};

const LANGS = ['en', 'de'];
const DIR = { en: '', de: 'de/' }; // where each language lives below the site root
const other = (lang) => (lang === 'en' ? 'de' : 'en');

// ---------------------------------------------------------------------------------------------
// Roadmap

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
        steps: [],
        text: [],
      };
      sections.push(cur);
      inItem = false;
      continue;
    }
    if (!cur) continue;
    // Top-level item: "- ✅ text", or "- text" without a mark (a note, not counted).
    const item = line.match(/^-\s+(?:(✅|🔶|⬜)\s*)?(.*)$/u);
    // Sub-item, indented below an item: "  - ⬜ text" or "  - text".
    const sub = line.match(/^\s{2,}-\s+(?:(✅|🔶|⬜)\s*)?(.*)$/u);
    // Numbered step: "1. text" (the "Next up" list).
    const step = line.match(/^\d+\.\s+(.*)$/);
    const last = cur.items[cur.items.length - 1];
    if (item) {
      cur.items.push({ status: item[1] ? STATUS[item[1]] : null, text: item[2].trim(), children: [] });
      inItem = 'item';
    } else if (sub && inItem && last) {
      last.children.push({ status: sub[1] ? STATUS[sub[1]] : null, text: sub[2].trim() });
      inItem = 'sub';
    } else if (step) {
      cur.steps.push(step[1].trim());
      inItem = 'step';
    } else if (inItem && /^\s{2,}\S/.test(line)) {
      if (inItem === 'sub') last.children[last.children.length - 1].text += ` ${line.trim()}`;
      else if (inItem === 'step') cur.steps[cur.steps.length - 1] += ` ${line.trim()}`;
      else last.text += ` ${line.trim()}`;
    } else if (line.trim() === '') {
      inItem = false;
    } else {
      inItem = false;
      cur.text.push(line.trim());
    }
  }

  for (const s of sections) s.paragraph = s.text.join(' ');

  // Items per milestone: only from a section that covers exactly that milestone.
  for (const m of milestones) {
    const n = Number(m.id.slice(1));
    const sec = sections.find((s) => s.from === n && s.to === n);
    m.items = sec ? sec.items : [];
  }
  return { milestones, sections };
}

// Counts every marked item and sub-item; notes without a mark are not counted.
function progressOf(list) {
  const items = list.flatMap((i) => [i, ...(i.children ?? [])]).filter((i) => i.status);
  if (!items.length) return null;
  const done = items.filter((i) => i.status === 'done').length;
  const partial = items.filter((i) => i.status === 'partial').length;
  return { done, partial, total: items.length, pct: Math.round(((done + partial / 2) / items.length) * 100) };
}

// Translated milestone, or the roadmap's own words when its wording changed.
function milestoneText(m, lang) {
  const t = MILESTONES[m.id];
  if (t && t.en === m.scope) return { title: t.title[lang], text: esc(t.text[lang]), known: true };
  return { title: m.id, text: inlineMd(m.scope), known: false };
}

function sectionTitle(s, lang) {
  if (s.from !== null && s.from === s.to && MILESTONES[`M${s.from}`]) {
    return `M${s.from} ${MILESTONES[`M${s.from}`].title[lang]}`;
  }
  return SECTION_TITLES[lang][s.heading] ?? s.heading;
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

function statusLabel(m, lang) {
  const s = T[lang].status;
  if (m.status === 'done') return s.done;
  if (m.status === 'partial') return m.inProgress ? s.progress : s.partial;
  return s.planned;
}

// ---------------------------------------------------------------------------------------------
// Data: a live checkout of ActCraft, or the snapshot taken from one

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

function loadData(opts) {
  const source = opts.source ?? (existsSync(join(ROOT, 'actcraft', 'ROADMAP.md')) ? join(ROOT, 'actcraft') : null);
  if (source) {
    const roadmapPath = join(source, 'ROADMAP.md');
    if (!existsSync(roadmapPath)) throw new Error(`no ROADMAP.md in ${source}: check out ActCraft there or pass --source`);
    return { from: source, roadmapMd: readFileSync(roadmapPath, 'utf8'), history: readHistory(source) };
  }
  const snap = join(ROOT, 'data', 'snapshot.json');
  if (!existsSync(snap)) throw new Error('no ActCraft checkout (./actcraft or --source) and no data/snapshot.json');
  const s = JSON.parse(readFileSync(snap, 'utf8'));
  // Say how old the offline data is, so a stale snapshot is noticed.
  return { from: `data/snapshot.json (taken ${s.taken ?? 'on an unknown date'})`, roadmapMd: s.roadmap, history: s.history };
}

// ---------------------------------------------------------------------------------------------
// Layout

// `file` is the page's path inside its language folder (index.html, impressum.html, ...).
const layout = (page) => externalLinksInNewTab(renderLayout(page), page.lang);

function renderLayout({ lang, file, title, description, body, notFound = false }) {
  const t = T[lang];
  const base = notFound ? '/' : lang === 'de' ? '../' : '';
  const local = notFound ? '/' : ''; // pages of one language share a folder
  const home = notFound ? '/' : 'index.html';
  const here = (l) => `${DIR[l]}${file}`; // path from the site root
  const switchHref = (l) => {
    if (notFound) return `/${DIR[l]}index.html`;
    if (l === lang) return file; // same folder
    return lang === 'en' ? `de/${file}` : `../${file}`;
  };
  const canonical = `${SITE_URL}${here(lang)}`.replace(/index\.html$/, '');
  const fullTitle = title ? `${title} – ActCraft` : t.siteTitle;
  const nav = ['progress', 'features', 'changes']
    // On the home page itself a bare #anchor scrolls instead of loading the page again.
    .map((k) => `      <a href="${file === 'index.html' ? '' : home}#${t.ids[k]}">${t.nav[k]}</a>`)
    .join('\n');
  const alt = notFound
    ? ''
    : [
        ...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${`${SITE_URL}${here(l)}`.replace(/index\.html$/, '')}">`),
        `<link rel="alternate" hreflang="x-default" href="${`${SITE_URL}${here('en')}`.replace(/index\.html$/, '')}">`,
      ].join('\n') + '\n';
  const langSwitch = LANGS.map((l) =>
    l === lang && !notFound
      ? `<a href="${switchHref(l)}" aria-current="true" lang="${l}" title="${T[l].langName}">${l.toUpperCase()}</a>`
      : `<a href="${switchHref(l)}" hreflang="${l}" lang="${l}" title="${T[l].langName}">${l.toUpperCase()}</a>`,
  ).join('');

  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0d0e10">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${notFound ? '' : `<link rel="canonical" href="${canonical}">\n`}${alt}<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE_URL}img/actcraft-logo.jpg">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:locale:alternate" content="${T[other(lang)].ogLocale}">
<link rel="icon" type="image/png" sizes="32x32" href="${base}img/favicon-32.png">
<link rel="apple-touch-icon" href="${base}img/apple-touch-icon.png">
<link rel="stylesheet" href="${base}style.css">
</head>
<body>
<a class="skip" href="#content">${t.skip}</a>
<header class="top">
  <div class="wrap top-inner">
    <a class="brand" href="${home}"><img src="${base}img/actcraft-icon-96.png" alt="" width="36" height="36">ActCraft</a>
    <nav class="main-nav" aria-label="${t.navLabel}">
${nav}
      <a href="${REPO_URL}" class="ext">GitHub</a>
    </nav>
    <nav class="lang" aria-label="${t.langLabel}">${langSwitch}</nav>
  </div>
</header>
<main id="content">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-inner">
    <p class="foot-brand"><img src="${base}img/actcraft-icon-96.png" alt="" width="28" height="28" loading="lazy" decoding="async"><span>${t.footBrand}</span></p>
    <nav aria-label="${t.legalLabel}">
      <a href="${local}impressum.html">${t.imprint}</a>
      <a href="${local}datenschutz.html">${t.privacy}</a>
      <a href="${REPO_URL}">${t.source}</a>
    </nav>
    <p class="foot-note">${t.footNote}</p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Home page

function renderMilestone(m, lang) {
  const t = T[lang];
  const { title, text, known } = milestoneText(m, lang);
  const textLang = !known && lang !== 'en' ? ' lang="en"' : '';
  const p = progressOf(m.items);
  const progress = p
    ? `
        ${bar(p, t.barLabel(p))}
        <p class="bar-note">${t.pointsDone(p)}</p>`
    : '';
  return `      <li class="ms ms-${m.status}">
        <div class="ms-head">
          <span class="ms-id">${esc(m.id)}</span>
          <h3>${esc(title)}</h3>
          <span class="chip chip-${m.status}">${statusLabel(m, lang)}</span>
        </div>
        <p class="ms-text"${textLang}>${text}</p>${progress}
      </li>`;
}

function renderSectionDetails(s, lang) {
  const t = T[lang];
  const l = t.detailLang ? ` lang="${t.detailLang}"` : '';
  const li = (i, indent) => {
    const cls = i.status ? `it-${i.status}` : 'it-note';
    const mark = i.status ? `<span class="it-mark" aria-hidden="true"></span><span class="sr">${t.itemMark[i.status]}: </span>` : '';
    const subs = i.children?.length
      ? `<ul class="items items-sub">\n${i.children.map((c) => li(c, `${indent}  `)).join('\n')}\n${indent}</ul>`
      : '';
    const body = subs ? `<div class="it-body"><span${l}>${inlineMd(i.text)}</span>${subs}</div>` : `<span${l}>${inlineMd(i.text)}</span>`;
    return `${indent}<li class="${cls}">${mark}${body}</li>`;
  };
  const items = s.items.length
    ? `<ul class="items">
${s.items.map((i) => li(i, '          ')).join('\n')}
        </ul>`
    : '';
  const para = s.paragraph ? `<p${l}>${inlineMd(s.paragraph)}</p>` : '';
  const p = progressOf(s.items);
  const count = p ? `<span class="sum-count">${p.done}/${p.total}</span>` : '';
  return `      <details class="detail">
        <summary><span>${esc(sectionTitle(s, lang))}</span>${count}</summary>
        ${items}${para}
      </details>`;
}

// A numbered list in the roadmap ("Next up"): the planned order of the open work.
function renderSteps(s, lang) {
  const t = T[lang];
  const l = t.detailLang ? ` lang="${t.detailLang}"` : '';
  return `
    <div class="next-up">
      <h3>${esc(sectionTitle(s, lang))}</h3>
      <p class="section-lead small">${t.stepsLead}</p>
      <ol class="steps">
${s.steps.map((x) => `        <li><span${l}>${inlineMd(x)}</span></li>`).join('\n')}
      </ol>
    </div>
`;
}

function renderHome(roadmap, hist, lang) {
  const t = T[lang];
  const { milestones, sections } = roadmap;
  const total = progressOf(sections.flatMap((s) => s.items));
  const msDone = milestones.filter((m) => m.status === 'done').length;
  const current = milestones.find((m) => m.inProgress) ?? milestones.find((m) => m.status === 'partial');
  const currentName = current
    ? `${current.id}${milestoneText(current, lang).known ? ` ${milestoneText(current, lang).title}` : ''}`
    : '';
  const stats = t.stats(msDone, milestones.length, total, hist.pullRequests, formatDate(hist.last, lang));
  const legend = t.legend(total);
  const cl = t.commitLang ? ` lang="${t.commitLang}"` : '';
  const ids = t.ids;

  return `<section class="hero">
  <div class="wrap hero-inner">
    <div class="hero-text">
      <p class="eyebrow">${t.eyebrow}</p>
      <h1>${t.h1}</h1>
      <p class="lead">${t.lead}</p>
      <p class="status-line"><span class="dot"></span>${t.statusLine}${current ? ` ${t.currently} <strong>${esc(currentName)}</strong>.` : ''}</p>
      <p class="actions"><a class="btn btn-primary" href="#${ids.progress}">${t.toProgress}</a><a class="btn" href="${REPO_URL}">${t.toGithub}</a></p>
    </div>
    <img class="hero-logo" src="${lang === 'de' ? '../' : ''}img/actcraft-logo.jpg" alt="${t.logoAlt}" width="512" height="512" fetchpriority="high">
  </div>
</section>

<section class="stats" aria-label="${t.statsLabel}">
  <div class="wrap">
    <dl class="stat-grid">
${stats.map(([v, l]) => `      <div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
    </dl>
  </div>
</section>

<section id="${ids.progress}" class="block">
  <div class="wrap">
    <h2>${t.progressH2}</h2>
    <p class="section-lead">${t.progressLead(formatDate(hist.roadmapDate, lang))}</p>
    <div class="overall" aria-label="${t.overallAria}">
      ${bar(total, t.overallLabel(total), true)}
      <p class="legend"><span class="lg lg-done"></span>${legend[0]} ${legend[1]} <span class="lg lg-partial"></span>${legend[2]} ${legend[3]} <span class="lg lg-planned"></span>${legend[4]} ${legend[5]}</p>
    </div>
    <ol class="milestones">
${milestones.map((m) => renderMilestone(m, lang)).join('\n')}
    </ol>
${sections.filter((s) => s.steps.length).map((s) => renderSteps(s, lang)).join('\n')}
    <h3 class="sub">${t.detailH3}</h3>
    <p class="section-lead small">${t.detailLead}</p>
    <div class="details">
${sections.filter((s) => s.items.length || (s.paragraph && !s.steps.length)).map((s) => renderSectionDetails(s, lang)).join('\n')}
    </div>
  </div>
</section>

<section id="${ids.features}" class="block">
  <div class="wrap">
    <h2>${t.featuresH2}</h2>
    <p class="section-lead">${t.featuresLead}</p>
    <div class="cards">
${FEATURES[lang].map(([h, d]) => `      <article class="card"><h3>${esc(h)}</h3><p>${esc(d)}</p></article>`).join('\n')}
    </div>
    <div class="next">
      <h3>${t.nextH3}</h3>
      <p>${t.nextText}</p>
    </div>
  </div>
</section>

<section id="${ids.changes}" class="block">
  <div class="wrap">
    <h2>${t.changesH2}</h2>
    <p class="section-lead">${t.changesLead(hist.commits, formatDate(hist.first, lang))}</p>
    <ol class="changes">
${hist.recent.map((c) => `      <li><time datetime="${c.date}">${formatDate(c.date, lang)}</time><a href="${c.url}"><span${cl}>${esc(c.subject)}</span> <span class="ref">${esc(c.ref)}</span></a></li>`).join('\n')}
    </ol>
    <p><a class="more" href="${REPO_URL}/commits/main">${t.allChanges}</a></p>
  </div>
</section>

<section class="block">
  <div class="wrap mitmachen">
    <h2>${t.tryH2}</h2>
    <p>${t.tryLead}</p>
    <pre><code>git clone ${REPO_URL}.git
cd ActCraft
cargo run -p actcraft --release --bin actcraft</code></pre>
    <p>${t.tryOutro}</p>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------------------------
// Legal pages

// The e-mail address is stored in two parts so the public repository holds no harvestable address.
const REQUIRED = ['name', 'street', 'postcode_city', 'email_user', 'email_domain'];

function checkConfig(config, allowIncomplete) {
  const missing = REQUIRED.filter((k) => !config[k] || !String(config[k]).trim());
  if (missing.length && !allowIncomplete) {
    throw new Error(
      `site.config.json lacks ${missing.join(', ')}: the legal notice must be complete before the site is published ` +
        '(pass --allow-incomplete for a local preview).',
    );
  }
}

function fillLegal(html, config, lang, file) {
  const t = T[lang];
  const val = (k) => (config[k] && String(config[k]).trim()) || t.missing(k);
  // Written out in words, no mailto link: readable for people, useless for address harvesters.
  const mail = entities(t.email(val('email_user'), val('email_domain')));
  const otherHref = lang === 'en' ? `de/${file}` : `../${file}`;
  return html
    .replace(/\{\{name\}\}/g, esc(val('name')))
    .replace(/\{\{street\}\}/g, esc(val('street')))
    .replace(/\{\{postcode_city\}\}/g, esc(val('postcode_city')))
    .replace(/\{\{email\}\}/g, mail)
    .replace(/\{\{other\}\}/g, otherHref);
}

// ---------------------------------------------------------------------------------------------
// Links to other sites open in a new tab

const NEW_TAB = { en: 'opens in a new tab', de: 'öffnet in neuem Tab' };

function externalLinksInNewTab(html, lang) {
  return html.replace(/<a href="(https?:\/\/[^"]+)"([^>]*)>([\s\S]*?)<\/a>/g, (whole, href, attrs, inner) => {
    if (new URL(href).hostname.replace(/^www\./, '') === 'actcraft.org') return whole;
    return `<a href="${href}"${attrs} target="_blank" rel="noopener noreferrer">${inner}<span class="sr"> (${NEW_TAB[lang]})</span></a>`;
  });
}

// ---------------------------------------------------------------------------------------------
// Main

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const data = loadData(opts);

  if (opts.writeSnapshot) {
    mkdirSync(dirname(opts.writeSnapshot), { recursive: true });
    writeFileSync(opts.writeSnapshot, `${JSON.stringify({ taken: new Date().toISOString().slice(0, 10), roadmap: data.roadmapMd, history: data.history }, null, 2)}\n`);
    console.log(`snapshot of ${data.from} written to ${opts.writeSnapshot}`);
    return;
  }

  const roadmap = parseRoadmap(data.roadmapMd);
  if (!roadmap.milestones.length) throw new Error('ROADMAP.md: no milestone table found');
  const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
  checkConfig(config, opts.allowIncomplete);

  rmSync(opts.out, { recursive: true, force: true });
  mkdirSync(join(opts.out, 'de'), { recursive: true });
  cpSync(join(ROOT, 'site'), opts.out, { recursive: true });

  let count = 0;
  for (const lang of LANGS) {
    const t = T[lang];
    const pages = [
      { file: 'index.html', title: '', description: t.homeDescription, body: renderHome(roadmap, data.history, lang) },
      {
        file: 'impressum.html', title: t.imprintTitle, description: t.imprintDescription,
        body: fillLegal(readFileSync(join(ROOT, 'content', lang, 'impressum.html'), 'utf8'), config, lang, 'impressum.html'),
      },
      {
        file: 'datenschutz.html', title: t.privacyTitle, description: t.privacyDescription,
        body: fillLegal(readFileSync(join(ROOT, 'content', lang, 'datenschutz.html'), 'utf8'), config, lang, 'datenschutz.html'),
      },
    ];
    for (const p of pages) {
      writeFileSync(join(opts.out, DIR[lang], p.file), layout({ lang, ...p }));
      count++;
    }
  }
  // Sitemap with both language versions of every page, so search engines show the right one.
  const urls = ['index.html', 'impressum.html', 'datenschutz.html'];
  const loc = (l, f) => `${SITE_URL}${DIR[l]}${f}`.replace(/index\.html$/, '');
  writeFileSync(
    join(opts.out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.flatMap((f) => LANGS.map((l) => `  <url>
    <loc>${loc(l, f)}</loc>
${LANGS.map((a) => `    <xhtml:link rel="alternate" hreflang="${a}" href="${loc(a, f)}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${loc('en', f)}"/>
  </url>`)).join('\n')}
</urlset>
`,
  );

  // Served by GitHub Pages for every unknown path, in both languages, so its links are absolute.
  writeFileSync(
    join(opts.out, '404.html'),
    layout({ lang: 'en', file: '404.html', title: 'Page not found', description: 'This page does not exist.', notFound: true, body: readFileSync(join(ROOT, 'content', '404.html'), 'utf8') }),
  );
  count++;

  console.log(
    `built ${count} pages into ${opts.out} from ${data.from}: ${roadmap.milestones.length} milestones, ` +
      `${progressOf(roadmap.sections.flatMap((s) => s.items))?.total ?? 0} roadmap items, ${roadmap.sections.reduce((n, s) => n + s.steps.length, 0)} next steps, ${data.history.commits} commits`,
  );
}

main();
