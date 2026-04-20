import { create } from 'zustand';

export type ModelSelection = { providerId: string; modelId: string };

export type SelectionState = {
  sessionModelSelections: Map<string, ModelSelection>;
  sessionAgentSelections: Map<string, string>;
  sessionAgentModelSelections: Map<string, Map<string, ModelSelection>>;
  lastUsedProvider: { providerID: string; modelID: string } | null;

  saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => void;
  getSessionModelSelection: (sessionId: string) => ModelSelection | null;
  saveSessionAgentSelection: (sessionId: string, agentName: string) => void;
  getSessionAgentSelection: (sessionId: string) => string | null;
  saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => void;
  getAgentModelForSession: (sessionId: string, agentName: string) => ModelSelection | null;
  saveAgentModelVariantForSession: (sessionId: string, agentName: string, providerId: string, modelId: string, variant: string | undefined) => void;
  getAgentModelVariantForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => string | undefined;
};

const agentModelVariantSelections = new Map<string, Map<string, Map<string, string>>>();

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  sessionModelSelections: new Map(),
  sessionAgentSelections: new Map(),
  sessionAgentModelSelections: new Map(),
  lastUsedProvider: null,

  saveSessionModelSelection: (sessionId, providerId, modelId) => set((state) => {
    const next = new Map(state.sessionModelSelections);
    next.set(sessionId, { providerId, modelId });
    return { sessionModelSelections: next, lastUsedProvider: { providerID: providerId, modelID: modelId } };
  }),

  getSessionModelSelection: (sessionId) => get().sessionModelSelections.get(sessionId) ?? null,

  saveSessionAgentSelection: (sessionId, agentName) => set((state) => {
    if (state.sessionAgentSelections.get(sessionId) === agentName) {
      return state;
    }
    const next = new Map(state.sessionAgentSelections);
    next.set(sessionId, agentName);
    return { sessionAgentSelections: next };
  }),

  getSessionAgentSelection: (sessionId) => get().sessionAgentSelections.get(sessionId) ?? null,

  saveAgentModelForSession: (sessionId, agentName, providerId, modelId) => set((state) => {
    const existing = state.sessionAgentModelSelections.get(sessionId)?.get(agentName);
    if (existing?.providerId === providerId && existing?.modelId === modelId) {
      return state;
    }
    const outer = new Map(state.sessionAgentModelSelections);
    const inner = new Map(outer.get(sessionId) ?? new Map());
    inner.set(agentName, { providerId, modelId });
    outer.set(sessionId, inner);
    return { sessionAgentModelSelections: outer };
  }),

  getAgentModelForSession: (sessionId, agentName) => get().sessionAgentModelSelections.get(sessionId)?.get(agentName) ?? null,

  saveAgentModelVariantForSession: (sessionId, agentName, providerId, modelId, variant) => {
    if (!variant) {
      return;
    }
    const key = `${providerId}/${modelId}`;
    let agentMap = agentModelVariantSelections.get(sessionId);
    if (!agentMap) {
      agentMap = new Map();
      agentModelVariantSelections.set(sessionId, agentMap);
    }
    let modelMap = agentMap.get(agentName);
    if (!modelMap) {
      modelMap = new Map();
      agentMap.set(agentName, modelMap);
    }
    modelMap.set(key, variant);
  },

  getAgentModelVariantForSession: (sessionId, agentName, providerId, modelId) => {
    const key = `${providerId}/${modelId}`;
    return agentModelVariantSelections.get(sessionId)?.get(agentName)?.get(key);
  },
}));
