# Translation Toolkit — Real Project Test Prompt

Wklej poniższy prompt w czacie nowego projektu (który ma pliki .po):

---

## PROMPT START

Zainstaluj i przetestuj narzędzie `translation-toolkit` (npm) na tym projekcie. Wykonaj WSZYSTKIE poniższe kroki, notuj wyniki, a na końcu wygeneruj raport.

### 0. Instalacja
```bash
npm install -g translation-toolkit
translation-toolkit --version
```

### 1. Odkrywanie plików .po
Znajdź wszystkie pliki .po w tym projekcie:
```bash
find . -name "*.po" -not -path "*/node_modules/*" | head -20
```
Zanotuj: ile plików, ile języków, w jakim katalogu.

### 2. Test EXPORT (po → CSV)
```bash
translation-toolkit export --dir <KATALOG_Z_PO> -o /tmp/tt-test-export.csv
```
Sprawdź wynik:
- Czy CSV się wygenerował?
- Ile kluczy × ile języków?
- Otwórz CSV i sprawdź: `head -20 /tmp/tt-test-export.csv`
- Czy klucze z msgctxt mają separator `::`?
- Czy wieloliniowe wartości są poprawnie w jednej komórce (w cudzysłowach)?
- Czy znaki specjalne (cudzysłowy, taby, newline) są poprawnie obsłużone?

### 3. Test IMPORT round-trip (CSV → po → CSV)
```bash
# Skopiuj oryginalne .po do tymczasowego katalogu
cp -r <KATALOG_Z_PO> /tmp/tt-test-reimport/
# Importuj CSV do kopii
translation-toolkit import /tmp/tt-test-export.csv --dir /tmp/tt-test-reimport/
# Re-eksportuj
translation-toolkit export --dir /tmp/tt-test-reimport/ -o /tmp/tt-test-reimport.csv
# Porównaj
diff /tmp/tt-test-export.csv /tmp/tt-test-reimport.csv
```
Sprawdź:
- Czy import się powiódł bez błędów?
- Czy diff między CSV jest pusty (round-trip zachowany)?
- Jeśli diff nie jest pusty — zanotuj co się różni i dlaczego.

### 4. Test VALIDATE
```bash
translation-toolkit validate --dir <KATALOG_Z_PO>
```
Sprawdź:
- Czy wykrywa brakujące klucze?
- Czy wykrywa puste tłumaczenia?
- Czy wykrywa niezgodność zmiennych (np. {{name}}, %s, {0})?
- Czy klucze z msgctxt wyświetlają się jako `kontekst::klucz` (nie niewidoczny znak)?

### 5. Test STATS
```bash
translation-toolkit stats --dir <KATALOG_Z_PO>
```
Sprawdź:
- Czy pokazuje coverage % per język?
- Czy paski postępu się wyświetlają?
- Czy lista top missing keys jest sensowna?
- Czy overall coverage się zgadza?

### 6. Test DIFF
```bash
# Skopiuj CSV i zmień kilka wartości
cp /tmp/tt-test-export.csv /tmp/tt-test-modified.csv
# Zmień 2-3 wartości ręcznie w modified.csv (np. sed)
# Potem:
translation-toolkit diff /tmp/tt-test-export.csv /tmp/tt-test-modified.csv
```
Sprawdź:
- Czy wykrywa zmienione wartości?

```bash
# CSV vs aktualny stan .po
translation-toolkit diff /tmp/tt-test-export.csv --dir <KATALOG_Z_PO>
```
Sprawdź:
- Czy mówi "No differences" (bo CSV pochodzi z tych samych .po)?

### 7. Test PREVIEW
```bash
translation-toolkit preview --dir <KATALOG_Z_PO> --port 3456
```
Sprawdź (curl lub przeglądarka):
```bash
curl -s http://localhost:3456/ | head -5
```
- Czy serwer startuje?
- Czy zwraca HTML?
Po teście zatrzymaj serwer (Ctrl+C).

### 8. Edge cases — jeśli projekt ma:
- [ ] Pliki z wieloliniowymi msgstr (continuation lines) — czy export je łączy?
- [ ] Wpisy z msgctxt — czy klucze mają `::` w CSV?
- [ ] Puste pliki .po (tylko nagłówek) — czy nie crashuje?
- [ ] Znaki specjalne: cudzysłowy `\"`, taby `\t`, newline `\n` — czy round-trip je zachowuje?
- [ ] Bardzo długie msgstr (>500 znaków) — czy eksport działa?

### 9. RAPORT KOŃCOWY

Wygeneruj raport w formacie:

```
## Translation Toolkit v1.1.0 — Test Report

**Projekt**: [nazwa projektu]
**Pliki .po**: X plików, Y języków
**Kluczy**: Z

### Wyniki testów

| Test | Status | Uwagi |
|------|--------|-------|
| Instalacja | ✅/❌ | |
| Export (po→CSV) | ✅/❌ | X kluczy × Y języków |
| Import round-trip | ✅/❌ | diff pusty? |
| Validate | ✅/❌ | X errors, Y warnings |
| Stats | ✅/❌ | overall coverage: X% |
| Diff (CSV vs CSV) | ✅/❌ | |
| Diff (CSV vs .po) | ✅/❌ | |
| Preview server | ✅/❌ | |
| Multiline strings | ✅/❌/N/A | |
| msgctxt support | ✅/❌/N/A | |
| Special characters | ✅/❌ | |
| Edge cases | ✅/❌ | |

### Błędy / problemy
- (lista znalezionych problemów, jeśli jakieś)

### Sugestie
- (opcjonalne sugestie usprawnień)
```

## PROMPT END
