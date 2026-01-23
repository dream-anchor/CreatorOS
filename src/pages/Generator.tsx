import { useEffect, useState } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Topic, Post, DraftGenerationResult, TopPerformingPost, RemasterResult } from "@/types/database";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, Sparkles, Copy, Check, ImagePlus, Camera, Brain, Laugh, Heart, 
  Lightbulb, Star, ArrowRight, ArrowLeft, Recycle, TrendingUp, MessageSquare, 
  Flame, BookmarkCheck, Eye, Zap, BarChart3, Layers,
  RotateCw, Calendar, Image as ImageIcon
} from "lucide-react";
import { AiModelSelector, AI_MODELS } from "@/components/community/AiModelSelector";
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
  const [outputTab, setOutputTab] = useState<"post" | "alternatives" | "analysis">("post");

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

  // Model Selection
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

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
          additional_context: additionalContext,
          model: selectedModel,
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
          remix_post_id: selectedRemixPost.id,
          model: selectedModel,
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

  const handleCaptionChange = (newCaption: string) => {
    if (draft) {
      setDraft({ ...draft, caption: newCaption });
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Was möchtest du erstellen?
                  </CardTitle>
                  <div className="w-full sm:w-auto">
                    <AiModelSelector
                      selectedModel={selectedModel}
                      onModelChange={setSelectedModel}
                    />
                  </div>
                </div>
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
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Generierter Content
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Überprüfe und verfeinere deinen Post
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={resetWizard} className="text-xs h-8">
                    <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                    Neu generieren
                  </Button>
                  <Button size="sm" className="text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                    Planen
                  </Button>
                </div>
              </div>

              <Tabs value={outputTab} onValueChange={(v) => setOutputTab(v as any)} className="w-full">
                <TabsList className="w-full grid grid-cols-3 mb-6 bg-muted/50 p-1 h-auto">
                  <TabsTrigger value="post" className="flex items-center gap-2 py-2 data-[state=active]:bg-background shadow-sm">
                    <MessageSquare className="h-4 w-4" />
                    <span className="hidden sm:inline">Post</span>
                  </TabsTrigger>
                  <TabsTrigger value="alternatives" className="flex items-center gap-2 py-2 data-[state=active]:bg-background shadow-sm">
                    <Layers className="h-4 w-4" />
                    <span className="hidden sm:inline">Alternativen</span>
                  </TabsTrigger>
                  <TabsTrigger value="analysis" className="flex items-center gap-2 py-2 data-[state=active]:bg-background shadow-sm">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Analyse</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="post" className="space-y-6 animate-in fade-in-50 duration-300">
                  {/* Image Preview */}
                  {assetUrl && (
                    <Card className="glass-card overflow-hidden border-primary/10">
                      <img 
                        src={assetUrl} 
                        alt="Post Bild" 
                        className="w-full aspect-square object-cover"
                      />
                    </Card>
                  )}

                  {/* Main Post Content */}
                  <div className="glass-card p-6 rounded-2xl border-primary/10">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded-md">
                          Haupt-Version
                        </span>
                        {createdPost.status && <StatusBadge status={createdPost.status} />}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-primary/5"
                        onClick={() => copyToClipboard(draft.caption, "caption")}
                      >
                        {copied === "caption" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </div>
                    
                    <div className="bg-muted/30 rounded-xl p-1 border border-border/50 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-200">
                      <Textarea
                        value={draft.caption}
                        onChange={(e) => handleCaptionChange(e.target.value)}
                        className="min-h-[200px] border-0 bg-transparent resize-none focus-visible:ring-0 text-sm leading-relaxed p-4"
                        placeholder="Schreibe hier deine Caption..."
                      />
                    </div>

                    <div className="mt-6 space-y-4">
                      {/* Image Prompt */}
                      {draft.asset_prompt && (
                        <div className="bg-accent/5 rounded-xl p-4 border border-accent/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-accent flex items-center gap-1.5">
                              <ImageIcon className="h-3.5 w-3.5" />
                              Bild-Prompt
                            </span>
                            <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-accent/10"
                                  onClick={() => copyToClipboard(draft.asset_prompt || "", "prompt")}
                                >
                                  {copied === "prompt" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                                </Button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground italic">
                            "{draft.asset_prompt}"
                          </p>
                        </div>
                      )}

                      {/* Hashtags */}
                      {draft.hashtags && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Hashtags</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-primary/5"
                              onClick={() => copyToClipboard(Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : draft.hashtags, "hashtags")}
                            >
                              {copied === "hashtags" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                            </Button>
                          </div>
                          <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                             {Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : draft.hashtags}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="alternatives" className="space-y-6 animate-in fade-in-50 duration-300">
                  {/* Hooks */}
                  {draft.hook_options && draft.hook_options.length > 0 && (
                    <div className="glass-card p-6 rounded-2xl">
                      <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        Virale Hooks
                      </h3>
                      <div className="space-y-3">
                        {draft.hook_options.map((hook, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50 hover:border-primary/20 transition-colors group">
                            <span className="text-sm">{hook}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => copyToClipboard(hook, `hook-${i}`)}
                            >
                              {copied === `hook-${i}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alternative Captions */}
                  {(draft.caption_alt || draft.caption_short) && (
                    <div className="glass-card p-6 rounded-2xl">
                      <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                        <Recycle className="h-4 w-4 text-blue-500" />
                        Alternative Versionen
                      </h3>
                      <div className="space-y-4">
                        {draft.caption_alt && (
                          <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-medium text-muted-foreground">Alternative</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(draft.caption_alt || "", "caption_alt")}
                              >
                                {copied === "caption_alt" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                              </Button>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{draft.caption_alt}</p>
                          </div>
                        )}
                        {draft.caption_short && (
                          <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-medium text-muted-foreground">Kurzversion</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(draft.caption_short || "", "caption_short")}
                              >
                                {copied === "caption_short" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                              </Button>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{draft.caption_short}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="analysis" className="space-y-6 animate-in fade-in-50 duration-300">
                  {/* Remix Analysis if available */}
                  {remixInfo && (
                    <div className="glass-card p-5 rounded-2xl border-orange-500/20 bg-orange-500/5">
                      <h3 className="text-sm font-medium mb-3 flex items-center gap-2 text-orange-500">
                        <Recycle className="h-4 w-4" />
                        Remaster Analyse
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div>
                          <span className="font-medium text-muted-foreground block text-xs mb-1">Original Erfolgs-Faktor:</span>
                          <p>{remixInfo.original_analysis}</p>
                        </div>
                        {remixInfo.format_flip_reason && (
                           <div>
                             <span className="font-medium text-muted-foreground block text-xs mb-1">Format-Flip:</span>
                             <p>{remixInfo.format_flip_reason}</p>
                           </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Standard Analysis */}
                  <div className="glass-card p-5 rounded-2xl">
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2 text-muted-foreground">
                       <Lightbulb className="h-4 w-4" />
                       Content Strategie
                    </h3>
                    <div className="space-y-4">
                      {/* Note: The DB types for DraftGenerationResult might not always have strategy/targetAudience/whyItWorks depending on backend version. 
                          Assuming they exist based on previous code. If missing, we render nothing or generic info. */}
                       <p className="text-sm text-muted-foreground italic">
                         Dieser Post wurde basierend auf deinen ausgewählten Themen und der Brand DNA optimiert.
                       </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
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
