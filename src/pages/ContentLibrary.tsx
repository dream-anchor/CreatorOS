import { useEffect, useState, useCallback, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Loader2,
  Heart,
  MessageCircle,
  BarChart3,
  RefreshCw,
  ArrowUpDown,
  Flame,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Post } from "@/types/database";
import { SyncCockpit } from "@/components/content-library/SyncCockpit";
import { PostCard } from "@/components/content-library/PostCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { differenceInDays } from "date-fns";

type SortOption = "performance" | "newest" | "comments";

export default function ContentLibraryPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("performance");
  const backgroundRefreshRef = useRef(false);

  useEffect(() => {
    if (user) loadImportedPosts();
  }, [user]);

  // Background check for stale URLs
  useEffect(() => {
    if (posts.length > 0 && !backgroundRefreshRef.current) {
      backgroundRefreshRef.current = true;
      checkAndRefreshStaleUrls();
    }
  }, [posts]);

  const checkAndRefreshStaleUrls = async () => {
    const staleThresholdDays = 3;
    const stalePosts = posts.filter(post => {
      if (!post.updated_at || !post.ig_media_id) return false;
      const daysSinceUpdate = differenceInDays(new Date(), new Date(post.updated_at));
      return daysSinceUpdate > staleThresholdDays;
    });

    if (stalePosts.length === 0) return;

    console.log(`Found ${stalePosts.length} posts with potentially stale URLs`);
    
    // Refresh up to 5 stale URLs in background (to avoid rate limits)
    const postsToRefresh = stalePosts.slice(0, 5);
    
    for (const post of postsToRefresh) {
      try {
        const { data } = await supabase.functions.invoke('refresh-media-url', {
          body: {
            post_id: post.id,
            ig_media_id: post.ig_media_id,
          },
        });

        if (data?.success && data?.media_url) {
          setPosts(prev => prev.map(p => 
            p.id === post.id ? { ...p, original_media_url: data.media_url, updated_at: new Date().toISOString() } : p
          ));
        }
      } catch (err) {
        console.error(`Background refresh failed for post ${post.id}:`, err);
      }
    }
  };

  const loadImportedPosts = async (showRefreshToast = false) => {
    try {
      if (showRefreshToast) setRefreshing(true);
      
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("is_imported", true)
        .order("likes_count", { ascending: false });

      if (error) throw error;
      
      setPosts((data as Post[]) || []);
      setDebugInfo(`Abfrage abgeschlossen: ${data?.length || 0} Posts mit is_imported=true gefunden`);
      
      if (showRefreshToast) {
        toast.success(`${data?.length || 0} Posts geladen`);
      }
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
      setDebugInfo(`Fehler: ${error.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadImportedPosts(true);
  };

  const handleImageRefreshed = useCallback((postId: string, newUrl: string) => {
    setPosts(prev => prev.map(p => 
      p.id === postId ? { ...p, original_media_url: newUrl } : p
    ));
  }, []);

  // Calculate virality score for each post
  const calculateViralityScore = (post: Post) => {
    const likes = post.likes_count || 0;
    const comments = post.comments_count || 0;
    const saved = post.saved_count || 0;
    return likes + (comments * 3) + (saved * 2);
  };

  // Sort posts based on selected option
  const getSortedPosts = () => {
    const sorted = [...posts];
    
    switch (sortBy) {
      case "newest":
        return sorted.sort((a, b) => {
          const dateA = new Date(a.published_at || a.created_at).getTime();
          const dateB = new Date(b.published_at || b.created_at).getTime();
          return dateB - dateA;
        });
      case "comments":
        return sorted.sort((a, b) => (b.comments_count || 0) - (a.comments_count || 0));
      case "performance":
      default:
        return sorted.sort((a, b) => calculateViralityScore(b) - calculateViralityScore(a));
    }
  };

  const sortedPosts = getSortedPosts();

  // Top 1% threshold (always based on performance)
  const performanceSorted = [...posts].sort((a, b) => 
    calculateViralityScore(b) - calculateViralityScore(a)
  );
  const top1PercentThreshold = performanceSorted.length > 0 
    ? calculateViralityScore(performanceSorted[Math.floor(performanceSorted.length * 0.01)] || performanceSorted[0])
    : 0;

  // Stats
  const totalLikes = posts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
  const unicornCount = posts.filter(p => calculateViralityScore(p) >= top1PercentThreshold).length;

  const getSortLabel = () => {
    switch (sortBy) {
      case "newest": return "Neueste zuerst";
      case "comments": return "Meiste Diskussionen";
      default: return "Beste Performance";
    }
  };

  if (loading) {
    return (
      <AppLayout title="Post-Historie">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Post-Historie"
      description="Deine importierten Instagram-Posts mit Erfolgsanalyse"
      actions={
        <div className="flex items-center gap-2">
          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowUpDown className="h-4 w-4" />
                {getSortLabel()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Sortierung</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <DropdownMenuRadioItem value="performance" className="gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Beste Performance
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="newest" className="gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  Neueste zuerst
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="comments" className="gap-2">
                  <MessageSquare className="h-4 w-4 text-cyan-500" />
                  Meiste Diskussionen
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Aktualisieren
          </Button>
        </div>
      }
    >
      {/* Sync Cockpit */}
      {user && <SyncCockpit userId={user.id} />}

      {posts.length === 0 ? (
        <Card className="glass-card mt-6">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center mb-6">
              <BarChart3 className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Noch keine Historie importiert
            </h2>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Importiere deine Instagram-Posts in den Einstellungen unter "Meta-Verbindung", 
              um hier deine Erfolgsstatistiken zu sehen.
            </p>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2 mb-4"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              {refreshing ? "Lädt..." : "Posts laden"}
            </Button>
            {debugInfo && (
              <p className="text-xs text-muted-foreground/60 font-mono mt-4 p-2 bg-muted/50 rounded max-w-lg text-center">
                Debug: {debugInfo}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 mt-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-foreground">{posts.length}</p>
                <p className="text-sm text-muted-foreground">Importierte Posts</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Heart className="h-5 w-5 text-rose-500" />
                  <p className="text-3xl font-bold text-foreground">{totalLikes.toLocaleString()}</p>
                </div>
                <p className="text-sm text-muted-foreground">Gesamt Likes</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <MessageCircle className="h-5 w-5 text-cyan-500" />
                  <p className="text-3xl font-bold text-foreground">{totalComments.toLocaleString()}</p>
                </div>
                <p className="text-sm text-muted-foreground">Gesamt Kommentare</p>
              </CardContent>
            </Card>
            <Card className="glass-card border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/10">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl">🦄</span>
                  <p className="text-3xl font-bold text-amber-500">{unicornCount}</p>
                </div>
                <p className="text-sm text-muted-foreground">Top 1% Unicorns</p>
              </CardContent>
            </Card>
          </div>

          {/* Posts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedPosts.map((post) => {
              const viralityScore = calculateViralityScore(post);
              const isUnicorn = viralityScore >= top1PercentThreshold && top1PercentThreshold > 0;
              const isHighEngagement = (post.likes_count || 0) > (totalLikes / posts.length) * 1.5;
              const isDiscussionStarter = (post.comments_count || 0) > (totalComments / posts.length) * 2;

              return (
                <PostCard
                  key={post.id}
                  post={post}
                  viralityScore={viralityScore}
                  isUnicorn={isUnicorn}
                  isHighEngagement={isHighEngagement}
                  isDiscussionStarter={isDiscussionStarter}
                  onImageRefreshed={handleImageRefreshed}
                />
              );
            })}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
