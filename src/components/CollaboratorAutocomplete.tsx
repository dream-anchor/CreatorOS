import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, Users, Loader2, Check, AlertTriangle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Collaborator {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  use_count: number;
}

interface ValidatedProfile {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
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
  const [validating, setValidating] = useState(false);
  const [validatedProfile, setValidatedProfile] = useState<ValidatedProfile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [allCollaborators, setAllCollaborators] = useState<Collaborator[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load all collaborators on mount
  useEffect(() => {
    loadCollaborators();
  }, []);

  // Clear validation when input changes
  useEffect(() => {
    setValidatedProfile(null);
    setValidationError(null);
  }, [inputValue]);

  // Filter suggestions based on input
  useEffect(() => {
    if (!inputValue.trim()) {
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

  const validateUsername = async (username: string) => {
    const cleanUsername = username.trim().replace(/^@/, "");
    if (!cleanUsername) return;

    setValidating(true);
    setValidatedProfile(null);
    setValidationError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Nicht eingeloggt");
      }

      const response = await supabase.functions.invoke('validate-instagram-user', {
        body: { username: cleanUsername }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;

      if (result.success && result.found) {
        setValidatedProfile({
          username: result.profile.username,
          full_name: result.profile.full_name,
          avatar_url: result.profile.avatar_url
        });
        // Reload collaborators to get the updated data
        loadCollaborators();
        toast.success(`@${result.profile.username} validiert!`);
      } else {
        setValidationError(result.message || "Profil nicht gefunden");
      }
    } catch (error) {
      console.error("Validation error:", error);
      setValidationError(error instanceof Error ? error.message : "Validierung fehlgeschlagen");
    } finally {
      setValidating(false);
    }
  };

  const addCollaborator = (username: string, profile?: ValidatedProfile) => {
    const cleanUsername = username.trim().replace(/^@/, "");
    if (cleanUsername && !collaborators.includes(cleanUsername)) {
      onChange([...collaborators, cleanUsername]);
      
      // If profile was validated, update use_count
      if (profile) {
        supabase
          .from("collaborators")
          .update({ 
            use_count: allCollaborators.find(c => c.username === cleanUsername)?.use_count ?? 0 + 1,
            last_used_at: new Date().toISOString()
          })
          .eq("username", cleanUsername)
          .then(() => loadCollaborators());
      }
    }
    setInputValue("");
    setShowSuggestions(false);
    setValidatedProfile(null);
    setValidationError(null);
  };

  const removeCollaborator = (username: string) => {
    onChange(collaborators.filter(c => c !== username));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (validatedProfile) {
        addCollaborator(validatedProfile.username, validatedProfile);
      } else if (suggestions.length > 0) {
        addCollaborator(suggestions[0].username);
      } else if (inputValue.trim()) {
        // Trigger validation on Enter if not yet validated
        validateUsername(inputValue);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
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

  const displayValue = inputValue.startsWith("@") ? inputValue : inputValue ? `@${inputValue}` : "";

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label className="flex items-center gap-2">
        <Users className="h-4 w-4" />
        Co-Autoren (Collab-Post)
      </Label>
      
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              placeholder="@username eingeben..."
              value={displayValue}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || val === "@") {
                  setInputValue("");
                } else if (val.startsWith("@")) {
                  setInputValue(val);
                } else {
                  setInputValue(`@${val}`);
                }
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              className={`pr-10 ${validatedProfile ? 'border-green-500 bg-green-500/10' : ''} ${validationError ? 'border-yellow-500 bg-yellow-500/10' : ''}`}
            />
            {/* Validation status indicator inside input */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {validating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {validatedProfile && <Check className="h-4 w-4 text-green-500" />}
              {validationError && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
            </div>
          </div>
          
          {/* Validate button */}
          <Button 
            type="button" 
            variant="outline" 
            size="icon"
            onClick={() => validateUsername(inputValue)}
            disabled={!inputValue.trim() || validating}
            title="Instagram-Profil prüfen"
          >
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
          
          {/* Add button */}
          <Button 
            type="button" 
            variant="outline" 
            size="icon" 
            onClick={() => {
              if (validatedProfile) {
                addCollaborator(validatedProfile.username, validatedProfile);
              } else if (inputValue.trim()) {
                addCollaborator(inputValue);
              }
            }}
            disabled={!inputValue.trim()}
            title="Hinzufügen"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Validated Profile Preview */}
        {validatedProfile && (
          <div className="mt-2 p-3 rounded-lg border border-green-500/30 bg-green-500/10 flex items-center gap-3">
            {validatedProfile.avatar_url ? (
              <img 
                src={validatedProfile.avatar_url} 
                alt="" 
                className="w-10 h-10 rounded-full object-cover ring-2 ring-green-500"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-700 font-medium">
                {validatedProfile.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-green-700 dark:text-green-400">@{validatedProfile.username}</p>
              {validatedProfile.full_name && (
                <p className="text-sm text-muted-foreground truncate">{validatedProfile.full_name}</p>
              )}
            </div>
            <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
          </div>
        )}

        {/* Validation Error */}
        {validationError && (
          <div className="mt-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-yellow-700 dark:text-yellow-400">{validationError}</p>
              <p className="text-xs text-muted-foreground mt-1">Du kannst den Username trotzdem hinzufügen.</p>
            </div>
          </div>
        )}

        {/* Suggestions Dropdown */}
        {showSuggestions && !validatedProfile && (suggestions.length > 0 || loading) && (
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
            
            {/* Option to validate new username */}
            {inputValue.trim() && !suggestions.some(s => s.username.toLowerCase() === inputValue.toLowerCase().replace(/^@/, "")) && (
              <button
                type="button"
                className="w-full px-3 py-2 flex items-center gap-3 hover:bg-muted transition-colors text-left border-t border-border"
                onClick={() => validateUsername(inputValue)}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Search className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium">@{inputValue.replace(/^@/, "")}</span>
                    <span className="text-muted-foreground"> auf Instagram prüfen</span>
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
        Nutze die Lupe um Instagram Business-Profile zu validieren
      </p>
    </div>
  );
}
