import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

const comparisonExamples = [
  {
    scenario: "Intellektueller Kommentar",
    userComment: "Ja, deutsche Sprache ist so eine bunte Sprache, nur ist das Anwenden vielen nicht mehr gegeben.",
    gpt: "Absolut! 🌈 Die Vielfalt ist riesig. Danke für deinen tollen Kommentar! 🙌",
    claude: "Da triffst du einen wunden Punkt. Es ist wirklich eine Kunst, diese Buntheit im Alltag zu pflegen. ✍️",
  },
  {
    scenario: "Persönliche Story",
    userComment: "So umgehe ich immer die Nachbarn, die uns unfreundlich gesinnt sind!",
    gpt: "Haha, geniale Strategie! 😂 Manchmal ist Wegducken die beste Verteidigung. Mach weiter so! 👍",
    claude: "Not macht erfinderisch! 😂 Manchmal muss man kreativ werden, um seine Ruhe zu haben. Solange es funktioniert... 😉",
  },
  {
    scenario: "Trockener Humor",
    userComment: "Mein Arzt sagte ich hab Probleme mit Alkohol, da sagte ich: Mir nicht, aber ohne.",
    gpt: "Der ist gut! 😂 Den muss ich mir merken. Danke für den Lacher! 🍻",
    claude: "Ein klassischer Konter! 😂 Da war der Arzt sicher erst mal sprachlos. Humor ist die beste Medizin! 😉",
  },
];

export function ModelComparisonModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Unterschiede ansehen"
        >
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Wie unterscheiden sich die Modelle?
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Comparison Table */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-semibold w-1/4">
                    Szenario
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold w-[37.5%]">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />
                      GPT-4o
                      <span className="text-xs font-normal text-muted-foreground">
                        (Der Energetische)
                      </span>
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold w-[37.5%]">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
                      Claude 3.5
                      <span className="text-xs font-normal text-muted-foreground">
                        (Der Einfühlsame)
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonExamples.map((example, index) => (
                  <tr
                    key={index}
                    className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}
                  >
                    <td className="px-4 py-4 align-top">
                      <div className="font-medium text-sm mb-2">
                        {example.scenario}
                      </div>
                      <div className="text-xs text-muted-foreground italic bg-muted/50 p-2 rounded">
                        "{example.userComment}"
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          Mehr Emojis, kurz & laut:
                        </span>
                        <p className="mt-1">{example.gpt}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-sm bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                        <span className="font-medium text-orange-600 dark:text-orange-400">
                          Längere Sätze, mehr Tiefe:
                        </span>
                        <p className="mt-1">{example.claude}</p>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recommendation Tip */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
              💡 Empfehlung
            </h4>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">GPT-4o:</span>{" "}
                Für schnelle, energetische Reaktionen. Ideal bei vielen Kommentaren, die kurze Antworten brauchen.
              </p>
              <p>
                <span className="font-medium text-orange-600 dark:text-orange-400">Claude 3.5:</span>{" "}
                Für tiefere Gespräche. Ideal bei komplexen Themen oder persönlichen Geschichten.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
