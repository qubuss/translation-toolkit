# translation-toolkit — Plan rozwoju

## Status: AKTYWNY — v1.4.0 wydane, v1.4.1 w planach

**Strategia:** Iteracyjne wydania — solidne fundamenty (Faza 1 ✅), polish & DX (v1.2–v1.4 ✅), potem plural forms (Faza 2), a na końcu rozszerzenie o JSON/i18next (Faza 3). Każda faza kończy się publikacją na npm.

**Nazwa paczki:** `translation-toolkit` ✅ (opublikowana na npm)
**Repozytorium:** https://github.com/qubuss/translation-toolkit
**Zero dependencies** — kluczowy wyróżnik

---

## 1. Nazwa paczki

### Decyzja: `translation-toolkit` ✅ OPUBLIKOWANA

| Nazwa                     | Dostępna na npm | Uwagi                                                                  |
| ------------------------- | :-------------: | ---------------------------------------------------------------------- |
| **`translation-toolkit`** |    ✅ nasza     | Szeroka, profesjonalna, pasuje do multi-format przyszłości             |
| **`translate-toolkit`**   |       ✅        | Krótsza, ale uwaga: Python `translate-toolkit` jest znany (może mylić) |
| **`l10n-toolkit`**        |       ✅        | Techniczna, niszowa — trafia do ludzi znających l10n                   |
| **`translation-tools`**   |       ✅        | Prosta, ale mniej "markowa"                                            |
| **`po-toolkit`**          |       ✅        | Krótka, ale ogranicza do .po                                           |
| ~~`i18n-toolkit`~~        |    ❌ zajęta    | —                                                                      |

**Decyzja: `translation-toolkit`** ✅

- Brzmi profesjonalnie i szeroko
- Pasuje do przyszłego rozszerzenia o JSON/i18next (Faza 3)
- Dobrze wygląda: `npx translation-toolkit export`, `npx translation-toolkit validate`
- Nie koliduje z Python translate-toolkit (inna nazwa)
- Opublikowana na npm 20.02.2026

---

## 2. Roadmapa

---

### Faza 1 — Solidne fundamenty (v1.0–v1.1) ✅ UKOŃCZONA

Cel: paczka działa poprawnie z realnymi plikami .po "z życia".

#### 1.1 Wsparcie dla multi-line strings ✅

**Ukończone w v1.0**

```po
msgid ""
"This is a very long string that "
"continues on the next line."
```

- [x] Parser łączy linie kontynuacji w jeden string
- [x] Przy kompilacji do .po — zachowanie oryginalnego podziału linii
- [x] Testy na plikach z multi-line strings

#### 1.2 Wsparcie dla `msgctxt` (kontekst wiadomości) ✅

**Ukończone w v1.0**

- [x] Parser rozpoznaje `msgctxt` w .po
- [x] W CSV key = `kontekst::klucz` (separator `::`)
- [x] Import odtwarza `msgctxt` z klucza CSV
- [x] Preview i Validate uwzględniają kontekst

#### 1.3 Testy automatyczne ✅

**Ukończone w v1.0, rozbudowane do 91 testów w v1.4.0**

- [x] Test runner: wbudowany `node:test` — zero dependencies
- [x] Testy unit: poParser.js, export.js, import.js, validate.js, preview.js
- [x] Testy round-trip: export → import → porównanie z oryginałem
- [x] Testy dla multi-line, msgctxt, edge cases (puste msgstr, znaki specjalne)
- [x] Skrypt `npm test` w package.json
- [x] Przykładowe pliki .po w `test/fixtures/` (en-US.po, pl-PL.po — 50 kluczy)
- [x] 91 unit testów w 20 suite'ach (stan na v1.4.0)

#### 1.4 Publikacja v1.0–v1.1 ✅

- [x] Rename: `po-csv-tool` → `translation-toolkit`
- [x] Aktualizacja README, package.json, bin/
- [x] `npm publish` — v1.0.0
- [x] Tag na GitHubie

---

### Faza 1.x — Polish, bugfixes & DX (v1.2–v1.4.0) ✅ UKOŃCZONA

> Funkcje dodane organicznie na podstawie real-world testowania.

#### v1.2.0 — Preview & Watch ✅

- [x] `preview` — serwer HTTP z tabelą tłumaczeń, walidacją, statystykami, diff
- [x] `--watch` — auto-reload po zmianach w plikach .po
- [x] Port auto-increment — jeśli port zajęty, próbuje następny
- [x] Dark mode toggle
- [x] Wyszukiwarka kluczy
- [x] Inline editing z Apply/Discard

#### v1.3.0–v1.3.2 — Bugfixes ✅

- [x] Fix: `--watch` crashował z `ReferenceError: fs is not defined`
- [x] Fix: Plural-Forms continuation lines normalizowane do jednej linii
- [x] Fix: Puste linie między wpisami dodawane/usuwane po imporcie
- [x] Fix: Komentarze (`#.`, `#:`, `#,`) nie zachowywane byte-for-byte

#### v1.4.0 — Static HTML export, Sticky header, --ci ✅

- [x] `--static` / `-s` — generuje standalone HTML (self-contained, zero fetch)
- [x] `--output` / `-o` — custom output path dla static HTML
- [x] `--static` + `--watch` rejection (error + exit 1)
- [x] Client-side diff (`parseCsvString`, `csvToData`, `clientDiff`) — diff bez backendu
- [x] Inline editing guard (`if (STATIC_MODE) return`), save bar `display:none`
- [x] Fix: sticky header — usunięto `overflow:hidden`, `border-collapse:separate`
- [x] `--ci` flag — auto-wybiera katalog bez interakcji
- [x] 91 unit testów, 29/29 integration testów na real-world projekcie
- [x] `npm publish` — v1.4.0 (commit `1710e99`)
- [x] test-prompt.md — protokół testów real-world (29 checków + regresje)

---

### v1.4.1 — DX patch (z real-world testów) ⏳ W TRAKCIE

> Szybki patch (~1h) przed przejściem do Fazy 2 (plural forms).
> Zakres okrojony: P1 + P2 + P4. P3 (`--separator`) usunięte jako YAGNI.
> Zmiany wynikające z testowania v1.4.0 na projekcie `opbox-one-merchants-gui` (256 kluczy × 2 języki).

#### P1. Static preview → folder `translation-preview/index.html`

**Priorytet: ŚREDNI** | **Szacunek: 30 min**

Problem: `--static` generuje `translation-preview.html` w katalogu głównym projektu — zaśmieca root. Lepiej: `translation-preview/index.html` (folder).

- [ ] Zmienić domyślny output z `translation-preview.html` → `translation-preview/index.html`
- [ ] `mkdir -p` przed zapisem
- [ ] `-o` nadal nadpisuje ścieżkę (bez zmian)
- [ ] Aktualizacja testów, README, test-prompt.md

Pliki do zmiany: `lib/preview.js`, `test/preview.test.js`

#### P2. Fix double port log (anomalia A3)

**Priorytet: NISKI** | **Szacunek: 15 min**

Problem: Przy zajętym porcie najpierw loguje "running at port X" (błędnie), potem "Port X is in use, trying X+1..." i dopiero "running at port X+1".

- [ ] Usunąć przedwczesny log — logować port dopiero po udanym `listen()`

Pliki do zmiany: `lib/preview.js`

#### ~~P3. Flaga `--separator` dla export/import~~ ❌ USUNIĘTE (YAGNI)

> **Decyzja (22.02.2026):** Usunięte z zakresu v1.4.1. Nikt nie zgłaszał potrzeby zmiany separatora CSV.
> Jeśli pojawi się realna potrzeba — wróci w przyszłej wersji.

#### P4. Flaga `--exit-zero` dla diff

**Priorytet: NISKI** | **Szacunek: 20 min**

Problem: `diff` zwraca exit code 1 gdy są różnice — w CI to fail. `--exit-zero` pozwala zwrócić 0 nawet przy różnicach (przydatne w pipeline'ach informacyjnych).

- [ ] Dodać `--exit-zero` do diff
- [ ] Aktualizacja CLI help

Pliki do zmiany: `lib/diff.js` (jeśli istnieje), `bin/translation-toolkit.js`

#### P5. Publikacja v1.4.1

- [ ] Bump version → 1.4.1
- [ ] Aktualizacja CHANGELOG.md
- [ ] Zaktualizować testy (91+ testów)
- [ ] Zaktualizować test-prompt.md (wersja → 1.4.1, nowe testy)
- [ ] `npm publish`
- [ ] Git tag

---

### Faza 2 — Plural forms (v1.5.0) ⏳ NASTĘPNA (po v1.4.1)

Cel: pełne wsparcie dla form liczby mnogiej — kluczowa cecha gettext.

> **⚠️ KRYTYCZNE odkrycie (22.02.2026):** Analiza `lib/poParser.js` wykazała, że `parsePo()` **cicho gubi wpisy z plural forms** — `msgid_plural` i `msgstr[N]` nie są obsługiwane przez state machine (linie 60-117). W efekcie:
> - **Export**: wpisy z pluralami są pomijane w CSV (data loss!)
> - **Import (patchPoFile)**: linie msgid_plural/msgstr[N] są preservowane jako "unrecognized" — brak data loss, ale też brak możliwości edycji
>
> To podnosi priorytet Fazy 2 — nie jest to "nice to have" lecz fix na silent data loss.

#### 2.1 Parsowanie plural forms z .po

**Priorytet: WYSOKI** | **Szacunek: 1 dzień**

Co zrobić:

- [ ] Parser rozpoznaje `msgid_plural`, `msgstr[0]`, `msgstr[1]`, `msgstr[2]` ...
- [ ] Parsowanie `Plural-Forms` header (np. `nplurals=3; plural=(n==1 ? 0 : ...)`)
- [ ] Struktura danych w pamięci przechowuje plurale

Pliki do zmiany: `lib/poParser.js`

#### 2.2 Plural forms w CSV

**Priorytet: WYSOKI** | **Szacunek: 1-2 dni**

Format w CSV — osobne wiersze z sufiksem:

```
key|en|pl
items[0]|{count} item|{count} element
items[1]|{count} items|{count} elementy
items[2]||{count} elementów
```

- `[0]` = `msgstr[0]` (singular)
- `[1]` = `msgstr[1]` (plural / few)
- `[2]` = `msgstr[2]` (many) — tylko dla języków które tego wymagają

Co zrobić:

- [ ] Export: generuj wiersze `key[N]` dla każdej formy pluralnej
- [ ] Import: składaj wiersze `key[N]` z powrotem w `msgid_plural` + `msgstr[N]`
- [ ] Łączenie z `msgctxt`: `context::key[0]`, `context::key[1]`

Pliki do zmiany: `lib/export.js`, `lib/import.js`

#### 2.3 Walidacja plural forms

**Priorytet: ŚREDNI** | **Szacunek: 0.5 dnia**

Co zrobić:

- [ ] Sprawdzanie czy ilość form `msgstr[N]` zgadza się z `nplurals` z headera
- [ ] Warning jeśli język ma 3 formy a CSV zawiera tylko 2 wiersze
- [ ] Sprawdzanie zmiennych (`{{count}}`, `%d`) we wszystkich formach pluralnych

Pliki do zmiany: `lib/validate.js`

#### 2.4 Aktualizacja preview, stats, diff

- [ ] Preview: wyświetlanie plural forms w tabeli (zgrupowane)
- [ ] Stats: liczenie pokrycia uwzględniające plurale
- [ ] Diff: porównywanie plural forms

#### 2.5 Publikacja v1.5 / v2.0

- [ ] Aktualizacja README
- [ ] `npm publish`

---

### Faza 3 — Nowe formaty (v2.0+) 🔮 WAŻNE, ALE PÓŹNIEJ

Cel: rozszerzenie o eksport/import do JSON i i18next. Zmienia charakter paczki z "PO ↔ CSV" na "translation Swiss Army Knife".

> **Kontekst rynkowy (dane z npm, luty 2026):**
>
> - Ekosystem JSON/i18next jest ~10x większy niż PO/gettext w świecie JS:
>   - `react-i18next`: ~5M weekly downloads
>   - `vue-i18n`: ~1.4M, `react-intl`: ~1.4M
>   - `gettext-parser`: ~462K, `pofile`: ~371K
> - Ale: projekty JSON nie potrzebują CSV (JSON sam jest edytowalny)
> - Realny use case Fazy 3: projekty które mają .po jako source of truth i generują JSON dla frontendu
> - `i18next-conv` (PO→JSON) ma tylko 27K downloads — nisza, ale istniejąca
> - Nasza przewaga: zero-dependency (`i18next-conv` ma 6 deps)
>
> **Wniosek:** Faza 3 ma sens, ale dopiero po solidnym PO ↔ CSV core (Fazy 1+2). Nie blokuje publikacji.

#### 3.1 Export/Import do flat JSON

**Szacunek: 1-2 dni**

```bash
translation-toolkit export --format json --output ./locales/
# Generuje: locales/en.json, locales/pl.json, ...
```

Wynik:

```json
{
  "mainMenu.send": "Send packages",
  "mainMenu.help": "Help"
}
```

Co zrobić:

- [ ] Nowy moduł `lib/jsonFormat.js`
- [ ] Opcja `--format json|csv` w export i import
- [ ] Obsługa nested keys (opcjonalnie): `mainMenu.send` → `{ "mainMenu": { "send": "..." } }`
- [ ] Round-trip test: .po → JSON → .po

#### 3.2 Export/Import do formatu i18next

**Szacunek: 2-3 dni**

```bash
translation-toolkit export --format i18next --output ./locales/
# Generuje: locales/en/translation.json, locales/pl/translation.json
```

Specyfika i18next:

- Nested structure z namespace'ami
- Plurals: `key_one`, `key_other` (i18next v21+) lub `key_plural` (starsze)
- Context: `key_male`, `key_female`

Co zrobić:

- [ ] Nowy moduł `lib/i18nextFormat.js`
- [ ] Mapowanie plural forms gettext → i18next suffixes
- [ ] Obsługa `compatibilityJSON` (v3 vs v4)
- [ ] Zero-dependency — przewaga nad `i18next-conv` (6 deps)

#### 3.3 Walidacja cross-format

**Szacunek: 1 dzień**

```bash
translation-toolkit validate --compare-json ./locales/
translation-toolkit validate --compare-i18next ./locales/
```

Co zrobić:

- [ ] Porównanie kluczy między .po a JSON/i18next
- [ ] Raport: brakujące klucze, dodatkowe klucze, różnice w tłumaczeniach
- [ ] Exit code 1 jeśli są rozbieżności (CI-friendly)

#### 3.4 Finalizacja v2.0+

- [ ] Major version bump (2.0.0)
- [ ] Aktualizacja README — dokumentacja nowych formatów
- [ ] Nowe examples w README
- [ ] Aktualizacja CLI help text
- [ ] Blog post / changelog opisujący nowe możliwości

---

## 3. Podsumowanie szacunków

| Faza            | Zakres                                           | Szacunek   | Status                       |
| --------------- | ------------------------------------------------ | ---------- | ---------------------------- |
| **Faza 1**      | multiline + msgctxt + testy                      | ~3-4 dni   | ✅ v1.0–v1.1 (20.02.2026)    |
| **Faza 1.x**    | preview, watch, static, --ci, bugfixes           | ~5 dni     | ✅ v1.2–v1.4.0 (22.02.2026)  |
| **v1.4.1**      | DX patch: folder output, port log fix, --exit-zero | ~1h       | ⏳ w trakcie                  |
| **Faza 2**      | plural forms (**⚠️ fix data loss**)                | ~3-4 dni   | ⏳ następna (po v1.4.1)       |
| **Faza 3**      | JSON + i18next + cross-validate                  | ~5-6 dni   | 🔮 przyszłość                 |

**Dotychczasowy czas**: ~8-9 dni (Faza 1 + 1.x)
**Pozostało**: ~1h (v1.4.1) + ~3-4 dni (Faza 2) + ~5-6 dni (Faza 3)

---

## 4. Decyzje podjęte

| Temat                  | Decyzja                                                      | Data       |
| ---------------------- | ------------------------------------------------------------ | ---------- |
| Nazwa paczki           | `translation-toolkit`                                        | 20.02.2026 |
| Kolejność prac         | Faza 1 → 1.x → v1.4.1 → Faza 2 → Faza 3                     | 20.02.2026 |
| Opcja A (v1.4.1→v1.5)  | v1.4.1 (P1+P2+P4, ~1h) → v1.5.0 (plural forms). P3 dropped  | 22.02.2026 |
| Plural forms data loss | parsePo() cicho gubi msgid_plural/msgstr[N] — fix w Faza 2   | 22.02.2026 |
| Publikacja             | Po Fazie 1 (nie czekamy na wszystko)                         | 20.02.2026 |
| JSON/i18next           | Ważne, ale Faza 3 — po solidnym core                         | 20.02.2026 |
| Testy                  | `node:test` — 91 testów, 20 suite'ów                         | 20.02.2026 |
| Zero-dependency        | Utrzymujemy — kluczowy wyróżnik                              | 20.02.2026 |
| Plural forms w CSV     | Osobne wiersze z `key[N]` sufiksem                           | 20.02.2026 |
| Separator msgctxt      | `::` (np. `menu::Open`)                                      | 20.02.2026 |
| Static preview         | `--static` generuje self-contained HTML                      | 21.02.2026 |
| Static → folder        | Domyślny output: `translation-preview/index.html` (v1.4.1)  | 22.02.2026 |
| Real-world test prompt | `test-prompt.md` — 29 checków + regresje + anomalie          | 22.02.2026 |

## 5. Zmiana nazwy ✅ UKOŃCZONE

- [x] `package.json` → `"name": "translation-toolkit"`
- [x] `package.json` → `"bin": { "translation-toolkit": "./bin/translation-toolkit.js" }`
- [x] Rename `bin/po-csv-tool.js` → `bin/translation-toolkit.js` (zachowany jako alias)
- [x] Zaktualizowane wszystkie referencje w kodzie i README
- [x] Repo URL: https://github.com/qubuss/translation-toolkit
- [x] `npx translation-toolkit --help` działa ✅

## 6. Otwarte pytania

- **Plural forms format w preview** — czy grupować wiersze `key[0]`, `key[1]`, `key[2]` wizualnie? Czy zwijać/rozwijać?
- **Version bump Faza 2** — v1.5.0 (minor, rekomendowane) bo CSV format jest backwards-compatible (nowe wiersze `key[N]` nie łamią starych importów)

## 7. Historia wydań

| Wersja  | Data       | Kluczowe zmiany                                          |
| ------- | ---------- | -------------------------------------------------------- |
| v1.0.0  | 20.02.2026 | Initial release — export, import, preview, validate, stats, diff |
| v1.2.0  | 20.02.2026 | Preview server, --watch, port auto-increment             |
| v1.3.0  | 21.02.2026 | --watch fix (fs), format preservation fixes              |
| v1.3.2  | 21.02.2026 | Plural-Forms, blank lines, comments preservation         |
| v1.4.0  | 22.02.2026 | --static HTML, sticky header, --ci, 91 tests             |
