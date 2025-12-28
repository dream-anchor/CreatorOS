import { useEffect, useState } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Topic, Post, DraftGenerationResult, TopPerformingPost, RemasterResult } from "@/types/database";
import { toast } from "sonner";
import { 
  Loader2, Sparkles, Copy, Check, ImagePlus, Camera, Brain, Laugh, Heart, 
  Lightbulb, Star, ArrowRight, ArrowLeft, Recycle, TrendingUp, MessageSquare, 
  Flame, BookmarkCheck, Eye, Zap
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

type WizardStep = "mode" | "type" | "topic" | "context" | "generate" | "remix_select" | "remix_generate";
type GeneratorMode = "new" | "remix";

export default function GeneratorPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [draft, setDraft] = useState<DraftGenerationResult | null>(null);
  const [createdPost, setCreatedPost] = useState<Post | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);

  // Wizard State
  const [wizardStep, setWizardStep] = useState<WizardStep>("mode");
  const [generatorMode, setGeneratorMode] = useState<GeneratorMode | null>(null);
  const [selectedPostType, setSelectedPostType] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [additionalContext, setAdditionalContext] = useState("");

  // Remix State
  const [remixCandidates, setRemixCandidates] = useState<TopPerformingPost[]>([]);
  const [selectedRemixPost, setSelectedRemixPost] = useState<TopPerformingPost | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [remixInfo, setRemixInfo] = useState<any>(null);

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

  const loadRemixCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-draft", {
        body: { get_remix_candidates: true },
      });

      if (error) throw error;
      setRemixCandidates(data.candidates || []);
      
      if (data.candidates?.length === 0) {
        toast.info("Keine importierten Posts gefunden. Importiere zuerst deine Instagram-Posts.");
      }
    } catch (error: any) {
      toast.error("Fehler beim Laden: " + error.message);
    } finally {
      setLoadingCandidates(false);
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
    setAssetUrl(null);

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
      setAssetUrl(data.asset_url);
      toast.success("Entwurf erfolgreich generiert!");
    } catch (error: any) {
      toast.error("Generierung fehlgeschlagen: " + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRemixGenerate = async () => {
    if (!selectedRemixPost) {
      toast.error("Bitte wähle einen Post zum Remastern");
      return;
    }

    setGenerating(true);
    setDraft(null);
    setCreatedPost(null);
    setAssetUrl(null);
    setRemixInfo(null);
    setWizardStep("remix_generate");

    try {
      const { data, error } = await supabase.functions.invoke("generate-draft", {
        body: { 
          remix_mode: true,
          remix_post_id: selectedRemixPost.id
        },
      });

      if (error) throw error;

      setDraft(data.draft as DraftGenerationResult);
      setCreatedPost(data.post as Post);
      setAssetUrl(data.asset_url);
      setRemixInfo(data.remix_info);
      toast.success("Remaster erfolgreich erstellt!");
    } catch (error: any) {
      toast.error("Remaster fehlgeschlagen: " + error.message);
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
    setWizardStep("mode");
    setGeneratorMode(null);
    setSelectedPostType(null);
    setSelectedTopicId("");
    setAdditionalContext("");
    setDraft(null);
    setCreatedPost(null);
    setAssetUrl(null);
    setSelectedRemixPost(null);
    setRemixInfo(null);
  };

  const getPerformanceLabelDisplay = (label: string) => {
    switch (label) {
      case 'discussion_starter':
        return { icon: <MessageSquare className="h-4 w-4" />, text: 'Diskussions-Starter', color: 'bg-blue-500/10 text-blue-500' };
      case 'viral_hit':
        return { icon: <Flame className="h-4 w-4" />, text: 'Viral Hit', color: 'bg-orange-500/10 text-orange-500' };
      case 'high_value':
        return { icon: <BookmarkCheck className="h-4 w-4" />, text: 'High Value', color: 'bg-purple-500/10 text-purple-500' };
      default:
        return { icon: <TrendingUp className="h-4 w-4" />, text: 'High Engagement', color: 'bg-green-500/10 text-green-500' };
    }
  };

  const getStepNumber = () => {
    switch (wizardStep) {
      case "mode": return 0;
      case "type": return 1;
      case "topic": return 2;
      case "context": return 3;
      case "generate": return 4;
      case "remix_select": return 1;
      case "remix_generate": return 2;
      default: return 0;
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
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Wizard Section */}
        <div className="space-y-6">
          {/* Step 0: Mode Selection */}
          {wizardStep === "mode" && (
            <Card className="glass-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Was möchtest du erstellen?
                </CardTitle>
                <CardDescription>
                  Wähle zwischen neuem Content oder dem Remaster eines Erfolgs-Posts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <button
                  onClick={() => {
                    setGeneratorMode("new");
                    setWizardStep("type");
                  }}
                  className="w-full p-6 rounded-xl border-2 text-left transition-all hover:border-primary/50 hover:bg-primary/5 border-border"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold">Neuer Post</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Erstelle frischen Content basierend auf deinen Themen und Brand-Richtlinien
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setGeneratorMode("remix");
                    setWizardStep("remix_select");
                    loadRemixCandidates();
                  }}
                  className="w-full p-6 rounded-xl border-2 text-left transition-all hover:border-primary/50 hover:bg-primary/5 border-border group"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/10 to-pink-500/10 text-orange-500 group-hover:from-orange-500/20 group-hover:to-pink-500/20 transition-colors">
                      <Recycle className="h-8 w-8" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-semibold">♻️ Alten Hit neu auflegen</h4>
                        <Badge variant="secondary" className="text-xs">Remix</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Nimm deinen erfolgreichsten Content und transformiere ihn in ein neues Format
                      </p>
                      <div className="flex gap-2 mt-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-muted">Viralitäts-Score</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-muted">Format-Flip</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-muted">Hook-Update</span>
                      </div>
                    </div>
                  </div>
                </button>
              </CardContent>
            </Card>
          )}

          {/* Remix: Select Post */}
          {wizardStep === "remix_select" && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Recycle className="h-5 w-5 text-orange-500" />
                  Wähle deinen Top-Performer
                </CardTitle>
                <CardDescription>
                  Diese Posts haben die höchsten Viralitäts-Scores (Likes + Kommentare×3 + Saves×2)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingCandidates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : remixCandidates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Recycle className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>Keine importierten Posts gefunden.</p>
                    <p className="text-sm mt-2">Importiere zuerst deine Instagram-Posts, um diese Funktion zu nutzen.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {remixCandidates.map((post) => {
                      const labelInfo = getPerformanceLabelDisplay(post.performance_label);
                      return (
                        <button
                          key={post.id}
                          onClick={() => setSelectedRemixPost(post)}
                          className={cn(
                            "w-full p-4 rounded-xl border-2 text-left transition-all hover:border-primary/50",
                            selectedRemixPost?.id === post.id
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            {post.original_media_url && (
                              <img 
                                src={post.original_media_url} 
                                alt="" 
                                className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={cn("flex items-center gap-1", labelInfo.color)}>
                                  {labelInfo.icon}
                                  {labelInfo.text}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Score: {post.virality_score.toFixed(0)}
                                </span>
                              </div>
                              <p className="text-sm line-clamp-2">
                                {post.caption?.substring(0, 100)}...
                              </p>
                              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Heart className="h-3 w-3" /> {post.likes_count || 0}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" /> {post.comments_count || 0}
                                </span>
                                <span className="flex items-center gap-1">
                                  <BookmarkCheck className="h-3 w-3" /> {post.saved_count || 0}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWizardStep("mode");
                      setGeneratorMode(null);
                    }}
                    className="flex-1"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Zurück
                  </Button>
                  <Button
                    onClick={handleRemixGenerate}
                    disabled={!selectedRemixPost}
                    className="flex-1 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Remastern
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Remix: Generating */}
          {wizardStep === "remix_generate" && !draft && (
            <Card className="glass-card">
              <CardContent className="py-12 text-center">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-orange-500" />
                <p className="text-muted-foreground mb-2">
                  KI analysiert und remastert deinen Top-Post...
                </p>
                <p className="text-xs text-muted-foreground">
                  Format-Flip • Hook-Update • Vibe-Check
                </p>
              </CardContent>
            </Card>
          )}

          {/* Step 1: Post Type Selection (New Mode) */}
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
                <div className="mt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWizardStep("mode");
                      setGeneratorMode(null);
                    }}
                    className="w-full"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Zurück zur Auswahl
                  </Button>
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

          {topics.length === 0 && wizardStep !== "mode" && wizardStep !== "remix_select" && (
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
          {/* Remix Info Card */}
          {remixInfo && (
            <Card className="glass-card border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-pink-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Recycle className="h-5 w-5 text-orange-500" />
                  Remaster Analyse
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Warum war der Original-Post erfolgreich?</Label>
                  <p className="text-sm mt-1">{remixInfo.original_analysis}</p>
                </div>
                {remixInfo.format_flip_reason && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Format-Änderung</Label>
                    <p className="text-sm mt-1">{remixInfo.format_flip_reason}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Neue Hook-Optionen</Label>
                  <div className="space-y-2 mt-2">
                    {remixInfo.new_hooks?.map((hook: string, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border"
                      >
                        <span className="text-xs text-orange-500 font-medium mt-0.5">
                          {i + 1}.
                        </span>
                        <p className="text-sm flex-1">{hook}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(hook, `remix_hook_${i}`)}
                        >
                          {copied === `remix_hook_${i}` ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {draft && createdPost && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <StatusBadge status={createdPost.status} />
                <span className="text-sm text-muted-foreground">
                  Post wurde erstellt und wartet auf Review
                </span>
              </div>

              {/* Image Preview */}
              {assetUrl && (
                <Card className="glass-card overflow-hidden">
                  <img 
                    src={assetUrl} 
                    alt="Post Bild" 
                    className="w-full aspect-square object-cover"
                  />
                </Card>
              )}

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
                          <Check className="h-4 w-4 text-green-500" />
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
                          <Check className="h-4 w-4 text-green-500" />
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

                  {draft.asset_prompt && (
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
                  )}
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
                              <Check className="h-4 w-4 text-green-500" />
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
                              <Check className="h-4 w-4 text-green-500" />
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
                            <Check className="h-4 w-4 text-green-500" />
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

          {wizardStep === "mode" && (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Wähle einen Modus um zu starten</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </GlobalLayout>
  );
}
