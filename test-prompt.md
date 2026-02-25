# Translation Toolkit — Real Project Test Prompt

Wklej poniższy prompt w czacie nowego projektu (który ma pliki .po):

---

## PROMPT START

Zainstaluj i przetestuj narzędzie `translation-toolkit@2.0.0` (npm) na tym projekcie.
Wykonaj WSZYSTKIE poniższe kroki po kolei, notuj wyniki, a na końcu wygeneruj raport.

> Komendy: `export`, `import`, `preview`, `validate`, `stats`, `diff`

### 0. Instalacja

```bash
npm install -g translation-toolkit@2.0.0
translation-toolkit --version   # powinno wypisać 1.9.0
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
- [ ] Nagłówek: `key|<lang1>|<lang2>|...` (default delimiter `|`; z `-D ","` będzie `key,<lang1>,<lang2>`)
- [ ] Klucze z `msgctxt` mają separator `::` (np. `menu::Save`)
- [ ] Wieloliniowe wartości są w jednej komórce (w cudzysłowach CSV)
- [ ] Znaki specjalne (`\"`, `\t`, `\n`) poprawnie wyeksportowane

**2a. Test EXPORT z custom delimiterem (`-D`) [v1.5.1]:**

```bash
# Export z delimiterem przecinkowym
translation-toolkit export --dir "$PO_DIR" -o /tmp/tt-comma-export.csv -D ","
head -3 /tmp/tt-comma-export.csv
```

Checklist:

- [ ] Nagłówek: `key,<lang1>,<lang2>,...` (przecinek zamiast pipe)
- [ ] Wartości zawierające przecinki są w cudzysłowach
- [ ] Round-trip: import z `-D ","` → re-export → identyczny CSV

```bash
cp -r "$PO_DIR" /tmp/tt-comma-reimport
translation-toolkit import /tmp/tt-comma-export.csv --dir /tmp/tt-comma-reimport -D ","
translation-toolkit export --dir /tmp/tt-comma-reimport -o /tmp/tt-comma-reexport.csv -D ","
diff /tmp/tt-comma-export.csv /tmp/tt-comma-reexport.csv
echo "Exit code: $?"   # 0 = identyczne
```

- [ ] Round-trip z comma delimiterem jest bezstratny (diff pusty)

### 3. Test IMPORT --dry-run

```bash
# Dodaj nowy klucz do CSV (dynamicznie dopasowuje liczbę kolumn)
cp /tmp/tt-test-export.csv /tmp/tt-test-dryrun.csv
COLS=$(head -1 /tmp/tt-test-dryrun.csv | awk -F'|' '{print NF}')
ROW='DRYRUN_KEY'; for i in $(seq 2 $COLS); do ROW="$ROW|dry lang $((i-1))"; done
echo "$ROW" >> /tmp/tt-test-dryrun.csv

translation-toolkit import /tmp/tt-test-dryrun.csv --dir "$PO_DIR" --dry-run
```

Checklist:

- [ ] Wypisuje "DRY RUN — no files will be modified."
- [ ] Pokazuje "Would update: ..." z liczbą kluczy (+added, ~changed, -removed)
- [ ] Pliki `.po` NIE zostały zmienione (sprawdź `git status` lub `diff`)

### 4. Test IMPORT round-trip (CSV → po → CSV)

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
- [ ] **[v1.3.1 FIX]** Nagłówek `Plural-Forms` wieloliniowy (continuation line) zachował oryginalny podział linii (nie został znormalizowany do jednej linii)
- [ ] **[v1.3.1 FIX]** Puste linie między wpisami zachowały oryginalny wzorzec (nie zostały dodane/usunięte)
- [ ] **[v1.3.1 FIX]** Komentarze (`#.`, `#:`, `#,`) zachowane byte-for-byte
- [ ] **[v1.4.0 FIX]** Tagi `--ci` w `--help` są widoczne (`translation-toolkit --help | grep ci`)

### 4a. Test IMPORT --merge [v1.5.1]

W trybie domyślnym (replace) import **usuwa** klucze z `.po` których nie ma w CSV.
W trybie `--merge` zachowuje istniejące klucze i tylko dodaje/aktualizuje dane z CSV.

```bash
# Przygotuj CSV z mniejszą liczbą kluczy (symulacja częściowej aktualizacji)
cp /tmp/tt-test-export.csv /tmp/tt-merge-test.csv
# Usuń wiersze 3-5 (kilka kluczy "zniknie" z CSV)
sed -i '' '3,5d' /tmp/tt-merge-test.csv 2>/dev/null || \
sed -i  '3,5d' /tmp/tt-merge-test.csv

# Test replace mode (domyślny) — klucze powinny ZNIKNĄĆ
cp -r "$PO_DIR" /tmp/tt-replace-test
translation-toolkit import /tmp/tt-merge-test.csv --dir /tmp/tt-replace-test
translation-toolkit export --dir /tmp/tt-replace-test -o /tmp/tt-replace-result.csv
REPLACE_KEYS=$(wc -l < /tmp/tt-replace-result.csv | tr -d ' ')
echo "Replace mode keys: $REPLACE_KEYS"

# Test merge mode — klucze powinny POZOSTAĆ
cp -r "$PO_DIR" /tmp/tt-merge-actual
translation-toolkit import /tmp/tt-merge-test.csv --dir /tmp/tt-merge-actual --merge
translation-toolkit export --dir /tmp/tt-merge-actual -o /tmp/tt-merge-result.csv
MERGE_KEYS=$(wc -l < /tmp/tt-merge-result.csv | tr -d ' ')
echo "Merge mode keys: $MERGE_KEYS"
```

Checklist:

- [ ] Replace mode: `$REPLACE_KEYS` < oryginalna liczba kluczy (klucze usunięte)
- [ ] Merge mode: `$MERGE_KEYS` == oryginalna liczba kluczy (klucze zachowane)
- [ ] Merge mode: zmienione wartości w CSV są zaktualizowane w `.po`
- [ ] Merge mode: klucze nieobecne w CSV mają oryginalne wartości

### 5. Test VALIDATE

```bash
translation-toolkit validate --dir "$PO_DIR"
```

Checklist:

- [ ] Wykrywa brakujące tłumaczenia (klucze obecne w jednym języku, brak w innym)
- [ ] Wykrywa puste `msgstr`
- [ ] Wykrywa niezgodność zmiennych (np. `{{name}}`, `%s`, `{0}`)
- [ ] Klucze z `msgctxt` wyświetlają się jako `kontekst::klucz` (nie znak `\x04`)
- [ ] Exit code = 1 jeśli są błędy (errors), exit code = 0 jeśli brak błędów
- [ ] Raport jest czytelny i sensowny

### 6. Test STATS

```bash
translation-toolkit stats --dir "$PO_DIR"
```

Checklist:

- [ ] Pokazuje coverage % per język
- [ ] Paski postępu się wyświetlają (terminal colors/ASCII)
- [ ] Lista top missing keys jest sensowna
- [ ] Overall coverage się zgadza (policz ręcznie dla jednego języka jeśli wątpliwości)

### 7. Test DIFF

**7a. CSV vs CSV (ze zmianami):**

```bash
cp /tmp/tt-test-export.csv /tmp/tt-test-modified.csv

# Wprowadź 3 zmiany w modified.csv:
# 1) Zmień wartość w wierszu 3 (zamień tłumaczenie)
sed -i '' '3s/|[^|]*$/|ZMIENIONE/' /tmp/tt-test-modified.csv 2>/dev/null || \
sed -i  '3s/|[^|]*$/|ZMIENIONE/' /tmp/tt-test-modified.csv
# 2) Usuń wiersz 5 (symulacja usunięcia klucza)
sed -i '' '5d' /tmp/tt-test-modified.csv 2>/dev/null || \
sed -i  '5d' /tmp/tt-test-modified.csv
# 3) Dodaj nowy klucz na końcu (dynamicznie dopasowuje liczbę kolumn)
COLS=$(head -1 /tmp/tt-test-modified.csv | awk -F'|' '{print NF}')
NEW_ROW='NEW_TEST_KEY'; for i in $(seq 2 $COLS); do NEW_ROW="$NEW_ROW|new val $((i-1))"; done
echo "$NEW_ROW" >> /tmp/tt-test-modified.csv

translation-toolkit diff /tmp/tt-test-export.csv /tmp/tt-test-modified.csv
```

Checklist:

- [ ] Wykrywa zmienioną wartość
- [ ] Wykrywa usunięty klucz
- [ ] Wykrywa dodany klucz

**7b. CSV vs .po (powinno być identyczne):**

```bash
translation-toolkit diff /tmp/tt-test-export.csv --dir "$PO_DIR"
```

Checklist:

- [ ] Wynik: "No differences" (bo CSV pochodzi z tych samych .po)

### 8. Test PREVIEW

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
- [ ] **[v1.4.0 FIX]** Nagłówek tabeli (wiersz z "Key", nazwami języków) jest przypięty na samej górze tabeli — **NIE** jest przesunięty o kilka wierszy w dół. Przy scrollowaniu header powinien być zawsze widoczny i przyklejony bezpośrednio pod toolbarem.
- [ ] Zakładki: Translations, Validation, Statistics, Diff — wszystkie działają
- [ ] Inline editing działa (kliknij komórkę → edytuj → Apply)
- [ ] Dark mode toggle działa
- [ ] Wyszukiwarka filtruje klucze

Po teście zatrzymaj serwer (Ctrl+C).

**8a. Test port auto-increment:**

```bash
# Zajmij port 3456, uruchom preview na tym samym porcie
node -e "require('net').createServer().listen(3456, () => console.log('blocking 3456'))" &
BLOCKER_PID=$!
translation-toolkit preview --dir "$PO_DIR" --port 3456 &
PREVIEW_PID=$!
sleep 2
curl -s http://localhost:3457/ | head -3
kill $PREVIEW_PID $BLOCKER_PID 2>/dev/null
```

Checklist:

- [ ] Wypisuje "Port 3456 is in use, trying 3457..."
- [ ] Serwer uruchamia się na porcie 3457
- [ ] Informacja "(requested port 3456 was in use)" w output

**8b. Test --watch mode:**

```bash
translation-toolkit preview --dir "$PO_DIR" --port 3458 --watch &
WATCH_PID=$!
sleep 2
# Zmodyfikuj plik .po i sprawdź czy serwer przeładował
touch "$PO_DIR"/*.po
sleep 1
kill $WATCH_PID 2>/dev/null
```

Checklist:

- [ ] **[v1.3.1 FIX]** Serwer startuje bez crashu (w v1.3.0 crashował z `fs is not defined`)
- [ ] **[v1.4.0 NEW]** Flaga `--ci` działa: `translation-toolkit preview --dir "$PO_DIR" --port 3459 --ci &` → auto-wybiera katalog bez pytania
- [ ] Wypisuje "Watching for .po changes..." na starcie
- [ ] Po `touch` wypisuje "↻ Reloaded (... changed)"
- [ ] Serwer dalej działa po przeładowaniu

**8c. Test --static (standalone HTML export) [v1.4.0 NEW]:**

```bash
translation-toolkit preview --dir "$PO_DIR" --static
ls -la translation-preview/index.html
```

Checklist:

- [ ] Generuje plik `translation-preview/index.html` bez błędów
- [ ] Plik zawiera `STATIC_MODE = true`
- [ ] Wszystkie dane tłumaczeń osadzone w HTML
- [ ] Tabela, walidacja, statystyki, diff — wszystkie zakładki obecne

**Test custom output path:**

```bash
translation-toolkit preview --dir "$PO_DIR" --static -o /tmp/tt-static-preview.html
ls -la /tmp/tt-static-preview.html
```

- [ ] Plik utworzony pod wskazaną ścieżką
- [ ] Rozmiar > 1 KB

**Test --static + --watch rejection:**

```bash
translation-toolkit preview --dir "$PO_DIR" --static --watch 2>&1
echo "Exit: $?"
```

- [ ] Wypisuje błąd "Error: --watch cannot be used with --static"
- [ ] Exit code != 0

**Test --static with empty dir:**

```bash
mkdir -p /tmp/tt-empty-dir
translation-toolkit preview --dir /tmp/tt-empty-dir --static 2>&1
echo "Exit: $?"
rm -rf /tmp/tt-empty-dir
```

- [ ] Wypisuje błąd o braku plików .po
- [ ] Exit code != 0

**8d. Test deployed static HTML (serwowanie jako strona) [v1.4.0 NEW]:**

```bash
# Wygeneruj static HTML i wystawij na prostym serwerze
translation-toolkit preview --dir "$PO_DIR" --static -o /tmp/tt-static-deploy.html

# Serwuj plik na porcie 8899 (symulacja GitHub Pages / nginx / S3)
python3 -m http.server 8899 --directory /tmp &
STATIC_SERVER_PID=$!
sleep 1

# Pobierz stronę i sprawdź zawartość
curl -s http://localhost:8899/tt-static-deploy.html > /tmp/tt-static-fetched.html
STATIC_SIZE=$(wc -c < /tmp/tt-static-fetched.html | tr -d ' ')
echo "Fetched size: $STATIC_SIZE bytes"

# Sprawdź kluczowe elementy HTML
echo "=== Struktura ==="
grep -c 'STATIC_MODE = true' /tmp/tt-static-fetched.html
grep -c '<table' /tmp/tt-static-fetched.html
grep -c 'tab-btn' /tmp/tt-static-fetched.html       # zakładki
grep -c 'searchInput' /tmp/tt-static-fetched.html    # wyszukiwarka
grep -c 'dark-mode' /tmp/tt-static-fetched.html      # dark mode toggle
grep -c 'clientDiff' /tmp/tt-static-fetched.html     # client-side diff
grep -c 'display:none\|display: none' /tmp/tt-static-fetched.html  # save bar ukryty

# Sprawdź że dane tłumaczeń są osadzone (nie ładowane z API)
grep -c 'DATA_ROWS' /tmp/tt-static-fetched.html || \
  grep -c 'const rows' /tmp/tt-static-fetched.html || \
  echo "WARNING: Nie znaleziono osadzonych danych tłumaczeń"

kill $STATIC_SERVER_PID 2>/dev/null
rm -f /tmp/tt-static-deploy.html /tmp/tt-static-fetched.html
```

Checklist:

- [ ] Plik HTML serwuje się poprawnie z prostego serwera HTTP (curl zwraca treść)
- [ ] Rozmiar pobranego pliku > 1 KB (dane są osadzone)
- [ ] `STATIC_MODE = true` obecne
- [ ] Tabela HTML obecna (`<table>`)
- [ ] Zakładki obecne (`tab-btn`): Translations, Validation, Statistics, Diff
- [ ] Wyszukiwarka obecna (`searchInput`)
- [ ] Dark mode toggle obecny
- [ ] Client-side diff obecny (`clientDiff`) — diff działa bez backendu
- [ ] Save bar ukryty (`display:none`) — edycja zablokowana w trybie statycznym
- [ ] Dane tłumaczeń osadzone inline (nie wymagają fetch do API)
- [ ] **Plik jest w pełni self-contained** — zero zewnętrznych zależności (brak CDN, brak fetch)

### 9. Edge cases

Sprawdź które z poniższych występują w projekcie i czy są obsłużone:

- [ ] Wieloliniowe `msgstr` (continuation lines) — czy export łączy je w jedną wartość?
- [ ] Wpisy z `msgctxt` — czy klucze mają `::` w CSV i w preview?
- [ ] Puste pliki `.po` (tylko nagłówek) — czy nie crashuje?
- [ ] Znaki specjalne: `\"`, `\t`, `\n` — czy round-trip je zachowuje?
- [ ] Bardzo długie `msgstr` (>500 znaków) — czy export/import działa?
- [ ] Wpisy z komentarzami (`#.`, `#:`, `#,`, `#| msgid`) — czy są zachowane po imporcie?
- [ ] Wpisy z flagą `fuzzy` — czy są wykrywane w validate?
- [ ] Klucze z cudzysłowami lub przecinkami w wartości — czy CSV jest poprawny?

### 10. Testy regresyjne v1.4.0

> Te testy weryfikują fixy z v1.3.1 i v1.4.0.

**R1. --watch nie crashuje (był: `fs is not defined`)**

Jeśli krok 8b przeszedł — ten test jest zaliczony. Jeśli serwer wyrzucił `ReferenceError: fs is not defined` — regresja.

**R2. Nagłówek tabeli preview nie jest przesunięty [v1.4.0 FIX]**

Otwórz preview w przeglądarce. Przewiń tabelę w dół. Sprawdź czy nagłówek (`Key | en | pl`) jest **przyklejony bezpośrednio pod toolbarem** (search bar), a nie przesunięty o 3-4 wiersze danych.

> Root cause w v1.3.0–v1.3.1: `overflow: hidden` na `<table>` tworzył nowy CSS scroll container, przez co `position: sticky` nie działał względem viewportu. Fix w v1.4.0: usunięto `overflow: hidden`, zmieniono `border-collapse: collapse` → `border-collapse: separate; border-spacing: 0`.

- [ ] Nagłówek tabeli jest na pozycji 1 (zaraz pod toolbarem)
- [ ] Przy scrollowaniu nagłówek nie znika i nie "skacze"

**R3. Import nie zmienia nagłówka Plural-Forms**

```bash
# Sprawdź oryginalny nagłówek Plural-Forms
grep -A1 "Plural-Forms" "$PO_DIR"/*.po | head -10

# Po round-trip z kroku 4, porównaj:
grep -A1 "Plural-Forms" /tmp/tt-test-reimport/*.po | head -10
```

- [ ] Wieloliniowy `Plural-Forms` (jeśli był) zachował continuation lines
- [ ] Wartość `Plural-Forms` jest identyczna byte-for-byte

**R4. Import nie zmienia pustych linii między wpisami**

```bash
# Policz puste linie w oryginale vs reimport
for f in "$PO_DIR"/*.po; do
  fname=$(basename "$f")
  orig_blanks=$(grep -c '^$' "$f")
  new_blanks=$(grep -c '^$' "/tmp/tt-test-reimport/$fname")
  echo "$fname: original=$orig_blanks reimport=$new_blanks $([ $orig_blanks -eq $new_blanks ] && echo '✅' || echo '❌ DIFFERENT')"
done
```

- [ ] Liczba pustych linii identyczna w każdym pliku

**R5. Flaga --ci auto-wybiera katalog [v1.4.0 NEW]**

Jeśli projekt ma wiele katalogów z `.po` (lub nawet jeden):

```bash
translation-toolkit export --dir "$PO_DIR" -o /tmp/tt-ci-test.csv --ci
echo "Exit: $?"
```

- [ ] Komenda nie pyta o wybór katalogu (auto-wybiera pierwszy)
- [ ] Wypisuje "CI mode: ..." jeśli znaleziono wiele katalogów
- [ ] Exit code 0

**R6. --static generuje standalone HTML [v1.4.0 NEW]**

```bash
translation-toolkit preview --dir "$PO_DIR" --static -o /tmp/tt-static-test.html
# Sprawdź zawartość
grep -c "STATIC_MODE = true" /tmp/tt-static-test.html
grep -c "parseCsvString" /tmp/tt-static-test.html
grep -c "clientDiff" /tmp/tt-static-test.html
```

- [ ] Plik HTML zawiera `STATIC_MODE = true`
- [ ] Plik zawiera client-side CSV parser (`parseCsvString`)
- [ ] Plik zawiera client-side diff (`clientDiff`)
- [ ] Inline editing jest zablokowany (guard `if (STATIC_MODE) return`)
- [ ] Save bar ma `display:none`

### 13. Test PLURAL FORMS (v1.5.0)

> Testuje pełny pipeline `msgid_plural` / `msgstr[N]` — export, import, validate, stats, preview, diff.

**13a. Sprawdź czy projekt ma wpisy z `msgid_plural`**

```bash
grep -l "msgid_plural" "$PO_DIR"/*.po
grep -c "msgid_plural" "$PO_DIR"/*.po
```

Zanotuj:

- Liczba plików z pluralami: \_\_\_
- Łączna liczba wpisów z `msgid_plural`: \_\_\_

**13b. Export plurali do CSV**

```bash
translation-toolkit export --dir "$PO_DIR" -o /tmp/tt-plural-test.csv
grep '\[0\]' /tmp/tt-plural-test.csv | head -5
grep '\[1\]' /tmp/tt-plural-test.csv | head -5
grep '\[2\]' /tmp/tt-plural-test.csv | head -5
```

- [ ] Log eksportu mówi "X plural" (lub "X keys (Y plural)")
- [ ] CSV zawiera wiersze `key[0]`, `key[1]`, `key[2]` dla plurali
- [ ] Języki z 2 formami (en, de) mają `[0]` i `[1]`, puste `[2]`
- [ ] Języki z 3 formami (pl, cs, ru) mają wartości w `[2]`

**13c. Import plurali (round-trip)**

```bash
cp -R "$PO_DIR" /tmp/tt-plural-reimport
translation-toolkit import /tmp/tt-plural-test.csv --dir /tmp/tt-plural-reimport
diff -r "$PO_DIR" /tmp/tt-plural-reimport
```

- [ ] Import nie zmienił plików (round-trip bezstratny)
- [ ] Formy pluralne `msgstr[0]`…`msgstr[N]` są identyczne

**13d. Validate — sprawdzenie plurali**

```bash
translation-toolkit validate --dir "$PO_DIR"
```

- [ ] Raport pokazuje "Plural entries: X"
- [ ] Sprawdza `nplurals-mismatch` (forma vs nagłówek)
- [ ] Sprawdza `empty-plural-form`
- [ ] Sprawdza `missing-plural-key` / `extra-plural-key`
- [ ] Sprawdza spójność zmiennych (`%d`, `%s`) w formach pluralnych

**13e. Stats — liczniki plurali**

```bash
translation-toolkit stats --dir "$PO_DIR"
```

- [ ] Raport per-język pokazuje "Plurals: X entries (Y forms, Z empty)"
- [ ] Liczba `pluralKeys` zgadza się z `grep -c msgid_plural`

**13f. Preview — wyświetlanie plurali**

```bash
translation-toolkit preview --dir "$PO_DIR" --port 3456
# Otwórz http://localhost:3456 w przeglądarce
```

- [ ] Wiersze pluralne mają etykietę "plural" (badge)
- [ ] Wiersze pluralne mają subtelne kolorowe tło (accent)
- [ ] Klucze pluralne wyświetlane jako `klucz[0]`, `klucz[1]`, `klucz[2]`
- [ ] Kliknięcie na komórkę pluralną NIE otwiera edytora (read-only)
- [ ] Search filtruje wiersze pluralne poprawnie

**13g. Static preview — plurale w standalone HTML**

```bash
translation-toolkit preview --dir "$PO_DIR" --static -o /tmp/tt-plural-static.html
# Otwórz plik w przeglądarce
```

- [ ] Wiersze pluralne widoczne z badge "plural"
- [ ] Dane pluralne obecne w osadzonym `DATA` array

**13h. Diff — plurale w porównaniu**

```bash
# Zmień wartość pluralną w CSV
cp /tmp/tt-plural-test.csv /tmp/tt-plural-modified.csv
# (edytuj jedną wartość key[1] w pliku)
translation-toolkit diff /tmp/tt-plural-test.csv /tmp/tt-plural-modified.csv
echo "Exit: $?"
```

- [ ] Diff wykrywa zmianę w wierszu `key[N]`
- [ ] `translation-toolkit diff /tmp/tt-plural-test.csv --dir "$PO_DIR"` → "No differences" (CSV-vs-PO)

### 14. Test FUZZY DETECTION (v1.5.2)

Fuzzy entries (`#, fuzzy`) to tłumaczenia oznaczone jako wymagające przeglądu. Od v1.5.2 narzędzie wykrywa i raportuje je we wszystkich komendach.

**Validate — fuzzy warnings:**

```bash
translation-toolkit validate --dir "$PO_DIR"
```

- [ ] Jeśli projekt ma `#, fuzzy` w plikach .po → validate powinno wypisać warning `fuzzy-entry` dla każdego fuzzy klucza
- [ ] Fuzzy issues mają severity `warning` (nie blokują — exit code 0 jeśli brak innych errors)
- [ ] Nagłówek raportu pokazuje liczbę fuzzy entries: np. `(3 fuzzy)`

**Stats — fuzzy counter:**

```bash
translation-toolkit stats --dir "$PO_DIR"
```

- [ ] Dla każdego języka: linia `Fuzzy: X entries need review` (0 jeśli brak fuzzy)

**Preview — fuzzy badge:**

```bash
translation-toolkit preview --dir "$PO_DIR" --static -o /tmp/tt-fuzzy-preview.html
open /tmp/tt-fuzzy-preview.html
```

- [ ] Fuzzy wpisy mają żółte tło wiersza (`.fuzzy-row`)
- [ ] Obok klucza widoczna etykieta `fuzzy` (żółta odznaka `.fuzzy-badge`)
- [ ] Fuzzy wpisy SĄ edytowalne (w przeciwieństwie do plural entries które są read-only)

**Jeśli projekt NIE ma fuzzy entries:**

```bash
# Utwórz tymczasowy plik .po z fuzzy entry:
mkdir -p /tmp/tt-fuzzy-test
cat > /tmp/tt-fuzzy-test/en-US.po << 'EOF'
msgid ""
msgstr ""
"Language: en\n"
"Content-Type: text/plain; charset=UTF-8\n"

#, fuzzy
msgid "needs.review"
msgstr "This needs review"

msgid "clean.entry"
msgstr "This is clean"
EOF

translation-toolkit validate --dir /tmp/tt-fuzzy-test
translation-toolkit stats --dir /tmp/tt-fuzzy-test
```

- [ ] Validate raportuje 1 fuzzy-entry warning
- [ ] Stats pokazuje `Fuzzy: 1 entries need review`

### 15. Test \_STATUS COLUMN & UNFUZZY (v1.6.0)

**Export z kolumną `_status`:**

```bash
translation-toolkit export --dir "$PO_DIR" -o /tmp/tt-status.csv
```

- [ ] CSV ma kolumnę `_status` między `key` a językami: `key|_status|en|pl|...`
- [ ] Wpisy z `#, fuzzy` mają `_status=fuzzy`, reszta pusty string
- [ ] `--no-status` pomija kolumnę `_status`:

```bash
translation-toolkit export --dir "$PO_DIR" -o /tmp/tt-nostatus.csv --no-status
head -1 /tmp/tt-nostatus.csv   # powinno być: key|en|pl|...
```

**Import z unfuzzy:**

```bash
# Wyeksportuj z _status, usuń "fuzzy" z kolumny _status (unfuzzy)
cp /tmp/tt-status.csv /tmp/tt-unfuzzy.csv
# Edytuj /tmp/tt-unfuzzy.csv: zmień "fuzzy" na "" w kolumnie _status
sed -i '' 's/|fuzzy|/||/g' /tmp/tt-unfuzzy.csv
translation-toolkit import /tmp/tt-unfuzzy.csv --dir "$PO_DIR" --dry-run
```

- [ ] Dry-run raportuje zmiany fuzzy status
- [ ] Po prawdziwym imporcie: wpisy które miały `#, fuzzy` tracą tę flagę
- [ ] Inne flagi na linii `#,` (np. `c-format`) są zachowane
- [ ] CSV bez kolumny `_status` nie zmienia flag fuzzy (backwards compatible)

### 16. Test VALIDATE --json & --severity (v1.6.0)

**JSON output:**

```bash
translation-toolkit validate --dir "$PO_DIR" --json
```

- [ ] Output jest poprawnym JSON (parsuje się przez `jq .`)
- [ ] Struktura: `{ "errors": [...], "warnings": [...], "summary": { ... } }`
- [ ] Każdy error/warning ma: `type`, `lang`, `key`, `message`
- [ ] `summary` zawiera: `refLang`, `languages`, `totalKeys`, `totalPluralKeys`, `totalFuzzyKeys`, `errorCount`, `warningCount`
- [ ] Klucze z `msgctxt` używają `::` (nie `\x04`)
- [ ] Brak kodów ANSI w outputcie JSON

**Severity filter:**

```bash
# Pokaż tylko errory (ukryj fuzzy warnings)
translation-toolkit validate --dir "$PO_DIR" --severity error
```

- [ ] Warnings (np. fuzzy-entry) są ukryte
- [ ] Tylko errory (missing-key, variable-mismatch) są widoczne
- [ ] Exit code 0 jeśli brak errorów (nawet jeśli są warnings)

```bash
# Połączenie z --json
translation-toolkit validate --dir "$PO_DIR" --json --severity error
```

- [ ] JSON `warnings` array jest pusty
- [ ] JSON `errors` array zawiera errory

```bash
# Default (--severity warning) pokazuje wszystko
translation-toolkit validate --dir "$PO_DIR" --json --severity warning
```

- [ ] JSON zawiera zarówno errory jak i warnings

### 17. Test JSON FORMAT (v1.7.0)

Nowa funkcjonalność: eksport/import do formatu JSON (per-language files).

```bash
# Export do JSON
mkdir -p /tmp/tt-json-test
translation-toolkit export --format json -o /tmp/tt-json-test --dir "$PO_DIR" --ci
```

- [ ] Tworzy osobny .json per język (np. en.json, pl.json)
- [ ] JSON jest pretty-printed (2 spacje indent)
- [ ] Klucze singularne → string values
- [ ] Klucze pluralne → arrays: `"%d file": ["%d file", "%d files"]`
- [ ] Klucze z msgctxt używają `::` separator: `"menu::Save"`

```bash
# Sprawdź zawartość
cat /tmp/tt-json-test/en.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('Keys:', len(d)); plurals=[k for k,v in d.items() if isinstance(v,list)]; print('Plural:', len(plurals))"
```

- [ ] Liczba kluczy zgadza się z liczbą z export CSV
- [ ] Plurale zgadzają się

```bash
# Import JSON z powrotem (dry-run)
translation-toolkit import --format json /tmp/tt-json-test --dir "$PO_DIR" --ci --dry-run
```

- [ ] Import wykrywa pliki JSON
- [ ] Dry-run raportuje "Would update" bez zmian plików
- [ ] Zmiany = 0 (round-trip powinien być bezstratny)

```bash
# Import JSON z powrotem (faktyczny)
# Najpierw skopiuj .po do temp
cp -r "$PO_DIR" /tmp/tt-json-po-copy
translation-toolkit import --format json /tmp/tt-json-test --dir /tmp/tt-json-po-copy --ci
```

- [ ] Import aktualizuje pliki .po
- [ ] `diff` między oryginalnymi a reimportowanymi .po nie pokazuje zmian wartości

```bash
# Test nested JSON import
echo '{"menu": {"save": "Save", "open": "Open"}, "title": "Hello"}' > /tmp/tt-json-test/en.json
translation-toolkit import --format json /tmp/tt-json-test --dir /tmp/tt-json-po-copy --ci --merge --dry-run
```

- [ ] Nested JSON jest auto-flatten: `menu.save`, `menu.open`, `title`
- [ ] Merge mode zachowuje istniejące klucze

```bash
# Test invalid format
translation-toolkit export --format xml --dir "$PO_DIR" --ci 2>&1
```

- [ ] Error: "Unknown format" + exit code 1

### 18. Test i18next FORMAT (v1.8.0)

Nowa funkcjonalność: eksport/import do formatu i18next z mapowaniem CLDR plural forms.

```bash
# Export do i18next v4 (CLDR — default)
mkdir -p /tmp/tt-i18next-v4
translation-toolkit export --format i18next -o /tmp/tt-i18next-v4 --dir "$PO_DIR" --ci
```

- [ ] Tworzy osobny .json per język (np. en.json, pl.json)
- [ ] JSON jest pretty-printed (2 spacje indent)
- [ ] Klucze singularne → string values
- [ ] En plural sufiksy: `_one`, `_other` (np. `%d file_one`, `%d file_other`)
- [ ] Pl plural sufiksy: `_one`, `_few`, `_many`
- [ ] Log zawiera "[i18next v4 (CLDR)]"

```bash
# Sprawdź CLDR sufiksy
cat /tmp/tt-i18next-v4/en.json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(k) for k in d if '_one' in k or '_other' in k]"
```

- [ ] Widać klucze z sufiksami `_one`, `_other`
- [ ] Nie ma kluczy z sufiksami `_plural`, `_0`, `_1`, `_2`

```bash
# Export do i18next v3 (legacy)
mkdir -p /tmp/tt-i18next-v3
translation-toolkit export --format i18next --compat 3 -o /tmp/tt-i18next-v3 --dir "$PO_DIR" --ci
```

- [ ] En plural: base key + `_plural` (np. `%d file` + `%d file_plural`)
- [ ] Pl plural (nplurals=3): `_0`, `_1`, `_2` (np. `%d file_0`, `%d file_1`, `%d file_2`)
- [ ] Log zawiera "[i18next v3]"

```bash
# Import i18next v4 — round-trip
cp -r "$PO_DIR" /tmp/tt-i18next-po-copy
translation-toolkit import --format i18next /tmp/tt-i18next-v4 --dir /tmp/tt-i18next-po-copy --ci
```

- [ ] Import wykrywa pliki JSON z CLDR sufiksami
- [ ] Round-trip bezstratny: `diff` między oryginalnymi a reimportowanymi .po nie pokazuje zmian wartości

```bash
# Import i18next v3 — round-trip
cp -r "$PO_DIR" /tmp/tt-i18next-po-v3
translation-toolkit import --format i18next --compat 3 /tmp/tt-i18next-v3 --dir /tmp/tt-i18next-po-v3 --ci
```

- [ ] Import v3 poprawnie mapuje `_plural` → msgstr[1], `_0/_1/_2` → msgstr[0]/[1]/[2]

### 19. Test CROSS-FORMAT VALIDATION (v1.9.0)

```bash
# Przygotowanie — wyeksportuj JSON i i18next
PO_DIR="ścieżka/do/po"
translation-toolkit export --format json -o /tmp/tt-json --dir "$PO_DIR" --ci
translation-toolkit export --format i18next -o /tmp/tt-i18next --dir "$PO_DIR" --ci
```

**Testy walidacji cross-format:**

```bash
# Test 1: In-sync JSON — exit code 0
translation-toolkit validate --dir "$PO_DIR" --cross-format json --format-dir /tmp/tt-json --ci
echo "Exit code: $?"
```

- [ ] Exit code = 0
- [ ] Output zawiera "in sync"

```bash
# Test 2: In-sync i18next — exit code 0
translation-toolkit validate --dir "$PO_DIR" --cross-format i18next --format-dir /tmp/tt-i18next --ci
echo "Exit code: $?"
```

- [ ] Exit code = 0

```bash
# Test 3: Zmodyfikuj JSON i sprawdź — usunięcie klucza → error
cp -r /tmp/tt-json /tmp/tt-json-modified
# Usuń pierwszy klucz z en.json
node -e "const f=require('fs');const d=JSON.parse(f.readFileSync('/tmp/tt-json-modified/en.json'));const keys=Object.keys(d);delete d[keys[0]];f.writeFileSync('/tmp/tt-json-modified/en.json',JSON.stringify(d,null,2))"
translation-toolkit validate --dir "$PO_DIR" --cross-format json --format-dir /tmp/tt-json-modified --ci
echo "Exit code: $?"
```

- [ ] Exit code = 1
- [ ] Output zawiera "missing" + nazwa usuniętego klucza

```bash
# Test 4: --json output z --cross-format
translation-toolkit validate --dir "$PO_DIR" --cross-format json --format-dir /tmp/tt-json-modified --json --ci
```

- [ ] Poprawny JSON z sekcją `crossFormat`
- [ ] `crossFormat.errors` zawiera brakujący klucz
- [ ] `crossFormat.summary` z `poLanguages`, `formatLanguages`, `totalPoKeys`, `totalFormatKeys`

```bash
# Test 5: --severity error filtruje wartości mismatches (same klucze, inne wartości)
node -e "const f=require('fs');const d=JSON.parse(f.readFileSync('/tmp/tt-json/en.json'));const keys=Object.keys(d);d[keys[0]]='ZMIENIONA WARTOŚĆ';f.writeFileSync('/tmp/tt-json/en.json',JSON.stringify(d,null,2))"
translation-toolkit validate --dir "$PO_DIR" --cross-format json --format-dir /tmp/tt-json --severity error --ci
echo "Exit code: $?"
```

- [ ] Exit code = 0 (value mismatch to warning, nie error)

### 11. Anomalie i niestandardowe zachowania

**WAŻNE**: Przez cały czas testowania notuj WSZYSTKIE niespodziewane zachowania, nawet jeśli nie są błędami. Anomalie to rzeczy, które Cię zaskoczyły, wymagały dodatkowej interwencji lub mogą być problemem dla innych użytkowników.

Przykłady anomalii:

- Port zajęty → serwer nie startuje (lub automatycznie przeskakuje)
- Nieoczekiwane warningi w konsoli
- Długi czas wykonania komendy (>5 s)
- Dziwne formatowanie outputu (znaki sterujące, broken UTF-8)
- Proces nie kończy się po Ctrl+C (trzeba kill)
- Plik tymczasowy nie został usunięty
- Komenda zwraca exit code 0 mimo błędu (lub odwrotnie)
- Brakujące/nadmiarowe puste linie w output
- Nieczytelne komunikaty błędów (brak kontekstu, stacktrace zamiast ludzkiego opisu)
- Cokolwiek, co sprawia, że musisz się zatrzymać i pomyśleć "to dziwne"

Dla każdej anomalii zanotuj:

1. **Przy którym kroku** wystąpiła
2. **Co się stało** (dokładny output)
3. **Co oczekiwałeś**
4. **Czy to blocker** (uniemożliwia dalszą pracę) czy tylko irytujące

### 12. RAPORT KOŃCOWY

Wygeneruj raport **dokładnie** w poniższym formacie:

```
## Translation Toolkit v1.7.0 — Test Report

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
| 2a | Export `-D` comma delimiter | ✅/❌ | round-trip z comma bezstratny? |
| 3 | Import --dry-run | ✅/❌ | pliki niezmienione? raport poprawny? |
| 4 | Import format preservation (.po diff) | ✅/❌ | pliki .po bez zmian formatu? |
| 4a | Import --merge mode | ✅/❌ | klucze zachowane? zmiany zaktualizowane? |
| 5 | Validate | ✅/❌ | X errors, Y warnings |
| 6 | Stats | ✅/❌ | overall coverage: X% |
| 7a | Diff (CSV vs CSV) | ✅/❌ | wykrywa zmiany/dodane/usunięte? |
| 7b | Diff (CSV vs .po) | ✅/❌ | "No differences"? |
| 8 | Preview server | ✅/❌ | tabela renderuje wiersze? |
| 8a | Preview port auto-increment | ✅/❌ | przeskakuje na wolny port? |
| 8b | Preview --watch | ✅/❌ | przeładowuje po zmianie .po? |
| 9 | Multiline strings | ✅/❌/N/A | |
| 10 | msgctxt support | ✅/❌/N/A | |
| 11 | Special characters | ✅/❌ | |
| 12 | Comments preservation | ✅/❌/N/A | |
| 13 | Edge cases | ✅/❌ | |
| 14 | --static HTML export | ✅/❌ | standalone HTML generated? |
| 15 | --static custom output | ✅/❌ | -o flag works? |
| 16 | --static + --watch rejection | ✅/❌ | error message shown? |
| 17 | --static deployed HTML | ✅/❌ | serves from static server? self-contained? |
| **R1** | **--watch nie crashuje** | ✅/❌ | v1.3.0 bug: `fs is not defined` |
| **R2** | **Nagłówek tabeli na pozycji 1** | ✅/❌ | v1.3.0 bug: header na 4. pozycji |
| **R3** | **Plural-Forms zachowany** | ✅/❌ | v1.3.0 bug: normalizacja do 1 linii |
| **R4** | **Puste linie zachowane** | ✅/❌ | v1.3.0 bug: dodawanie/usuwanie blank lines |
| **R5** | **--ci auto-wybiera katalog** | ✅/❌ | v1.4.0 new: nie pyta o wybór |
| **R6** | **--static standalone HTML** | ✅/❌ | v1.4.0 new: client-side diff, no server |
| **R7** | **Plural export key[N] rows** | ✅/❌ | v1.5.0 new: plurals as key[0], key[1]… |
| **R8** | **Plural import round-trip** | ✅/❌ | v1.5.0 new: key[N] → msgstr[N] |
| **R9** | **Plural validate checks** | ✅/❌ | v1.5.0 new: nplurals, empty forms |
| **R10** | **Plural preview read-only** | ✅/❌ | v1.5.0 new: badge, no editing |
| **R11** | **Custom delimiter `-D` round-trip** | ✅/❌ | v1.5.1 new: comma/tab export→import |
| **R12** | **Import `--merge` mode** | ✅/❌ | v1.5.1 new: keeps existing keys |
| **R13** | **Validate exit code** | ✅/❌ | v1.5.1 new: exit 1 on errors, 0 otherwise |
| **R14** | **Fuzzy validate warnings** | ✅/❌ | v1.5.2 new: `fuzzy-entry` type, severity warning |
| **R15** | **Fuzzy stats counter** | ✅/❌ | v1.5.2 new: `Fuzzy: X entries need review` |
| **R16** | **Fuzzy preview badge** | ✅/❌ | v1.5.2 new: yellow row + fuzzy badge |
| **R17** | **_status column in export** | ✅/❌ | v1.6.0 new: `_status` column between key and langs |
| **R18** | **--no-status flag** | ✅/❌ | v1.6.0 new: omits `_status` column |
| **R19** | **Unfuzzy on import** | ✅/❌ | v1.6.0 new: empty `_status` removes `#, fuzzy` |
| **R20** | **validate --json** | ✅/❌ | v1.6.0 new: JSON output with errors/warnings/summary |
| **R21** | **validate --severity error** | ✅/❌ | v1.6.0 new: hides warnings, exit 0 if no errors |
| **R22** | **--format json export** | ✅/❌ | v1.7.0 new: per-lang .json files, plurals as arrays |
| **R23** | **--format json import round-trip** | ✅/❌ | v1.7.0 new: JSON → .po preserves all entries |
| **R24** | **--format i18next export v4** | ✅/❌ | v1.8.0 new: CLDR suffixes _one/_other/_few/_many |
| **R25** | **--format i18next --compat 3** | ✅/❌ | v1.8.0 new: v3 legacy _plural/_0/_1/_2 |
| **R26** | **--format i18next round-trip** | ✅/❌ | v1.8.0 new: i18next → .po preserves singular+plural |
| **R27** | **validate --cross-format json** | ✅/❌ | v1.9.0 new: no issues for in-sync JSON exports |
| **R28** | **validate --cross-format missing key** | ✅/❌ | v1.9.0 new: detects .po key missing from JSON |
| **R29** | **validate --cross-format exit code 1** | ✅/❌ | v1.9.0 new: exit 1 when cross-format errors found |

### Anomalie

| # | Krok | Opis | Oczekiwane | Severity |
|---|------|------|------------|----------|
| A1 | [nr kroku] | co się stało | co powinno się stać | blocker / minor / cosmetic |

(usuń wiersz A1 jeśli brak anomalii, lub dodaj A2, A3… dla kolejnych)

### Błędy / problemy

(lista znalezionych problemów — każdy z opisem, krokami reprodukcji i ewentualnym stack trace)

### Co działa dobrze

(lista rzeczy które działają bez zarzutu)

### Sugestie usprawnień

(opcjonalne pomysły na nowe funkcje lub poprawki UX)
```

## PROMPT END
