# translation-toolkit — Plan rozwoju

## Status: ZATWIERDZONY

**Strategia:** Najpierw solidne fundamenty (multiline, msgctxt, testy), publikacja v1.1 po Fazie 1, potem plural forms (v1.2), a na końcu rozszerzenie o JSON/i18next (v2.0). Każda faza kończy się publikacją na npm.

**Nazwa paczki:** `translation-toolkit` ✅ (zatwierdzona)

---

## 1. Nazwa paczki

### Decyzja: kierunek `*-toolkit`

| Nazwa                     | Dostępna na npm | Uwagi                                                                  |
| ------------------------- | :-------------: | ---------------------------------------------------------------------- |
| **`translation-toolkit`** |       ✅        | Szeroka, profesjonalna, pasuje do multi-format przyszłości             |
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
- Wolna na npm (sprawdzone 20.02.2026)

---

## 2. Roadmapa — trzy fazy

---

### Faza 1 — Solidne fundamenty (v1.1) 📦 PUBLIKACJA PO TEJ FAZIE

Cel: paczka działa poprawnie z realnymi plikami .po "z życia". Bez tego nie warto publikować.

#### 1.1 Wsparcie dla multi-line strings

**Priorytet: WYSOKI** | **Szacunek: 0.5-1 dzień**

Problem: Wiele plików .po używa kontynuacji stringów:

```po
msgid ""
"This is a very long string that "
"continues on the next line."
```

Co zrobić:

- [ ] Parser łączy linie kontynuacji w jeden string
- [ ] Przy kompilacji do .po — zawijanie co ~76 znaków (standard gettext)
- [ ] Testy na plikach z multi-line strings

Pliki do zmiany: `lib/poParser.js`

#### 1.2 Wsparcie dla `msgctxt` (kontekst wiadomości)

**Priorytet: WYSOKI** | **Szacunek: 1 dzień**

Problem: Ten sam `msgid` może mieć różne tłumaczenia w różnych kontekstach:

```po
msgctxt "menu"
msgid "Open"
msgstr "Otwórz"

msgctxt "button"
msgid "Open"
msgstr "Otwórz plik"
```

Co zrobić:

- [ ] Parser rozpoznaje `msgctxt` w .po
- [ ] W CSV key = `kontekst::klucz` (separator `::`)
  ```
  key|en|pl
  menu::Open|Open|Otwórz
  button::Open|Open|Otwórz plik
  ```
- [ ] Import odtwarza `msgctxt` z klucza CSV
- [ ] Preview i Validate uwzględniają kontekst

Pliki do zmiany: `lib/poParser.js`, `lib/export.js`, `lib/import.js`, `lib/preview.js`, `lib/validate.js`

#### 1.3 Testy automatyczne

**Priorytet: WYSOKI** | **Szacunek: 1-2 dni**

Co zrobić:

- [ ] Dodać test runner (wbudowany `node:test` — zero dependencies)
- [ ] Testy unit dla `poParser.js` (parse + compile)
- [ ] Testy round-trip: export → import → porównanie z oryginałem
- [ ] Testy dla multi-line, msgctxt, edge cases (puste msgstr, znaki specjalne)
- [ ] Skrypt `npm test` w package.json
- [ ] Przykładowe pliki .po do testów w `test/fixtures/`

Pliki do dodania: `test/`, `test/fixtures/*.po`

#### 1.4 Publikacja v1.1

- [ ] Aktualizacja README z nową dokumentacją (msgctxt, multiline)
- [ ] Aktualizacja package.json (nowa nazwa jeśli zdecydowana, version bump)
- [ ] `npm publish`
- [ ] Tag na GitHubie

---

### Faza 2 — Plural forms (v1.2)

Cel: pełne wsparcie dla form liczby mnogiej — kluczowa cecha gettext.

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

#### 2.5 Publikacja v1.2

- [ ] Aktualizacja README
- [ ] `npm publish`

---

### Faza 3 — Nowe formaty (v2.0) 🔮 WAŻNE, ALE PÓŹNIEJ

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

#### 3.4 Finalizacja v2.0

- [ ] Major version bump (2.0.0)
- [ ] Aktualizacja README — dokumentacja nowych formatów
- [ ] Nowe examples w README
- [ ] Aktualizacja CLI help text
- [ ] Blog post / changelog opisujący nowe możliwości

---

## 3. Podsumowanie szacunków

| Faza       | Zakres                          | Szacunek | Publikacja           |
| ---------- | ------------------------------- | -------- | -------------------- |
| **Faza 1** | multiline + msgctxt + testy     | ~3-4 dni | v1.1 → `npm publish` |
| **Faza 2** | plural forms                    | ~3-4 dni | v1.2 → `npm publish` |
| **Faza 3** | JSON + i18next + cross-validate | ~5-6 dni | v2.0 → `npm publish` |

**Łącznie: ~11-14 dni roboczych** do pełnego v2.0

---

## 4. Decyzje podjęte

| Temat              | Decyzja                                          | Data       |
| ------------------ | ------------------------------------------------ | ---------- |
| Nazwa paczki       | `translation-toolkit`                            | 20.02.2026 |
| Kolejność prac     | Faza 1 → Faza 2 → Faza 3 (iteracyjnie)           | 20.02.2026 |
| Publikacja         | Po Fazie 1 (nie czekamy na wszystko)             | 20.02.2026 |
| JSON/i18next       | Ważne, ale Faza 3 — po solidnym core             | 20.02.2026 |
| Testy              | Dodajemy w Fazie 1 (przed rozwojem plural forms) | 20.02.2026 |
| Zero-dependency    | Utrzymujemy — kluczowy wyróżnik                  | 20.02.2026 |
| Plural forms w CSV | Osobne wiersze z `key[N]` sufiksem               | 20.02.2026 |
| Separator msgctxt  | `::` (np. `menu::Open`)                          | 20.02.2026 |

## 5. Co trzeba zrobić przy zmianie nazwy (przed publikacją v1.1)

- [ ] `package.json` → `"name": "translation-toolkit"`
- [ ] `package.json` → `"bin": { "translation-toolkit": "./bin/translation-toolkit.js" }`
- [ ] Rename `bin/po-csv-tool.js` → `bin/translation-toolkit.js`
- [ ] Zaktualizować wszystkie referencje do starej nazwy w kodzie i README
- [ ] Zaktualizować repo URL na GitHub (opcjonalnie)
- [ ] Sprawdzić czy `npx translation-toolkit --help` działa

## 6. Otwarte pytania

_(Brak — wszystkie kluczowe decyzje podjęte. Szczegóły implementacyjne rozstrzygamy w trakcie prac.)_
