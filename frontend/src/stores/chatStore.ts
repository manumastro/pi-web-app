import { create } from 'zustand';
import { appendPrompt as buildOptimisticConversation } from '@/chatState';
import type { ConversationItem, MessageItem, PermissionItem, QuestionItem } from '@/chatState';

// Fallback for crypto.randomUUID when not available
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers/node
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

interface ChatState {
  // Conversation state
  conversation: ConversationItem[];
  streaming: 'idle' | 'streaming' | 'connecting' | 'error';
  statusMessage: string;
  error: string;
  
  // Actions
  setConversation: (items: ConversationItem[]) => void;
  appendPrompt: (prompt: string, activeModelKey: string, turnId?: string) => void;
  applySsePayload: (data: string) => void;
  setStreaming: (state: 'idle' | 'streaming' | 'connecting' | 'error') => void;
  setStatusMessage: (message: string) => void;
  setError: (error: string) => void;
  clearConversation: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  conversation: [],
  streaming: 'idle',
  statusMessage: 'Connecting…',
  error: '',
  
  // Actions
  setConversation: (items) => set({ conversation: items }),
  
  appendPrompt: (prompt, _activeModelKey, turnId) => {
    set((state) => ({
      conversation: buildOptimisticConversation(state.conversation, prompt, turnId),
    }));
  },
  
  applySsePayload: (data) => {
    const state = get();
    
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
      } else if (parsed.type === 'permission') {
        // Permission request
        const permissionItem: PermissionItem = {
          kind: 'permission',
          id: parsed.id || parsed.permissionId || generateId(),
          permissionId: parsed.permissionId || parsed.id || generateId(),
          action: parsed.action || parsed.description || 'permission',
          resource: parsed.resource || '',
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          conversation: [...state.conversation, permissionItem],
        }));
      } else if (parsed.type === 'question') {
        // Question request
        const questionItem: QuestionItem = {
          kind: 'question',
          id: parsed.id || parsed.questionId || generateId(),
          questionId: parsed.questionId || parsed.id || generateId(),
          question: parsed.question || '',
          options: parsed.options || [],
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          conversation: [...state.conversation, questionItem],
        }));
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
