import { create } from 'zustand';

export type AttachedFile = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  source: 'local';
  file?: File;
};

export type SyntheticContextPart = {
  text: string;
  attachments?: AttachedFile[];
  synthetic?: boolean;
};

export type InputState = {
  pendingInputText: string | null;
  pendingInputMode: 'replace' | 'append' | 'append-inline';
  pendingSyntheticParts: SyntheticContextPart[] | null;
  attachedFiles: AttachedFile[];

  setPendingInputText: (text: string | null, mode?: 'replace' | 'append' | 'append-inline') => void;
  consumePendingInputText: () => { text: string; mode: 'replace' | 'append' | 'append-inline' } | null;
  setPendingSyntheticParts: (parts: SyntheticContextPart[] | null) => void;
  consumePendingSyntheticParts: () => SyntheticContextPart[] | null;
  addAttachedFile: (file: File) => Promise<void>;
  removeAttachedFile: (id: string) => void;
  clearAttachedFiles: () => void;
};

function createAttachedFile(file: File, dataUrl: string): AttachedFile {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    dataUrl,
    mimeType: file.type,
    filename: file.name,
    size: file.size,
    source: 'local',
  };
}

function readAsDataUrl(file: File): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return Promise.resolve('');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

export const useInputStore = create<InputState>()((set, get) => ({
  pendingInputText: null,
  pendingInputMode: 'replace',
  pendingSyntheticParts: null,
  attachedFiles: [],

  setPendingInputText: (text, mode = 'replace') => set({ pendingInputText: text, pendingInputMode: mode }),

  consumePendingInputText: () => {
    const { pendingInputText, pendingInputMode } = get();
    if (pendingInputText === null) {
      return null;
    }
    set({ pendingInputText: null, pendingInputMode: 'replace' });
    return { text: pendingInputText, mode: pendingInputMode };
  },

  setPendingSyntheticParts: (parts) => set({ pendingSyntheticParts: parts }),

  consumePendingSyntheticParts: () => {
    const { pendingSyntheticParts } = get();
    if (pendingSyntheticParts !== null) {
      set({ pendingSyntheticParts: null });
    }
    return pendingSyntheticParts;
  },

  addAttachedFile: async (file) => {
    const dataUrl = await readAsDataUrl(file);
    const attached = createAttachedFile(file, dataUrl);
    set((state) => ({ attachedFiles: [...state.attachedFiles, attached] }));
  },

  removeAttachedFile: (id) => set((state) => ({ attachedFiles: state.attachedFiles.filter((file) => file.id !== id) })),

  clearAttachedFiles: () => set({ attachedFiles: [] }),
}));
