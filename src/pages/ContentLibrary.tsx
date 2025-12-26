import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Loader2,
  TrendingUp,
  Heart,
  MessageCircle,
  Bookmark,
  Sparkles,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Post } from "@/types/database";

export default function ContentLibraryPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    if (user) loadImportedPosts();
  }, [user]);

  const loadImportedPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("is_imported", true)
        .order("likes_count", { ascending: false });

      if (error) throw error;
      setPosts((data as Post[]) || []);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate virality score for each post
  const calculateViralityScore = (post: Post) => {
    const likes = post.likes_count || 0;
    const comments = post.comments_count || 0;
    const saved = post.saved_count || 0;
    return likes + (comments * 3) + (saved * 2);
  };

  // Get sorted posts by virality score
  const sortedPosts = [...posts].sort((a, b) => 
    calculateViralityScore(b) - calculateViralityScore(a)
  );

  // Top 1% threshold
  const top1PercentThreshold = sortedPosts.length > 0 
    ? calculateViralityScore(sortedPosts[Math.floor(sortedPosts.length * 0.01)] || sortedPosts[0])
    : 0;

  // Stats
  const totalLikes = posts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
  const unicornCount = posts.filter(p => calculateViralityScore(p) >= top1PercentThreshold).length;

  if (loading) {
    return (
      <AppLayout title="📊 Post-Historie">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="📊 Post-Historie"
      description="Deine importierten Instagram-Posts mit Erfolgsanalyse"
    >
      {posts.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center mb-6">
              <BarChart3 className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Noch keine Historie importiert
            </h2>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Importiere deine Instagram-Posts in den Einstellungen unter "Meta-Verbindung", 
              um hier deine Erfolgsstatistiken zu sehen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
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
                <Card
                  key={post.id}
                  className={cn(
                    "glass-card overflow-hidden group transition-all duration-300 hover:scale-[1.02]",
                    isUnicorn && "ring-2 ring-amber-500/50 bg-gradient-to-br from-amber-500/10 to-orange-500/10"
                  )}
                >
                  <CardContent className="p-0">
                    {/* Image Preview */}
                    <div className="aspect-video relative bg-muted">
                      {post.original_media_url ? (
                        <img
                          src={post.original_media_url}
                          alt="Post preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-cyan-500/10">
                          <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                      )}

                      {/* Unicorn Badge */}
                      {isUnicorn && (
                        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                          <span>🦄</span> Top 1% Unicorn
                        </div>
                      )}

                      {/* Virality Score */}
                      <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-sm text-white text-xs font-semibold flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        {viralityScore.toLocaleString()}
                      </div>

                      {/* Link to Original */}
                      {post.original_ig_permalink && (
                        <a
                          href={post.original_ig_permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute bottom-3 right-3 p-2 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-3">
                      {/* Performance Labels */}
                      <div className="flex flex-wrap gap-2">
                        {isHighEngagement && (
                          <Badge variant="secondary" className="bg-rose-500/20 text-rose-400 border-rose-500/30">
                            <Heart className="h-3 w-3 mr-1" />
                            High Engagement
                          </Badge>
                        )}
                        {isDiscussionStarter && (
                          <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                            <MessageCircle className="h-3 w-3 mr-1" />
                            Diskussions-Starter
                          </Badge>
                        )}
                      </div>

                      {/* Caption Snippet */}
                      <p className="text-sm text-foreground line-clamp-2">
                        {post.caption?.slice(0, 120) || "Kein Text"}
                        {(post.caption?.length || 0) > 120 && "..."}
                      </p>

                      {/* Stats Row */}
                      <div className="flex items-center gap-4 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Heart className="h-4 w-4 text-rose-500" />
                          <span className="text-sm font-medium">{(post.likes_count || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MessageCircle className="h-4 w-4 text-cyan-500" />
                          <span className="text-sm font-medium">{(post.comments_count || 0).toLocaleString()}</span>
                        </div>
                        {(post.saved_count || 0) > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Bookmark className="h-4 w-4 text-violet-500" />
                            <span className="text-sm font-medium">{(post.saved_count || 0).toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                      {/* Date */}
                      <p className="text-xs text-muted-foreground">
                        {post.published_at 
                          ? format(new Date(post.published_at), "dd. MMMM yyyy", { locale: de })
                          : format(new Date(post.created_at), "dd. MMMM yyyy", { locale: de })
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
