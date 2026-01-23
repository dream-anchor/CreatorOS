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
  ArrowLeft, ArrowRight, BarChart3, BookmarkCheck, Brain, Calendar, Camera, 
  Check, Copy, Flame, Heart, Image, Laugh, Layers, Lightbulb, Loader2, 
  MessageSquare, Recycle, RotateCcw, Sparkles, Star, TrendingUp, Zap
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
            <Card className="glass-card border-primary/20 animate-fade-in">
              <CardHeader className="p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                  <CardTitle className="flex items-center gap-2 font-bold tracking-tight">
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
              <CardContent className="space-y-4 p-8">
                <button
                  onClick={() => {
                    setGeneratorMode("new");
                    setWizardStep("type");
                  }}
                  className="w-full p-6 rounded-3xl border-2 text-left transition-all duration-250 hover:border-primary/50 hover:bg-primary/5 hover:scale-[1.02] border-border"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold tracking-tight">Neuer Post</h4>
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
                  className="w-full p-6 rounded-3xl border-2 text-left transition-all duration-250 hover:border-primary/50 hover:bg-primary/5 hover:scale-[1.02] border-border group"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-orange-500/10 to-pink-500/10 text-orange-500 group-hover:from-orange-500/20 group-hover:to-pink-500/20 transition-all duration-250">
                      <Recycle className="h-8 w-8" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-semibold tracking-tight">♻️ Alten Hit neu auflegen</h4>
                        <Badge variant="secondary" className="text-xs rounded-full">Remix</Badge>
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
            <Card className="glass-card animate-fade-in">
              <CardHeader className="p-8">
                <CardTitle className="flex items-center gap-2 font-bold tracking-tight">
                  <Recycle className="h-5 w-5 text-orange-500" />
                  Wähle deinen Top-Performer
                </CardTitle>
                <CardDescription>
                  Diese Posts haben die höchsten Viralitäts-Scores (Likes + Kommentare×3 + Saves×2)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-8">
                {loadingCandidates ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : remixCandidates.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Recycle className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="font-medium">Keine importierten Posts gefunden.</p>
                    <p className="text-sm mt-2">Importiere zuerst deine Instagram-Posts, um diese Funktion zu nutzen.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                    {remixCandidates.map((post) => {
                      const labelInfo = getPerformanceLabelDisplay(post.performance_label);
                      return (
                        <button
                          key={post.id}
                          onClick={() => setSelectedRemixPost(post)}
                          className={cn(
                            "w-full p-4 rounded-3xl border-2 text-left transition-all duration-250 hover:border-primary/50 hover:scale-[1.01]",
                            selectedRemixPost?.id === post.id
                              ? "border-primary bg-primary/10 shadow-glow-sm"
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

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWizardStep("mode");
                      setGeneratorMode(null);
                    }}
                    className="flex-1 rounded-2xl h-11 transition-all duration-250 hover:scale-[1.02]"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Zurück
                  </Button>
                  <Button
                    onClick={handleRemixGenerate}
                    disabled={!selectedRemixPost}
                    className="flex-1 rounded-2xl h-11 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 transition-all duration-250 hover:scale-[1.02] hover:shadow-glow-accent disabled:hover:scale-100"
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
            <Card className="glass-card border-primary/20 animate-fade-in">
              <CardHeader className="p-8">
                <CardTitle className="flex items-center gap-2 font-bold tracking-tight">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Worüber möchtest du posten?
                </CardTitle>
                <CardDescription>
                  Wähle die Art des Posts – die KI passt Struktur und Stil an
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <div className="grid gap-3 sm:grid-cols-2">
                  {POST_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => {
                        setSelectedPostType(type.id);
                        setWizardStep("topic");
                      }}
                      className={cn(
                        "p-4 rounded-3xl border-2 text-left transition-all duration-250 hover:border-primary/50 hover:bg-primary/5 hover:scale-[1.02]",
                        selectedPostType === type.id
                          ? "border-primary bg-primary/10 shadow-glow-sm"
                          : "border-border"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-2xl bg-primary/10 text-primary">
                          {type.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold tracking-tight">{type.label}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {type.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-6">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWizardStep("mode");
                      setGeneratorMode(null);
                    }}
                    className="w-full rounded-2xl h-11 transition-all duration-250 hover:scale-[1.02]"
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
            <Card className="glass-card animate-fade-in">
              <CardHeader className="p-8">
                <CardTitle className="font-bold tracking-tight">Thema auswählen</CardTitle>
                <CardDescription>
                  {POST_TYPES.find(t => t.id === selectedPostType)?.label}: Welches Thema passt?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-8">
                <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                  <SelectTrigger className="glass-input rounded-2xl h-12">
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
                  <div className="p-6 rounded-3xl bg-muted/50 border border-border animate-slide-up">
                    {(() => {
                      const topic = topics.find((t) => t.id === selectedTopicId);
                      return topic ? (
                        <>
                          <h4 className="font-semibold tracking-tight">{topic.title}</h4>
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

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setWizardStep("type")}
                    className="flex-1 rounded-2xl h-11 transition-all duration-250 hover:scale-[1.02]"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Zurück
                  </Button>
                  <Button
                    onClick={() => setWizardStep("context")}
                    disabled={!selectedTopicId}
                    className="flex-1 rounded-2xl h-11 transition-all duration-250 hover:scale-[1.02] hover:shadow-glow-sm disabled:hover:scale-100"
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
            <Card className="glass-card animate-fade-in">
              <CardHeader className="p-8">
                <CardTitle className="font-bold tracking-tight">Zusätzlicher Kontext</CardTitle>
                <CardDescription>
                  Optional: Gibt es etwas Bestimmtes, das der Post beinhalten soll?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-8">
                <div className="p-6 rounded-3xl bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    {POST_TYPES.find(t => t.id === selectedPostType)?.icon}
                    <span className="font-semibold tracking-tight">
                      {POST_TYPES.find(t => t.id === selectedPostType)?.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <strong>Struktur:</strong>{" "}
                    {POST_TYPES.find(t => t.id === selectedPostType)?.structure}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="context" className="font-medium">Besondere Details (optional)</Label>
                  <Textarea
                    id="context"
                    placeholder="z.B. 'Es geht um meinen ersten Drehtag bei der neuen Serie' oder 'Ich möchte einen Fail vom Set erzählen'..."
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    className="glass-input min-h-[120px] rounded-2xl p-4"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setWizardStep("topic")}
                    className="flex-1 rounded-2xl h-11 transition-all duration-250 hover:scale-[1.02]"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Zurück
                  </Button>
                  <Button
                    onClick={() => {
                      setWizardStep("generate");
                      handleGenerate();
                    }}
                    className="flex-1 rounded-2xl h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-250 hover:scale-[1.02] hover:shadow-glow-md"
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
              className="w-full rounded-2xl h-11 transition-all duration-250 hover:scale-[1.02] animate-fade-in"
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
            <Card className="glass-card border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-pink-500/5 animate-slide-up">
              <CardHeader className="p-6">
                <CardTitle className="text-lg flex items-center gap-2 font-bold tracking-tight">
                  <Recycle className="h-5 w-5 text-orange-500" />
                  Remaster Analyse
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Warum war der Original-Post erfolgreich?</Label>
                  <p className="text-sm mt-2 leading-relaxed">{remixInfo.original_analysis}</p>
                </div>
                {remixInfo.format_flip_reason && (
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Format-Änderung</Label>
                    <p className="text-sm mt-2 leading-relaxed">{remixInfo.format_flip_reason}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Neue Hook-Optionen</Label>
                  <div className="space-y-2 mt-3">
                    {remixInfo.new_hooks?.map((hook: string, i: number) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 p-4 rounded-2xl bg-background/50 border border-border hover:border-orange-500/30 transition-all duration-250 group"
                        >
                          <span className="text-xs text-orange-500 font-semibold mt-0.5 px-2 py-1 rounded-full bg-orange-500/10">
                            {i + 1}
                          </span>
                          <p className="text-sm flex-1 leading-relaxed">{hook}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(hook, `remix_hook_${i}`)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
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
              <div className="flex items-center justify-between mb-8 animate-fade-in">
                <div>
                  <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Generierter Content
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Überprüfe und verfeinere deinen Post
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={resetWizard} className="text-xs h-9 rounded-2xl transition-all duration-250 hover:scale-[1.02]">
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Neu generieren
                  </Button>
                  <Button size="sm" className="text-xs h-9 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-250 hover:scale-[1.02] hover:shadow-glow-sm">
                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                    Planen
                  </Button>
                </div>
              </div>

              <Tabs value={outputTab} onValueChange={(v) => setOutputTab(v as any)} className="w-full">
                <TabsList className="w-full grid grid-cols-3 mb-8 glass-card p-1.5 h-auto rounded-3xl">
                  <TabsTrigger value="post" className="flex items-center gap-2 py-2.5 rounded-2xl data-[state=active]:bg-background data-[state=active]:shadow-soft transition-all duration-250 font-medium">
                    <MessageSquare className="h-4 w-4" />
                    <span className="hidden sm:inline">Post</span>
                  </TabsTrigger>
                  <TabsTrigger value="alternatives" className="flex items-center gap-2 py-2.5 rounded-2xl data-[state=active]:bg-background data-[state=active]:shadow-soft transition-all duration-250 font-medium">
                    <Layers className="h-4 w-4" />
                    <span className="hidden sm:inline">Alternativen</span>
                  </TabsTrigger>
                  <TabsTrigger value="analysis" className="flex items-center gap-2 py-2.5 rounded-2xl data-[state=active]:bg-background data-[state=active]:shadow-soft transition-all duration-250 font-medium">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Analyse</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="post" className="space-y-6 animate-fade-in">
                  {/* Image Preview */}
                  {assetUrl && (
                    <Card className="glass-card overflow-hidden border-primary/10 animate-slide-up">
                      <img 
                        src={assetUrl} 
                        alt="Post Bild" 
                        className="w-full aspect-square object-cover"
                      />
                    </Card>
                  )}

                  {/* Main Post Content */}
                  <div className="glass-card p-8 border-primary/10 animate-slide-up">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-3 py-1.5 bg-primary/10 text-primary rounded-full">
                          Haupt-Version
                        </span>
                        {createdPost.status && <StatusBadge status={createdPost.status} />}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-primary/5 rounded-xl transition-all duration-250 hover:scale-110"
                        onClick={() => copyToClipboard(draft.caption, "caption")}
                      >
                        {copied === "caption" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </div>
                    
                    <div className="glass-input p-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-250">
                      <Textarea
                        value={draft.caption}
                        onChange={(e) => handleCaptionChange(e.target.value)}
                        className="min-h-[200px] border-0 bg-transparent resize-none focus-visible:ring-0 text-sm leading-relaxed p-4"
                        placeholder="Schreibe hier deine Caption..."
                      />
                    </div>

                    <div className="mt-8 space-y-4">
                      {/* Image Prompt */}
                      {draft.asset_prompt && (
                        <div className="bg-accent/5 rounded-3xl p-5 border border-accent/10 hover:border-accent/20 transition-all duration-250">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-semibold text-accent flex items-center gap-2">
                              <Image className="h-4 w-4" />
                              Bild-Prompt
                            </span>
                            <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 hover:bg-accent/10 rounded-xl transition-all duration-250 hover:scale-110"
                                  onClick={() => copyToClipboard(draft.asset_prompt || "", "prompt")}
                                >
                                  {copied === "prompt" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                                </Button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground italic leading-relaxed">
                            "{draft.asset_prompt}"
                          </p>
                        </div>
                      )}

                      {/* Hashtags */}
                      {draft.hashtags && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-semibold text-muted-foreground">Hashtags</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-primary/5 rounded-xl transition-all duration-250 hover:scale-110"
                              onClick={() => copyToClipboard(Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : draft.hashtags, "hashtags")}
                            >
                              {copied === "hashtags" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                            </Button>
                          </div>
                          <div className="p-4 bg-muted/30 rounded-2xl text-xs text-muted-foreground leading-relaxed">
                             {Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : draft.hashtags}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="alternatives" className="space-y-6 animate-fade-in">
                  {/* Hooks */}
                  {draft.hook_options && draft.hook_options.length > 0 && (
                    <div className="glass-card p-8 animate-slide-up">
                      <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 tracking-tight">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        Virale Hooks
                      </h3>
                      <div className="space-y-3">
                        {draft.hook_options.map((hook, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-muted/30 rounded-3xl border border-border/50 hover:border-primary/30 hover:bg-muted/40 transition-all duration-250 group">
                            <span className="text-sm leading-relaxed flex-1">{hook}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl hover:scale-110"
                              onClick={() => copyToClipboard(hook, `hook-${i}`)}
                            >
                              {copied === `hook-${i}` ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alternative Captions */}
                  {(draft.caption_alt || draft.caption_short) && (
                    <div className="glass-card p-8 animate-slide-up">
                      <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 tracking-tight">
                        <Recycle className="h-4 w-4 text-blue-500" />
                        Alternative Versionen
                      </h3>
                      <div className="space-y-4">
                        {draft.caption_alt && (
                          <div className="p-5 bg-muted/30 rounded-3xl border border-border/50 hover:border-primary/20 transition-all duration-250 group">
                            <div className="flex justify-between items-start mb-3">
                              <span className="text-xs font-semibold text-muted-foreground">Alternative</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-250 hover:scale-110"
                                onClick={() => copyToClipboard(draft.caption_alt || "", "caption_alt")}
                              >
                                {copied === "caption_alt" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                              </Button>
                            </div>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{draft.caption_alt}</p>
                          </div>
                        )}
                        {draft.caption_short && (
                          <div className="p-5 bg-muted/30 rounded-3xl border border-border/50 hover:border-primary/20 transition-all duration-250 group">
                            <div className="flex justify-between items-start mb-3">
                              <span className="text-xs font-semibold text-muted-foreground">Kurzversion</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-250 hover:scale-110"
                                onClick={() => copyToClipboard(draft.caption_short || "", "caption_short")}
                              >
                                {copied === "caption_short" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                              </Button>
                            </div>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{draft.caption_short}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="analysis" className="space-y-6 animate-fade-in">
                  {/* Remix Analysis if available */}
                  {remixInfo && (
                    <div className="glass-card p-8 border-orange-500/20 bg-orange-500/5 animate-slide-up">
                      <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-orange-500 tracking-tight">
                        <Recycle className="h-4 w-4" />
                        Remaster Analyse
                      </h3>
                      <div className="space-y-4 text-sm">
                        <div>
                          <span className="font-semibold text-muted-foreground block text-xs mb-2">Original Erfolgs-Faktor:</span>
                          <p className="leading-relaxed">{remixInfo.original_analysis}</p>
                        </div>
                        {remixInfo.format_flip_reason && (
                           <div>
                             <span className="font-semibold text-muted-foreground block text-xs mb-2">Format-Flip:</span>
                             <p className="leading-relaxed">{remixInfo.format_flip_reason}</p>
                           </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Standard Analysis */}
                  <div className="glass-card p-8 animate-slide-up">
                    <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-muted-foreground tracking-tight">
                       <Lightbulb className="h-4 w-4" />
                       Content Strategie
                    </h3>
                    <div className="space-y-4">
                       <p className="text-sm text-muted-foreground italic leading-relaxed">
                         Dieser Post wurde basierend auf deinen ausgewählten Themen und der Brand DNA optimiert.
                       </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}

          {wizardStep === "mode" && (
            <Card className="glass-card animate-fade-in">
              <CardContent className="py-16 text-center text-muted-foreground">
                <Sparkles className="h-16 w-16 mx-auto mb-6 opacity-20" />
                <p className="font-medium">Wähle einen Modus um zu starten</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </GlobalLayout>
  );
}
