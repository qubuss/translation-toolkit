# Translation Toolkit — Real Project Test Prompt

Wklej poniższy prompt w czacie nowego projektu (który ma pliki .po):

---

## PROMPT START

Zainstaluj i przetestuj narzędzie `translation-toolkit@1.2.0` (npm) na tym projekcie.
Wykonaj WSZYSTKIE poniższe kroki po kolei, notuj wyniki, a na końcu wygeneruj raport.

> Komendy: `export`, `import`, `preview`, `validate`, `stats`, `diff`

### 0. Instalacja

```bash
npm install -g translation-toolkit@1.2.0
translation-toolkit --version   # powinno wypisać 1.2.0
```

### 1. Odkrywanie plików .po

Znajdź wszystkie pliki `.po` w tym projekcie:

```bash
find . -name "*.po" -not -path "*/node_modules/*" | head -30
```

Zanotuj:

- Ile plików `.po`?
- Ile języków (np. en, pl, de…)?
- W jakim katalogu leżą (np. `translations/`, `locale/`, `src/i18n/`)?

Ustaw zmienną na potem:

```bash
PO_DIR="<KATALOG_Z_PO>"   # np. translations
```

### 2. Test EXPORT (po → CSV)

```bash
translation-toolkit export --dir "$PO_DIR" -o /tmp/tt-test-export.csv
```

Sprawdź wynik:

```bash
wc -l /tmp/tt-test-export.csv          # ile wierszy (kluczy + nagłówek)
head -5 /tmp/tt-test-export.csv        # nagłówek + pierwsze wpisy
```

Checklist:

- [ ] CSV się wygenerował bez błędów
- [ ] Nagłówek: `key,<lang1>,<lang2>,...`
- [ ] Klucze z `msgctxt` mają separator `::` (np. `menu::Save`)
- [ ] Wieloliniowe wartości są w jednej komórce (w cudzysłowach CSV)
- [ ] Znaki specjalne (`\"`, `\t`, `\n`) poprawnie wyeksportowane

### 3. Test IMPORT round-trip (CSV → po → CSV)

```bash
rm -rf /tmp/tt-test-reimport
cp -r "$PO_DIR" /tmp/tt-test-reimport/

translation-toolkit import /tmp/tt-test-export.csv --dir /tmp/tt-test-reimport/
translation-toolkit export --dir /tmp/tt-test-reimport/ -o /tmp/tt-test-reimport.csv

diff /tmp/tt-test-export.csv /tmp/tt-test-reimport.csv
echo "Exit code: $?"    # 0 = identyczne
```

Checklist:

- [ ] Import bez błędów
- [ ] CSV diff jest **pusty** (exit code 0)
- [ ] Jeśli diff nie jest pusty — zanotuj dokładnie co się różni

**WAŻNE — test preservacji formatu .po:**

```bash
# Porównaj oryginalne .po z zaimportowanymi — nie powinno być zmian formatowania
for f in "$PO_DIR"/*.po; do
  fname=$(basename "$f")
  diff "$f" "/tmp/tt-test-reimport/$fname" | head -20
  echo "--- $fname: exit $? ---"
done
```

Checklist:

- [ ] Pliki `.po` nie zostały przeformatowane (diff pusty lub minimalne różnice)
- [ ] Długie single-line `msgstr` NIE zostały złamane na wiele linii
- [ ] Wieloliniowe `msgstr` zachowały swój oryginalny podział

### 4. Test VALIDATE

```bash
translation-toolkit validate --dir "$PO_DIR"
```

Checklist:

- [ ] Wykrywa brakujące tłumaczenia (klucze obecne w jednym języku, brak w innym)
- [ ] Wykrywa puste `msgstr`
- [ ] Wykrywa niezgodność zmiennych (np. `{{name}}`, `%s`, `{0}`)
- [ ] Klucze z `msgctxt` wyświetlają się jako `kontekst::klucz` (nie znak `\x04`)
- [ ] Raport jest czytelny i sensowny

### 5. Test STATS

```bash
translation-toolkit stats --dir "$PO_DIR"
```

Checklist:

- [ ] Pokazuje coverage % per język
- [ ] Paski postępu się wyświetlają (terminal colors/ASCII)
- [ ] Lista top missing keys jest sensowna
- [ ] Overall coverage się zgadza (policz ręcznie dla jednego języka jeśli wątpliwości)

### 6. Test DIFF

**6a. CSV vs CSV (ze zmianami):**

```bash
cp /tmp/tt-test-export.csv /tmp/tt-test-modified.csv

# Wprowadź 3 zmiany w modified.csv:
# 1) Zmień wartość w wierszu 3 (zamień tłumaczenie)
sed -i '' '3s/,[^,]*$/,ZMIENIONE/' /tmp/tt-test-modified.csv 2>/dev/null || \
sed -i  '3s/,[^,]*$/,ZMIENIONE/' /tmp/tt-test-modified.csv
# 2) Usuń wiersz 5 (symulacja usunięcia klucza)
sed -i '' '5d' /tmp/tt-test-modified.csv 2>/dev/null || \
sed -i  '5d' /tmp/tt-test-modified.csv
# 3) Dodaj nowy klucz na końcu
echo '"NEW_TEST_KEY","new value en","nowa wartość pl"' >> /tmp/tt-test-modified.csv

translation-toolkit diff /tmp/tt-test-export.csv /tmp/tt-test-modified.csv
```

Checklist:

- [ ] Wykrywa zmienioną wartość
- [ ] Wykrywa usunięty klucz
- [ ] Wykrywa dodany klucz

**6b. CSV vs .po (powinno być identyczne):**

```bash
translation-toolkit diff /tmp/tt-test-export.csv --dir "$PO_DIR"
```

Checklist:

- [ ] Wynik: "No differences" (bo CSV pochodzi z tych samych .po)

### 7. Test PREVIEW

```bash
translation-toolkit preview --dir "$PO_DIR" --port 3456
```

W osobnym terminalu / po uruchomieniu sprawdź:

```bash
curl -s http://localhost:3456/ | head -10
```

Checklist:

- [ ] Serwer startuje bez błędów
- [ ] Zwraca HTML (`<!DOCTYPE html>`)
- [ ] **Tabela tłumaczeń renderuje wiersze** (nie jest pusta!)
- [ ] Zakładki: Translations, Validation, Statistics, Diff — wszystkie działają
- [ ] Inline editing działa (kliknij komórkę → edytuj → Apply)
- [ ] Dark mode toggle działa
- [ ] Wyszukiwarka filtruje klucze

Po teście zatrzymaj serwer (Ctrl+C).

### 8. Edge cases

Sprawdź które z poniższych występują w projekcie i czy są obsłużone:

- [ ] Wieloliniowe `msgstr` (continuation lines) — czy export łączy je w jedną wartość?
- [ ] Wpisy z `msgctxt` — czy klucze mają `::` w CSV i w preview?
- [ ] Puste pliki `.po` (tylko nagłówek) — czy nie crashuje?
- [ ] Znaki specjalne: `\"`, `\t`, `\n` — czy round-trip je zachowuje?
- [ ] Bardzo długie `msgstr` (>500 znaków) — czy export/import działa?
- [ ] Wpisy z komentarzami (`#.`, `#:`, `#,`, `#| msgid`) — czy są zachowane po imporcie?
- [ ] Wpisy z flagą `fuzzy` — czy są wykrywane w validate?
- [ ] Klucze z cudzysłowami lub przecinkami w wartości — czy CSV jest poprawny?

### 9. RAPORT KOŃCOWY

Wygeneruj raport **dokładnie** w poniższym formacie:

```
## Translation Toolkit v1.2.0 — Test Report

**Projekt**: [nazwa projektu]
**Pliki .po**: X plików, Y języków
**Kluczy**: Z
**Data testu**: [data]

### Wyniki testów

| # | Test | Status | Uwagi |
|---|------|--------|-------|
| 0 | Instalacja | ✅/❌ | wersja: |
| 1 | Export (po→CSV) | ✅/❌ | X kluczy × Y języków |
| 2 | Import round-trip (CSV diff) | ✅/❌ | diff pusty? |
| 3 | Import format preservation (.po diff) | ✅/❌ | pliki .po bez zmian formatu? |
| 4 | Validate | ✅/❌ | X errors, Y warnings |
| 5 | Stats | ✅/❌ | overall coverage: X% |
| 6a | Diff (CSV vs CSV) | ✅/❌ | wykrywa zmiany/dodane/usunięte? |
| 6b | Diff (CSV vs .po) | ✅/❌ | "No differences"? |
| 7 | Preview server | ✅/❌ | tabela renderuje wiersze? |
| 8 | Multiline strings | ✅/❌/N/A | |
| 9 | msgctxt support | ✅/❌/N/A | |
| 10 | Special characters | ✅/❌ | |
| 11 | Comments preservation | ✅/❌/N/A | |
| 12 | Edge cases | ✅/❌ | |

### Błędy / problemy

(lista znalezionych problemów — każdy z opisem, krokami reprodukcji i ewentualnym stack trace)

### Co działa dobrze

(lista rzeczy które działają bez zarzutu)

### Sugestie usprawnień

(opcjonalne pomysły na nowe funkcje lub poprawki UX)
```

## PROMPT END
