import { useState, useRef, useCallback } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Film,
  Loader2,
  Play,
  Plus,
  Scissors,
  Sparkles,
  Type,
  Upload,
  Video,
  Wand2,
  X,
} from "lucide-react";
import type {
  VideoProject,
  VideoProjectStatus,
  VideoSegment,
  SubtitleStyle,
  TransitionStyle,
} from "@/types/database";

type ReelWizardStep = "upload" | "processing" | "segments" | "style" | "render";

interface FrameData {
  index: number;
  timestamp_ms: number;
  base64: string;
}

const SUBTITLE_STYLES: { id: SubtitleStyle; label: string; description: string }[] = [
  { id: "bold_center", label: "Fett Zentriert", description: "Großer weißer Text, mittig, mit Schatten" },
  { id: "bottom_bar", label: "Bottom Bar", description: "Schwarzer Balken unten mit weißem Text" },
  { id: "karaoke", label: "Karaoke", description: "Goldener Text mit starkem Schatten" },
  { id: "minimal", label: "Minimal", description: "Dezenter kleiner Text unten links" },
];

const TRANSITION_STYLES: { id: TransitionStyle; label: string; description: string }[] = [
  { id: "smooth", label: "Smooth Fade", description: "Sanfter Ein-/Ausblendeffekt" },
  { id: "cut", label: "Hard Cut", description: "Harter direkter Schnitt" },
  { id: "fade", label: "Fade In", description: "Einblenden ohne Ausblenden" },
  { id: "zoom", label: "Zoom", description: "Zoom-Übergang zwischen Clips" },
];

export default function ReelGenerator() {
  const { user } = useAuth();
  const [wizardStep, setWizardStep] = useState<ReelWizardStep>("upload");
  const [project, setProject] = useState<VideoProject | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingProgress, setProcessingProgress] = useState(0);

  // Style options
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>("bold_center");
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>("smooth");
  const [targetDuration, setTargetDuration] = useState(30);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Render polling
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ===== STEP 1: VIDEO UPLOAD =====

  const handleVideoUpload = async (file: File) => {
    if (!user) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Bitte lade eine Videodatei hoch");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Video ist zu groß (max. 100MB)");
      return;
    }

    setLoading(true);
    try {
      // Read video metadata
      const videoEl = document.createElement("video");
      videoEl.src = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        videoEl.onloadedmetadata = () => resolve();
        videoEl.onerror = () => reject(new Error("Video konnte nicht geladen werden"));
      });
      const durationMs = Math.floor(videoEl.duration * 1000);
      const width = videoEl.videoWidth;
      const height = videoEl.videoHeight;
      URL.revokeObjectURL(videoEl.src);

      if (file.size > 25 * 1024 * 1024) {
        toast.warning("Video ist größer als 25MB. Transkription könnte fehlschlagen. Kürze das Video ggf. vorher.");
      }

      toast.info("Video wird hochgeladen...");

      // Upload to storage
      const ext = file.name.split(".").pop() || "mp4";
      const fileName = `${user.id}/source/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("video-assets")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("video-assets")
        .getPublicUrl(fileName);

      // Create project record
      const { data: projectData, error: projectError } = await supabase
        .from("video_projects")
        .insert({
          user_id: user.id,
          source_video_path: fileName,
          source_video_url: urlData.publicUrl,
          source_duration_ms: durationMs,
          source_width: width,
          source_height: height,
          source_file_size: file.size,
          status: "uploaded",
          target_duration_sec: targetDuration,
        })
        .select()
        .single();

      if (projectError) throw projectError;

      setProject(projectData as unknown as VideoProject);
      toast.success(`Video hochgeladen (${(durationMs / 1000).toFixed(0)}s)`);
      setWizardStep("processing");
      // Auto-start processing
      runProcessing(projectData as unknown as VideoProject, urlData.publicUrl, durationMs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Upload fehlgeschlagen: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("video/")
      );
      if (files[0]) handleVideoUpload(files[0]);
    },
    [user]
  );

  // ===== STEP 2: PROCESSING =====

  const extractFrames = async (
    videoUrl: string,
    durationMs: number
  ): Promise<FrameData[]> => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = videoUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Video konnte nicht geladen werden"));
    });

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;

    const intervalMs = 2000; // 1 frame every 2 seconds
    const frames: FrameData[] = [];

    for (let t = 0; t < durationMs; t += intervalMs) {
      video.currentTime = t / 1000;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      ctx.drawImage(video, 0, 0, 640, 360);
      const base64 = canvas.toDataURL("image/jpeg", 0.7);
      frames.push({ index: frames.length, timestamp_ms: t, base64 });
    }

    return frames;
  };

  const runProcessing = async (proj: VideoProject, videoUrl: string, durationMs: number) => {
    try {
      // Phase A: Extract frames client-side
      setProcessingStatus("Frames werden extrahiert...");
      setProcessingProgress(10);
      const frames = await extractFrames(videoUrl, durationMs);
      setProcessingProgress(25);

      // Phase B: Send frames to analysis in batches
      const BATCH_SIZE = 10;
      for (let i = 0; i < frames.length; i += BATCH_SIZE) {
        const batch = frames.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(frames.length / BATCH_SIZE);
        setProcessingStatus(
          `KI analysiert Frames (Batch ${batchNum}/${totalBatches})...`
        );
        setProcessingProgress(25 + (i / frames.length) * 30);

        const { error } = await supabase.functions.invoke("analyze-video-frames", {
          body: { project_id: proj.id, frames: batch },
        });
        if (error) throw new Error(error.message || "Frame-Analyse fehlgeschlagen");
      }
      setProcessingProgress(55);

      // Phase C: Transcribe audio
      setProcessingStatus("Audio wird transkribiert...");
      setProcessingProgress(60);
      const { error: transcriptError } = await supabase.functions.invoke(
        "transcribe-video",
        { body: { project_id: proj.id } }
      );
      if (transcriptError) throw new Error(transcriptError.message || "Transkription fehlgeschlagen");
      setProcessingProgress(80);

      // Phase D: AI segment selection
      setProcessingStatus("KI wählt beste Segmente...");
      setProcessingProgress(85);
      const { data: segmentData, error: segmentError } = await supabase.functions.invoke(
        "select-reel-segments",
        { body: { project_id: proj.id, target_duration_sec: targetDuration } }
      );
      if (segmentError) throw new Error(segmentError.message || "Segment-Auswahl fehlgeschlagen");

      setProcessingProgress(100);
      setSegments(segmentData.segments || []);

      // Refresh project
      const { data: refreshed } = await supabase
        .from("video_projects")
        .select("*")
        .eq("id", proj.id)
        .single();
      if (refreshed) setProject(refreshed as unknown as VideoProject);

      setWizardStep("segments");
      toast.success("Analyse abgeschlossen!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Verarbeitung fehlgeschlagen: " + msg);
      setProcessingStatus("Fehler: " + msg);

      // Update project status to failed
      if (proj.id) {
        await supabase
          .from("video_projects")
          .update({ status: "failed", error_message: msg })
          .eq("id", proj.id);
      }
    }
  };

  // ===== STEP 3: SEGMENT REVIEW =====

  const updateSegment = (segmentId: string, updates: Partial<VideoSegment>) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === segmentId ? { ...s, ...updates } : s))
    );
  };

  const saveSegmentsAndContinue = async () => {
    setLoading(true);
    try {
      for (const seg of segments) {
        await supabase
          .from("video_segments")
          .update({
            is_included: seg.is_included,
            subtitle_text: seg.subtitle_text,
            segment_index: seg.segment_index,
            start_ms: seg.start_ms,
            end_ms: seg.end_ms,
            is_user_modified: true,
          })
          .eq("id", seg.id);
      }
      setWizardStep("style");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Speichern fehlgeschlagen: " + msg);
    } finally {
      setLoading(false);
    }
  };

  // ===== STEP 5: RENDER =====

  const startRender = async () => {
    if (!project) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("render-reel", {
        body: {
          project_id: project.id,
          subtitle_style: subtitleStyle,
          transition_style: transitionStyle,
        },
      });
      if (error) throw new Error(error.message || "Render-Start fehlgeschlagen");

      toast.success("Reel wird gerendert...");
      setWizardStep("render");
      startPolling();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Render fehlgeschlagen: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      if (!project) return;
      const { data } = await supabase
        .from("video_projects")
        .select("status, rendered_video_url, error_message")
        .eq("id", project.id)
        .single();

      if (data?.status === "render_complete") {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        setProject((prev) => (prev ? { ...prev, ...data, status: data.status as VideoProjectStatus } : prev));
        toast.success("Reel fertig gerendert!");
      } else if (data?.status === "failed") {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        toast.error("Rendering fehlgeschlagen: " + (data?.error_message || "Unbekannter Fehler"));
      }
    }, 5000);
  };

  const createPostFromReel = async () => {
    if (!project || !user) return;
    setLoading(true);
    try {
      const { data: post, error } = await supabase
        .from("posts")
        .insert({
          user_id: user.id,
          status: "READY_FOR_REVIEW",
          format: "reel",
          caption: "",
          hashtags: "",
        })
        .select()
        .single();

      if (error) throw error;

      // Link project to post
      await supabase
        .from("video_projects")
        .update({ post_id: post.id, status: "published" })
        .eq("id", project.id);

      // Create asset record
      if (project.rendered_video_url && project.rendered_video_path) {
        await supabase.from("assets").insert({
          user_id: user.id,
          post_id: post.id,
          storage_path: project.rendered_video_path,
          public_url: project.rendered_video_url,
          source: "generate",
        });
      }

      toast.success("Reel als Post erstellt! Gehe zur Review-Seite.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Fehler: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const resetWizard = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setProject(null);
    setSegments([]);
    setWizardStep("upload");
    setProcessingStatus("");
    setProcessingProgress(0);
  };

  // ===== SEGMENT HELPERS =====

  const totalIncludedDuration = segments
    .filter((s) => s.is_included)
    .reduce((sum, s) => sum + (s.end_ms - s.start_ms), 0);

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const scoreColor = (score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 7) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (score >= 4) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  // ===== RENDER =====

  return (
    <GlobalLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Film className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Reel Studio</h1>
              <p className="text-sm text-muted-foreground">
                Video hochladen, KI schneidet das perfekte Reel
              </p>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-4">
            {(["upload", "processing", "segments", "style", "render"] as ReelWizardStep[]).map(
              (step, i) => {
                const labels = ["Upload", "Analyse", "Segmente", "Style", "Render"];
                const stepOrder: Record<ReelWizardStep, number> = {
                  upload: 0,
                  processing: 1,
                  segments: 2,
                  style: 3,
                  render: 4,
                };
                const current = stepOrder[wizardStep];
                const isActive = i === current;
                const isDone = i < current;
                return (
                  <div key={step} className="flex items-center gap-2">
                    {i > 0 && (
                      <div
                        className={cn(
                          "h-px w-6 sm:w-10",
                          isDone ? "bg-primary" : "bg-border"
                        )}
                      />
                    )}
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                        isActive && "bg-primary/15 text-primary border border-primary/30",
                        isDone && "bg-primary/10 text-primary",
                        !isActive && !isDone && "text-muted-foreground"
                      )}
                    >
                      {isDone ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <span className="w-4 text-center">{i + 1}</span>
                      )}
                      <span className="hidden sm:inline">{labels[i]}</span>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* ===== STEP 1: UPLOAD ===== */}
        {wizardStep === "upload" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-card animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  Video hochladen
                </CardTitle>
                <CardDescription>
                  Lade dein Rohvideo hoch. Die KI findet die besten Momente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleVideoUpload(file);
                    }}
                  />
                  {loading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground">Video wird hochgeladen...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Video className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          Video hierher ziehen oder klicken
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          MP4, MOV, WebM - max. 100MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" />
                  Einstellungen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-sm font-medium mb-3 block">
                    Ziel-Dauer: {targetDuration}s
                  </Label>
                  <Slider
                    value={[targetDuration]}
                    onValueChange={([v]) => setTargetDuration(v)}
                    min={15}
                    max={90}
                    step={5}
                    className="mt-2"
                  />
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>15s</span>
                    <span>90s</span>
                  </div>
                </div>

                <div className="rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
                  <p className="font-medium text-foreground">So funktioniert es:</p>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-mono">1.</span>
                    <span>Video hochladen</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-mono">2.</span>
                    <span>KI analysiert Frames + generiert Untertitel</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-mono">3.</span>
                    <span>Beste Segmente werden vorgeschlagen</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-mono">4.</span>
                    <span>Du wählst Style und renderst das Reel</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===== STEP 2: PROCESSING ===== */}
        {wizardStep === "processing" && (
          <Card className="glass-card animate-fade-in max-w-2xl mx-auto">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-10 w-10 text-primary animate-pulse" />
                  </div>
                  {/* Progress ring */}
                  <svg
                    className="absolute inset-0 w-20 h-20 -rotate-90"
                    viewBox="0 0 80 80"
                  >
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      className="text-muted"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      strokeDasharray={226}
                      strokeDashoffset={226 - (226 * processingProgress) / 100}
                      className="text-primary transition-all duration-500"
                    />
                  </svg>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">
                    Video wird analysiert
                  </h2>
                  <p className="text-sm text-muted-foreground">{processingStatus}</p>
                  <p className="text-2xl font-bold text-primary mt-2">
                    {processingProgress}%
                  </p>
                </div>

                <div className="w-full max-w-sm">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${processingProgress}%` }}
                    />
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetWizard}
                  className="mt-4"
                >
                  <X className="h-4 w-4 mr-2" />
                  Abbrechen
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== STEP 3: SEGMENTS ===== */}
        {wizardStep === "segments" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Segment List */}
            <div className="lg:col-span-3 space-y-3">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Scissors className="h-5 w-5 text-primary" />
                    Segmente bearbeiten
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {segments.filter((s) => s.is_included).length} Segmente aktiv
                    {" "}|{" "}
                    Gesamt: {formatMs(totalIncludedDuration)}
                  </p>
                </div>
              </div>

              {segments.map((seg) => (
                <Card
                  key={seg.id}
                  className={cn(
                    "glass-card transition-all duration-200",
                    !seg.is_included && "opacity-40"
                  )}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      {/* Score badge */}
                      <div
                        className={cn(
                          "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg border",
                          scoreColor(seg.score)
                        )}
                      >
                        {seg.score?.toFixed(0) || "?"}
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Time range + include toggle */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {formatMs(seg.start_ms)} - {formatMs(seg.end_ms)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ({((seg.end_ms - seg.start_ms) / 1000).toFixed(1)}s)
                            </span>
                          </div>
                          <Switch
                            checked={seg.is_included}
                            onCheckedChange={(checked) =>
                              updateSegment(seg.id, { is_included: checked })
                            }
                          />
                        </div>

                        {/* Reason */}
                        {seg.reason && (
                          <p className="text-xs text-muted-foreground">{seg.reason}</p>
                        )}

                        {/* Subtitle edit */}
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Untertitel
                          </Label>
                          <Textarea
                            value={seg.subtitle_text || ""}
                            onChange={(e) =>
                              updateSegment(seg.id, { subtitle_text: e.target.value })
                            }
                            rows={1}
                            className="text-sm resize-none"
                            placeholder="Untertitel eingeben..."
                          />
                        </div>

                        {/* Transcript excerpt */}
                        {seg.transcript_text && (
                          <p className="text-xs text-muted-foreground/70 italic truncate">
                            Transkript: &quot;{seg.transcript_text}&quot;
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Video Preview */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="glass-card sticky top-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Play className="h-4 w-4 text-primary" />
                    Video-Vorschau
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {project?.source_video_url ? (
                    <video
                      ref={videoPreviewRef}
                      src={project.source_video_url}
                      controls
                      className="w-full rounded-xl aspect-video bg-black"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-muted rounded-xl flex items-center justify-center">
                      <p className="text-sm text-muted-foreground">Kein Video</p>
                    </div>
                  )}

                  {/* Segment markers */}
                  <div className="mt-3 space-y-1">
                    {segments
                      .filter((s) => s.is_included)
                      .map((seg) => (
                        <button
                          key={seg.id}
                          className="flex items-center gap-2 w-full text-left px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors text-xs"
                          onClick={() => {
                            if (videoPreviewRef.current) {
                              videoPreviewRef.current.currentTime = seg.start_ms / 1000;
                              videoPreviewRef.current.play();
                            }
                          }}
                        >
                          <Play className="h-3 w-3 text-primary flex-shrink-0" />
                          <span className="font-mono">{formatMs(seg.start_ms)}</span>
                          <span className="text-muted-foreground truncate">
                            {seg.subtitle_text || seg.reason || `Segment ${seg.segment_index + 1}`}
                          </span>
                        </button>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setWizardStep("upload")}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Zurück
                </Button>
                <Button
                  className="flex-1"
                  onClick={saveSegmentsAndContinue}
                  disabled={loading || segments.filter((s) => s.is_included).length === 0}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Weiter
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 4: STYLE ===== */}
        {wizardStep === "style" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <Card className="glass-card animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Type className="h-5 w-5 text-primary" />
                  Untertitel-Style
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {SUBTITLE_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSubtitleStyle(style.id)}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all duration-200",
                        subtitleStyle === style.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="font-medium text-sm text-foreground">{style.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{style.description}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scissors className="h-5 w-5 text-primary" />
                  Übergänge
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {TRANSITION_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setTransitionStyle(style.id)}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all duration-200",
                        transitionStyle === style.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="font-medium text-sm text-foreground">{style.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{style.description}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setWizardStep("segments")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <Button className="flex-1" onClick={startRender} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Reel rendern
              </Button>
            </div>
          </div>
        )}

        {/* ===== STEP 5: RENDER ===== */}
        {wizardStep === "render" && (
          <div className="max-w-2xl mx-auto">
            {project?.status === "render_complete" && project?.rendered_video_url ? (
              <Card className="glass-card animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-400">
                    <Check className="h-5 w-5" />
                    Reel fertig!
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-center">
                    <div className="w-64 rounded-2xl overflow-hidden shadow-2xl">
                      <video
                        src={project.rendered_video_url}
                        controls
                        className="w-full aspect-[9/16] bg-black"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = project.rendered_video_url!;
                        a.download = `reel-${project.id}.mp4`;
                        a.click();
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Herunterladen
                    </Button>
                    <Button className="flex-1" onClick={createPostFromReel} disabled={loading}>
                      {loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Als Post erstellen
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full mt-2"
                    onClick={resetWizard}
                  >
                    Neues Reel erstellen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="glass-card animate-fade-in">
                <CardContent className="py-12">
                  <div className="flex flex-col items-center gap-6 text-center">
                    <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                      <Film className="h-10 w-10 text-primary animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground mb-2">
                        Reel wird gerendert
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Dies kann 1-3 Minuten dauern. Du kannst diese Seite offen lassen.
                      </p>
                    </div>
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </GlobalLayout>
  );
}
