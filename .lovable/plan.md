
## Plan: Build-Fehler beheben und PostPro → CreatorOS Umbenennung abschließen

### Zusammenfassung der Probleme

Es gibt **zwei separate Problemkategorien**:

1. **Build-Fehler in Generator.tsx** (4 TypeScript-Fehler)
2. **PostPro-Referenzen** im Code, die auf CreatorOS aktualisiert werden müssen

---

### Phase 1: Build-Fehler in Generator.tsx beheben

#### Problem 1: Fehlende lucide-react Imports (3 Fehler)

| Fehler | Zeile | Ursache |
|--------|-------|---------|
| `RotateCw` nicht gefunden | 784 | Nicht importiert |
| `Calendar` nicht gefunden | 788 | Nicht importiert |
| `ImageIcon` nicht gefunden | 856 | Nicht importiert |

**Lösung:** Die Icons `RotateCw`, `Calendar`, `ImageIcon` zum Import hinzufügen:

```typescript
// Zeile 11-16 - Aktueller Import:
import { 
  Loader2, Sparkles, Copy, Check, ImagePlus, Camera, Brain, Laugh, Heart, 
  Lightbulb, Star, ArrowRight, ArrowLeft, Recycle, TrendingUp, MessageSquare, 
  Flame, BookmarkCheck, Eye, Zap,
  BarChart3, Layers
} from "lucide-react";

// Änderung - Diese Icons hinzufügen:
// RotateCw, Calendar, ImageIcon (Image)
```

#### Problem 2: `setGeneratedContent` nicht definiert (1 Fehler)

| Fehler | Zeile | Ursache |
|--------|-------|---------|
| `setGeneratedContent` nicht gefunden | 280 | Funktion existiert nicht |

**Analyse:** Die Funktion `setGeneratedContent` wird in `handleCaptionChange` aufgerufen, aber es gibt keinen entsprechenden `useState`-Hook dafür. Da der `draft`-State bereits aktualisiert wird (Zeile 274), ist diese Zeile redundant und kann entfernt werden.

**Lösung:** Zeile 280 entfernen (die Zeile mit `setGeneratedContent(...)`)

---

### Phase 2: PostPro → CreatorOS Umbenennung

| Datei | Zeile | Aktuell | Neu |
|-------|-------|---------|-----|
| `.github/workflows/deploy-strato.yml` | 1 | `name: Build & Deploy to Strato (postpro)` | `name: Build & Deploy to Strato (CreatorOS)` |
| `.github/workflows/deploy-strato.yml` | 9 | `group: deploy-postpro-strato` | `group: deploy-creatoros-strato` |
| `.github/workflows/deploy-strato.yml` | 65 | `/WEBSITE/POSTPRO.ANTOINEMONOT.COM` | `/WEBSITE/CREATOROS.ANTOINEMONOT.COM` oder neuer Pfad |
| `supabase/functions/test-instagram-post/index.ts` | 71 | `Test from PostPro ✨` | `Test from CreatorOS ✨` |
| `src/pages/InstagramSettings.tsx` | 418 | `Test from PostPro ✨` | `Test from CreatorOS ✨` |

**Hinweis zum Strato-Pfad:** Falls die Domain sich nicht geändert hat, sollte Zeile 65 unverändert bleiben. Falls eine neue Domain verwendet wird (z.B. `creatoros.antoinemonot.com`), muss der Pfad angepasst werden.

---

### Phase 3: Bereits korrekt (keine Änderung nötig)

Diese Dateien sind bereits auf CreatorOS aktualisiert:
- `index.html` → `<title>CreatorOS</title>` ✅
- `src/pages/Index.tsx` → "CreatorOS" im Branding ✅
- `src/pages/Login.tsx` → "CreatorOS" im UI ✅

---

### Betroffene Dateien (Änderungen)

| Datei | Änderungstyp |
|-------|--------------|
| `src/pages/Generator.tsx` | Import-Fix + redundante Zeile entfernen |
| `.github/workflows/deploy-strato.yml` | PostPro → CreatorOS umbenennen |
| `supabase/functions/test-instagram-post/index.ts` | PostPro → CreatorOS im Caption |
| `src/pages/InstagramSettings.tsx` | PostPro → CreatorOS im UI-Text |

---

### Technische Details

#### Generator.tsx - Korrigierter Import (Zeilen 11-16)

```typescript
import { 
  Loader2, Sparkles, Copy, Check, ImagePlus, Camera, Brain, Laugh, Heart, 
  Lightbulb, Star, ArrowRight, ArrowLeft, Recycle, TrendingUp, MessageSquare, 
  Flame, BookmarkCheck, Eye, Zap, BarChart3, Layers,
  RotateCw, Calendar, Image as ImageIcon
} from "lucide-react";
```

#### Generator.tsx - handleCaptionChange (Zeilen 272-282)

Die Funktion wird vereinfacht, da `setGeneratedContent` nicht existiert:

```typescript
const handleCaptionChange = (newCaption: string) => {
  if (draft) {
    setDraft({ ...draft, caption: newCaption });
  }
};
```

#### deploy-strato.yml - Umbenennung

```yaml
name: Build & Deploy to Strato (CreatorOS)

concurrency:
  group: deploy-creatoros-strato
  cancel-in-progress: true
```

---

### Erwartetes Ergebnis

Nach Umsetzung:
1. Alle 4 Build-Fehler sind behoben
2. Die App kompiliert erfolgreich
3. Alle sichtbaren "PostPro"-Referenzen sind durch "CreatorOS" ersetzt
4. GitHub Actions Workflow ist korrekt benannt
