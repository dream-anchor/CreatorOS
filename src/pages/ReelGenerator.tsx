import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiGet, apiPost, apiPatch, invokeFunction as apiInvokeFunction } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Download,
  Film,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Video,
  Wand2,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import type {
  VideoProject,
  VideoProjectStatus,
  VideoSegment,
  SubtitleStyle,
  TransitionStyle,
} from "@/types/database";

type ReelWizardStep = "upload" | "processing" | "segments" | "style" | "render" | "failed";

interface FrameData {
  index: number;
  timestamp_ms: number;
  base64: string;
}

interface UploadItem {
  id: string;
  file: File;
  fileName: string;
  progress: number;
  status: "uploading" | "done" | "error";
  durationMs?: number;
  project?: VideoProject;
  error?: string;
}

function uploadWithProgress(
  url: string,
  file: File | Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload fehlgeschlagen (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload"));
    xhr.send(file);
  });
}

/** Encode an AudioBuffer as a 16-bit PCM WAV file (mono, 16 kHz) */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // subchunk1 size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // PCM samples (float32 → int16)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/** Extract audio from a video URL as a 16kHz mono WAV blob using OfflineAudioContext */
async function extractAudioAsWav(videoUrl: string): Promise<Blob> {
  console.log("[extractAudio] Fetching video for audio extraction...");
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Video fetch fehlgeschlagen: ${response.status}`);

  const videoArrayBuffer = await response.arrayBuffer();
  console.log(`[extractAudio] Video fetched: ${(videoArrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

  // Decode audio from the video at original sample rate
  const tempCtx = new AudioContext();
  const decodedBuffer = await tempCtx.decodeAudioData(videoArrayBuffer);
  await tempCtx.close();

  console.log(`[extractAudio] Decoded: ${decodedBuffer.duration.toFixed(1)}s, ${decodedBuffer.sampleRate}Hz, ${decodedBuffer.numberOfChannels}ch`);

  // Resample to 16kHz mono using OfflineAudioContext
  const TARGET_SAMPLE_RATE = 16000;
  const targetLength = Math.ceil(decodedBuffer.duration * TARGET_SAMPLE_RATE);
  const offlineCtx = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);

  const source = offlineCtx.createBufferSource();
  source.buffer = decodedBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const resampledBuffer = await offlineCtx.startRendering();
  console.log(`[extractAudio] Resampled to ${TARGET_SAMPLE_RATE}Hz mono: ${resampledBuffer.length} samples`);

  const wavBlob = audioBufferToWav(resampledBuffer);
  console.log(`[extractAudio] WAV size: ${(wavBlob.size / 1024 / 1024).toFixed(1)}MB`);

  return wavBlob;
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
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
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
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Project history
  const [projectHistory, setProjectHistory] = useState<VideoProject[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Render polling
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load project history on mount
  useEffect(() => {
    loadProjectHistory().catch((err) => {
      console.error("[ReelGenerator] Failed to load project history:", err);
      // Don't crash if history fails to load
    });
  }, []);

  // Load project from URL param (/reels/:projectId)
  const loadedProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || loadedProjectIdRef.current === projectId) return;
    loadedProjectIdRef.current = projectId;
    (async () => {
      try {
        const proj = await apiGet<VideoProject>(`/api/video/projects/${projectId}`);
        if (proj) {
          resumeProject(proj);
        } else {
          toast.error("Projekt nicht gefunden");
          navigate("/reels", { replace: true });
        }
      } catch (err) {
        console.error("[ReelGenerator] Failed to load project:", err);
        toast.error("Projekt konnte nicht geladen werden");
        navigate("/reels", { replace: true });
      }
    })();
  }, [projectId, navigate]);

  const loadProjectHistory = async () => {
    try {
      const projects = await apiGet<VideoProject[]>("/api/video/projects");
      setProjectHistory(projects || []);
    } catch (err) {
      console.error("[ReelGenerator] Error loading project history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const resumeProject = async (proj: VideoProject) => {
    setProject(proj);

    if (proj.status === "render_complete" && (proj.rendered_video_path || proj.rendered_video_url)) {
      setWizardStep("render");
    } else if (proj.status === "segments_ready") {
      // Load segments and go to segment review
      try {
        const fullProject = await apiGet<VideoProject & { segments: VideoSegment[] }>(`/api/video/projects/${proj.id}`);
        if (fullProject?.segments) setSegments(fullProject.segments);
        setWizardStep("segments");
      } catch {
        toast.error("Segmente konnten nicht geladen werden");
      }
    } else if (proj.status === "rendering") {
      setWizardStep("render");
      startPolling();
    } else if (
      (proj.status === "uploaded" || proj.status === "analyzing_frames" || proj.status === "transcribing" || proj.status === "selecting_segments")
      && proj.source_video_path && proj.source_duration_ms
    ) {
      // Restart processing for uploaded or interrupted analyses
      const apiBase = import.meta.env.VITE_API_URL || "";
      const proxyUrl = `${apiBase}/api/upload/proxy?key=${encodeURIComponent(proj.source_video_path)}`;
      setWizardStep("processing");
      runProcessing(proj, proxyUrl, proj.source_duration_ms);
    } else if (proj.status === "failed") {
      setWizardStep("failed");
    }
  };

  const retryProject = async () => {
    if (!project || !project.source_video_path || !project.source_duration_ms) return;
    try {
      // Reset project status to "uploaded"
      await apiPatch(`/api/video/projects/${project.id}`, {
        status: "uploaded",
        error_message: null,
      });
      const updated = { ...project, status: "uploaded" as VideoProjectStatus, error_message: null };
      setProject(updated);
      setProcessingStatus("");
      setProcessingProgress(0);

      // Re-run processing via proxy
      const apiBase = import.meta.env.VITE_API_URL || "";
      const proxyUrl = `${apiBase}/api/upload/proxy?key=${encodeURIComponent(project.source_video_path)}`;
      setWizardStep("processing");
      runProcessing(updated, proxyUrl, project.source_duration_ms);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Retry fehlgeschlagen: " + msg);
    }
  };

  // ===== STEP 1: VIDEO UPLOAD =====

  const updateUpload = (id: string, patch: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  const uploadSingleVideo = async (file: File) => {
    if (!user) return;
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const item: UploadItem = {
      id: uploadId,
      file,
      fileName: file.name,
      progress: 0,
      status: "uploading",
    };
    setUploads((prev) => [...prev, item]);

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
      updateUpload(uploadId, { durationMs });

      // Step 1: Get presigned URL from R2 Edge Function
      const contentType = file.type || "video/mp4";
      const { data: presignedData, error: presignedError } = await apiInvokeFunction<any>(
        "get-presigned-url",
        {
          body: {
            files: [{ fileName: file.name, contentType, folder: "videos" }],
          },
        },
      );

      if (presignedError || !presignedData?.success) {
        throw new Error(presignedData?.error || presignedError?.message || "Presigned URL fehlgeschlagen");
      }

      const { uploadUrl, publicUrl, key: r2Key } = presignedData.urls[0];
      console.log(`[ReelGenerator] Uploading to R2: ${r2Key} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

      // Step 2: Upload directly to R2 with progress
      await uploadWithProgress(uploadUrl, file, contentType, (pct) => {
        updateUpload(uploadId, { progress: pct });
      });

      // Step 3: Create project record with R2 URL
      const projectData = await apiPost<any>("/api/video/projects", {
        user_id: user.id,
        source_video_path: r2Key,
        source_video_url: publicUrl,
        source_duration_ms: durationMs,
        source_width: width,
        source_height: height,
        source_file_size: file.size,
        status: "uploaded",
        target_duration_sec: targetDuration,
      });

      const proj = projectData as unknown as VideoProject;
      updateUpload(uploadId, { status: "done", progress: 100, project: proj });
      toast.success(`${file.name} hochgeladen (${(durationMs / 1000).toFixed(0)}s)`);

      // Auto-start analysis using local file blob (avoids R2 CORS issues)
      const localBlobUrl = URL.createObjectURL(file);
      setProject(proj);
      setWizardStep("processing");
      loadedProjectIdRef.current = proj.id;
      navigate(`/reels/${proj.id}`, { replace: true });
      runProcessing(proj, localBlobUrl, durationMs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      updateUpload(uploadId, { status: "error", error: msg });
      toast.error(`${file.name}: ${msg}`);
    }
  };

  const handleVideoUpload = async (files: File[]) => {
    if (!user) return;

    const validFiles = files.filter((f) => {
      if (!f.type.startsWith("video/")) {
        toast.error(`${f.name}: Keine Videodatei`);
        return false;
      }
      if (f.size > 2 * 1024 * 1024 * 1024) {
        toast.error(`${f.name}: Zu groß (max. 2GB)`);
        return false;
      }
      return true;
    });

    // Start all uploads in parallel
    validFiles.forEach((f) => uploadSingleVideo(f));
  };

  const startProcessingFromUpload = (item: UploadItem) => {
    if (!item.project || !item.durationMs) return;
    setProject(item.project);
    setWizardStep("processing");
    runProcessing(item.project, item.project.source_video_url!, item.durationMs);
  };

  const removeUpload = (id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("video/")
      );
      if (files.length > 0) handleVideoUpload(files);
    },
    [user],
  );

  // ===== STEP 2: PROCESSING =====

  const extractFrames = async (
    videoUrl: string,
    durationMs: number
  ): Promise<FrameData[]> => {
    const video = document.createElement("video");
    // Only set crossOrigin for http(s) URLs, not for blob: URLs
    if (videoUrl.startsWith("http")) {
      video.crossOrigin = "anonymous";
    }
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

  /** Helper: invoke an Edge Function with detailed error logging */
  const invokeFunction = async (
    fnName: string,
    body: Record<string, unknown>,
  ): Promise<{ data: unknown; error: null } | { data: null; error: string }> => {
    console.log(`[ReelGenerator] Invoking ${fnName}`, { bodyKeys: Object.keys(body) });
    try {
      const { data, error } = await apiInvokeFunction(fnName, { body });

      if (error) {
        console.error(`[ReelGenerator] ${fnName} returned error:`, error.message);
        return { data: null, error: error.message || `Fehler bei ${fnName}` };
      }

      console.log(`[ReelGenerator] ${fnName} success`, data);
      return { data, error: null };
    } catch (fetchErr) {
      console.error(`[ReelGenerator] ${fnName} fetch exception:`, fetchErr);
      return {
        data: null,
        error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      };
    }
  };

  const runProcessing = async (proj: VideoProject, videoUrl: string, durationMs: number) => {
    try {
      // Phase 0: Quick connectivity test
      setProcessingStatus("Verbindung wird getestet...");
      setProcessingProgress(5);
      console.log("[ReelGenerator] Testing Edge Function connectivity...");

      const testResult = await invokeFunction("analyze-video-frames", {
        project_id: proj.id,
        frames: [],
      });
      // The function returns 400 "project_id und frames sind erforderlich" for empty frames,
      // but that means the function IS reachable. A FunctionsFetchError means it's NOT.
      // We accept any response except a total fetch failure.
      if (testResult.error && testResult.error.includes("Failed to send a request")) {
        throw new Error(
          "Edge Function nicht erreichbar. Bitte überprüfe, ob 'analyze-video-frames' in Supabase deployt ist. " +
          "(Dashboard → Edge Functions → Status prüfen)"
        );
      }
      console.log("[ReelGenerator] Connectivity test passed");

      // Phase A: Extract frames client-side
      setProcessingStatus("Frames werden extrahiert...");
      setProcessingProgress(10);
      const frames = await extractFrames(videoUrl, durationMs);
      console.log(`[ReelGenerator] Extracted ${frames.length} frames`);

      // Log estimated payload size
      const sampleSize = frames[0]?.base64?.length || 0;
      console.log(`[ReelGenerator] Sample frame base64 size: ${(sampleSize / 1024).toFixed(0)}KB`);
      setProcessingProgress(25);

      // Phase B: Send frames to analysis in small batches (3 per batch to avoid payload limits)
      const BATCH_SIZE = 3;
      for (let i = 0; i < frames.length; i += BATCH_SIZE) {
        const batch = frames.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(frames.length / BATCH_SIZE);
        setProcessingStatus(
          `KI analysiert Frames (Batch ${batchNum}/${totalBatches})...`
        );
        setProcessingProgress(25 + (i / frames.length) * 30);

        const batchPayloadSize = JSON.stringify({ project_id: proj.id, frames: batch }).length;
        console.log(`[ReelGenerator] Batch ${batchNum}/${totalBatches}: ${batch.length} frames, ~${(batchPayloadSize / 1024).toFixed(0)}KB`);

        const result = await invokeFunction("analyze-video-frames", {
          project_id: proj.id,
          frames: batch,
        });
        if (result.error) throw new Error(result.error);
      }
      setProcessingProgress(55);

      // Phase C: Extract audio client-side, upload to R2, then transcribe
      setProcessingStatus("Audio wird extrahiert...");
      setProcessingProgress(57);

      let audioR2Url: string | undefined;
      try {
        const wavBlob = await extractAudioAsWav(videoUrl);
        console.log(`[ReelGenerator] Audio extracted: ${(wavBlob.size / 1024 / 1024).toFixed(1)}MB`);

        // Upload audio WAV to R2 via presigned URL
        setProcessingStatus("Audio wird hochgeladen...");
        setProcessingProgress(62);

        const { data: audioPsData, error: audioPsErr } = await apiInvokeFunction<any>(
          "get-presigned-url",
          {
            body: {
              files: [{ fileName: `audio-${proj.id}.wav`, contentType: "audio/wav", folder: "audio" }],
            },
          },
        );

        if (audioPsErr || !audioPsData?.success) {
          console.warn("[ReelGenerator] Audio presigned URL failed, falling back to full video:", audioPsErr);
        } else {
          const { uploadUrl: audioUploadUrl, publicUrl: audioPublicUrl } = audioPsData.urls[0];
          await uploadWithProgress(audioUploadUrl, wavBlob, "audio/wav", () => {});
          audioR2Url = audioPublicUrl;
          console.log(`[ReelGenerator] Audio uploaded to R2: ${audioR2Url}`);
        }
      } catch (audioErr) {
        console.warn("[ReelGenerator] Client-side audio extraction failed, falling back to full video:", audioErr);
      }

      setProcessingStatus("Audio wird transkribiert...");
      setProcessingProgress(68);
      const transcriptResult = await invokeFunction("transcribe-video", {
        project_id: proj.id,
        ...(audioR2Url ? { audio_url: audioR2Url } : {}),
      });
      if (transcriptResult.error) throw new Error(transcriptResult.error);
      setProcessingProgress(80);

      // Phase D: AI segment selection
      setProcessingStatus("KI wählt beste Segmente...");
      setProcessingProgress(85);
      const segmentResult = await invokeFunction("select-reel-segments", {
        project_id: proj.id,
        target_duration_sec: targetDuration,
      });
      if (segmentResult.error) throw new Error(segmentResult.error);

      setProcessingProgress(100);
      const segData = segmentResult.data as { segments?: VideoSegment[] };
      setSegments(segData?.segments || []);

      // Refresh project
      try {
        const refreshed = await apiGet<VideoProject>(`/api/video/projects/${proj.id}`);
        if (refreshed) setProject(refreshed);
      } catch { /* ignore refresh error */ }

      setWizardStep("segments");
      toast.success("Analyse abgeschlossen!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ReelGenerator] Processing failed:", msg);

      // Update project status to failed
      if (proj.id) {
        try {
          await apiPatch(`/api/video/projects/${proj.id}`, { status: "failed", error_message: msg });
        } catch { /* ignore */ }
      }

      // Show failed view with retry option
      setProject((prev) => prev ? { ...prev, status: "failed", error_message: msg } : prev);
      setWizardStep("failed");
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
        await apiPatch(`/api/video/segments/${seg.id}`, {
          is_included: seg.is_included,
          subtitle_text: seg.subtitle_text,
          segment_index: seg.segment_index,
          start_ms: seg.start_ms,
          end_ms: seg.end_ms,
          is_user_modified: true,
        });
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
      const result = await invokeFunction("render-reel", {
        project_id: project.id,
        subtitle_style: subtitleStyle,
        transition_style: transitionStyle,
      });
      if (result.error) throw new Error(result.error);

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
      let data: any = null;
      try {
        data = await apiGet<any>(`/api/video/projects/${project.id}`, { fields: "status,rendered_video_url,error_message" });
      } catch { return; }

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
      const post = await apiPost<{ id: string }>("/api/posts", {
        user_id: user.id,
        status: "READY_FOR_REVIEW",
        format: "reel",
        caption: "",
        hashtags: "",
      });

      // Link project to post
      await apiPatch(`/api/video/projects/${project.id}`, { post_id: post.id, status: "published" });

      // Create asset record
      if (project.rendered_video_url && project.rendered_video_path) {
        await apiPost("/api/posts/assets", {
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
    setUploads([]);
    loadedProjectIdRef.current = null;
    navigate("/reels", { replace: true });
    loadProjectHistory();
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
                  failed: -1,
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
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Card className="glass-card animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-primary" />
                    Videos hochladen
                  </CardTitle>
                  <CardDescription>
                    Lade ein oder mehrere Rohvideos hoch. Die KI findet die besten Momente.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200",
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30",
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
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) handleVideoUpload(files);
                        e.target.value = "";
                      }}
                    />
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Video className="h-7 w-7 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          Videos hierher ziehen oder klicken
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          MP4, MOV, WebM - max. 2GB pro Video - Mehrfachauswahl
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Upload Queue */}
              {uploads.length > 0 && (
                <div className="space-y-2">
                  {uploads.map((item) => (
                    <Card key={item.id} className="glass-card animate-fade-in">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {/* Status icon */}
                          <div className="flex-shrink-0">
                            {item.status === "uploading" && (
                              <Loader2 className="h-5 w-5 text-primary animate-spin" />
                            )}
                            {item.status === "done" && (
                              <Check className="h-5 w-5 text-green-400" />
                            )}
                            {item.status === "error" && (
                              <X className="h-5 w-5 text-red-400" />
                            )}
                          </div>

                          {/* Info + progress */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium text-foreground truncate">
                                {item.fileName}
                              </p>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                {item.status === "uploading" && (
                                  <span className="text-xs font-mono text-primary">{item.progress}%</span>
                                )}
                                {item.durationMs && (
                                  <span className="text-xs text-muted-foreground">
                                    {(item.durationMs / 1000).toFixed(0)}s
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {(item.file.size / 1024 / 1024).toFixed(1)}MB
                                </span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            {item.status === "uploading" && (
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all duration-300"
                                  style={{ width: `${item.progress}%` }}
                                />
                              </div>
                            )}

                            {item.status === "error" && (
                              <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex-shrink-0 flex items-center gap-1">
                            {item.status === "done" && item.project && (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs"
                                onClick={() => startProcessingFromUpload(item)}
                              >
                                <Sparkles className="h-3 w-3 mr-1" />
                                Analysieren
                              </Button>
                            )}
                            {item.status !== "uploading" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => removeUpload(item.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

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
                    <span>Videos hochladen (parallel)</span>
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

          {/* Project History */}
          {projectHistory.length > 0 && (
            <Card className="glass-card animate-fade-in mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  Meine Projekte
                </CardTitle>
                <CardDescription>
                  Alle bisherigen Reel-Projekte – klicke um fortzufahren oder das Ergebnis anzusehen.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {projectHistory.map((proj) => {
                      const statusConfig: Record<string, { label: string; color: string }> = {
                        uploaded: { label: "Hochgeladen", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
                        analyzing_frames: { label: "Analysiert...", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
                        transcribing: { label: "Transkribiert...", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
                        selecting_segments: { label: "Segmente...", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
                        segments_ready: { label: "Segmente bereit", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
                        rendering: { label: "Rendert...", color: "bg-primary/20 text-primary border-primary/30" },
                        render_complete: { label: "Fertig", color: "bg-green-500/20 text-green-400 border-green-500/30" },
                        published: { label: "Veröffentlicht", color: "bg-green-500/20 text-green-400 border-green-500/30" },
                        failed: { label: "Fehlgeschlagen", color: "bg-red-500/20 text-red-400 border-red-500/30" },
                      };
                      const status = statusConfig[proj.status] || { label: proj.status, color: "bg-muted text-muted-foreground" };

                      return (
                        <button
                          key={proj.id}
                          onClick={() => navigate(`/reels/${proj.id}`)}
                          className={cn(
                            "flex flex-col gap-3 p-4 rounded-xl border text-left transition-all duration-200",
                            "border-border hover:border-primary/50 hover:bg-muted/30 hover:scale-[1.01]",
                            proj.status === "render_complete" && "border-green-500/20"
                          )}
                        >
                          {/* Thumbnail or placeholder */}
                          {proj.rendered_video_path ? (
                            <div className="w-full aspect-video rounded-lg overflow-hidden bg-black">
                              <video src={`${import.meta.env.VITE_API_URL || ""}/api/upload/proxy?key=${encodeURIComponent(proj.rendered_video_path)}`} className="w-full h-full object-cover" muted preload="metadata" />
                            </div>
                          ) : proj.source_video_path ? (
                            <div className="w-full aspect-video rounded-lg overflow-hidden bg-black">
                              <video src={`${import.meta.env.VITE_API_URL || ""}/api/upload/proxy?key=${encodeURIComponent(proj.source_video_path)}`} className="w-full h-full object-cover" muted preload="metadata" />
                            </div>
                          ) : (
                            <div className="w-full aspect-video rounded-lg bg-muted flex items-center justify-center">
                              <Film className="h-8 w-8 text-muted-foreground/30" />
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Badge className={cn("text-xs", status.color)}>
                                {status.label}
                              </Badge>
                              {proj.source_duration_ms && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {Math.floor(proj.source_duration_ms / 1000)}s
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(proj.created_at), { addSuffix: true, locale: de })}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          </>
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
                  {project?.source_video_path ? (
                    <video
                      ref={videoPreviewRef}
                      src={`${import.meta.env.VITE_API_URL || ""}/api/upload/proxy?key=${encodeURIComponent(project.source_video_path)}`}
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
                  onClick={resetWizard}
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
            {project?.status === "render_complete" && project?.rendered_video_path ? (
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
                        src={`${import.meta.env.VITE_API_URL || ""}/api/upload/proxy?key=${encodeURIComponent(project.rendered_video_path)}`}
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
                        a.href = `${import.meta.env.VITE_API_URL || ""}/api/upload/proxy?key=${encodeURIComponent(project.rendered_video_path!)}`;
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

        {/* ===== FAILED STATE ===== */}
        {wizardStep === "failed" && project && (
          <Card className="glass-card animate-fade-in max-w-2xl mx-auto">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-10 w-10 text-red-400" />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">
                    Verarbeitung fehlgeschlagen
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {project.error_message || "Ein unbekannter Fehler ist aufgetreten."}
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={resetWizard}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Zurück
                  </Button>
                  <Button
                    onClick={retryProject}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Erneut versuchen
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </GlobalLayout>
  );
}
