# Modernisierung des Settings-Menüs

## Analyse der aktuellen Situation
Das aktuelle Settings-Menü wirkt durch die vielen Tabs und Weiterleitungen fragmentiert. Es ist nicht "aus einem Guss". Besonders die Tabs "DNA" und "Themen", die nur Weiterleitungen sind, brechen das UX-Pattern und wirken wie Fremdkörper.

## Verbesserungsplan

### 1. Navigationsstruktur vereinfachen
- **Reduzierung der Tabs**: Ich werde die Weiterleitungs-Tabs ("DNA", "Themen") entfernen. Diese gehören thematisch in die Hauptnavigation oder sollten vollständig integriert sein. Da es bereits Hauptmenüpunkte dafür gibt, sind sie in den "technischen" Einstellungen redundant.
- **Neue Gruppierung**:
  - **Account & Allgemein**: Zusammenführung von "Allgemein" und "Instagram" (als "Verbindungen").
  - **System & Logs**: Zusammenführung von "System" und "Logs" für technische Wartung.
  - **Mobile**: Bleibt als eigenständiger Punkt für die App-Verbindung.

### 2. Visuelles Update & Feedback
- **Auto-Save Indikator**: Hinzufügen eines subtilen "Gespeichert"-Feedbacks bei Änderungen in den allgemeinen Einstellungen (analog zur Brand-Seite).
- **Responsive Labels**: Sicherstellen, dass Labels auf Mobile nicht einfach verschwinden, sondern ggf. in einem Dropdown oder einer Scroll-Leiste nutzbar bleiben.

### 3. Technische Konsolidierung
- **Refactoring SettingsPage**: Aufräumen der Tabs.
- **Entfernen der Redundanzen**: Löschen der Weiterleitungs-Tabs für ein saubereres Erlebnis.

Das Ziel ist ein aufgeräumtes, technisches Einstellungsmenü, das sich auf Konfiguration fokussiert und nicht als zweite Navigation missbraucht wird.
