import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

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
      const data = await apiGet<ChatConversation[]>("/api/chat/conversations");
      setConversations(data || []);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const createConversation = useCallback(async (title: string): Promise<string | null> => {
    try {
      const data = await apiPost<ChatConversation>("/api/chat/conversations", {
        title: title.slice(0, 100),
      });

      await fetchConversations();
      return data.id;
    } catch (err) {
      console.error("Error creating conversation:", err);
      return null;
    }
  }, [fetchConversations]);

  const updateConversationTitle = useCallback(async (id: string, title: string) => {
    try {
      await apiPatch(`/api/chat/conversations/${id}`, { title: title.slice(0, 100) });
      await fetchConversations();
    } catch (err) {
      console.error("Error updating conversation title:", err);
    }
  }, [fetchConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await apiDelete(`/api/chat/conversations/${id}`);
      await fetchConversations();
    } catch (err) {
      console.error("Error deleting conversation:", err);
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
      const data = await apiGet<ChatMessage[]>(`/api/chat/conversations/${conversationId}/messages`);
      setMessages(data || []);
    } catch (err) {
      console.error("Error fetching messages:", err);
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
      const data = await apiPost<ChatMessage>(`/api/chat/conversations/${conversationId}/messages`, {
        role,
        content,
        attachments: attachments || {},
      });

      setMessages(prev => [...prev, data]);
      return data;
    } catch (err) {
      console.error("Error adding message:", err);
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
