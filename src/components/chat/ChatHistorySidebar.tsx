import { MessageSquarePlus, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatConversation } from "@/hooks/useChatConversations";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface ChatHistorySidebarProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  loading?: boolean;
}

export function ChatHistorySidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  loading,
}: ChatHistorySidebarProps) {
  return (
    <div className="flex flex-col h-full border-r border-border/15 bg-card/50">
      {/* Header */}
      <div className="p-3 border-b border-border/15">
        <Button
          onClick={onNewConversation}
          className="w-full justify-start gap-2"
          variant="outline"
          size="sm"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Neuer Chat
        </Button>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              Lade Chats...
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              Noch keine Chats
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200",
                  activeConversationId === conv.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted/40 text-foreground"
                )}
                onClick={() => onSelectConversation(conv.id)}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {conv.title || "Neuer Chat"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(conv.updated_at), {
                      addSuffix: true,
                      locale: de,
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
