# Translation Toolkit — Real Project Test Prompt

Wklej poniższy prompt w czacie nowego projektu (który ma pliki .po):

---

## PROMPT START

Zainstaluj i przetestuj narzędzie `translation-toolkit@1.3.2` (npm) na tym projekcie.
Wykonaj WSZYSTKIE poniższe kroki po kolei, notuj wyniki, a na końcu wygeneruj raport.

> Komendy: `export`, `import`, `preview`, `validate`, `stats`, `diff`

### 0. Instalacja

```bash
npm install -g translation-toolkit@1.3.2
translation-toolkit --version   # powinno wypisać 1.3.2
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

### 3. Test IMPORT --dry-run

```bash
# Dodaj nowy klucz do CSV
cp /tmp/tt-test-export.csv /tmp/tt-test-dryrun.csv
echo '"DRYRUN_KEY","dry en","dry pl"' >> /tmp/tt-test-dryrun.csv

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
- [ ] **[v1.3.2 FIX]** Tagi `--ci` w `--help` są widoczne (`translation-toolkit --help | grep ci`)

### 5. Test VALIDATE

```bash
translation-toolkit validate --dir "$PO_DIR"
```

Checklist:

- [ ] Wykrywa brakujące tłumaczenia (klucze obecne w jednym języku, brak w innym)
- [ ] Wykrywa puste `msgstr`
- [ ] Wykrywa niezgodność zmiennych (np. `{{name}}`, `%s`, `{0}`)
- [ ] Klucze z `msgctxt` wyświetlają się jako `kontekst::klucz` (nie znak `\x04`)
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
- [ ] **[v1.3.2 FIX]** Nagłówek tabeli (wiersz z "Key", nazwami języków) jest przypięty na samej górze tabeli — **NIE** jest przesunięty o kilka wierszy w dół. Przy scrollowaniu header powinien być zawsze widoczny i przyklejony bezpośrednio pod toolbarem.
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
- [ ] **[v1.3.2 NEW]** Flaga `--ci` działa: `translation-toolkit preview --dir "$PO_DIR" --port 3459 --ci &` → auto-wybiera katalog bez pytania
- [ ] Wypisuje "Watching for .po changes..." na starcie
- [ ] Po `touch` wypisuje "↻ Reloaded (... changed)"
- [ ] Serwer dalej działa po przeładowaniu

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

### 10. Testy regresyjne v1.3.2

> Te testy weryfikują fixy z v1.3.1 i v1.3.2.

**R1. --watch nie crashuje (był: `fs is not defined`)**

Jeśli krok 8b przeszedł — ten test jest zaliczony. Jeśli serwer wyrzucił `ReferenceError: fs is not defined` — regresja.

**R2. Nagłówek tabeli preview nie jest przesunięty [v1.3.2 FIX]**

Otwórz preview w przeglądarce. Przewiń tabelę w dół. Sprawdź czy nagłówek (`Key | en | pl`) jest **przyklejony bezpośrednio pod toolbarem** (search bar), a nie przesunięty o 3-4 wiersze danych.

> Root cause w v1.3.0–v1.3.1: `overflow: hidden` na `<table>` tworzył nowy CSS scroll container, przez co `position: sticky` nie działał względem viewportu. Fix w v1.3.2: usunięto `overflow: hidden`, zmieniono `border-collapse: collapse` → `border-collapse: separate; border-spacing: 0`.

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

**R5. Flaga --ci auto-wybiera katalog [v1.3.2 NEW]**

Jeśli projekt ma wiele katalogów z `.po` (lub nawet jeden):

```bash
translation-toolkit export --dir "$PO_DIR" -o /tmp/tt-ci-test.csv --ci
echo "Exit: $?"
```

- [ ] Komenda nie pyta o wybór katalogu (auto-wybiera pierwszy)
- [ ] Wypisuje "CI mode: ..." jeśli znaleziono wiele katalogów
- [ ] Exit code 0

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
## Translation Toolkit v1.3.2 — Test Report

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
| 3 | Import --dry-run | ✅/❌ | pliki niezmienione? raport poprawny? |
| 4 | Import format preservation (.po diff) | ✅/❌ | pliki .po bez zmian formatu? |
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
| **R1** | **--watch nie crashuje** | ✅/❌ | v1.3.0 bug: `fs is not defined` |
| **R2** | **Nagłówek tabeli na pozycji 1** | ✅/❌ | v1.3.0 bug: header na 4. pozycji |
| **R3** | **Plural-Forms zachowany** | ✅/❌ | v1.3.0 bug: normalizacja do 1 linii |
| **R4** | **Puste linie zachowane** | ✅/❌ | v1.3.0 bug: dodawanie/usuwanie blank lines |
| **R5** | **--ci auto-wybiera katalog** | ✅/❌ | v1.3.2 new: nie pyta o wybór |

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
