# Faza 2 — Plural Forms (v1.5.0)

> Plan implementacji i status wykonania.
> Plik tymczasowy — usunąć po release v1.5.0.

---

## Decyzje projektowe

| ID | Decyzja | Wybór |
|----|---------|-------|
| D1 | Struktura danych | Osobne pole `pluralEntries` w return z `parsePo()` — zero ryzyka regresji dla istniejących 96 testów |
| D2 | Format CSV | `key[0]`, `key[1]`, ... — kolejne formy pluralne jako osobne wiersze |
| D3 | Klucz kontekstowy | Plurale z msgctxt: `ctx::msgid[N]` (CSV) / `ctx\x04msgid` (wewnętrznie) |
| D4 | Zakres importu | Patch-only w v1.5.0 — import aktualizuje istniejące plurale, nie tworzy nowych od zera |
| D5 | nplurals walidacja | Sprawdzenie: faktyczna liczba `msgstr[N]` vs `nplurals` z nagłówka Plural-Forms |

---

## Struktura `pluralEntries`

```js
// Zwracane przez parsePo() jako dodatkowe pole:
// { header, entries, pluralEntries }

pluralEntries = new Map();
// klucz: "msgid" lub "ctx\x04msgid" (identycznie jak entries)
// wartość:
{
  msgid: '1 item',
  msgid_plural: '%%count%% items',
  msgstr: ['1 element', '%%count%% elementy', '%%count%% elementów'],
  msgctxt: 'cart'  // opcjonalnie, undefined jeśli brak
}
```

## Format CSV dla plurali

```
key|en|pl
cart::1 item[0]|1 item|1 element
cart::1 item[1]|%%count%% items|%%count%% elementy
cart::1 item[2]||%%count%% elementów
```

- `[0]` = msgstr[0] (singular), msgid w kolumnie en
- `[1]` = msgstr[1] (first plural), msgid_plural w kolumnie en
- `[2]+` = msgstr[2..N] (kolejne formy), puste en (bo en ma tylko 2 formy)

---

## Plan kroków

### S1. Fixtures — plural entries w .po i .csv
- [x] Dodać 3-4 wpisy z `msgid_plural`/`msgstr[N]` do `test/fixtures/en-US.po`
- [x] Dodać odpowiedniki do `test/fixtures/pl-PL.po` (pl ma nplurals=3)
- [x] Dodać wiersze `key[0]`, `key[1]`, `key[2]` do `test/fixtures/translations.csv`
- [x] Zaktualizować `test/fixtures/translations-modified.csv` (zmienione tłumaczenia plurali)
- **Status:** ✅ Ukończone — 4 plural entries (basic, msgctxt, variables, multiline), 96/96 testów pass

### S2. `parsePo()` — rozpoznawanie plural entries
- [x] Dodać stany `msgid_plural` i `msgstr[N]` do state machine
- [x] Budować obiekt plural entry w `flushEntry()`
- [x] Zwracać `{ header, entries, pluralEntries }` — istniejące entries bez zmian
- [x] `_readEntryBlock()` — obsługa bloków z pluralami (zamiast `return null`)
- **Status:** ✅ Ukończone — 6-state machine, en: 50 entries + 4 plurals, pl: 50 entries + 4 plurals

### S3. `writePo()` i `patchPoFile()` — zapis plurali
- [x] `writePo()` — emitować `msgid_plural` + `msgstr[N]` dla plural entries
- [x] `patchPoFile()` — rozpoznawać i patchować bloki z `msgid_plural`
- [x] Zachować oryginalny format (single-line vs multi-line msgstr[N])
- **Status:** ✅ Ukończone — per-form comparison, format preservation, _extractPluralValueFromLines helper

### S4. `exportToCsv()` — emisja wierszy `key[N]`
- [x] Iterować `pluralEntries` oprócz `entries`
- [x] Emitować `key[0]` z msgid/msgstr[0], `key[1]` z msgid_plural/msgstr[1], itd.
- [x] Poprawne escapowanie wartości CSV
- [x] Obsługa msgctxt → `ctx::msgid[N]`
- **Status:** ✅ Ukończone — export CSV identical to fixture, "54 keys (4 plural) × 2 languages"

### S5. `importFromCsv()` — rozpoznawanie `key[N]` i grupowanie
- [x] Wykrywać wzorzec `key[N]` w CSV (regex: `/\[(\d+)\]$/`)
- [x] Grupować wiersze w plural entry
- [x] Przekazywać do `patchPoFile()` jako plural update
- [x] Walidacja: czy all [0..N] present?
- **Status:** ✅ Ukończone — PLURAL_KEY_RE, langPluralForms grouping, full roundtrip verified

### S6. `validateTranslations()` — reguły dla plurali
- [x] Sprawdzenie: nplurals z nagłówka vs faktyczna liczba msgstr[N]
- [x] Sprawdzenie: puste msgstr[N] (warning, nie error)
- [x] Sprawdzenie: zmienne (%s, %d, %%var%%) konsystentne we wszystkich formach
- [x] Nie raportować brakujących kluczy plural vs singular (to różne typy)
- **Status:** ✅ Ukończone — 5 nowych typów walidacji: nplurals-mismatch, empty-plural-form, missing-plural-key, extra-plural-key, variable-mismatch

### S7. `computeStats()` — liczenie plural entries
- [x] Osobny licznik: singular entries vs plural entries
- [x] Plural entry z pustymi formami = partially translated
- [x] Wyświetlanie w raporcie: "Plural entries: X (Y forms total)"
- **Status:** ✅ Ukończone — pluralKeys, pluralForms, emptyPluralForms per-language

### S8. `preview.js` — wyświetlanie plurali w UI
- [x] Wiersze `key[N]` grupowane wizualnie (wcięcie lub kolor tła)
- [x] Label: "plural" badge przy kluczu pluralnym
- [x] Plurale read-only w preview (brak edycji inline)
- [x] generateStaticPreview() — również emituje wiersze pluralne
- **Status:** ✅ Ukończone — loadAll(), generateStaticPreview(), CSS plural-row class, read-only guard

### S9. Testy jednostkowe
- [x] `test/poParser.test.js` — parsePo z pluralami (11 testów), writePo z pluralami (5 testów), patchPoFile z pluralami (4 testy)
- [x] `test/roundtrip.test.js` — export → import round-trip z plural entries (7 testów)
- [x] Nowy lub rozszerzony test dla validate z pluralami (inline)
- [x] Nowy lub rozszerzony test dla stats z pluralami (inline)
- **Status:** ✅ Ukończone — 126 tests / 27 suites (było 96 / 22)

### S10. Diff — weryfikacja (prawdopodobnie zero zmian)
- [x] Zweryfikować że `computeDiff()` poprawnie porównuje wiersze `key[N]`
- [x] Dodać test z plural wierszami w diff fixtures
- [x] `loadPoAsCsv()` — dodano emitowanie wierszy `key[N]` z pluralEntries
- **Status:** ✅ Ukończone — 3 nowe testy plural diff, loadPoAsCsv plural support

### S11. Dokumentacja
- [x] `README.md` — sekcja "Plural Forms in CSV", feature list, limitations, roadmap
- [x] `CHANGELOG.md` — wpis v1.5.0 z pełnym opisem zmian
- [x] `test-prompt.md` — nowa sekcja "13. Test PLURAL FORMS" + testy regresyjne R7-R10
- [ ] `plan.md` — oznaczyć Fazę 2 jako ukończoną
- **Status:** ✅ Ukończone (plan.md opcjonalnie)

### S12. Aktualizacja `.github/copilot-instructions.md`
- [x] Usunąć/zmienić Pitfall #4 ("Plural Forms — Silently Skipped") → opisać nowe zachowanie
- [x] Zaktualizować Architecture section — `parsePo` returns `{ header, entries, pluralEntries }`
- [x] Zaktualizować sekcję "File Format Quick Reference" — PO plural syntax, CSV `key[N]` convention
- [x] Zaktualizować test count (~96 → 126)
- [x] Dodać nowy pitfall: `key[N]` pattern w CSV — regex, grupowanie, edge cases
- **Status:** ✅ Ukończone

### S13. Finalizacja
- [x] `npm test` — wszystkie testy przechodzą (126 / 27)
- [x] Bump `package.json` → 1.5.0
- [ ] Oba bin files aktualne (translation-toolkit.js + po-csv-tool.js)
- [ ] Git tag `v1.5.0` + push
- [ ] npm publish
- [ ] Usunąć `faza2.md`
- **Status:** ⏳ W trakcie — version bumped, docs done, awaiting git tag + publish

---

## Kolejność implementacji (graf zależności)

```
S1 (fixtures)
 ├── S2 (parsePo)
 │    ├── S3 (writePo + patchPoFile)
 │    │    ├── S5 (import — wymaga S3 + S4)
 │    │    └── S9 (testy — wymaga S2-S5)
 │    ├── S4 (export)
 │    │    └── S5
 │    ├── S6 (validate)
 │    ├── S7 (stats)
 │    └── S8 (preview)
 ├── S10 (diff — weryfikacja, niezależny od S2-S5)
 └── S11, S12 (docs — po implementacji)
      └── S13 (finalizacja — po wszystkim)
```

**Ścieżka krytyczna:** S1 → S2 → S3 → S4 → S5 → S9 → S11/S12 → S13

---

## Ryzyko

| Ryzyko | Wpływ | Mitygacja |
|--------|-------|-----------|
| `patchPoFile()` rewrite psuje istniejące .po | KRYTYCZNY | Roundtrip test po każdej zmianie |
| Preview monolith (2000+ linii) — trudna edycja | ŚREDNI | Minimalne zmiany: tylko grupowanie wizualne wierszy `key[N]` |
| nplurals mismatch między językami | NISKI | Walidacja w S6, warning (nie error) |
| CSV parser nie obsługuje `[N]` w kluczu | NISKI | Prosty regex na końcu klucza, nie koliduje z istniejącymi kluczami |

---

## Baseline

- **Wersja startowa:** 1.4.1
- **Testy startowe:** 96 tests / 22 suites
- **Commit startowy:** `18814a8` (main)
