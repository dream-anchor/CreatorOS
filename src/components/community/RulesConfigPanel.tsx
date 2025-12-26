import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Settings, ChevronDown, ChevronUp, X, Plus, EyeOff, Ban } from "lucide-react";

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
  newEmojiTerm: string;
  newTopic: string;
  onNewEmojiTermChange: (value: string) => void;
  onNewTopicChange: (value: string) => void;
  onAddEmojiNogoTerm: () => void;
  onRemoveEmojiNogoTerm: (id: string) => void;
  onAddBlacklistTopic: () => void;
  onRemoveBlacklistTopic: (id: string) => void;
}

export function RulesConfigPanel({
  emojiNogoTerms,
  blacklistTopics,
  newEmojiTerm,
  newTopic,
  onNewEmojiTermChange,
  onNewTopicChange,
  onAddEmojiNogoTerm,
  onRemoveEmojiNogoTerm,
  onAddBlacklistTopic,
  onRemoveBlacklistTopic,
}: RulesConfigPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const totalRules = emojiNogoTerms.length + blacklistTopics.length;

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
                Begriffe, deren assoziierte Emojis vermieden werden
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {emojiNogoTerms.length === 0 ? (
                <span className="text-sm text-muted-foreground italic">
                  Keine Einschränkungen definiert
                </span>
              ) : (
                emojiNogoTerms.map((term) => (
                  <Badge
                    key={term.id}
                    variant="outline"
                    className="gap-1.5 pr-1.5 h-7 border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10"
                  >
                    ⛔ {term.term}
                    <button
                      onClick={() => onRemoveEmojiNogoTerm(term.id)}
                      className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="z.B. Liebe, Herzen, Kitsch"
                value={newEmojiTerm}
                onChange={(e) => onNewEmojiTermChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddEmojiNogoTerm()}
                className="max-w-xs h-9 text-sm"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={onAddEmojiNogoTerm}
                className="h-9"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Hinzufügen
              </Button>
            </div>
          </div>

          {/* Separator */}
          <div className="border-t" />

          {/* Blacklist Topics */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">Themen ausblenden</h4>
              <span className="text-xs text-muted-foreground">
                Kommentare mit diesen Begriffen werden nicht angezeigt
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {blacklistTopics.length === 0 ? (
                <span className="text-sm text-muted-foreground italic">
                  Keine Themen auf der Blacklist
                </span>
              ) : (
                blacklistTopics.map((topic) => (
                  <Badge
                    key={topic.id}
                    variant="secondary"
                    className="gap-1.5 pr-1.5 h-7"
                  >
                    {topic.topic}
                    <button
                      onClick={() => onRemoveBlacklistTopic(topic.id)}
                      className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="z.B. Pater Brown, Werbung"
                value={newTopic}
                onChange={(e) => onNewTopicChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddBlacklistTopic()}
                className="max-w-xs h-9 text-sm"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={onAddBlacklistTopic}
                className="h-9"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Hinzufügen
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
