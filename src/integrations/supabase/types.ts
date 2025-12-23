export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          created_at: string
          generator_meta: Json | null
          height: number | null
          id: string
          post_id: string | null
          public_url: string | null
          source: Database["public"]["Enums"]["asset_source"] | null
          storage_path: string
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          generator_meta?: Json | null
          height?: number | null
          id?: string
          post_id?: string | null
          public_url?: string | null
          source?: Database["public"]["Enums"]["asset_source"] | null
          storage_path: string
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          generator_meta?: Json | null
          height?: number | null
          id?: string
          post_id?: string | null
          public_url?: string | null
          source?: Database["public"]["Enums"]["asset_source"] | null
          storage_path?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_rules: {
        Row: {
          content_pillars: Json | null
          created_at: string
          disclaimers: string | null
          do_list: string[] | null
          dont_list: string[] | null
          emoji_level: number | null
          hashtag_max: number | null
          hashtag_min: number | null
          id: string
          language_primary: string | null
          tone_style: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content_pillars?: Json | null
          created_at?: string
          disclaimers?: string | null
          do_list?: string[] | null
          dont_list?: string[] | null
          emoji_level?: number | null
          hashtag_max?: number | null
          hashtag_min?: number | null
          id?: string
          language_primary?: string | null
          tone_style?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content_pillars?: Json | null
          created_at?: string
          disclaimers?: string | null
          do_list?: string[] | null
          dont_list?: string[] | null
          emoji_level?: number | null
          hashtag_max?: number | null
          hashtag_min?: number | null
          id?: string
          language_primary?: string | null
          tone_style?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          level: Database["public"]["Enums"]["log_level"] | null
          post_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"] | null
          post_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"] | null
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          connected_at: string | null
          id: string
          ig_user_id: string | null
          ig_username: string | null
          page_id: string | null
          page_name: string | null
          token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          page_id?: string | null
          page_name?: string | null
          token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          page_id?: string | null
          page_name?: string | null
          token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          alt_text: string | null
          approved_at: string | null
          approved_by: string | null
          caption: string | null
          caption_alt: string | null
          caption_short: string | null
          created_at: string
          error_message: string | null
          format: Database["public"]["Enums"]["post_format"] | null
          hashtags: string | null
          id: string
          ig_media_id: string | null
          published_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alt_text?: string | null
          approved_at?: string | null
          approved_by?: string | null
          caption?: string | null
          caption_alt?: string | null
          caption_short?: string | null
          created_at?: string
          error_message?: string | null
          format?: Database["public"]["Enums"]["post_format"] | null
          hashtags?: string | null
          id?: string
          ig_media_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          topic_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alt_text?: string | null
          approved_at?: string | null
          approved_by?: string | null
          caption?: string | null
          caption_alt?: string | null
          caption_short?: string | null
          created_at?: string
          error_message?: string | null
          format?: Database["public"]["Enums"]["post_format"] | null
          hashtags?: string | null
          id?: string
          ig_media_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          id: string
          posts_per_week: number | null
          preferred_days: string[] | null
          preferred_hours: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          posts_per_week?: number | null
          preferred_days?: string[] | null
          preferred_hours?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          posts_per_week?: number | null
          preferred_days?: string[] | null
          preferred_hours?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          created_at: string
          description: string | null
          evergreen: boolean | null
          id: string
          keywords: string[] | null
          priority: number | null
          seasonal_end: string | null
          seasonal_start: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          evergreen?: boolean | null
          id?: string
          keywords?: string[] | null
          priority?: number | null
          seasonal_end?: string | null
          seasonal_start?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          evergreen?: boolean | null
          id?: string
          keywords?: string[] | null
          priority?: number | null
          seasonal_end?: string | null
          seasonal_start?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      asset_source: "upload" | "generate"
      log_level: "info" | "warn" | "error"
      post_format: "single"
      post_status:
        | "IDEA"
        | "DRAFT"
        | "READY_FOR_REVIEW"
        | "APPROVED"
        | "SCHEDULED"
        | "PUBLISHED"
        | "FAILED"
        | "REJECTED"
      user_role: "owner" | "editor" | "reviewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      asset_source: ["upload", "generate"],
      log_level: ["info", "warn", "error"],
      post_format: ["single"],
      post_status: [
        "IDEA",
        "DRAFT",
        "READY_FOR_REVIEW",
        "APPROVED",
        "SCHEDULED",
        "PUBLISHED",
        "FAILED",
        "REJECTED",
      ],
      user_role: ["owner", "editor", "reviewer"],
    },
  },
} as const
