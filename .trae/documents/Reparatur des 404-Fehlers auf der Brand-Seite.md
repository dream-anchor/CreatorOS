# Reparatur des Navigationsfehlers in der Marken-Seite

Das Problem ist identifiziert: Der Button "Daten in Historie aktualisieren" in der Datei `src/pages/Brand.tsx` verlinkt auf `/content-library`, während die Route in der App tatsächlich `/library` heißt. Dies führt zu einem 404-Fehler.

## Geplante Schritte

1.  **Korrigiere den Navigationspfad**
    - Bearbeite `src/pages/Brand.tsx`.
    - Ändere `navigate("/content-library")` zu `navigate("/library")`.

Das ist eine einfache Frontend-Korrektur, die das Problem sofort behebt. Es sind keine Änderungen am Backend oder an der Datenbank erforderlich.
