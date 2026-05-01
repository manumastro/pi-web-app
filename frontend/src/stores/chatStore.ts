import { create } from 'zustand';
import { appendPrompt as buildOptimisticConversation } from '@/sync/conversation';
import type { ConversationItem, MessageItem } from '@/sync/conversation';
import type { PromptImageAttachment } from '@/types';

interface ChatState {
  conversation: ConversationItem[];
  streaming: 'idle' | 'streaming' | 'connecting' | 'error';
  statusMessage: string;
  error: string;
  scrollToBottomRevision: number;

  setConversation: (items: ConversationItem[]) => void;
  appendPrompt: (prompt: string, activeModelKey: string, turnId?: string, attachments?: PromptImageAttachment[]) => void;
  applySsePayload: (data: string) => void;
  setStreaming: (state: 'idle' | 'streaming' | 'connecting' | 'error') => void;
  setStatusMessage: (message: string) => void;
  setError: (error: string) => void;
  requestScrollToBottom: () => void;
  clearConversation: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversation: [],
  streaming: 'idle',
  statusMessage: 'Connecting',
  error: '',
  scrollToBottomRevision: 0,

  setConversation: (items) => set({ conversation: items }),

  appendPrompt: (prompt, _activeModelKey, turnId, attachments) => {
    set((state) => ({
      conversation: buildOptimisticConversation(state.conversation, prompt, turnId, attachments),
    }));
  },

  requestScrollToBottom: () => {
    set((state) => ({ scrollToBottomRevision: state.scrollToBottomRevision + 1 }));
  },

  applySsePayload: (data) => {
    try {
      const parsed = JSON.parse(data);
      
      // Handle different event types
      if (parsed.type === 'text_chunk' || parsed.content !== undefined) {
        // Text content update
        set((state) => {
          const conversation = [...state.conversation];
          const lastItem = conversation[conversation.length - 1];
          
          if (lastItem && lastItem.kind === 'message' && lastItem.role === 'assistant') {
            const newContent = (lastItem as MessageItem).content + (parsed.content || parsed.text || '');
            conversation[conversation.length - 1] = {
              ...lastItem,
              content: newContent,
            };
          }
          
          return { conversation };
        });
      } else if (parsed.type === 'status') {
        set({ statusMessage: parsed.message || parsed.text || '' });
      } else if (parsed.type === 'error') {
        set({ error: parsed.message || 'Unknown error', streaming: 'error' });
      } else if (parsed.type === 'done') {
        set({ streaming: 'idle', statusMessage: 'Completed' });
      }
    } catch {
      // If not JSON, treat as text content
      set((state) => {
        const conversation = [...state.conversation];
        const lastItem = conversation[conversation.length - 1];
        
        if (lastItem && lastItem.kind === 'message' && lastItem.role === 'assistant') {
          const updated = {
            ...lastItem,
            content: lastItem.content + data,
          };
          conversation[conversation.length - 1] = updated;
        }
        
        return { conversation };
      });
    }
  },
  
  setStreaming: (streaming) => set({ streaming }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setError: (error) => set({ error }),
  clearConversation: () => set({ conversation: [], error: '' }),
}));
