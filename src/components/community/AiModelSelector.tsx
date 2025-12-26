import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brain, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";

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
    description: "Gut für kurze Antworten",
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    description: "Maximale Präzision",
  },
];

interface AiModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

export function AiModelSelector({
  selectedModel,
  onModelChange,
}: AiModelSelectorProps) {
  const currentModel = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];

  const handleSelectModel = (model: AiModel) => {
    if (model.id !== selectedModel) {
      onModelChange(model.id);
      toast.success(`🧠 KI gewechselt auf ${model.name}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 bg-card hover:bg-muted/50"
        >
          <Brain className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">{currentModel.name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
        {AI_MODELS.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => handleSelectModel(model)}
            className="flex items-center justify-between cursor-pointer"
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
