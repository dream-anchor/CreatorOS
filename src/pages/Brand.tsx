import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BrandRules } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Save, Plus, X, Sparkles, Brain, Wand2, Instagram, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const AI_MODELS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Schnell & günstig" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Beste Qualität & Reasoning" },
  { value: "openai/gpt-5", label: "GPT-5", description: "Kreativ & präzise" },
];

interface StyleAnalysis {
  style_description: string;
  writing_style: string;
  do_list: string[];
  dont_list: string[];
  example_posts: string;
  emoji_level: number;
  engagement_insights: string;
  unique_elements: string[];
}

export default function BrandPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brand, setBrand] = useState<BrandRules | null>(null);
  const [doInput, setDoInput] = useState("");
  const [dontInput, setDontInput] = useState("");
  const [tabooInput, setTabooInput] = useState("");
  
  // Style Analysis State
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<StyleAnalysis | null>(null);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [postsAnalyzed, setPostsAnalyzed] = useState(0);

  useEffect(() => {
    if (user) {
      loadBrandRules();
    }
  }, [user]);

  const loadBrandRules = async () => {
    try {
      const { data, error } = await supabase
        .from("brand_rules")
        .select("*")
        .single();

      if (error && error.code !== "PGRST116") throw error;
      if (data) setBrand(data as BrandRules);
    } catch (error: any) {
      toast.error("Fehler beim Laden: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!brand) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("brand_rules")
        .update({
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
        })
        .eq("id", brand.id);

      if (error) throw error;
      toast.success("Brand-Regeln gespeichert!");
    } catch (error: any) {
      toast.error("Fehler beim Speichern: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStyleAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-style");

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setAnalysisResult(data.analysis);
      setPostsAnalyzed(data.posts_analyzed);
      setShowAnalysisDialog(true);
      toast.success(`${data.posts_analyzed} Posts analysiert!`);
    } catch (error: any) {
      toast.error("Analyse fehlgeschlagen: " + error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const applyAnalysis = () => {
    if (!analysisResult || !brand) return;

    setBrand({
      ...brand,
      tone_style: analysisResult.style_description,
      writing_style: analysisResult.writing_style,
      do_list: analysisResult.do_list,
      dont_list: analysisResult.dont_list,
      example_posts: analysisResult.example_posts,
      emoji_level: analysisResult.emoji_level,
    });

    setShowAnalysisDialog(false);
    toast.success("Analyse übernommen! Vergiss nicht zu speichern.");
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

  if (loading) {
    return (
      <AppLayout title="Marke & Regeln">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Marke & Regeln"
      description="Definiere deinen Markenstil und Content-Richtlinien"
      actions={
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Speichern
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Style Analysis Card */}
        <Card className="glass-card border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              <CardTitle>Stil-Analyse</CardTitle>
            </div>
            <CardDescription>
              Analysiere deinen Instagram-Account automatisch und lerne deinen Schreibstil
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-2">
                  Die KI analysiert deine letzten 20 Instagram-Posts und extrahiert:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    Schreibstil & Tonalität
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    Do's und Don'ts
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    Beste Beispiel-Posts
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    Engagement-Insights
                  </li>
                </ul>
              </div>
              <Button 
                onClick={handleStyleAnalysis} 
                disabled={analyzing}
                size="lg"
                className="shrink-0"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analysiere...
                  </>
                ) : (
                  <>
                    <Instagram className="mr-2 h-4 w-4" />
                    Account analysieren
                  </>
                )}
              </Button>
            </div>
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
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Neues Do hinzufügen..."
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
                  <Badge key={index} variant="secondary" className="gap-1 pl-3">
                    {item}
                    <button
                      onClick={() => removeItem("do_list", index)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(brand?.do_list || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Noch keine Einträge</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Don'ts */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-destructive">Don'ts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Neues Don't hinzufügen..."
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
                  <Badge key={index} variant="secondary" className="gap-1 pl-3">
                    {item}
                    <button
                      onClick={() => removeItem("dont_list", index)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(brand?.dont_list || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Noch keine Einträge</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Analysis Results Dialog */}
      <Dialog open={showAnalysisDialog} onOpenChange={setShowAnalysisDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Stil-Analyse Ergebnis
            </DialogTitle>
            <DialogDescription>
              {postsAnalyzed} Posts analysiert • Powered by Gemini 2.5 Pro
            </DialogDescription>
          </DialogHeader>

          {analysisResult && (
            <div className="space-y-6 py-4">
              {/* Style Description */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Dein Schreibstil</Label>
                <p className="text-sm p-3 rounded-lg bg-muted/50 border border-border">
                  {analysisResult.style_description}
                </p>
              </div>

              {/* Writing Style String */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Stil-Zusammenfassung</Label>
                <Badge variant="outline" className="text-sm px-3 py-1">
                  {analysisResult.writing_style}
                </Badge>
              </div>

              {/* Engagement Insights */}
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertTitle>Engagement-Insights</AlertTitle>
                <AlertDescription>
                  {analysisResult.engagement_insights}
                </AlertDescription>
              </Alert>

              {/* Do's and Don'ts */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-success">Do's</Label>
                  <ul className="text-sm space-y-1">
                    {analysisResult.do_list.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <Label className="text-destructive">Don'ts</Label>
                  <ul className="text-sm space-y-1">
                    {analysisResult.dont_list.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Unique Elements */}
              {analysisResult.unique_elements && analysisResult.unique_elements.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Einzigartige Merkmale</Label>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.unique_elements.map((el, i) => (
                      <Badge key={i} variant="secondary">{el}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Emoji Level */}
              <div className="space-y-2">
                <Label>Empfohlenes Emoji-Level</Label>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    {analysisResult.emoji_level === 0 ? "😐" : 
                     analysisResult.emoji_level === 1 ? "🙂" :
                     analysisResult.emoji_level === 2 ? "😊" : "🎉"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Level {analysisResult.emoji_level}/3
                  </span>
                </div>
              </div>

              {/* Apply Button */}
              <div className="flex gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowAnalysisDialog(false)} className="flex-1">
                  Abbrechen
                </Button>
                <Button onClick={applyAnalysis} className="flex-1">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Analyse übernehmen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}