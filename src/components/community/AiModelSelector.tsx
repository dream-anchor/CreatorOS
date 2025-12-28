import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brain, ChevronDown, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiModel {
  id: string;
  name: string;
  description: string;
}

const AI_MODELS: AiModel[] = [
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini Flash",
    description: "Schnell & ausgewogen",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini Pro",
    description: "Beste Qualität",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Kurz & prägnant",
  },
];

interface AiModelSelectorProps {
  selectedModel: string | null;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
  isGenerating?: boolean;
  generationProgress?: { current: number; total: number } | null;
}

export function AiModelSelector({
  selectedModel,
  onModelChange,
  disabled = false,
  isGenerating = false,
  generationProgress = null,
}: AiModelSelectorProps) {
  const currentModel = selectedModel ? AI_MODELS.find((m) => m.id === selectedModel) : null;
  const noModelSelected = !selectedModel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={noModelSelected ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-10 gap-2 rounded-xl transition-all",
            noModelSelected && "bg-primary hover:bg-primary/90",
            isGenerating && "pointer-events-none"
          )}
          disabled={disabled || isGenerating}
        >
          {isGenerating ? (
            <>
              <Sparkles className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">
                {generationProgress 
                  ? `${generationProgress.current}/${generationProgress.total}` 
                  : "Generiere..."}
              </span>
            </>
          ) : noModelSelected ? (
            <>
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Modell wählen</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              <Brain className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">{currentModel?.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover z-50 rounded-xl">
        {AI_MODELS.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelChange(model.id)}
            className="flex items-center justify-between cursor-pointer rounded-lg"
          >
            <div className="flex flex-col">
              <span className="font-medium text-sm">{model.name}</span>
              <span className="text-xs text-muted-foreground">
                {model.description}
              </span>
            </div>
            {model.id === selectedModel && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { AI_MODELS };
