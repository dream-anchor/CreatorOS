import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Topic, Post, DraftGenerationResult } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Sparkles, Copy, Check, ImagePlus } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function GeneratorPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [draft, setDraft] = useState<DraftGenerationResult | null>(null);
  const [createdPost, setCreatedPost] = useState<Post | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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
    if (!selectedTopicId) {
      toast.error("Bitte wähle ein Thema");
      return;
    }

    setGenerating(true);
    setDraft(null);
    setCreatedPost(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-draft", {
        body: { topic_id: selectedTopicId },
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
        {/* Input Section */}
        <div className="space-y-6">
          <Card className="glass-card">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>Thema auswählen</Label>
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
              </div>

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
                        {topic.keywords && topic.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {topic.keywords.map((kw, i) => (
                              <span
                                key={i}
                                className="text-xs px-2 py-0.5 rounded bg-background text-muted-foreground"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : null;
                  })()}
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={generating || !selectedTopicId}
                className="w-full"
                size="lg"
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {generating ? "Generiere..." : "Entwurf generieren"}
              </Button>
            </CardContent>
          </Card>

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

          {!draft && !generating && (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Wähle ein Thema und generiere deinen ersten Entwurf</p>
              </CardContent>
            </Card>
          )}

          {generating && (
            <Card className="glass-card">
              <CardContent className="py-12 text-center">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground">
                  KI generiert deinen Entwurf...
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
