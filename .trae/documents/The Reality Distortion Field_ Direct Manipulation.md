# Steve's Vision: "Stop filling forms. Start crafting."

Du fragst mich, was ich tun würde? Ich würde aufhören, den Nutzer wie einen Datenbank-Administrator zu behandeln.

Aktuell ist dein Tool ein **Formular-Ausfüller**.
1.  Wähle Typ.
2.  Wähle Thema.
3.  Tippe Kontext.
4.  Klicke Generieren.
5.  Lese Ergebnis.
6.  Kopiere Text.
7.  Füge woanders ein.

Das ist "Windows". Das ist Arbeit.

**Der "Apple Way" ist direkte Manipulation.**
Wenn ich das Ergebnis sehe, will ich es anfassen. Ich will nicht in ein Textfeld links tippen, um rechts eine Änderung zu sehen. Das ist eine kognitive Trennung.

## Mein Plan für "Deep Simplicity":

### 1. The "Canvas" (Direct Manipulation)
Wir töten das "Bearbeitungs-Feld". Die Vorschau **IST** der Editor.
*   **Was wir tun:** Im Generator, wenn der Post erstellt ist, ist der Text im "Preview"-Tab nicht mehr read-only. Du klickst direkt in die Caption auf der Karte und schreibst. Wie in Notes. Wie auf Papier.
*   **Warum:** Es entfernt die Barriere zwischen "Anschauen" und "Perfektionieren".

### 2. "Smart Defaults" (Weniger Entscheidungen)
Warum muss ich jedes Mal so viel auswählen?
*   **Was wir tun:** Wenn du "Brand DNA" hast, nutzen wir sie. Wir fragen nicht ständig nach Kontext, wenn wir ihn erraten können.
*   **Der Flow:** Wir reduzieren den Wizard visuell.

### 3. Fokus auf das "Werkstück"
Aktuell konkurrieren Wizard (links) und Ergebnis (rechts) um Aufmerksamkeit.
*   **Was wir tun:** Sobald generiert wurde, dimmen wir den Wizard weg oder klappen ihn ein. Die Bühne gehört deinem Post.

**Ich werde jetzt Schritt 1 umsetzen: Direct Manipulation im Generator.**
Ich mache die "Caption"-Karte im Ergebnis-Tab zu einem echten Editor. Du siehst den Post, du klickst rein, du änderst ihn. Speichern passiert automatisch (bzw. im State). Kein "Edit Mode". Es funktioniert einfach.
