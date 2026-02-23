# translation-toolkit — Plan rozwoju

## Status: AKTYWNY — v1.5.2 wydane, v1.6.0 w planach

**Strategia:** Iteracyjne wydania — solidne fundamenty (Faza 1 ✅), polish & DX (v1.2–v1.4 ✅), plural forms (Faza 2 ✅), polish (v1.5.1–v1.5.2 ✅), potem fuzzy CSV + validate improvements (v1.6.0), a na końcu rozszerzenie o JSON/i18next (Faza 3). Każda faza kończy się publikacją na npm.

**Nazwa paczki:** `translation-toolkit` ✅ (opublikowana na npm)
**Repozytorium:** https://github.com/qubuss/translation-toolkit
**Zero dependencies** — kluczowy wyróżnik
**Aktualna wersja:** v1.5.2 (23.02.2026)
**Testy:** 204 testy / 50 suite'ów

---

## 1. Roadmapa

---

### Faza 1 — Solidne fundamenty (v1.0–v1.1) ✅ UKOŃCZONA

Cel: paczka działa poprawnie z realnymi plikami .po "z życia".

- [x] Parser łączy linie kontynuacji (multi-line) w jeden string, zachowuje oryginalny podział
- [x] Parser rozpoznaje `msgctxt` → CSV key = `kontekst::klucz`
- [x] Testy automatyczne: `node:test` — 31 testów / 12 suite'ów
- [x] Publikacja v1.0–v1.1, rename `po-csv-tool` → `translation-toolkit`

### Faza 1.x — Polish, bugfixes & DX (v1.2–v1.4.0) ✅ UKOŃCZONA

> Funkcje dodane organicznie na podstawie real-world testowania.

- [x] v1.2.0 — Preview server, --watch, port auto-increment, dark mode, search, inline editing
- [x] v1.3.0–v1.3.2 — Fix: --watch crash (`fs`), Plural-Forms normalization, blank lines, comments preservation
- [x] v1.4.0 — `--static` HTML export (self-contained), sticky header fix, `--ci` flag, 91 testów / 20 suite'ów
- [x] v1.4.1 — DX patch: `--static` → `translation-preview/index.html`, port fix, `--exit-zero` dla diff, 96 testów / 22 suite'y
- [x] test-prompt.md — protokół testów real-world (29+ checków + regresje)

### Faza 2 — Plural forms (v1.5.0) ✅ UKOŃCZONA

Cel: pełne wsparcie dla form liczby mnogiej — kluczowa cecha gettext.

- [x] `parsePo()` returns `pluralEntries: Map<string, PluralEntry>` z `{ msgid, msgid_plural, msgstr: string[], msgctxt? }`
- [x] `writePo()` + `patchPoFile()` obsługują plurale (4th argument)
- [x] Export emituje `key[N]` rows — osobny wiersz CSV per forma pluralna
- [x] Import detektuje `key[N]` pattern → grupuje z powrotem w `PluralEntry`
- [x] Validate: `nplurals-mismatch`, `empty-plural-form`, `missing-plural-key`, `extra-plural-key`, variable consistency
- [x] Stats: `pluralKeys`, `pluralForms`, `emptyPluralForms` per język
- [x] Preview: plural badge, accent background, read-only (no inline editing)
- [x] Diff: `loadPoAsCsv()` includes `key[N]` rows
- [x] 126 testów / 27 suite'ów

### v1.5.1 — Custom delimiter, merge mode, test expansion ✅ UKOŃCZONA

- [x] Custom delimiter `-D` — export/import z dowolnym delimiterem (`,`, `\t`, `|`)
- [x] `--merge` mode — import zachowuje istniejące klucze (default: replace)
- [x] Validate CLI exit codes: exit 1 on errors, exit 0 otherwise
- [x] 61 nowych testów: validate (25/8), stats (16/5), preview plural (11), delimiter (4), merge (5), exit code (2)
- [x] 187 testów / 46 suite'ów

### v1.5.2 — Fuzzy detection ✅ UKOŃCZONA

- [x] `parsePo()` tracks `#, fuzzy` → returns `fuzzyKeys: Set<string>`
- [x] Validate: `fuzzy-entry` warnings (severity: warning, nie blokuje exit code)
- [x] Stats: `Fuzzy: X entries need review` per język
- [x] Preview: yellow `.fuzzy-row` + `.fuzzy-badge` (server + static)
- [x] Fix: A2 (delimiter docs), A3 (port messages → stderr)
- [x] Fix: `po-csv-tool.js` help sync (--dry-run, --watch, --exit-zero)
- [x] Fix: CHANGELOG v1.1.0 false fuzzy claim
- [x] 204 testy / 50 suite'ów
- [x] Real-world test na `opbox-one-merchants-gui` — 20+ testów passed, 3 anomalie (A1 npm delay, A2 delimiter, A3 port) — wszystkie naprawione

---

### v1.6.0 — Fuzzy CSV, validate improvements ⏳ NASTĘPNA

Cel: fuzzy info w pipeline CSV, ulepszony validate, lepszy DX.

> **Kontekst:** Fuzzy jest wykrywane w validate/stats/preview (v1.5.2), ale brakuje go w CSV export/import.
> Użytkownicy edytujący CSV w arkuszach nie widzą które wpisy są fuzzy i nie mogą oznaczyć unfuzzy.

#### F1. Fuzzy w CSV export

**Priorytet: WYSOKI** | **Szacunek: 0.5 dnia**

Dwie opcje do rozważenia:
- **Opcja A: Kolumna `_status`** — `key|_status|en|pl` → wartość `fuzzy` lub pusta
- **Opcja B: Sufiks `[fuzzy]`** — `key[fuzzy]|en|pl` (analogicznie do `key[N]` plural)

> **Rekomendacja:** Opcja A (kolumna `_status`) — bardziej elastyczna, łatwiejsza do filtrowania w arkuszach, nie koliduje z `[N]` plural.

- [ ] Export: dodaj kolumnę `_status` z wartością `fuzzy` dla fuzzy entries
- [ ] Flaga `--no-status` do pominięcia kolumny (backwards compat)
- [ ] Aktualizacja testów, README

Pliki do zmiany: `lib/export.js`, `test/roundtrip.test.js`

#### F2. Fuzzy w CSV import (unfuzzy)

**Priorytet: WYSOKI** | **Szacunek: 0.5 dnia**

- [ ] Import: jeśli CSV ma kolumnę `_status` — użyj jej
- [ ] Jeśli `_status` jest pusta/brak → usuń `#, fuzzy` z wpisu (unfuzzy)
- [ ] Jeśli `_status` == `fuzzy` → zachowaj `#, fuzzy`
- [ ] `patchPoFile()` — nowa logika: usuwanie/dodawanie flagi `fuzzy` w komentarzach
- [ ] Aktualizacja testów

Pliki do zmiany: `lib/import.js`, `lib/poParser.js`, `test/roundtrip.test.js`

#### F3. Validate `--json` output

**Priorytet: ŚREDNI** | **Szacunek: 0.5 dnia**

- [ ] `--json` flag → JSON output zamiast kolorowego tekstu
- [ ] Format: `{ "errors": [...], "warnings": [...], "summary": { ... } }`
- [ ] Przydatne w CI/CD — parsowalne przez inne narzędzia
- [ ] Aktualizacja CLI help, README

Pliki do zmiany: `lib/validate.js`, `bin/translation-toolkit.js`, `bin/po-csv-tool.js`

#### F4. Validate `--severity` filter

**Priorytet: NISKI** | **Szacunek: 0.25 dnia**

- [ ] `--severity error` → pokazuj tylko errory (ukryj warnings jak fuzzy)
- [ ] `--severity warning` → pokazuj warnings i errory
- [ ] Default: `warning` (wszystko)
- [ ] Aktualizacja CLI help

Pliki do zmiany: `lib/validate.js`

#### F5. Integration test project

**Priorytet: WYSOKI** | **Szacunek: 0.5 dnia**

- [ ] `test/integration-project/` — syntetyczny projekt z 3 językami (en/pl/de)
- [ ] ~80-100 kluczy z: pluralami, fuzzy, msgctxt, multiline, HTML, Unicode, edge cases
- [ ] Skrypt `test/integration.test.js` — automatyczne testy na tym projekcie
- [ ] Uzupełnia `test/fixtures/` (unit testy) o realistyczny scenariusz end-to-end

#### F6. Publikacja v1.6.0

- [ ] Bump version → 1.6.0
- [ ] CHANGELOG.md, README.md, test-prompt.md
- [ ] `npm publish`, git tag
- [ ] Real-world test na integration project + zewnętrzny projekt

---

### Faza 3 — Nowe formaty (v2.0+) 🔮 WAŻNE, ALE PÓŹNIEJ

Cel: rozszerzenie o eksport/import do JSON i i18next. Zmienia charakter paczki z "PO ↔ CSV" na "translation Swiss Army Knife".

> **Kontekst rynkowy (dane z npm, luty 2026):**
>
> - Ekosystem JSON/i18next jest ~10x większy niż PO/gettext w świecie JS
> - Realny use case: projekty z .po jako source of truth + JSON dla frontendu
> - Nasza przewaga: zero-dependency (`i18next-conv` ma 6 deps)
>
> **Wniosek:** Faza 3 ma sens, ale dopiero po solidnym PO ↔ CSV core. Nie blokuje publikacji.

#### 3.1 Export/Import do flat JSON

**Szacunek: 1-2 dni**

- [ ] Nowy moduł `lib/jsonFormat.js`
- [ ] Opcja `--format json|csv` w export i import
- [ ] Obsługa nested keys (opcjonalnie): `mainMenu.send` → `{ "mainMenu": { "send": "..." } }`
- [ ] Round-trip test: .po → JSON → .po

#### 3.2 Export/Import do formatu i18next

**Szacunek: 2-3 dni**

- [ ] Nowy moduł `lib/i18nextFormat.js`
- [ ] Mapowanie plural forms gettext → i18next suffixes
- [ ] Obsługa `compatibilityJSON` (v3 vs v4)
- [ ] Zero-dependency — przewaga nad `i18next-conv`

#### 3.3 Walidacja cross-format

**Szacunek: 1 dzień**

- [ ] Porównanie kluczy między .po a JSON/i18next
- [ ] Exit code 1 jeśli są rozbieżności (CI-friendly)

#### 3.4 Finalizacja v2.0+

- [ ] Major version bump (2.0.0)
- [ ] Aktualizacja README, CLI help
- [ ] Blog post / changelog

---

## 2. Podsumowanie szacunków

| Faza            | Zakres                                               | Szacunek   | Status                         |
| --------------- | ---------------------------------------------------- | ---------- | ------------------------------ |
| **Faza 1**      | multiline + msgctxt + testy                          | ~3-4 dni   | ✅ v1.0–v1.1 (20.02.2026)      |
| **Faza 1.x**    | preview, watch, static, --ci, bugfixes               | ~5 dni     | ✅ v1.2–v1.4.1 (22.02.2026)    |
| **Faza 2**      | plural forms (fix data loss)                         | ~3 dni     | ✅ v1.5.0 (23.02.2026)         |
| **v1.5.1–1.5.2**| delimiter, merge, fuzzy, tests                       | ~1.5 dni   | ✅ v1.5.2 (23.02.2026)         |
| **v1.6.0**      | fuzzy CSV, validate --json/--severity, integration   | ~2.5 dni   | ⏳ następna                     |
| **Faza 3**      | JSON + i18next + cross-validate                      | ~5-6 dni   | 🔮 przyszłość                   |

**Dotychczasowy czas**: ~12-13 dni (Faza 1 + 1.x + 2 + v1.5.1–1.5.2)
**Pozostało**: ~2.5 dni (v1.6.0) + ~5-6 dni (Faza 3)

---

## 3. Decyzje podjęte

| Temat                      | Decyzja                                                       | Data       |
| -------------------------- | ------------------------------------------------------------- | ---------- |
| Nazwa paczki               | `translation-toolkit`                                         | 20.02.2026 |
| Kolejność prac             | Faza 1 → 1.x → 2 → v1.6.0 → Faza 3                           | 20.02.2026 |
| Plural forms data loss     | parsePo() cicho gubił msgid_plural/msgstr[N] — naprawione w v1.5.0 | 22.02.2026 |
| Zero-dependency            | Utrzymujemy — kluczowy wyróżnik                               | 20.02.2026 |
| Plural forms w CSV         | Osobne wiersze z `key[N]` sufiksem                            | 20.02.2026 |
| Separator msgctxt          | `::` (np. `menu::Open`, wewnętrznie `\x04`)                   | 20.02.2026 |
| Static preview             | `--static` → `translation-preview/index.html`                 | 22.02.2026 |
| Fuzzy w CSV                | Kolumna `_status` (nie sufiks) — do potwierdzenia w v1.6.0    | 23.02.2026 |
| Integration test project   | `test/integration-project/` — 3 języki, pełne edge cases      | 23.02.2026 |
| v1.6.0 scope               | Fuzzy CSV + validate --json + --severity + integration tests   | 23.02.2026 |
| Real-world test prompt     | `test-prompt.md` — 40+ checków + 16 regresji + anomalie       | 23.02.2026 |

## 4. Otwarte pytania

- **Fuzzy w CSV format** — kolumna `_status` vs sufiks `[fuzzy]`? (rekomendacja: kolumna)
- **Fuzzy unfuzzy** — auto-unfuzzy przy import jeśli tłumaczenie zmienione? czy explicit via `_status`?
- **Validate --json schema** — ustalić dokładny format JSON (pod CI tools)
- **Integration test project** — ile kluczy, jakie edge cases, jakie języki (en/pl/de? + ar?)

## 5. Historia wydań

| Wersja  | Data       | Kluczowe zmiany                                                | Testy      |
| ------- | ---------- | -------------------------------------------------------------- | ---------- |
| v1.0.0  | 20.02.2026 | Initial release — 6 commands, multiline, msgctxt               | 31 / 12    |
| v1.2.0  | 20.02.2026 | Preview server, --watch, port auto-increment                   | 69 / 16    |
| v1.3.0  | 21.02.2026 | --watch fix (fs), --dry-run, port auto-increment               | 71 / 16    |
| v1.3.2  | 21.02.2026 | Plural-Forms, blank lines, comments preservation               | 71 / 16    |
| v1.4.0  | 22.02.2026 | --static HTML, sticky header, --ci                             | 91 / 20    |
| v1.4.1  | 23.02.2026 | Static → folder, --exit-zero, port fix                         | 96 / 22    |
| v1.5.0  | 23.02.2026 | Plural forms — full pipeline (export/import/validate/stats/preview/diff) | 126 / 27   |
| v1.5.1  | 23.02.2026 | Custom delimiter -D, --merge mode, test expansion              | 187 / 46   |
| v1.5.2  | 23.02.2026 | Fuzzy detection (validate/stats/preview), A2/A3 fixes          | 204 / 50   |
