UI/UX Design Guideline für dieses Projekt
Wende bei jeder neuen Komponente oder Seite strikt die folgenden visuellen Regeln an, um den “Soft UI / Glassmorphism” Look beizubehalten:

1. Kern-Komponenten (aus index.css)
Container/Karten: Nutze NIEMALS bg-white shadow. Verwende immer .glass-card.
Hervorhebung: Für Fokus-Elemente nutze .glass-card-warm.
Formulare: Nutze .glass-input für alle Eingabefelder.
Interaktion: Nutze .glass-button für Buttons, die einen weichen Hover-Effekt benötigen.
2. Layout & Spacing
Radius: Der Standard-Radius ist extrem hoch: Nutze rounded-3xl (entspricht 1.25rem/20px).
Padding: Nutze großzügigen Whitespace (mindestens p-6 oder p-8 bei Karten).
Typografie: Headlines immer mit font-bold und tracking-tight.
3. Farben & Effekte
Variablen: Nutze nur HSL-Variablen (z.B. text-muted-foreground oder bg-background). Keine Hex-Codes!
Status: Nutze die .status-badge Klasse zusammen mit .status-review, .status-approved etc.
Glow: Für Highlights nutze die Schatten-Klassen shadow-glow-sm oder shadow-glow-md aus der Konfiguration.
4. Animationen
Neue Elemente sollen immer sanft erscheinen. Nutze dafür animate-fade-in oder animate-slide-up.
