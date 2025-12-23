import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BrandRules } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Save, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function BrandPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brand, setBrand] = useState<BrandRules | null>(null);
  const [doInput, setDoInput] = useState("");
  const [dontInput, setDontInput] = useState("");

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

  const addItem = (list: "do_list" | "dont_list") => {
    const input = list === "do_list" ? doInput : dontInput;
    if (!input.trim() || !brand) return;

    setBrand({
      ...brand,
      [list]: [...(brand[list] || []), input.trim()],
    });

    if (list === "do_list") setDoInput("");
    else setDontInput("");
  };

  const removeItem = (list: "do_list" | "dont_list", index: number) => {
    if (!brand) return;
    setBrand({
      ...brand,
      [list]: brand[list].filter((_, i) => i !== index),
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
    </AppLayout>
  );
}
