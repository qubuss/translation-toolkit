# translation-toolkit — Plan rozwoju

## Status: AKTYWNY — v1.8.0 wydane, Faza 3.2 done, 3.3 następna

**Strategia:** Iteracyjne wydania — solidne fundamenty (Faza 1 ✅), polish & DX (v1.2–v1.4 ✅), plural forms (Faza 2 ✅), polish (v1.5.1–v1.5.2 ✅), fuzzy CSV + validate improvements (v1.6.0 ✅), JSON format (v1.7.0 ✅), i18next format (v1.8.0 ✅), cross-format validation (v1.9.0 ✅), teraz finalizacja v2.0 (Faza 3.4). Każda faza kończy się publikacją na npm.

**Nazwa paczki:** `translation-toolkit` ✅ (opublikowana na npm)
**Repozytorium:** https://github.com/qubuss/translation-toolkit
**Zero dependencies** — kluczowy wyróżnik
**Aktualna wersja:** v1.8.0 (26.02.2026)
**Testy:** 336 testów / 81 suite'ów

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

#### F1. Fuzzy w CSV export ✅ DONE

**Priorytet: WYSOKI** | **Szacunek: 0.5 dnia** | **Zrobione: 23.02.2026**

Wybrano **Opcję A: Kolumna `_status`** — `key|_status|en|pl` → wartość `fuzzy` lub pusta.

- [x] Export: kolumna `_status` między `key` a językami — `fuzzy` jeśli entry ma `#, fuzzy` w DOWOLNYM języku
- [x] Flaga `--no-status` do pominięcia kolumny (backwards compat)
- [x] Import/diff/preview auto-detect `_status` column — backwards compat z CSV bez `_status`
- [x] 9 nowych testów (241 / 59), README, CLI help, CHANGELOG [Unreleased]

Pliki zmienione: `lib/export.js`, `lib/import.js`, `lib/diff.js`, `lib/preview.js`, `test/roundtrip.test.js`, `test/fixtures/*.csv`

#### F2. Fuzzy w CSV import (unfuzzy) ✅ DONE

**Priorytet: WYSOKI** | **Szacunek: 0.5 dnia** | **Zrobione: 26.02.2026**

- [x] Import: jeśli CSV ma kolumnę `_status` — użyj jej
- [x] Jeśli `_status` jest pusta/brak → usuń `#, fuzzy` z wpisu (unfuzzy)
- [x] Jeśli `_status` == `fuzzy` → zachowaj `#, fuzzy`
- [x] `patchPoFile()` — nowa logika: buforowanie komentarzy + `_applyFuzzyChange()` + `fuzzyChanges` 5th param
- [x] 8 nowych testów w `roundtrip.test.js`

Pliki zmienione: `lib/import.js`, `lib/poParser.js`, `test/roundtrip.test.js`

#### F3. Validate `--json` output ✅ DONE

**Priorytet: ŚREDNI** | **Szacunek: 0.5 dnia** | **Zrobione: 26.02.2026**

- [x] `--json` flag → JSON output zamiast kolorowego tekstu
- [x] Format: `{ "errors": [...], "warnings": [...], "summary": { refLang, languages, totalKeys, totalPluralKeys, totalFuzzyKeys, errorCount, warningCount } }`
- [x] \x04 → `::` w kluczach JSON
- [x] 4 testy CLI w `validate.test.js`

Pliki zmienione: `lib/validate.js`, `bin/translation-toolkit.js`, `bin/po-csv-tool.js`

#### F4. Validate `--severity` filter ✅ DONE

**Priorytet: NISKI** | **Szacunek: 0.25 dnia** | **Zrobione: 26.02.2026**

- [x] `--severity error` → pokazuj tylko errory (ukryj warnings jak fuzzy)
- [x] `--severity warning` → pokazuj warnings i errory (default)
- [x] Działa z `--json` i zwykłym wyjściem
- [x] 4 testy CLI w `validate.test.js`

Pliki zmienione: `lib/validate.js`

#### F5. Integration test project ✅ DONE

**Priorytet: WYSOKI** | **Szacunek: 0.5 dnia** | **Zrobione: 23.02.2026**

- [x] `test/integration-project/` — syntetyczny projekt z 3 językami (en/pl/de)
- [x] 104 singular + 8 plural kluczy z: fuzzy (7/lang), msgctxt (6), multiline, HTML, Unicode, edge cases
- [x] `test/integration.test.js` — 28 testów (parse, export, import, round-trip, validate, stats, diff, preview)
- [x] Full test-prompt.md run — ALL 40+ checks passed
- [x] Anomalia A1: en/de zyskują puste `msgstr[2]` po round-trip z pl (nplurals=3) — known, nie-blocker

#### F6. Publikacja v1.6.0 ✅ DONE

**Zrobione: 24.02.2026**

- [x] Bump version → 1.6.0
- [x] CHANGELOG.md, README.md, test-prompt.md
- [x] `npm publish`, git tag v1.6.0
- [x] Real-world test na integration project — all checks passed

---

### Faza 3 — Nowe formaty (v2.0+) ⏳ NASTĘPNA

Cel: rozszerzenie o eksport/import do JSON i i18next. Zmienia charakter paczki z "PO ↔ CSV" na "translation Swiss Army Knife".

> **Kontekst rynkowy (dane z npm, luty 2026):**
>
> - Ekosystem JSON/i18next jest ~10x większy niż PO/gettext w świecie JS
> - Realny use case: projekty z .po jako source of truth + JSON dla frontendu
> - Nasza przewaga: zero-dependency (`i18next-conv` ma 6 deps)
>
> **Wniosek:** Faza 3 ma sens, ale dopiero po solidnym PO ↔ CSV core. Nie blokuje publikacji.

#### 3.1 Export/Import do flat JSON ✅ DONE

**Zrobione: 24.02.2026**

- [x] Nowy moduł `lib/jsonFormat.js`
- [x] Opcja `--format json|csv` w export i import
- [x] Obsługa nested keys: auto-flatten on import (dot-separated)
- [x] Round-trip test: .po → JSON → .po (33 testów, 8 suites)

#### 3.2 Export/Import do formatu i18next ✅ DONE

**Zrobione: 26.02.2026**

- [x] Nowy moduł `lib/i18nextFormat.js`
- [x] Mapowanie plural forms gettext → i18next suffixes (CLDR v4 + legacy v3)
- [x] Obsługa `compatibilityJSON` (v3 vs v4) — flaga `--compat 3|4`
- [x] Zero-dependency — przewaga nad `i18next-conv`
- [x] 14 języków w mapowaniu CLDR + arabski (6 form), fallback na one/other
- [x] Round-trip test: .po → i18next → .po (46 testów, 11 suites)

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

| Faza             | Zakres                                 | Szacunek  | Status                          |
| ---------------- | -------------------------------------- | --------- | ------------------------------- |
| **Faza 1**       | multiline + msgctxt + testy            | ~3-4 dni  | ✅ v1.0–v1.1 (20.02.2026)       |
| **Faza 1.x**     | preview, watch, static, --ci, bugfixes | ~5 dni    | ✅ v1.2–v1.4.1 (22.02.2026)     |
| **Faza 2**       | plural forms (fix data loss)           | ~3 dni    | ✅ v1.5.0 (23.02.2026)          |
| **v1.5.1–1.5.2** | delimiter, merge, fuzzy, tests         | ~1.5 dni  | ✅ v1.5.2 (23.02.2026)          |
| **v1.6.0**       | fuzzy CSV, validate --json/--severity  | ~1.5 dni  | ✅ v1.6.0 (24.02.2026), 257/62  |
| **v1.7.0**       | JSON format (flat export/import)       | ~0.5 dnia | ✅ v1.7.0 (24.02.2026), 290/70  |
| **v1.8.0**       | i18next format (CLDR v4 + v3 legacy)   | ~0.5 dnia | ✅ v1.8.0 (26.02.2026), 336/81  |
| **v1.9.0**       | cross-format validation                | ~0.5 dnia | ✅ v1.9.0 (25.07.2025), 373/100 |
| **Faza 3.4**     | finalizacja v2.0                       | ~1 dzień  | ⏳ po 3.3                       |

**Dotychczasowy czas**: ~15.5 dni (Faza 1 + 1.x + 2 + v1.5.1–1.5.2 + v1.6.0 + v1.7.0 + v1.8.0 + v1.9.0)
**Pozostało**: ~1 dzień (Faza 3.4)

---

## 3. Decyzje podjęte

| Temat                    | Decyzja                                                            | Data       |
| ------------------------ | ------------------------------------------------------------------ | ---------- |
| Nazwa paczki             | `translation-toolkit`                                              | 20.02.2026 |
| Kolejność prac           | Faza 1 → 1.x → 2 → v1.6.0 → Faza 3                                 | 20.02.2026 |
| Plural forms data loss   | parsePo() cicho gubił msgid_plural/msgstr[N] — naprawione w v1.5.0 | 22.02.2026 |
| Zero-dependency          | Utrzymujemy — kluczowy wyróżnik                                    | 20.02.2026 |
| Plural forms w CSV       | Osobne wiersze z `key[N]` sufiksem                                 | 20.02.2026 |
| Separator msgctxt        | `::` (np. `menu::Open`, wewnętrznie `\x04`)                        | 20.02.2026 |
| Static preview           | `--static` → `translation-preview/index.html`                      | 22.02.2026 |
| Fuzzy w CSV              | Kolumna `_status` (nie sufiks) — potwierdzone i wdrożone w v1.6.0  | 24.02.2026 |
| Integration test project | `test/integration-project/` — 3 języki, pełne edge cases           | 23.02.2026 |
| v1.6.0 scope             | Fuzzy CSV + validate --json + --severity + integration tests       | 23.02.2026 |
| Real-world test prompt   | `test-prompt.md` — 40+ checków + 16 regresji + anomalie            | 23.02.2026 |

## 4. Otwarte pytania

- ~~**Fuzzy w CSV format** — kolumna `_status` vs sufiks `[fuzzy]`?~~ → **DONE v1.6.0: kolumna `_status`**
- ~~**Fuzzy unfuzzy** — auto-unfuzzy przy import jeśli tłumaczenie zmienione?~~ → **DONE v1.6.0: explicit via `_status` column**
- ~~**Validate --json schema** — ustalić dokładny format JSON~~ → **DONE v1.6.0: `{ errors, warnings, summary }`**
- ~~**Integration test project** — ile kluczy, jakie edge cases, jakie języki~~ → **DONE: 112 kluczy, en/pl/de, 28 testów**
- **A1: Extra plural forms** — en/de zyskują puste `msgstr[2]` przy round-trip z pl (nplurals=3). Opcje: `--strip-extra-plural-forms` flag, lub inteligentne pomijanie pustych form w eksporcie.
- **Faza 3 scope** — zacząć od flat JSON (3.1) czy od razu i18next (3.2)? Jaki format kluczy w JSON (flat vs nested)?

## 5. Historia wydań

| Wersja  | Data       | Kluczowe zmiany                                                          | Testy    |
| ------- | ---------- | ------------------------------------------------------------------------ | -------- |
| v1.0.0  | 20.02.2026 | Initial release — 6 commands, multiline, msgctxt                         | 31 / 12  |
| v1.2.0  | 20.02.2026 | Preview server, --watch, port auto-increment                             | 69 / 16  |
| v1.3.0  | 21.02.2026 | --watch fix (fs), --dry-run, port auto-increment                         | 71 / 16  |
| v1.3.2  | 21.02.2026 | Plural-Forms, blank lines, comments preservation                         | 71 / 16  |
| v1.4.0  | 22.02.2026 | --static HTML, sticky header, --ci                                       | 91 / 20  |
| v1.4.1  | 23.02.2026 | Static → folder, --exit-zero, port fix                                   | 96 / 22  |
| v1.5.0  | 23.02.2026 | Plural forms — full pipeline (export/import/validate/stats/preview/diff) | 126 / 27 |
| v1.5.1  | 23.02.2026 | Custom delimiter -D, --merge mode, test expansion                        | 187 / 46 |
| v1.5.2  | 23.02.2026 | Fuzzy detection (validate/stats/preview), A2/A3 fixes                    | 204 / 50 |
| v1.5.2+ | 23.02.2026 | Integration test project (3 langs, 112 keys, 28 tests)                   | 232 / 58 |
| v1.6.0  | 24.02.2026 | \_status column, unfuzzy import, --json, --severity                      | 257 / 62 |
| v1.7.0  | 24.02.2026 | JSON export/import (--format json), nested auto-flatten                  | 290 / 70 |
| v1.8.0  | 26.02.2026 | i18next export/import (--format i18next), CLDR v4 + v3, --compat         | 336 / 81 |
