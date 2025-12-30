import { useEffect, useState } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Topic } from "@/types/database";
import { toast } from "sonner";
import { 
  Loader2, Plus, Pencil, Trash2, Upload, Star, Leaf, Calendar,
  Sparkles, Archive, Lightbulb, ArrowRight, Check, FileText
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PostIdea {
  angle: string;
  hook: string;
  outline: string;
  hashtag_suggestions: string[];
  best_time: string;
  format_suggestion: string;
}

interface TopicResearch {
  ideas: PostIdea[];
  trend_insights?: string;
  warning?: string;
}

interface ArchivePost {
  id: string;
  caption: string;
  likes?: number;
  created_at: string;
}

type WizardStep = 'input' | 'options' | 'archive' | 'research' | 'results';

export default function TopicsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvInput, setCsvInput] = useState("");
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [saving, setSaving] = useState(false);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('input');
  const [wizardTopic, setWizardTopic] = useState("");
  const [wizardContext, setWizardContext] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchResults, setResearchResults] = useState<TopicResearch | null>(null);
  const [archivePosts, setArchivePosts] = useState<ArchivePost[]>([]);
  const [searchingArchive, setSearchingArchive] = useState(false);
  const [selectedIdeas, setSelectedIdeas] = useState<Set<number>>(new Set());

  const [form, setForm] = useState({
    title: "",
    description: "",
    keywords: "",
    priority: 3,
    evergreen: false,
    seasonal_start: "",
    seasonal_end: "",
  });

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

  const openDialog = (topic?: Topic) => {
    if (topic) {
      setEditingTopic(topic);
      setForm({
        title: topic.title,
        description: topic.description || "",
        keywords: topic.keywords?.join(", ") || "",
        priority: topic.priority,
        evergreen: topic.evergreen,
        seasonal_start: topic.seasonal_start || "",
        seasonal_end: topic.seasonal_end || "",
      });
      setDialogOpen(true);
    } else {
      // Open wizard for new topics
      resetWizard();
      setWizardOpen(true);
    }
  };

  const resetWizard = () => {
    setWizardStep('input');
    setWizardTopic("");
    setWizardContext("");
    setResearchResults(null);
    setArchivePosts([]);
    setSelectedIdeas(new Set());
    setEditingTopic(null);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Titel ist erforderlich");
      return;
    }

    setSaving(true);
    try {
      const topicData = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
        priority: form.priority,
        evergreen: form.evergreen,
        seasonal_start: form.seasonal_start || null,
        seasonal_end: form.seasonal_end || null,
        user_id: user!.id,
      };

      if (editingTopic) {
        const { error } = await supabase
          .from("topics")
          .update(topicData)
          .eq("id", editingTopic.id);
        if (error) throw error;
        toast.success("Thema aktualisiert");
      } else {
        const { error } = await supabase.from("topics").insert(topicData);
        if (error) throw error;
        toast.success("Thema erstellt");
      }

      setDialogOpen(false);
      loadTopics();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Thema wirklich löschen?")) return;

    try {
      const { error } = await supabase.from("topics").delete().eq("id", id);
      if (error) throw error;
      toast.success("Thema gelöscht");
      loadTopics();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    }
  };

  const handleCsvImport = async () => {
    const lines = csvInput.split("\n").filter((l) => l.trim());
    if (lines.length === 0) {
      toast.error("Keine Daten gefunden");
      return;
    }

    setSaving(true);
    try {
      const newTopics = lines.map((line) => {
        const [title, description, keywords] = line.split(";").map((s) => s?.trim());
        return {
          title: title || "Ohne Titel",
          description: description || null,
          keywords: keywords?.split(",").map((k) => k.trim()).filter(Boolean) || [],
          priority: 3,
          evergreen: false,
          user_id: user!.id,
        };
      });

      const { error } = await supabase.from("topics").insert(newTopics);
      if (error) throw error;

      toast.success(`${newTopics.length} Themen importiert`);
      setCsvDialogOpen(false);
      setCsvInput("");
      loadTopics();
    } catch (error: any) {
      toast.error("Import fehlgeschlagen: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Wizard: Search archive for similar posts
  const handleArchiveScan = async () => {
    if (!wizardTopic.trim()) {
      toast.error("Bitte gib ein Thema ein");
      return;
    }

    setSearchingArchive(true);
    setWizardStep('archive');

    try {
      // Search posts by caption containing the topic keywords
      const keywords = wizardTopic.toLowerCase().split(' ');
      
      const { data: posts, error } = await supabase
        .from("posts")
        .select("id, caption, created_at")
        .not("caption", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Filter posts that contain any of the keywords
      const matchingPosts = (posts || [])
        .filter(post => {
          const caption = (post.caption || '').toLowerCase();
          return keywords.some(kw => caption.includes(kw));
        })
        .slice(0, 5) as ArchivePost[];

      setArchivePosts(matchingPosts);

      if (matchingPosts.length === 0) {
        toast.info("Keine passenden Posts im Archiv gefunden");
      }
    } catch (error: any) {
      toast.error("Archiv-Suche fehlgeschlagen: " + error.message);
    } finally {
      setSearchingArchive(false);
    }
  };

  // Wizard: AI Research
  const handleResearch = async () => {
    if (!wizardTopic.trim()) {
      toast.error("Bitte gib ein Thema ein");
      return;
    }

    setResearching(true);
    setWizardStep('research');

    try {
      const { data, error } = await supabase.functions.invoke('topic-research', {
        body: { 
          topic: wizardTopic,
          context: wizardContext
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setResearchResults(data.research);
      setWizardStep('results');
      toast.success("Recherche abgeschlossen!");
    } catch (error: any) {
      toast.error("Recherche fehlgeschlagen: " + error.message);
      setWizardStep('options');
    } finally {
      setResearching(false);
    }
  };

  // Save selected ideas as drafts
  const handleSaveIdeasAsDrafts = async () => {
    if (!researchResults || selectedIdeas.size === 0) {
      toast.error("Bitte wähle mindestens eine Idee aus");
      return;
    }

    setSaving(true);
    try {
      // First, create the topic
      const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .insert({
          title: wizardTopic,
          description: `KI-generierte Ideen zum Thema "${wizardTopic}"`,
          keywords: [wizardTopic.toLowerCase()],
          priority: 3,
          evergreen: false,
          user_id: user!.id,
        })
        .select()
        .single();

      if (topicError) throw topicError;

      // Create drafts for selected ideas
      const selectedIdeasArray = Array.from(selectedIdeas);
      const drafts = selectedIdeasArray.map(index => {
        const idea = researchResults.ideas[index];
        return {
          user_id: user!.id,
          topic_id: topicData.id,
          caption: `${idea.hook}\n\n${idea.outline}`,
          hashtags: idea.hashtag_suggestions?.join(' ') || '',
          status: 'IDEA' as const,
        };
      });

      const { error: draftsError } = await supabase
        .from("posts")
        .insert(drafts);

      if (draftsError) throw draftsError;

      toast.success(`Thema und ${selectedIdeasArray.length} Entwürfe erstellt!`);
      setWizardOpen(false);
      resetWizard();
      loadTopics();
    } catch (error: any) {
      toast.error("Fehler beim Speichern: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Save archive post as draft
  const handleSaveArchivePostAsDraft = async (post: ArchivePost) => {
    setSaving(true);
    try {
      // First, create the topic if it doesn't exist
      const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .insert({
          title: wizardTopic,
          description: `Recycling-Thema basierend auf Archiv`,
          keywords: [wizardTopic.toLowerCase()],
          priority: 3,
          evergreen: false,
          user_id: user!.id,
        })
        .select()
        .single();

      if (topicError) throw topicError;

      // Create a new draft inspired by the old post
      const { error: draftError } = await supabase
        .from("posts")
        .insert({
          user_id: user!.id,
          topic_id: topicData.id,
          caption: `[RECYCLING-IDEE basierend auf altem Post]\n\nOriginal:\n${post.caption}\n\n---\nNEUE VERSION:\n[Hier deine neue Version schreiben]`,
          status: 'IDEA' as const,
        });

      if (draftError) throw draftError;

      toast.success("Als Entwurf gespeichert!");
      setWizardOpen(false);
      resetWizard();
      loadTopics();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Create topic without wizard
  const handleQuickCreate = () => {
    if (!wizardTopic.trim()) {
      toast.error("Bitte gib ein Thema ein");
      return;
    }

    setForm({
      title: wizardTopic,
      description: wizardContext,
      keywords: "",
      priority: 3,
      evergreen: false,
      seasonal_start: "",
      seasonal_end: "",
    });
    setWizardOpen(false);
    setDialogOpen(true);
  };

  const toggleIdeaSelection = (index: number) => {
    const newSelected = new Set(selectedIdeas);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIdeas(newSelected);
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
        <div className="space-y-6 max-w-7xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Themen</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Verwalte deine Content-Themen und Ideen
              </p>
            </div>
            <div className="flex gap-2">
              <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" />
                    CSV Import
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>CSV Import</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Format: Titel;Beschreibung;Keywords (kommagetrennt)
                    </p>
                    <Textarea
                      placeholder="Thema 1;Beschreibung;keyword1, keyword2
Thema 2;Andere Beschreibung;keyword3"
                      value={csvInput}
                      onChange={(e) => setCsvInput(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                    />
                    <Button onClick={handleCsvImport} disabled={saving} className="w-full">
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Importieren
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Neues Thema
              </Button>
            </div>
          </div>

          {topics.length === 0 ? (
            <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">Noch keine Themen erstellt</p>
            <Button onClick={() => openDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Erstes Thema erstellen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <Card key={topic.id} className="glass-card group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{topic.title}</CardTitle>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openDialog(topic)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(topic.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {topic.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {topic.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="gap-1">
                    <Star className="h-3 w-3" />
                    {topic.priority}
                  </Badge>
                  {topic.evergreen && (
                    <Badge variant="secondary" className="gap-1">
                      <Leaf className="h-3 w-3" />
                      Evergreen
                    </Badge>
                  )}
                  {topic.seasonal_start && (
                    <Badge variant="secondary" className="gap-1">
                      <Calendar className="h-3 w-3" />
                      Saisonal
                    </Badge>
                  )}
                </div>
                {topic.keywords && topic.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {topic.keywords.slice(0, 3).map((kw, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {kw}
                      </span>
                    ))}
                    {topic.keywords.length > 3 && (
                      <span className="text-xs px-2 py-0.5 text-muted-foreground">
                        +{topic.keywords.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
        </div>
      </div>

      {/* Topic Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={(open) => {
        setWizardOpen(open);
        if (!open) resetWizard();
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {wizardStep === 'input' && 'Neues Thema erstellen'}
              {wizardStep === 'options' && 'Wie möchtest du vorgehen?'}
              {wizardStep === 'archive' && 'Dein Archiv durchsuchen'}
              {wizardStep === 'research' && 'KI recherchiert...'}
              {wizardStep === 'results' && 'Post-Ideen'}
            </DialogTitle>
          </DialogHeader>

          {/* Step 1: Input */}
          {wizardStep === 'input' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-topic">Worüber möchtest du posten?</Label>
                <Input
                  id="wizard-topic"
                  value={wizardTopic}
                  onChange={(e) => setWizardTopic(e.target.value)}
                  placeholder="z.B. Set-Leben, Gedanken, Behind the Scenes..."
                  className="text-lg"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-context">Zusätzlicher Kontext (optional)</Label>
                <Textarea
                  id="wizard-context"
                  value={wizardContext}
                  onChange={(e) => setWizardContext(e.target.value)}
                  placeholder="Gibt es einen besonderen Anlass oder Fokus?"
                  className="min-h-[80px]"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={() => setWizardStep('options')}
                  disabled={!wizardTopic.trim()}
                  className="flex-1"
                >
                  Weiter
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleQuickCreate}
                  disabled={!wizardTopic.trim()}
                >
                  Direkt erstellen
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Options */}
          {wizardStep === 'options' && (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Thema: <span className="font-medium text-foreground">"{wizardTopic}"</span>
              </p>
              
              <div className="grid gap-4 md:grid-cols-2">
                {/* Option A: Archive Scan */}
                <Card 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={handleArchiveScan}
                >
                  <CardContent className="p-6 text-center space-y-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Archive className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Mein Archiv scannen</h3>
                    <p className="text-sm text-muted-foreground">
                      Durchsuche deine alten Posts nach diesem Thema und finde bewährte Inhalte zum Recyceln.
                    </p>
                    <Badge variant="secondary">Recycling</Badge>
                  </CardContent>
                </Card>

                {/* Option B: AI Research */}
                <Card 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={handleResearch}
                >
                  <CardContent className="p-6 text-center space-y-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Lightbulb className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Inspiration & Recherche</h3>
                    <p className="text-sm text-muted-foreground">
                      Die KI entwickelt 5 unkonventionelle Blickwinkel mit provokanten Hooks.
                    </p>
                    <Badge variant="secondary">Fresh Content</Badge>
                  </CardContent>
                </Card>
              </div>

              <Button 
                variant="ghost" 
                onClick={() => setWizardStep('input')}
                className="w-full"
              >
                Zurück
              </Button>
            </div>
          )}

          {/* Step 3a: Archive Results */}
          {wizardStep === 'archive' && (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Thema: <span className="font-medium text-foreground">"{wizardTopic}"</span>
              </p>

              {searchingArchive ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-3 text-muted-foreground">Durchsuche dein Archiv...</span>
                </div>
              ) : archivePosts.length === 0 ? (
                <div className="text-center py-12">
                  <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Keine passenden Posts gefunden.
                  </p>
                  <Button onClick={handleResearch}>
                    <Lightbulb className="mr-2 h-4 w-4" />
                    Stattdessen KI-Recherche starten
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {archivePosts.length} Posts gefunden. Klicke auf einen, um ihn als Vorlage zu nutzen.
                  </p>
                  {archivePosts.map((post) => (
                    <Card 
                      key={post.id} 
                      className="cursor-pointer hover:border-primary transition-colors"
                    >
                      <CardContent className="p-4">
                        <p className="text-sm line-clamp-3 mb-2">{post.caption}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {new Date(post.created_at).toLocaleDateString('de-DE')}
                          </span>
                          <Button 
                            size="sm"
                            onClick={() => handleSaveArchivePostAsDraft(post)}
                            disabled={saving}
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <FileText className="mr-2 h-4 w-4" />
                                Als Entwurf speichern
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <Button 
                variant="ghost" 
                onClick={() => setWizardStep('options')}
                className="w-full"
              >
                Zurück
              </Button>
            </div>
          )}

          {/* Step 3b: Researching */}
          {wizardStep === 'research' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative">
                <Sparkles className="h-12 w-12 text-primary animate-pulse" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold mb-2">KI recherchiert...</h3>
                <p className="text-sm text-muted-foreground">
                  Die KI entwickelt unkonventionelle Blickwinkel für "{wizardTopic}"
                </p>
              </div>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Step 4: Results */}
          {wizardStep === 'results' && researchResults && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{researchResults.ideas.length} Ideen</span> für "{wizardTopic}"
                </p>
                <Badge variant="outline">
                  {selectedIdeas.size} ausgewählt
                </Badge>
              </div>

              {researchResults.trend_insights && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <p className="text-sm">
                      <span className="font-semibold">💡 Trend-Insight: </span>
                      {researchResults.trend_insights}
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {researchResults.ideas.map((idea, index) => (
                  <Card 
                    key={index}
                    className={`cursor-pointer transition-all ${
                      selectedIdeas.has(index) 
                        ? 'border-primary ring-2 ring-primary/20' 
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => toggleIdeaSelection(index)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="secondary" className="shrink-0">{idea.angle}</Badge>
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selectedIdeas.has(index) 
                            ? 'bg-primary border-primary text-primary-foreground' 
                            : 'border-muted-foreground'
                        }`}>
                          {selectedIdeas.has(index) && <Check className="h-3 w-3" />}
                        </div>
                      </div>
                      <p className="font-medium text-sm">"{idea.hook}"</p>
                      <p className="text-sm text-muted-foreground">{idea.outline}</p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <span className="text-xs text-muted-foreground">
                          📅 {idea.best_time}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          📸 {idea.format_suggestion}
                        </span>
                      </div>
                      {idea.hashtag_suggestions && idea.hashtag_suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {idea.hashtag_suggestions.slice(0, 3).map((tag, i) => (
                            <span key={i} className="text-xs text-primary">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {researchResults.warning && (
                <Card className="bg-destructive/5 border-destructive/20">
                  <CardContent className="p-4">
                    <p className="text-sm">
                      <span className="font-semibold">⚠️ Achtung: </span>
                      {researchResults.warning}
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={handleSaveIdeasAsDrafts}
                  disabled={selectedIdeas.size === 0 || saving}
                  className="flex-1"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {selectedIdeas.size} Ideen als Entwürfe speichern
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setWizardStep('options')}
                >
                  Zurück
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog (for existing topics) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTopic ? "Thema bearbeiten" : "Neues Thema"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="z.B. Produktvorstellung"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Worum geht es bei diesem Thema?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords (kommagetrennt)</Label>
              <Input
                id="keywords"
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                placeholder="keyword1, keyword2, keyword3"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priorität (1-5)</Label>
                <Input
                  id="priority"
                  type="number"
                  min={1}
                  max={5}
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: parseInt(e.target.value) || 3 })
                  }
                />
              </div>
              <div className="flex items-center space-x-2 pt-7">
                <Switch
                  id="evergreen"
                  checked={form.evergreen}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, evergreen: checked })
                  }
                />
                <Label htmlFor="evergreen">Evergreen</Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="seasonal_start">Saison Start</Label>
                <Input
                  id="seasonal_start"
                  type="date"
                  value={form.seasonal_start}
                  onChange={(e) =>
                    setForm({ ...form, seasonal_start: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seasonal_end">Saison Ende</Label>
                <Input
                  id="seasonal_end"
                  type="date"
                  value={form.seasonal_end}
                  onChange={(e) =>
                    setForm({ ...form, seasonal_end: e.target.value })
                  }
                />
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTopic ? "Aktualisieren" : "Erstellen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </GlobalLayout>
  );
}
