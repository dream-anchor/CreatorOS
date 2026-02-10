import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { BrandRules } from "@/types/database";
import { Loader2, Plus, X, Sparkles, Brain, CheckCircle2, Clock, Database, ExternalLink, PenLine, AlertCircle, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const AI_MODELS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Schnell & günstig" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Beste Qualität & Reasoning" },
  { value: "openai/gpt-5", label: "GPT-5", description: "Kreativ & präzise" },
];

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export default function BrandPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState<BrandRules | null>(null);
  const [doInput, setDoInput] = useState("");
  const [dontInput, setDontInput] = useState("");
  const [tabooInput, setTabooInput] = useState("");
  
  // Data source state
  const [postCount, setPostCount] = useState(0);
  const [replyCount, setReplyCount] = useState(0);
  
  // Autosave state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (user) {
      loadBrandRules();
      loadPostCount();
      loadReplyCount();
    }
  }, [user]);

  // Autosave effect - triggers when brand changes
  useEffect(() => {
    // Skip initial load
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    
    if (!brand || !brand.id) return;

    // Set status to pending (typing detected)
    setSaveStatus("pending");
    setLastError(null);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for debounced save (1 second)
    saveTimeoutRef.current = setTimeout(() => {
      performAutoSave();
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [brand]);

  const performAutoSave = useCallback(async () => {
    if (!brand || !brand.id) return;
    
    setSaveStatus("saving");

    try {
      await apiPatch(`/api/settings/brand-rules/${brand.id}`, {
        tone_style: brand.tone_style,
        do_list: brand.do_list,
        dont_list: brand.dont_list,
        emoji_level: brand.emoji_level,
        hashtag_min: brand.hashtag_min,
        hashtag_max: brand.hashtag_max,
        language_primary: brand.language_primary,
        content_pillars: brand.content_pillars as unknown as null,
        disclaimers: brand.disclaimers,
        writing_style: brand.writing_style,
        example_posts: brand.example_posts,
        taboo_words: brand.taboo_words,
        ai_model: brand.ai_model,
        style_system_prompt: brand.style_system_prompt,
        reply_style_system_prompt: brand.reply_style_system_prompt,
        reply_style_description: brand.reply_style_description,
        formality_mode: brand.formality_mode,
      });
      
      setSaveStatus("saved");
      
      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus((current) => current === "saved" ? "idle" : current);
      }, 2000);
      
    } catch (error: any) {
      console.error("Autosave error:", error);
      setSaveStatus("error");
      setLastError(error.message);
    }
  }, [brand]);

  const loadBrandRules = async () => {
    try {
      try {
        const data = await apiGet<BrandRules>("/api/settings/brand-rules");
        if (data) {
          setBrand(data);
          isInitialLoad.current = true; // Reset flag after setting data
        }
      } catch (err: any) {
        // 404 is ok - no brand rules yet
        if (!err.message?.includes("404")) throw err;
      }
    } catch (error: any) {
      console.error("Fehler beim Laden:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPostCount = async () => {
    try {
      const data = await apiGet<{ count: number }>("/api/posts/count", { is_imported: "true" });
      if (data?.count !== undefined) {
        setPostCount(data.count);
      }
    } catch (error) {
      console.error("Error loading post count:", error);
    }
  };

  const loadReplyCount = async () => {
    try {
      const data = await apiGet<{ count: number }>("/api/community/reply-count", { status: "sent,imported" });
      if (data?.count !== undefined) {
        setReplyCount(data.count);
      }
    } catch (error) {
      console.error("Error loading reply count:", error);
    }
  };

  const formatLastAnalysisDate = () => {
    if (!brand?.last_style_analysis_at) return null;
    try {
      return format(new Date(brand.last_style_analysis_at), "dd.MM.yyyy 'um' HH:mm", { locale: de });
    } catch {
      return null;
    }
  };

  const addItem = (list: "do_list" | "dont_list" | "taboo_words") => {
    const input = list === "do_list" ? doInput : list === "dont_list" ? dontInput : tabooInput;
    if (!input.trim() || !brand) return;

    setBrand({
      ...brand,
      [list]: [...(brand[list] || []), input.trim()],
    });

    if (list === "do_list") setDoInput("");
    else if (list === "dont_list") setDontInput("");
    else setTabooInput("");
  };

  const removeItem = (list: "do_list" | "dont_list" | "taboo_words", index: number) => {
    if (!brand) return;
    setBrand({
      ...brand,
      [list]: brand[list]?.filter((_, i) => i !== index) || [],
    });
  };

  // Autosave Status Component
  const AutosaveStatus = () => {
    switch (saveStatus) {
      case "pending":
        return (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <PenLine className="h-4 w-4" />
            <span>Änderungen erkannt...</span>
          </div>
        );
      case "saving":
        return (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Speichert...</span>
          </div>
        );
      case "saved":
        return (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-success">Gespeichert</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>Fehler: {lastError || "Speichern fehlgeschlagen"}</span>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <GlobalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </GlobalLayout>
    );
  }

  return (
    <GlobalLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="space-y-6 max-w-4xl">
          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Marke & Regeln</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Definiere deinen Markenstil und Content-Richtlinien
                </p>
              </div>
              <AutosaveStatus />
            </div>
          </div>

          {/* Datenquelle Info-Box */}
          <Card className="glass-card border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle>Deine Stil-DNA</CardTitle>
              </div>
              <CardDescription>
                Dein Schreibstil, automatisch aus deiner Post-Historie analysiert
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex-1 space-y-3">
                  {/* Data Source Info */}
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Datenbasis:</span>
                    <Badge variant="secondary" className="font-medium">
                      {postCount} Posts aus deiner Historie
                    </Badge>
                  </div>
                  
                  {/* Last Analysis Info */}
                  {formatLastAnalysisDate() && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Letztes Update:</span>
                      <Badge variant="outline" className="font-normal">
                        {formatLastAnalysisDate()}
                      </Badge>
                    </div>
                  )}
                  
                  {/* Status */}
                  {brand?.style_system_prompt && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-success">Stil-Profil aktiv</span>
                    </div>
                  )}
                  
                  {postCount === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Importiere zuerst deine Posts in der Historie, um dein Stil-Profil zu erstellen.
                    </p>
                  )}
                </div>
                
                <Button 
                  variant="outline"
                  onClick={() => navigate("/library")}
                  className="shrink-0"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Daten in Historie aktualisieren
                </Button>
              </div>

              {/* Show System Prompt if exists */}
              {brand?.style_system_prompt && (
                <div className="mt-6 space-y-2">
                  <Label className="text-sm font-medium">Generierte System-Instruktion</Label>
                  <Textarea
                    value={brand.style_system_prompt}
                    onChange={(e) => setBrand(brand ? { ...brand, style_system_prompt: e.target.value } : null)}
                    className="min-h-[150px] text-sm font-mono bg-muted/30"
                    placeholder="Die System-Instruktion wird nach dem Import und der Analyse hier angezeigt..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Diese Instruktion wird automatisch vom Generator verwendet. Du kannst sie manuell anpassen.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Antwort-DNA Box */}
          <Card className="glass-card border-2 border-accent/30 bg-gradient-to-br from-accent/5 via-accent/10 to-accent/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-accent" />
                <CardTitle>Deine Antwort-DNA</CardTitle>
              </div>
              <CardDescription>
                Dein Kommentar-Stil, gelernt aus deinen Antworten
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Datenbasis:</span>
                    <Badge variant="secondary" className="font-medium">
                      {replyCount} Antworten analysiert
                    </Badge>
                  </div>
                  
                  {brand?.reply_style_system_prompt && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-success">Antwort-Profil aktiv</span>
                    </div>
                  )}

                  {replyCount < 5 && (
                    <p className="text-sm text-muted-foreground">
                      Noch zu wenige Antworten für eine Analyse (min. 5 benötigt).
                    </p>
                  )}
                </div>
              </div>

              {brand?.reply_style_description && (
                <div className="mt-4 p-3 bg-background/50 rounded-lg border border-border/50">
                  <p className="text-sm italic text-muted-foreground">"{brand.reply_style_description}"</p>
                </div>
              )}

              {brand?.reply_style_system_prompt && (
                <div className="mt-6 space-y-2">
                  <Label className="text-sm font-medium">Generierte Antwort-Instruktion</Label>
                  <Textarea
                    value={brand.reply_style_system_prompt}
                    onChange={(e) => setBrand(brand ? { ...brand, reply_style_system_prompt: e.target.value } : null)}
                    className="min-h-[150px] text-sm font-mono bg-muted/30"
                    placeholder="Hier erscheint deine Antwort-DNA..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Diese Instruktion steuert den KI-Copiloten beim Antworten auf Kommentare.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tone of Voice Section */}
          <Card className="glass-card border-primary/20">
            <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Tone of Voice</CardTitle>
            </div>
            <CardDescription>
              Trainiere die KI auf deinen einzigartigen Schreibstil für bessere Texte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Writing Style */}
            <div className="space-y-2">
              <Label htmlFor="writing_style">Schreibstil</Label>
              <Input
                id="writing_style"
                placeholder="z.B. Humorvoll, Selbstironisch, Kurze Sätze, Direkte Ansprache..."
                value={brand?.writing_style || ""}
                onChange={(e) =>
                  setBrand(brand ? { ...brand, writing_style: e.target.value } : null)
                }
              />
              <p className="text-xs text-muted-foreground">
                Beschreibe deinen Schreibstil in wenigen Worten
              </p>
            </div>

            {/* Example Posts */}
            <div className="space-y-2">
              <Label htmlFor="example_posts">Beispiel-Posts (Few-Shot)</Label>
              <Textarea
                id="example_posts"
                placeholder="Kopiere hier 2-3 deiner besten Captions, die deinen Stil perfekt repräsentieren...

Beispiel 1:
---
Beispiel 2:
---
Beispiel 3:"
                value={brand?.example_posts || ""}
                onChange={(e) =>
                  setBrand(brand ? { ...brand, example_posts: e.target.value } : null)
                }
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Diese Beispiele helfen der KI, deinen Stil zu imitieren (Few-Shot Prompting)
              </p>
            </div>

            {/* Taboo Words */}
            <div className="space-y-2">
              <Label>Tabu-Wörter</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="z.B. Empowerment, Leute, Basic..."
                  value={tabooInput}
                  onChange={(e) => setTabooInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem("taboo_words")}
                />
                <Button size="icon" onClick={() => addItem("taboo_words")}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {(brand?.taboo_words || []).map((word, index) => (
                  <Badge key={index} variant="destructive" className="gap-1 pl-3">
                    {word}
                    <button
                      onClick={() => removeItem("taboo_words", index)}
                      className="ml-1 hover:opacity-70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(brand?.taboo_words || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Wörter, die nie verwendet werden sollen</p>
                )}
              </div>
            </div>

            {/* AI Model Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <Label>KI-Modell für Texte</Label>
              </div>
              <Select
                value={brand?.ai_model || "google/gemini-2.5-flash"}
                onValueChange={(value) =>
                  setBrand(brand ? { ...brand, ai_model: value } : null)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Modell wählen" />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{model.label}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                GPT-5 und Gemini Pro liefern kreativere und logisch bessere Texte, verbrauchen aber mehr Credits
              </p>
            </div>

            {/* Formality Mode Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" />
                <Label>Ansprache (Du/Sie)</Label>
              </div>
              <Select
                value={brand?.formality_mode || "smart"}
                onValueChange={(value: 'smart' | 'du' | 'sie') =>
                  setBrand(brand ? { ...brand, formality_mode: value } : null)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ansprache wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smart">
                    <div className="flex flex-col">
                      <span className="font-medium">🧠 Smart (Empfohlen)</span>
                      <span className="text-xs text-muted-foreground">Passt sich automatisch an - duzt, wenn der Fan duzt</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="du">
                    <div className="flex flex-col">
                      <span className="font-medium">👋 Immer Du</span>
                      <span className="text-xs text-muted-foreground">Informell, auch wenn der Fan siezt</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="sie">
                    <div className="flex flex-col">
                      <span className="font-medium">🎩 Immer Sie</span>
                      <span className="text-xs text-muted-foreground">Formell, auch wenn der Fan duzt</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Smart erkennt automatisch, ob der Fan "Sie" oder "Du" verwendet und passt die Antwort an
              </p>
            </div>
          </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Tone & Style */}
            <Card className="glass-card">
            <CardHeader>
              <CardTitle>Tonalität & Stil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tone_style">Beschreibung des Stils</Label>
                <Textarea
                  id="tone_style"
                  placeholder="z.B. Professionell aber nahbar, mit einem Hauch Humor..."
                  value={brand?.tone_style || ""}
                  onChange={(e) =>
                    setBrand(brand ? { ...brand, tone_style: e.target.value } : null)
                  }
                  className="min-h-[120px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Emoji-Level: {brand?.emoji_level}</Label>
                <Slider
                  value={[brand?.emoji_level || 1]}
                  onValueChange={([value]) =>
                    setBrand(brand ? { ...brand, emoji_level: value } : null)
                  }
                  min={0}
                  max={3}
                  step={1}
                  className="py-4"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Keine</span>
                  <span>Wenig</span>
                  <span>Moderat</span>
                  <span>Viele</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Primäre Sprache</Label>
                <Input
                  id="language"
                  value={brand?.language_primary || "DE"}
                  onChange={(e) =>
                    setBrand(brand ? { ...brand, language_primary: e.target.value } : null)
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Hashtags */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Hashtag-Regeln</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hashtag_min">Minimum</Label>
                  <Input
                    id="hashtag_min"
                    type="number"
                    min={0}
                    value={brand?.hashtag_min || 8}
                    onChange={(e) =>
                      setBrand(brand ? { ...brand, hashtag_min: parseInt(e.target.value) || 0 } : null)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hashtag_max">Maximum</Label>
                  <Input
                    id="hashtag_max"
                    type="number"
                    min={1}
                    value={brand?.hashtag_max || 20}
                    onChange={(e) =>
                      setBrand(brand ? { ...brand, hashtag_max: parseInt(e.target.value) || 1 } : null)
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="disclaimers">Standard-Disclaimer</Label>
                <Textarea
                  id="disclaimers"
                  placeholder="z.B. Werbung | Anzeige..."
                  value={brand?.disclaimers || ""}
                  onChange={(e) =>
                    setBrand(brand ? { ...brand, disclaimers: e.target.value } : null)
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Do's */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-success">Do's</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="z.B. Call-to-Action am Ende..."
                  value={doInput}
                  onChange={(e) => setDoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem("do_list")}
                />
                <Button size="icon" onClick={() => addItem("do_list")}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(brand?.do_list || []).map((item, index) => (
                  <Badge key={index} variant="outline" className="gap-1 pl-3 border-success/50 text-success">
                    {item}
                    <button
                      onClick={() => removeItem("do_list", index)}
                      className="ml-1 hover:opacity-70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(brand?.do_list || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Regeln, die immer befolgt werden</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Don'ts */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-destructive">Don'ts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="z.B. Keine Clickbait-Titel..."
                  value={dontInput}
                  onChange={(e) => setDontInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem("dont_list")}
                />
                <Button size="icon" onClick={() => addItem("dont_list")}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(brand?.dont_list || []).map((item, index) => (
                  <Badge key={index} variant="outline" className="gap-1 pl-3 border-destructive/50 text-destructive">
                    {item}
                    <button
                      onClick={() => removeItem("dont_list", index)}
                      className="ml-1 hover:opacity-70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(brand?.dont_list || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Dinge, die vermieden werden</p>
                )}
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}
