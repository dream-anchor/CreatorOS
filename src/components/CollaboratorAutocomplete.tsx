import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";

interface Collaborator {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  use_count: number;
}

interface CollaboratorAutocompleteProps {
  collaborators: string[];
  onChange: (collaborators: string[]) => void;
}

export function CollaboratorAutocomplete({ collaborators, onChange }: CollaboratorAutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<Collaborator[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allCollaborators, setAllCollaborators] = useState<Collaborator[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load all collaborators on mount
  useEffect(() => {
    loadCollaborators();
  }, []);

  // Filter suggestions based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      // Show top collaborators when input is empty but focused
      const filtered = allCollaborators
        .filter(c => !collaborators.includes(c.username))
        .slice(0, 5);
      setSuggestions(filtered);
    } else {
      const searchTerm = inputValue.toLowerCase().replace(/^@/, "");
      const filtered = allCollaborators
        .filter(c => 
          !collaborators.includes(c.username) &&
          (c.username.toLowerCase().includes(searchTerm) ||
           (c.full_name && c.full_name.toLowerCase().includes(searchTerm)))
        )
        .slice(0, 5);
      setSuggestions(filtered);
    }
  }, [inputValue, allCollaborators, collaborators]);

  const loadCollaborators = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .order("use_count", { ascending: false })
        .limit(50);

      if (error) throw error;
      setAllCollaborators((data || []) as Collaborator[]);
    } catch (error) {
      console.error("Error loading collaborators:", error);
    } finally {
      setLoading(false);
    }
  };

  const addCollaborator = (username: string) => {
    const cleanUsername = username.trim().replace(/^@/, "");
    if (cleanUsername && !collaborators.includes(cleanUsername)) {
      onChange([...collaborators, cleanUsername]);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeCollaborator = (username: string) => {
    onChange(collaborators.filter(c => c !== username));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        addCollaborator(suggestions[0].username);
      } else if (inputValue.trim()) {
        addCollaborator(inputValue);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    } else if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      // Focus first suggestion (could be enhanced with proper focus management)
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label className="flex items-center gap-2">
        <Users className="h-4 w-4" />
        Co-Autoren (Collab-Post)
      </Label>
      
      <div className="relative">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder="@username eingeben..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button 
            type="button" 
            variant="outline" 
            size="icon" 
            onClick={() => {
              if (inputValue.trim()) {
                addCollaborator(inputValue);
              }
            }}
            disabled={!inputValue.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && (suggestions.length > 0 || loading) && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
            {loading ? (
              <div className="p-3 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Laden...
              </div>
            ) : (
              suggestions.map((collab) => (
                <button
                  key={collab.id}
                  type="button"
                  className="w-full px-3 py-2 flex items-center gap-3 hover:bg-muted transition-colors text-left"
                  onClick={() => addCollaborator(collab.username)}
                >
                  {collab.avatar_url ? (
                    <img 
                      src={collab.avatar_url} 
                      alt="" 
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-medium">
                      {collab.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">@{collab.username}</p>
                    {collab.full_name && (
                      <p className="text-xs text-muted-foreground truncate">{collab.full_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {collab.use_count}x
                  </span>
                </button>
              ))
            )}
            
            {/* Option to add new if no exact match */}
            {inputValue.trim() && !suggestions.some(s => s.username.toLowerCase() === inputValue.toLowerCase().replace(/^@/, "")) && (
              <button
                type="button"
                className="w-full px-3 py-2 flex items-center gap-3 hover:bg-muted transition-colors text-left border-t border-border"
                onClick={() => addCollaborator(inputValue)}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium">@{inputValue.replace(/^@/, "")}</span>
                    <span className="text-muted-foreground"> hinzufügen</span>
                  </p>
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selected Collaborators */}
      {collaborators.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {collaborators.map((username) => {
            const collab = allCollaborators.find(c => c.username === username);
            return (
              <Badge key={username} variant="secondary" className="gap-1 pr-1 py-1">
                {collab?.avatar_url ? (
                  <img 
                    src={collab.avatar_url} 
                    alt="" 
                    className="w-4 h-4 rounded-full mr-1"
                  />
                ) : null}
                @{username}
                <button
                  type="button"
                  onClick={() => removeCollaborator(username)}
                  className="ml-1 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      
      <p className="text-xs text-muted-foreground">
        Diese User erhalten eine Collab-Einladung beim Posten
      </p>
    </div>
  );
}
