# Marketing Plan — translation-toolkit

> Data utworzenia: 2026-02-24
> Paczka: `translation-toolkit@1.5.2`
> npm: https://www.npmjs.com/package/translation-toolkit
> GitHub: https://github.com/qubuss/translation-toolkit

---

## Stan obecny

- 1 013 pobrań (99% to mirrory/boty npm — ~80-100 per wersja)
- 0 starów na GitHubie
- Brak obecności w żadnych listach / artykułach / forach
- README z 5 screenshotami gotowy
- Keywords w package.json dobrze dobrane

---

## 1. Post na dev.to

### Gdzie opublikować

- **dev.to** (https://dev.to) — największa platforma blogowa dla developerów
- Załóż konto jeśli nie masz: https://dev.to/enter
- Post tworzy się z poziomu: https://dev.to/new

### Tytuł (propozycje — wybierz jeden)

1. `Managing .po Translation Files Without Losing Your Mind — A Zero-Dependency CLI Tool`
2. `I Built a CLI Tool to Convert .po ↔ CSV — So Translators Can Use Spreadsheets`
3. `Stop Sending .po Files to Translators — Export to CSV, Edit in Google Sheets, Import Back`

### Tagi (max 4 na dev.to)

```
#i18n #javascript #opensource #cli
```

### Pełny artykuł (kopiuj-wklej do dev.to)

> **INSTRUKCJA**: Wejdź na https://dev.to/new, wklej poniższy tekst.
> Miejsca do uzupełnienia oznaczone `[IMG: opis]` — zamień na uploadowane obrazki.
> Front matter (między `---`) dev.to parsuje automatycznie.

---

````markdown
---
title: Stop Sending .po Files to Translators — Export to CSV, Edit in Google Sheets, Import Back
published: true
tags: i18n, javascript, opensource, cli
cover_image:
  [IMG: hero image — gradient + tekst ".po → CSV → Spreadsheet → .po"]
---

I work on a project that uses GNU gettext `.po` files for translations. We have 3 languages, around 100 keys, and a few translators who help us out.

The problem? They don't know what a `.po` file is.

Every time we needed translations updated, the process looked like this:

1. Open each `.po` file in a text editor
2. Copy the strings into a Google Sheet manually
3. Send the sheet to translators
4. Get the sheet back
5. Copy everything back into `.po` files by hand
6. Hope nothing broke

After doing this a few times, I decided to automate the whole thing. So I built **translation-toolkit** — a CLI tool that handles the `.po` ↔ CSV conversion and a bunch more.

## What it does

The core idea is simple: export all your `.po` files into a single CSV, let people edit it in any spreadsheet app, then import it back.

```bash
npx translation-toolkit export
```

This scans your project for `.po` files and creates a `translations.csv`:

```
key|_status|en|pl|de
mainMenu.send||Send packages|Wyślij przesyłki|Pakete senden
mainMenu.help||Help|Pomoc|Hilfe
old.draft|fuzzy|Draft text|Wersja robocza|Entwurfstext
```

The pipe `|` delimiter is intentional — commas and semicolons show up in translations all the time, pipes almost never do. (You can change it with `-D ","` if you prefer.)

Now send the CSV to your translator, they open it in Google Sheets or Excel, fill in the blanks, and send it back.

[IMG: screenshot Google Sheets z otwartym translations.csv — kolumny key, en, pl, de]

Then import:

```bash
npx translation-toolkit import translations.csv
```

Done. The `.po` files are updated. Comments, formatting, blank lines — all preserved byte-for-byte. The round-trip is lossless.

## It's not just export/import

What started as a simple converter grew into 6 commands:

### 1. Preview — browse translations in the browser

```bash
npx translation-toolkit preview
```

This starts a local server with a searchable table of all your translations. You can click any cell to edit it right there.

[IMG: docs/screenshots/translations_screen.png]

It has 4 tabs:

- **Translations** — the main table with search and inline editing
- **Validation** — shows missing keys, empty translations, and variable mismatches
- **Statistics** — coverage per language with progress bars
- **Diff** — compare two CSV exports or a CSV against current `.po` files

There's dark mode too, because of course there is.

### 2. Validate — catch problems before they reach production

```bash
npx translation-toolkit validate
```

[IMG: docs/screenshots/validation_screen.png]

This checks for:

- **Missing keys** — a key exists in English but not in Polish
- **Empty translations** — `msgstr` is blank
- **Variable mismatches** — English has `{{name}}` but the translation says `{{nome}}`
- **Fuzzy entries** — marked `#, fuzzy` in the `.po` file, meaning "needs review"

It exits with code 1 if there are errors, so you can drop it into your CI pipeline:

```yaml
# .github/workflows/translations.yml
- run: npx translation-toolkit validate --dir src/i18n --ci
```

### 3. Stats — see the big picture

```bash
npx translation-toolkit stats
```

[IMG: docs/screenshots/statistics_screen.png]

Shows coverage per language, counts of translated/missing/empty keys, fuzzy entries, and the top missing keys. Handy when you're trying to figure out which language needs the most work.

### 4. Diff — what changed?

```bash
npx translation-toolkit diff old.csv new.csv
```

[IMG: docs/screenshots/diff_csv_csv.png]

Compare two CSV exports to see what your translator changed. Shows added, removed, and modified keys per language. You can also diff a CSV against the current `.po` files:

```bash
npx translation-toolkit diff translations.csv
# → "No differences" if .po files match the CSV
```

## Plural forms

This was the hardest part to get right. Different languages have different numbers of plural forms:

- English: 2 (singular, plural)
- Polish: 3 (one, few, many)
- Arabic: 6

In `.po` files, plurals look like this:

```po
msgid "1 file"
msgid_plural "%d files"
msgstr[0] "%d plik"
msgstr[1] "%d pliki"
msgstr[2] "%d plików"
```

In the CSV, each form gets its own row:

```
key|en|pl
1 file[0]|%d file|%d plik
1 file[1]|%d files|%d pliki
1 file[2]||%d plików
```

English only has 2 forms, so `[2]` is empty for English but filled for Polish. On import, the `[N]` rows are grouped back into proper `msgid_plural` / `msgstr[N]` blocks. Full round-trip, no data loss.

## Some things I'm happy with

**Zero dependencies.** The whole thing runs on Node.js stdlib — `fs`, `path`, `http`, `readline`. No need to install anything beyond Node itself. This was a conscious choice: fewer moving parts, fewer security issues, works anywhere Node runs.

**Format preservation.** When you import a CSV, the `.po` files keep their original formatting. Comments stay in place, multiline strings keep their line breaks, blank lines between entries don't change. I spent a lot of time on this because corrupting `.po` files would be a dealbreaker.

**Static HTML export.** Need to share the translation status with a PM who doesn't have Node installed? Generate a standalone HTML file:

```bash
npx translation-toolkit preview --static -o preview.html
```

It's a single self-contained HTML file — all data, styles, and scripts embedded. Upload it to GitHub Pages, S3, or just email it. All tabs work (translations, validation, stats, diff) without a server.

**Merge mode.** By default, import treats the CSV as the source of truth — keys not in the CSV get removed from `.po`. But sometimes you only want to update a few keys:

```bash
npx translation-toolkit import partial-update.csv --merge
```

This keeps all existing keys and only updates the ones present in the CSV.

## Quick start

```bash
# Export .po → CSV (auto-discovers .po files)
npx translation-toolkit export

# Edit translations.csv in your spreadsheet of choice...

# Import CSV → .po
npx translation-toolkit import translations.csv

# Check for problems
npx translation-toolkit validate

# Browse in browser
npx translation-toolkit preview
```

No global install needed — `npx` runs it directly.

## Links

- **GitHub**: [github.com/qubuss/translation-toolkit](https://github.com/qubuss/translation-toolkit)
- **npm**: [npmjs.com/package/translation-toolkit](https://www.npmjs.com/package/translation-toolkit)

If you work with `.po` files, give it a try and let me know what you think. Issues and PRs are welcome.

And if it saved you some time, a ⭐ on GitHub would be appreciated — it helps other people find the tool.
````

---

**ARTYKUŁ 2 — krótsza wersja na Hashnode** (cross-post z canonical URL na dev.to):

> Wklej ten sam artykuł na Hashnode (https://hashnode.com).
> W ustawieniach posta ustaw: `canonical_url` = URL artykułu na dev.to.
> Tagi: `i18n`, `JavaScript`, `CLI Tools`, `Open Source`

### Zdjęcia do przygotowania dla dev.to

| #   | Co sfotografować               | Jak                                                                                                                                                                                                            | Nazwa pliku             | Gdzie użyć                         |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------- | --------------------------------- | ----------------------- | ------------------------------------------- |
| 1   | **Hero image (cover)**         | Stwórz grafikę 1000×420px w Canva/Figma: tło gradient ciemnoniebieski, tekst `.po → CSV → Spreadsheet → .po` z ikonami arkusza i terminala. Logo narzędzia jeśli masz.                                         | `devto-cover.png`       | `cover_image` w front matter posta |
| 2   | **Terminal — export**          | Zrób screenshot terminala po odpaleniu `translation-toolkit export --dir test/integration-project/translations/`. Powinien pokazywać kolorowy output z liczbą kluczy i języków. Użyj iTerm2 z ciemnym motywem. | `terminal-export.png`   | Sekcja "Export"                    |
| 3   | **Terminal — validate**        | Screenshot `translation-toolkit validate --dir test/integration-project/translations/` — kolorowe warningi/errory.                                                                                             | `terminal-validate.png` | Sekcja "Validate"                  |
| 4   | **Terminal — stats**           | Screenshot `translation-toolkit stats --dir test/integration-project/translations/` — paski postępu, coverage %.                                                                                               | `terminal-stats.png`    | Sekcja "Stats"                     |
| 5   | **Preview — translations tab** | Otwórz `localhost:3456` w Chrome, zrób screenshot całej strony. Masz już: `docs/screenshots/translations_screen.png`                                                                                           | istniejący              | Sekcja "Preview"                   |
| 6   | **Preview — validation tab**   | Masz już: `docs/screenshots/validation_screen.png`                                                                                                                                                             | istniejący              | Sekcja "Validate"                  |
| 7   | **Preview — stats tab**        | Masz już: `docs/screenshots/statistics_screen.png`                                                                                                                                                             | istniejący              | Sekcja "Stats"                     |
| 8   | **Preview — diff tab**         | Masz już: `docs/screenshots/diff_csv_csv.png`                                                                                                                                                                  | istniejący              | Sekcja "Diff"                      |
| 9   | **Google Sheets z CSV**        | Otwórz `translations.csv` w Google Sheets (File → Import → Upload). Zrób screenshot z danymi tłumaczeń widocznymi w kolumnach `key                                                                             | en                      | pl                                 | de`. Pokaż jak wygodnie edytować. | `google-sheets-csv.png` | Sekcja "The Solution" — kluczowy screenshot |
| 10  | **Dark mode preview**          | Otwórz preview, włącz dark mode toggle, zrób screenshot.                                                                                                                                                       | `preview-dark-mode.png` | Opcjonalnie w sekcji "Features"    |

### Kiedy opublikować

- **Najlepszy dzień**: wtorek–czwartek, 8:00–10:00 UTC (poranek EU + wieczór US east)
- **Unikaj**: piątek wieczór, weekend

### Po publikacji

- [ ] Udostępnij link na Twitterze/X z tagami `#i18n #javascript #opensource`
- [ ] Wrzuć link w komentarzu na Hacker News (Show HN)
- [ ] Dodaj link do posta w README.md (sekcja "Blog posts")

---

## 2. Post na Hashnode

### Gdzie opublikować

- **Hashnode** (https://hashnode.com) — druga duża platforma blogowa dev
- Można cross-postować z dev.to (ten sam artykuł z `canonical_url` wskazującym na dev.to)
- Hashnode ma lepsze SEO (własna subdomena)

### Co zrobić

1. Załóż konto: https://hashnode.com/onboard
2. Ustaw subdomenę bloga (np. `qubuss.hashnode.dev`)
3. Skopiuj artykuł z dev.to
4. **Ustaw canonical URL** na artykuł dev.to (żeby Google nie karał za duplicate content):
   - W edytorze Hashnode → Settings → `canonical_url` = URL posta na dev.to
5. **Tagi Hashnode**: `i18n`, `JavaScript`, `CLI Tools`, `Open Source`

### Dodatkowe zdjęcia

Takie same jak dla dev.to — Hashnode obsługuje markdown, więc identyczne screenshoty.

---

## 3. Awesome Lists na GitHubie

### Listy do zgłoszenia (Pull Request)

| #   | Lista                | URL                                            | Kategoria do dodania        | Wymagania                                                          |
| --- | -------------------- | ---------------------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| 1   | **awesome-nodejs**   | https://github.com/sindresorhus/awesome-nodejs | `Internationalization`      | Projekt musi mieć: README, licencję, >0 starów (spróbuj nawet z 0) |
| 2   | **awesome-i18n**     | https://github.com/jpomykala/awesome-i18n      | `Tools` lub `CLI`           | Mniej restrykcyjne — mniejsza lista                                |
| 3   | **awesome-cli-apps** | https://github.com/agarrharr/awesome-cli-apps  | `Utilities` > `Translation` | Wymaga: opis ≤80 znaków, link do repo                              |
| 4   | **awesome-gettext**  | Wyszukaj na GitHubie                           | Tools / Converters          | Jeśli istnieje                                                     |

### Jak zgłosić PR do awesome-list

1. Forkuj repo awesome-listy
2. Edytuj `README.md` — dodaj wpis w odpowiedniej kategorii:
   ```markdown
   - [translation-toolkit](https://github.com/qubuss/translation-toolkit) - Zero-dependency CLI to convert .po ↔ CSV, with browser preview, validation, and inline editing.
   ```
3. Otwórz Pull Request z tytułem: `Add translation-toolkit`
4. W opisie PR: 1-2 zdania co robi narzędzie + link do npm

### Kiedy zgłosić

- **Po** zdobyciu kilku starów na GitHubie (nawet 5-10 wystarczy)
- Awesome-nodejs jest bardzo selektywny — lepiej mieć trochę social proof wcześniej
- Awesome-i18n i awesome-cli-apps są łatwiejsze do wejścia

---

## 4. README Badges — dodanie badge'ów npm

### Co dodać do README.md

Obecne badge'e:

```markdown
[![npm version](https://img.shields.io/npm/v/translation-toolkit)](https://www.npmjs.com/package/translation-toolkit)
[![license](https://img.shields.io/npm/l/translation-toolkit)](LICENSE)
[![node](https://img.shields.io/node/v/translation-toolkit)](package.json)
```

**Dodać:**

```markdown
[![npm downloads](https://img.shields.io/npm/dw/translation-toolkit)](https://www.npmjs.com/package/translation-toolkit)
[![GitHub stars](https://img.shields.io/github/stars/qubuss/translation-toolkit)](https://github.com/qubuss/translation-toolkit)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/qubuss/translation-toolkit/pulls)
```

### Dlaczego

- `npm downloads` — nawet jeśli to głównie mirrory, duża liczba wygląda dobrze dla nowych użytkowników (~1000/week)
- `GitHub stars` — zachęca do star-owania
- `PRs welcome` — sygnalizuje że projekt jest otwarty na kontrybucje

### Kiedy

- Badge'e dodaj **od razu** (przed publikacją artykułów) — to 5 minut pracy

---

## 5. Hacker News — Show HN

### Gdzie

- https://news.ycombinator.com/submit

### Pełny tekst zgłoszenia (kopiuj-wklej)

> **INSTRUKCJA**: Wejdź na https://news.ycombinator.com/submit
>
> - Title: wklej tytuł
> - Url: wklej URL
> - Text: wklej tekst (pojawi się pod postem)

**Title:**

```
Show HN: Translation-toolkit – Zero-dep CLI to manage .po files via CSV
```

**Url:**

```
https://github.com/qubuss/translation-toolkit
```

**Text:**

```
I built a CLI tool that converts GNU gettext .po translation files to/from CSV.

We have a project with 3 languages and a few translators who don't know .po syntax. The workflow was: manually copy strings into a Google Sheet, send it to the translator, get it back, paste everything back into .po files. Repeat every sprint.

So I built this to automate it:

- Export all .po files → single pipe-delimited CSV (npx translation-toolkit export)
- Translators edit the CSV in Google Sheets / Excel
- Import CSV back → .po files updated, formatting preserved byte-for-byte

It also includes:
- Browser preview with inline editing, search, dark mode
- Validation: missing keys, empty translations, variable mismatches, fuzzy entries
- Stats: per-language coverage with progress bars
- Diff: compare CSV snapshots or CSV vs .po
- Full plural forms support (handles 2-6 forms per language)
- Static HTML export for sharing without a server

Zero npm dependencies — just Node.js stdlib. Works on Node 14+.

npm: https://www.npmjs.com/package/translation-toolkit
```

### Dobre praktyki HN

- **Kiedy postować**: Wtorek–czwartek, 8:00–9:00 EST (14:00–15:00 CET)
- **NIE proś** znajomych o upvote'y (HN karze za vote rings)
- Odpowiadaj na KAŻDY komentarz szybko i rzeczowo
- Bądź szczery o ograniczeniach

---

## 6. Reddit

### Subreddity do postowania

| #   | Subreddit                 | Typ posta                | Zasady                                      |
| --- | ------------------------- | ------------------------ | ------------------------------------------- |
| 1   | **r/node** (~180k)        | Link post do GitHub repo | Dozwolona autopromocja jeśli jesteś aktywny |
| 2   | **r/javascript** (~2.5M)  | Self post z opisem       | Showoff Saturday thread — postuj w sobotę   |
| 3   | **r/webdev** (~2M)        | Self post                | Showoff Saturday                            |
| 4   | **r/i18n** (~5k)          | Link post                | Mała społeczność, ale super targetowana     |
| 5   | **r/commandline** (~300k) | Link post                | Uwielbiają CLI tools                        |
| 6   | **r/opensource** (~60k)   | Link post                |                                             |

### POST 1: r/node (kopiuj-wklej)

> **INSTRUKCJA**: Wejdź na https://www.reddit.com/r/node/submit
> Wybierz "Text" post. Wklej tytuł i body.

**Title:**

```
I built a zero-dependency CLI to manage .po translation files — export to CSV, edit in spreadsheets, import back
```

**Body:**

```
Hey r/node,

I work on a project with .po translation files across 3 languages. Our translators don't know gettext syntax, so every sprint I'd manually copy strings into a Google Sheet, send it over, get it back, and paste everything into .po files by hand.

Got tired of it and built a CLI tool to automate the whole thing. Thought some of you might find it useful.

**What it does:**

    npx translation-toolkit export
    # → creates translations.csv from all your .po files

    npx translation-toolkit import translations.csv
    # → updates .po files, preserving formatting byte-for-byte

The CSV uses pipe `|` as delimiter (commas show up in translations too often), but you can change it with `-D ","`.

**Other commands:**

- `preview` — starts a local server with a searchable table. Click any cell to edit. Has dark mode, validation tab, stats, and diff.
- `validate` — checks for missing keys, empty translations, variable mismatches (`{{name}}` vs `{{nome}}`), fuzzy entries. Exits with code 1 so you can use it in CI.
- `stats` — per-language coverage with progress bars
- `diff` — compare two CSV exports or CSV vs current .po files

Also handles plural forms properly (English has 2, Polish 3, Arabic 6 — each form gets its own CSV row as `key[0]`, `key[1]`, etc.).

Zero dependencies — just Node.js stdlib. Works on Node 14+.

GitHub: https://github.com/qubuss/translation-toolkit

Would love to hear feedback, especially if you work with .po files. What's your current workflow for managing translations?
```

---

### POST 2: r/javascript — Showoff Saturday (kopiuj-wklej)

> **INSTRUKCJA**: Postuj w sobotę w weekly "Showoff Saturday" thread.
> Albo stwórz osobny post z flair "Showoff Saturday".

**Title:**

```
[Showoff Saturday] translation-toolkit — zero-dep CLI for .po file management with browser preview
```

**Body:**

```
Built a CLI tool for managing GNU gettext .po translation files. The core idea: export .po → CSV, let translators edit in Google Sheets, import back.

Screenshots: https://github.com/qubuss/translation-toolkit#screenshots

Features:
- Export/import .po ↔ CSV (round-trip safe, format preserved)
- Browser preview with inline editing, search, dark mode
- 4 tabs: Translations, Validation, Statistics, Diff
- Validate: missing keys, empty translations, variable mismatches, fuzzy entries
- Full plural forms support (2-6 forms per language)
- Static HTML export (single file, no server needed)
- Zero npm dependencies

npx translation-toolkit preview

https://github.com/qubuss/translation-toolkit
```

---

### POST 3: r/i18n (kopiuj-wklej)

**Title:**

```
Open-source CLI tool to manage .po files — export to CSV for spreadsheet editing, browser preview with inline editing, validation, stats
```

**Body:**

```
Hey! I built an open-source CLI tool specifically for managing GNU gettext .po translation files.

The main problem it solves: translators who can't (or don't want to) work with .po files directly. You export everything to a single CSV, they edit in Google Sheets or Excel, you import back. The round-trip preserves formatting byte-for-byte — comments, blank lines, multiline strings all stay intact.

But it's grown beyond just export/import:

**Browser preview** (npx translation-toolkit preview)
Starts a local server with a searchable table. Click any cell to edit translations directly. Tabs for validation, statistics, and diff. Dark mode included.

**Validation** (npx translation-toolkit validate)
Checks for: missing keys across languages, empty translations, variable mismatches (e.g., {{name}} in source but {{nome}} in target), fuzzy entries (marked #, fuzzy). Exits with code 1 for CI pipelines.

**Plural forms**
Full support for msgid_plural / msgstr[N]. Handles the fact that English has 2 forms, Polish has 3, Arabic has 6. Each form becomes a separate CSV row (key[0], key[1], key[2]...) and gets grouped back on import.

**Stats & Diff**
Per-language coverage, diff between CSV snapshots or CSV vs current .po.

Zero dependencies (pure Node.js stdlib), works on Node 14+.

GitHub: https://github.com/qubuss/translation-toolkit
npm: https://www.npmjs.com/package/translation-toolkit

Would love to hear how this compares to your current .po workflow. What tools are you using?
```

---

### POST 4: r/commandline (kopiuj-wklej)

**Title:**

```
translation-toolkit: zero-dep Node.js CLI for managing .po translation files (export/import CSV, browser preview, validate, diff)
```

**Body:**

```
CLI tool for GNU gettext .po file management.

    # Export all .po files to a CSV
    npx translation-toolkit export

    # Import CSV back (preserves .po formatting)
    npx translation-toolkit import translations.csv

    # Browse translations in browser (searchable, editable)
    npx translation-toolkit preview

    # Check for issues (CI-friendly, exits 1 on errors)
    npx translation-toolkit validate

    # Per-language coverage stats
    npx translation-toolkit stats

    # Compare two CSVs or CSV vs .po files
    npx translation-toolkit diff old.csv new.csv

Zero npm dependencies. Pure Node.js stdlib.

https://github.com/qubuss/translation-toolkit
```

### Zasady postowania na Reddit

- **Nie spamuj** — NIE postuj na wszystkich subredditach tego samego dnia
- Rozłóż: r/node (tydzień 1), r/javascript Saturday (tydzień 2), r/i18n (tydzień 3), r/commandline (tydzień 4)
- Odpowiadaj na KAŻDY komentarz
- Nie usuwaj posta jeśli dostanie mało upvote'ów

---

## 7. Twitter/X

### Strategia

Seria 3-4 tweetów (nie jeden!) rozłożona w czasie.

### TWEET 1 — Launch (kopiuj-wklej)

> **INSTRUKCJA**: Wklej tekst na https://x.com/compose/post
> Dołącz GIF lub screenshot (patrz notatka pod spodem)

```
🚀 I just shipped translation-toolkit — a zero-dependency Node.js CLI for managing .po translation files.

Export .po → CSV → edit in Google Sheets → import back. Round-trip safe, formatting preserved.

Also: browser preview with inline editing, validation, stats, diff.

npx translation-toolkit export

github.com/qubuss/translation-toolkit

#i18n #javascript #opensource #nodejs
```

**Dołącz**: Animowany GIF (nagraj przez [Kap](https://getkap.co/)): terminal → export → preview w przeglądarce. Albo screenshot preview.

---

### TWEET 2 — Preview (2-3 dni później, kopiuj-wklej)

```
translation-toolkit has a browser preview:

✅ Searchable translation table
✅ Click any cell to edit inline
✅ Validation — missing keys, variable mismatches
✅ Statistics — coverage bars per language
✅ Diff — compare CSV versions
✅ Dark mode

All in one zero-dep CLI:
npx translation-toolkit preview

github.com/qubuss/translation-toolkit
```

**Dołącz**: Screenshot `docs/screenshots/translations_screen.png`

---

### TWEET 3 — Static export (kolejne 2-3 dni, kopiuj-wklej)

```
Need to share translation status with your team but they don't have Node installed?

npx translation-toolkit preview --static

Generates a single self-contained HTML file. Upload to GitHub Pages, S3, or just email it.

All 4 tabs work offline — translations, validation, stats, diff. No server needed.
```

**Dołącz**: Screenshot static HTML otwartego w przeglądarce (plik lokalny)

---

### TWEET 4 — Plural forms (tydzień później, kopiuj-wklej)

```
Fun i18n challenge: GNU gettext plural forms.

English → 2 forms
Polish → 3 forms
Arabic → 6 forms

translation-toolkit exports each form as a separate CSV row:
key[0], key[1], key[2]…

Translators fill in the blanks in Google Sheets. On import, rows get grouped back into msgstr[N] blocks.

Full round-trip, zero data loss.
```

---

## 8. GitHub — Optymalizacja repo

### Co zrobić na GitHubie

| #   | Akcja               | Szczegóły                                                                                                                                                                                            |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Topics**          | Dodaj topics do repo: `i18n`, `gettext`, `po-files`, `csv`, `translation`, `cli`, `nodejs`, `localization`, `internationalization`, `zero-dependencies`                                              |
| 2   | **Description**     | Upewnij się że repo description (widoczny pod nazwą) to: `Zero-dependency CLI to manage .po translation files — export ↔ CSV, browser preview, validate, stats, diff`                                |
| 3   | **Website**         | Ustaw website na: `https://www.npmjs.com/package/translation-toolkit`                                                                                                                                |
| 4   | **Social preview**  | Settings → Social preview → Upload image 1280×640px. Stwórz w Canva: nazwa narzędzia, główne komendy, "Zero dependencies". To image wyświetla się gdy ktoś udostępnia link na Slack/Twitter/Discord. |
| 5   | **Releases**        | Upewnij się że KAŻDY tag (v1.1.0 → v1.5.2) ma GitHub Release z opisem z CHANGELOG.                                                                                                                   |
| 6   | **Contributing.md** | Stwórz `CONTRIBUTING.md` z instrukcjami — sygnalizuje że projekt jest otwarty                                                                                                                        |
| 7   | **Issue templates** | Dodaj `.github/ISSUE_TEMPLATE/bug_report.md` i `feature_request.md` — profesjonalny wygląd                                                                                                           |

### Social preview — instrukcja

1. Idź na https://www.canva.com → stwórz nowy design 1280×640px
2. Ciemne tło (np. #1a1a2e gradient do #16213e)
3. Duży tekst: `translation-toolkit`
4. Pod spodem: `.po ↔ CSV · Preview · Validate · Stats · Diff`
5. Mały tekst: `Zero dependencies · Node.js CLI`
6. Opcjonalnie: ikona terminala / ikona tłumaczenia (globe)
7. Pobierz jako PNG → GitHub repo → Settings → Social preview → Upload

---

## 9. Dyskusje na forach / Stack Overflow

### Stack Overflow — odpowiadaj na pytania

Wyszukaj pytania z tagami: `gettext`, `po-file`, `i18n`, `gnu-gettext`

Szukaj pytań typu:

- "How to convert .po to CSV"
- "Edit .po files in spreadsheet"
- "Merge .po files from multiple translators"
- "Validate .po translation files"

**Jak odpowiadać**:

- Daj NAJPIERW prawdziwą odpowiedź na pytanie
- Na końcu: "There's also translation-toolkit (disclaimer: I'm the author) that does this: `npx translation-toolkit export`"
- **NIE spamuj** — odpowiadaj tylko na pytania gdzie narzędzie naprawdę pomaga

### GitHub Discussions / Issues w projektach gettext

Szukaj repozytoriów na GitHubie które używają .po:

- WordPress plugins (ogromna baza .po)
- Django projects
- PHP-Gettext projects

Gdzie pasuje, możesz zasugerować narzędzie w Discussion/Issue jako helpful tool.

---

## 10. Product Hunt

### Kiedy

- **Po** zdobyciu 10-20 starów na GitHubie i kilku komentarzy pod artykułem
- Product Hunt jest sens robić gdy masz already trochę social proof

### Jak przygotować

1. Idź na https://www.producthunt.com/posts/new
2. **Tagline** (max 60 znaków): `Manage .po translation files with CSV and browser preview`
3. **Description**: Rozbudowana wersja opisu z dev.to posta
4. **Media**:
   - Thumbnail (240×240): logo / ikona narzędzia
   - Gallery images (1270×760):
     - Screenshot preview translations tab
     - Screenshot terminal export
     - Screenshot Google Sheets z CSV
     - Screenshot validation tab
5. **Maker comment**: Napisz komentarz wyjaśniający dlaczego stworzyłeś narzędzie
6. **Topics**: `Developer Tools`, `Open Source`, `Productivity`

### Grafiki do przygotowania

| #   | Typ       | Rozmiar    | Opis                                           |
| --- | --------- | ---------- | ---------------------------------------------- |
| 1   | Thumbnail | 240×240px  | Logo/ikona na pomarańczowym tle                |
| 2   | Gallery 1 | 1270×760px | Preview translations tab (full browser window) |
| 3   | Gallery 2 | 1270×760px | Terminal: export + import commands             |
| 4   | Gallery 3 | 1270×760px | Google Sheets z otwartym CSV                   |
| 5   | Gallery 4 | 1270×760px | Preview validation + stats tabs side by side   |
| 6   | GIF       | 1270×760px | 15s demo: export → preview → edit → save       |

---

## 11. Newsletter / Weekly digests

### Gdzie się zgłosić

| #   | Newsletter                     | URL zgłoszenia                        | Opis                                              |
| --- | ------------------------------ | ------------------------------------- | ------------------------------------------------- |
| 1   | **JavaScript Weekly**          | https://cooperpress.com/submit/       | Najważniejszy JS newsletter (~180k subskrybentów) |
| 2   | **Node Weekly**                | https://cooperpress.com/submit/       | Ten sam formularz co JS Weekly                    |
| 3   | **Console.dev**                | https://console.dev/submit/           | Tygodniowy przegląd narzędzi dev                  |
| 4   | **Awesome Node.js Newsletter** | https://nodejs.libhunt.com/newsletter |                                                   |

### Jak zgłosić

Formularz Cooper Press (JS Weekly / Node Weekly):

- URL: link do GitHub repo
- Brief description: `Zero-dependency Node.js CLI to convert .po translation files to/from CSV. Includes browser preview with inline editing, validation, statistics, diff, and plural forms support.`
- Type: `Open Source Tool`

---

## Harmonogram działań

| Tydzień | Działanie                                                  | Priorytet         |
| ------- | ---------------------------------------------------------- | ----------------- |
| **1**   | Dodaj badge'e npm do README (punkt 4)                      | 🔴 Natychmiast    |
| **1**   | Ustaw GitHub topics, description, social preview (punkt 8) | 🔴 Natychmiast    |
| **1**   | Stwórz GitHub Releases dla wszystkich tagów (punkt 8)      | 🔴 Natychmiast    |
| **1**   | Zrób screenshoty terminala (punkt 1 zdjęcia)               | 🔴 Natychmiast    |
| **1**   | Zrób screenshot Google Sheets z CSV                        | 🔴 Natychmiast    |
| **2**   | Napisz i opublikuj post na dev.to (punkt 1)                | 🟠 Wysoki         |
| **2**   | Cross-post na Hashnode (punkt 2)                           | 🟠 Wysoki         |
| **2**   | Tweet 1 — launch (punkt 7)                                 | 🟠 Wysoki         |
| **2**   | Post na r/node (punkt 6)                                   | 🟠 Wysoki         |
| **3**   | Show HN (punkt 5)                                          | 🟡 Średni         |
| **3**   | Tweet 2 — preview feature                                  | 🟡 Średni         |
| **3**   | Post na r/javascript (Showoff Saturday)                    | 🟡 Średni         |
| **3**   | Zgłoś do JS Weekly / Node Weekly (punkt 11)                | 🟡 Średni         |
| **4**   | PR do awesome-i18n i awesome-cli-apps (punkt 3)            | 🟡 Średni         |
| **4**   | Tweet 3 — static export                                    | 🟡 Średni         |
| **4**   | Post na r/i18n, r/commandline                              | 🟡 Średni         |
| **5+**  | Odpowiadaj na Stack Overflow (punkt 9)                     | 🟢 Ongoing        |
| **5+**  | PR do awesome-nodejs (po zdobyciu starów)                  | 🟢 Gdy 20+ starów |
| **5+**  | Product Hunt launch (punkt 10)                             | 🟢 Gdy 50+ starów |

---

## Checklist zdjęć do przygotowania

> Wszystkie screenshoty rób na czystym, wyrazistym tle. Terminal: iTerm2 / Warp z ciemnym motywem.
> Przeglądarka: Chrome, clean profile (bez extensions w toolbarze).

| #   | Zdjęcie                                   | Rozmiar         | Do czego                       | Priorytet |
| --- | ----------------------------------------- | --------------- | ------------------------------ | --------- |
| 1   | Hero/cover image (gradient + tekst)       | 1000×420px      | dev.to cover                   | 🔴        |
| 2   | Social preview (GitHub)                   | 1280×640px      | GitHub repo link preview       | 🔴        |
| 3   | Terminal — `export` command output        | ~800×400px      | Post, README                   | 🔴        |
| 4   | Terminal — `validate` command output      | ~800×400px      | Post                           | 🟠        |
| 5   | Terminal — `stats` command output         | ~800×400px      | Post                           | 🟠        |
| 6   | Google Sheets z otwartym translations.csv | ~1200×700px     | Post — **kluczowy** screenshot | 🔴        |
| 7   | Preview dark mode                         | ~1200×700px     | Twitter, Post                  | 🟡        |
| 8   | Animated GIF: export → preview → edit     | 15s, ~800×500px | Twitter, Product Hunt          | 🟠        |
| 9   | Product Hunt thumbnail                    | 240×240px       | Product Hunt                   | 🟢        |
| 10  | Product Hunt gallery (4 obrazki)          | 1270×760px      | Product Hunt                   | 🟢        |

**Narzędzia do tworzenia grafik:**

- Screenshoty terminala: **natywny macOS screenshot** (Cmd+Shift+4) lub [Carbon](https://carbon.now.sh/) dla ładnych snippetów
- Grafiki z tekstem: **Canva** (free) lub **Figma**
- GIF nagrywanie: **[Kap](https://getkap.co/)** (macOS, free, open source)
- Screenshoty przeglądarki: Chrome DevTools → Cmd+Shift+P → "Capture full size screenshot"

---

## Metryki sukcesu

| Metryka                       | Po 1 miesiącu | Po 3 miesiącach | Po 6 miesięcy |
| ----------------------------- | ------------- | --------------- | ------------- |
| GitHub stars                  | 10-20         | 50-100          | 200+          |
| npm weekly downloads (realne) | 50-100        | 200-500         | 1000+         |
| dev.to views                  | 500-2000      | 2000-5000       | —             |
| Contributors (external)       | 0-1           | 1-3             | 3-5           |

Te liczby to realistyczne szacunki dla narzędzia w niszy i18n/gettext. Kluczem jest **konsekwencja** — lepiej robić po 1 rzecz tygodniowo przez 2 miesiące niż wszystko naraz i potem cisza.
