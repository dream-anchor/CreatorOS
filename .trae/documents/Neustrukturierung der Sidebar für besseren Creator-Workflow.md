# Optimierung der Sidebar-Navigation

## Analyse
Die aktuelle Navigation vernachlässigt den Workflow eines Creators. Wichtige strategische Bereiche (`Brand`, `Topics`) und der kreative Kern (`Generator`) sind nicht direkt erreichbar.

## Neuer Aufbau
Ich werde die `navItems` in `GlobalLayout.tsx` komplett neu strukturieren:

1.  **Dashboard**: Startpunkt & Übersicht.
2.  **Strategie (Neu)**:
    *   **Brand DNA**: Zentral für die KI-Personalisierung.
    *   **Themen**: Content-Strategie und Recherche.
3.  **Kreation (Neu)**:
    *   **Generator**: Der "Magic Create" Button für neue Inhalte.
4.  **Management**:
    *   **Planung**: Kalender.
    *   **Community**: Interaktion.
5.  **Assets & Analyse**:
    *   **Medien**: Dateiverwaltung.
    *   **Analytics**: Erfolgskontrolle.
6.  **System**:
    *   **Settings**: Konfiguration (ganz unten).

## Umsetzung
*   Importieren der fehlenden Icons (`Brain`, `Sparkles`, `Zap`).
*   Anpassen des `navItems` Arrays in `GlobalLayout.tsx`.
*   Visuelle Gruppierung (optional durch kleine Abstände oder Überschriften, falls nötig, aber vorerst durch logische Sortierung).

Dies macht die App zu einem echten "OS" für Creator, statt nur einem Planungstool.
