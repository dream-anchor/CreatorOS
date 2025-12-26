import { useState, useRef, KeyboardEvent, ClipboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Settings, ChevronDown, ChevronUp, X, EyeOff, Ban } from "lucide-react";

interface BlacklistTopic {
  id: string;
  topic: string;
}

interface EmojiNogoTerm {
  id: string;
  term: string;
}

interface RulesConfigPanelProps {
  emojiNogoTerms: EmojiNogoTerm[];
  blacklistTopics: BlacklistTopic[];
  onAddEmojiNogoTerms: (terms: string[]) => void;
  onRemoveEmojiNogoTerm: (id: string) => void;
  onAddBlacklistTopics: (topics: string[]) => void;
  onRemoveBlacklistTopic: (id: string) => void;
}

export function RulesConfigPanel({
  emojiNogoTerms,
  blacklistTopics,
  onAddEmojiNogoTerms,
  onRemoveEmojiNogoTerm,
  onAddBlacklistTopics,
  onRemoveBlacklistTopic,
}: RulesConfigPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [emojiInput, setEmojiInput] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const emojiInputRef = useRef<HTMLInputElement>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);

  const totalRules = emojiNogoTerms.length + blacklistTopics.length;

  // Parse input string into array of trimmed, non-empty terms
  const parseTerms = (input: string): string[] => {
    return input
      .split(",")
      .map((term) => term.trim())
      .filter((term) => term.length > 0);
  };

  // Handle emoji input key events
  const handleEmojiKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const terms = parseTerms(emojiInput);
      if (terms.length > 0) {
        onAddEmojiNogoTerms(terms);
        setEmojiInput("");
      }
    }
  };

  // Handle topic input key events
  const handleTopicKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const terms = parseTerms(topicInput);
      if (terms.length > 0) {
        onAddBlacklistTopics(terms);
        setTopicInput("");
      }
    }
  };

  // Handle paste for emoji input
  const handleEmojiPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData("text");
    if (pastedText.includes(",")) {
      e.preventDefault();
      const terms = parseTerms(pastedText);
      if (terms.length > 0) {
        onAddEmojiNogoTerms(terms);
        setEmojiInput("");
      }
    }
  };

  // Handle paste for topic input
  const handleTopicPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData("text");
    if (pastedText.includes(",")) {
      e.preventDefault();
      const terms = parseTerms(pastedText);
      if (terms.length > 0) {
        onAddBlacklistTopics(terms);
        setTopicInput("");
      }
    }
  };

  // Handle blur for emoji input - add remaining text
  const handleEmojiBlur = () => {
    const terms = parseTerms(emojiInput);
    if (terms.length > 0) {
      onAddEmojiNogoTerms(terms);
      setEmojiInput("");
    }
  };

  // Handle blur for topic input - add remaining text
  const handleTopicBlur = () => {
    const terms = parseTerms(topicInput);
    if (terms.length > 0) {
      onAddBlacklistTopics(terms);
      setTopicInput("");
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between h-12 px-4 bg-card hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Antwort-Regeln konfigurieren</span>
            {totalRules > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalRules} aktiv
              </Badge>
            )}
          </div>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2">
        <div className="p-5 rounded-xl border bg-card space-y-6">
          {/* Emoji No-Gos */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-destructive" />
              <h4 className="font-medium text-sm">Emoji-No-Gos</h4>
              <span className="text-xs text-muted-foreground">
                Begriffe mit Komma trennen
              </span>
            </div>

            {/* Tags display */}
            <div className="min-h-[40px] p-2 rounded-lg border bg-background/50 flex flex-wrap gap-2 items-center">
              {emojiNogoTerms.map((term) => (
                <Badge
                  key={term.id}
                  variant="outline"
                  className="gap-1.5 pr-1.5 h-7 border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10 animate-fade-in"
                >
                  ⛔ {term.term}
                  <button
                    onClick={() => onRemoveEmojiNogoTerm(term.id)}
                    className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Input
                ref={emojiInputRef}
                placeholder={emojiNogoTerms.length === 0 ? "Liebe, Herzen, Kitsch..." : ""}
                value={emojiInput}
                onChange={(e) => setEmojiInput(e.target.value)}
                onKeyDown={handleEmojiKeyDown}
                onPaste={handleEmojiPaste}
                onBlur={handleEmojiBlur}
                className="flex-1 min-w-[120px] h-7 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm px-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Tippe Begriffe und drücke <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">Enter</kbd> oder <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">,</kbd> zum Hinzufügen
            </p>
          </div>

          {/* Separator */}
          <div className="border-t" />

          {/* Blacklist Topics */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">Themen ausblenden</h4>
              <span className="text-xs text-muted-foreground">
                Begriffe mit Komma trennen
              </span>
            </div>

            {/* Tags display */}
            <div className="min-h-[40px] p-2 rounded-lg border bg-background/50 flex flex-wrap gap-2 items-center">
              {blacklistTopics.map((topic) => (
                <Badge
                  key={topic.id}
                  variant="secondary"
                  className="gap-1.5 pr-1.5 h-7 animate-fade-in"
                >
                  {topic.topic}
                  <button
                    onClick={() => onRemoveBlacklistTopic(topic.id)}
                    className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Input
                ref={topicInputRef}
                placeholder={blacklistTopics.length === 0 ? "Pater Brown, Werbung..." : ""}
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={handleTopicKeyDown}
                onPaste={handleTopicPaste}
                onBlur={handleTopicBlur}
                className="flex-1 min-w-[120px] h-7 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm px-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Kommentare mit diesen Begriffen werden komplett ausgeblendet
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
