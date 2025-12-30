import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChatConversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string | null;
  attachments: {
    images?: string[];
    media_asset_ids?: string[];
  };
  created_at: string;
}

export function useChatConversations() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("chat_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error fetching conversations:", error);
        return;
      }

      setConversations((data || []) as ChatConversation[]);
    } catch (err) {
      console.error("Error in fetchConversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const createConversation = useCallback(async (title: string): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("chat_conversations")
        .insert({
          user_id: user.id,
          title: title.slice(0, 100),
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating conversation:", error);
        return null;
      }

      // Refresh the list
      await fetchConversations();
      return (data as ChatConversation).id;
    } catch (err) {
      console.error("Error in createConversation:", err);
      return null;
    }
  }, [fetchConversations]);

  const updateConversationTitle = useCallback(async (id: string, title: string) => {
    try {
      const { error } = await supabase
        .from("chat_conversations")
        .update({ title: title.slice(0, 100) })
        .eq("id", id);

      if (error) {
        console.error("Error updating conversation title:", error);
        return;
      }

      await fetchConversations();
    } catch (err) {
      console.error("Error in updateConversationTitle:", err);
    }
  }, [fetchConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from("chat_conversations")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting conversation:", error);
        return;
      }

      await fetchConversations();
    } catch (err) {
      console.error("Error in deleteConversation:", err);
    }
  }, [fetchConversations]);

  return {
    conversations,
    loading,
    createConversation,
    updateConversationTitle,
    deleteConversation,
    refetch: fetchConversations,
  };
}

export function useChatMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        return;
      }

      setMessages((data || []) as ChatMessage[]);
    } catch (err) {
      console.error("Error in fetchMessages:", err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const addMessage = useCallback(async (
    role: "user" | "assistant",
    content: string,
    attachments?: { images?: string[]; media_asset_ids?: string[] }
  ) => {
    if (!conversationId) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("chat_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role,
          content,
          attachments: attachments || {},
        })
        .select()
        .single();

      if (error) {
        console.error("Error adding message:", error);
        return null;
      }

      // Also update conversation's updated_at
      await supabase
        .from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      setMessages(prev => [...prev, data as ChatMessage]);
      return data as ChatMessage;
    } catch (err) {
      console.error("Error in addMessage:", err);
      return null;
    }
  }, [conversationId]);

  return {
    messages,
    loading,
    addMessage,
    setMessages,
    refetch: fetchMessages,
  };
}
