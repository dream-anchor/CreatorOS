import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Topic, Post, DraftGenerationResult } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Sparkles, Copy, Check, ImagePlus, Camera, Brain, Laugh, Heart, Lightbulb, Star, ArrowRight, ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PostType {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  structure: string;
  examples: string[];
}

const POST_TYPES: PostType[] = [
  {
    id: "behind_scenes",
    label: "Set-Leben",
    description: "Behind the Scenes, Arbeitsalltag, Drehmomente",
    icon: <Camera className="h-6 w-6" />,
    structure: "Persönlicher Einblick → Was passiert gerade → Emotion/Reaktion → Frage an Community",
    examples: ["Tag am Set", "Drehpause", "Kulissen-Einblick"]
  },
  {
    id: "thoughts",
    label: "Gedanken",
    description: "Reflexionen, Learnings, persönliche Erkenntnisse",
    icon: <Brain className="h-6 w-6" />,
    structure: "Starkes Statement → Kontext/Geschichte → Lesson Learned → Call-to-Action",
    examples: ["Lebensweisheit", "Persönliche Entwicklung", "Aha-Moment"]
  },
  {
    id: "humor",
    label: "Humor",
    description: "Lustige Momente, Selbstironie, Entertainment",
    icon: <Laugh className="h-6 w-6" />,
    structure: "Witziger Hook → Setup → Punchline → Emoji-reicher Abschluss",
    examples: ["Fail des Tages", "Relatable Content", "Plot Twist"]
  },
  {
    id: "motivation",
    label: "Motivation",
    description: "Inspirierende Worte, Ermutigung, Aufbauendes",
    icon: <Heart className="h-6 w-6" />,
    structure: "Empowering Statement → Persönliche Erfahrung → Ermutigung → Aufruf",
    examples: ["Monday Motivation", "Durchhalten", "Erfolgsgeschichte"]
  },
  {
    id: "tips",
    label: "Tipps & Tricks",
    description: "Praktische Ratschläge, How-Tos, Expertise",
    icon: <Lightbulb className="h-6 w-6" />,
    structure: "Problem benennen → Lösung/Tipp → Warum es funktioniert → Speichern-CTA",
    examples: ["Quick Tip", "So mache ich...", "Mein Geheimnis"]
  },
  {
    id: "announcement",
    label: "Ankündigung",
    description: "News, Projekte, Updates",
    icon: <Star className="h-6 w-6" />,
    structure: "Teaser/Excitement → Die große News → Details → Was kommt als nächstes",
    examples: ["Neues Projekt", "Premiere", "Zusammenarbeit"]
  }
];

type WizardStep = "type" | "topic" | "context" | "generate";

export default function GeneratorPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [draft, setDraft] = useState<DraftGenerationResult | null>(null);
  const [createdPost, setCreatedPost] = useState<Post | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Wizard State
  const [wizardStep, setWizardStep] = useState<WizardStep>("type");
  const [selectedPostType, setSelectedPostType] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [additionalContext, setAdditionalContext] = useState("");

  useEffect(() => {
    if (user) loadTopics();
  }, [user]);

  const loadTopics = async () => {
    try {
      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .order("priority", { ascending: false });

      if (error) throw error;
      setTopics((data as Topic[]) || []);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTopicId || !selectedPostType) {
      toast.error("Bitte wähle Typ und Thema");
      return;
    }

    setGenerating(true);
    setDraft(null);
    setCreatedPost(null);

    try {
      const postType = POST_TYPES.find(t => t.id === selectedPostType);
      
      const { data, error } = await supabase.functions.invoke("generate-draft", {
        body: { 
          topic_id: selectedTopicId,
          post_type: selectedPostType,
          post_structure: postType?.structure,
          additional_context: additionalContext
        },
      });

      if (error) throw error;

      setDraft(data.draft as DraftGenerationResult);
      setCreatedPost(data.post as Post);
      toast.success("Entwurf erfolgreich generiert!");
    } catch (error: any) {
      toast.error("Generierung fehlgeschlagen: " + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const resetWizard = () => {
    setWizardStep("type");
    setSelectedPostType(null);
    setSelectedTopicId("");
    setAdditionalContext("");
    setDraft(null);
    setCreatedPost(null);
  };

  const getStepNumber = () => {
    switch (wizardStep) {
      case "type": return 1;
      case "topic": return 2;
      case "context": return 3;
      case "generate": return 4;
      default: return 1;
    }
  };

  if (loading) {
    return (
      <AppLayout title="Draft Generator">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Draft Generator"
      description="Generiere KI-gestützte Instagram-Posts basierend auf deinen Themen"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Wizard Section */}
        <div className="space-y-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-4">
            {["Typ", "Thema", "Kontext", "Generieren"].map((step, index) => (
              <div key={step} className="flex items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                    getStepNumber() > index + 1
                      ? "bg-primary text-primary-foreground"
                      : getStepNumber() === index + 1
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {index + 1}
                </div>
                {index < 3 && (
                  <div
                    className={cn(
                      "w-12 lg:w-20 h-0.5 mx-1",
                      getStepNumber() > index + 1 ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Post Type Selection */}
          {wizardStep === "type" && (
            <Card className="glass-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Worüber möchtest du posten?
                </CardTitle>
                <CardDescription>
                  Wähle die Art des Posts – die KI passt Struktur und Stil an
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {POST_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => {
                        setSelectedPostType(type.id);
                        setWizardStep("topic");
                      }}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all hover:border-primary/50 hover:bg-primary/5",
                        selectedPostType === type.id
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          {type.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium">{type.label}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {type.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Topic Selection */}
          {wizardStep === "topic" && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Thema auswählen</CardTitle>
                <CardDescription>
                  {POST_TYPES.find(t => t.id === selectedPostType)?.label}: Welches Thema passt?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wähle ein Thema..." />
                  </SelectTrigger>
                  <SelectContent>
                    {topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            P{topic.priority}
                          </span>
                          {topic.title}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedTopicId && (
                  <div className="p-4 rounded-lg bg-muted/50 border border-border">
                    {(() => {
                      const topic = topics.find((t) => t.id === selectedTopicId);
                      return topic ? (
                        <>
                          <h4 className="font-medium">{topic.title}</h4>
                          {topic.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {topic.description}
                            </p>
                          )}
                        </>
                      ) : null;
                    })()}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setWizardStep("type")}
                    className="flex-1"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Zurück
                  </Button>
                  <Button
                    onClick={() => setWizardStep("context")}
                    disabled={!selectedTopicId}
                    className="flex-1"
                  >
                    Weiter
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Additional Context */}
          {wizardStep === "context" && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Zusätzlicher Kontext</CardTitle>
                <CardDescription>
                  Optional: Gibt es etwas Bestimmtes, das der Post beinhalten soll?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Show selected post type structure */}
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    {POST_TYPES.find(t => t.id === selectedPostType)?.icon}
                    <span className="font-medium">
                      {POST_TYPES.find(t => t.id === selectedPostType)?.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <strong>Struktur:</strong>{" "}
                    {POST_TYPES.find(t => t.id === selectedPostType)?.structure}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="context">Besondere Details (optional)</Label>
                  <Textarea
                    id="context"
                    placeholder="z.B. 'Es geht um meinen ersten Drehtag bei der neuen Serie' oder 'Ich möchte einen Fail vom Set erzählen'..."
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setWizardStep("topic")}
                    className="flex-1"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Zurück
                  </Button>
                  <Button
                    onClick={() => {
                      setWizardStep("generate");
                      handleGenerate();
                    }}
                    className="flex-1"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generieren
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Generating */}
          {wizardStep === "generate" && !draft && (
            <Card className="glass-card">
              <CardContent className="py-12 text-center">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground mb-2">
                  KI generiert deinen {POST_TYPES.find(t => t.id === selectedPostType)?.label}-Post...
                </p>
                <p className="text-xs text-muted-foreground">
                  Mit angepasster Struktur für maximale Wirkung
                </p>
              </CardContent>
            </Card>
          )}

          {/* Show "New Post" button after generation */}
          {draft && (
            <Button
              onClick={resetWizard}
              variant="outline"
              className="w-full"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Neuen Post erstellen
            </Button>
          )}

          {topics.length === 0 && (
            <Card className="glass-card border-warning/50">
              <CardContent className="py-6 text-center">
                <p className="text-muted-foreground">
                  Du hast noch keine Themen erstellt.
                </p>
                <Button variant="link" onClick={() => window.location.href = "/topics"}>
                  Themen erstellen →
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Output Section */}
        <div className="space-y-6">
          {draft && createdPost && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <StatusBadge status={createdPost.status} />
                <span className="text-sm text-muted-foreground">
                  Post wurde erstellt und wartet auf Review
                </span>
              </div>

              <Card className="glass-card">
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Caption</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(draft.caption, "caption")}
                      >
                        {copied === "caption" ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Textarea
                      value={draft.caption}
                      readOnly
                      className="min-h-[200px] text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Hashtags</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(draft.hashtags, "hashtags")}
                      >
                        {copied === "hashtags" ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-primary p-3 rounded-lg bg-muted/50 border border-border">
                      {draft.hashtags}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Alt-Text (Bildbeschreibung)</Label>
                    <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border border-border">
                      {draft.alt_text}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Bild-Prompt (für Generierung)</Label>
                    <div className="flex gap-2">
                      <p className="flex-1 text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border border-border">
                        {draft.asset_prompt}
                      </p>
                      <Button variant="outline" size="icon">
                        <ImagePlus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Alternative Captions */}
              {(draft.caption_alt || draft.caption_short) && (
                <Card className="glass-card">
                  <CardContent className="pt-6 space-y-4">
                    <Label>Alternative Versionen</Label>
                    {draft.caption_alt && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Alternative
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              copyToClipboard(draft.caption_alt, "caption_alt")
                            }
                          >
                            {copied === "caption_alt" ? (
                              <Check className="h-4 w-4 text-success" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-sm p-3 rounded-lg bg-muted/50 border border-border">
                          {draft.caption_alt}
                        </p>
                      </div>
                    )}
                    {draft.caption_short && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Kurzversion
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              copyToClipboard(draft.caption_short, "caption_short")
                            }
                          >
                            {copied === "caption_short" ? (
                              <Check className="h-4 w-4 text-success" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-sm p-3 rounded-lg bg-muted/50 border border-border">
                          {draft.caption_short}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Hook Options */}
              {draft.hook_options && draft.hook_options.length > 0 && (
                <Card className="glass-card">
                  <CardContent className="pt-6 space-y-3">
                    <Label>Hook-Optionen</Label>
                    {draft.hook_options.map((hook, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border"
                      >
                        <span className="text-xs text-primary font-medium mt-0.5">
                          {i + 1}.
                        </span>
                        <p className="text-sm flex-1">{hook}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(hook, `hook_${i}`)}
                        >
                          {copied === `hook_${i}` ? (
                            <Check className="h-4 w-4 text-success" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {wizardStep === "type" && (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Wähle einen Post-Typ um zu starten</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}