import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
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
import { Loader2, Plus, Pencil, Trash2, Upload, Star, Leaf, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TopicsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvInput, setCsvInput] = useState("");
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [saving, setSaving] = useState(false);

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
    } else {
      setEditingTopic(null);
      setForm({
        title: "",
        description: "",
        keywords: "",
        priority: 3,
        evergreen: false,
        seasonal_start: "",
        seasonal_end: "",
      });
    }
    setDialogOpen(true);
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

  if (loading) {
    return (
      <AppLayout title="Themen">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Themen"
      description="Verwalte deine Content-Themen und Ideen"
      actions={
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
      }
    >
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

      {/* Edit/Create Dialog */}
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
    </AppLayout>
  );
}
