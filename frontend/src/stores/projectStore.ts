import { create } from 'zustand';
import { cacheGetItem, cacheRemoveItem, cacheSetItem } from '@/lib/frontend-cache';
import type { SessionInfo } from '@/types';
import { createProjectIdFromPath, getProjectLabel, normalizeProjectPath } from '@/lib/path';

export interface ProjectEntry {
  id: string;
  path: string;
  label: string;
  addedAt: string;
  updatedAt: string;
}

interface ProjectState {
  homeDirectory: string;
  projects: ProjectEntry[];
  activeProjectId: string;

  setHomeDirectory: (homeDirectory: string) => void;
  hydrate: (homeDirectory: string, sessions: SessionInfo[]) => void;
  addProject: (path: string) => ProjectEntry | null;
  removeProject: (id: string) => void;
  selectProject: (id: string) => void;
  syncFromSessions: (sessions: SessionInfo[]) => void;
  getActiveProject: () => ProjectEntry | undefined;
}

const STORAGE_KEY = 'pi-web-app:projects';
const ACTIVE_PROJECT_KEY = 'pi-web-app:active-project';

function readStoredProjects(): ProjectEntry[] {
  const raw = cacheGetItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is ProjectEntry => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        id: typeof entry.id === 'string' ? entry.id : createProjectIdFromPath(entry.path),
        path: typeof entry.path === 'string' ? entry.path : '',
        label: typeof entry.label === 'string' ? entry.label : '',
        addedAt: typeof entry.addedAt === 'string' ? entry.addedAt : new Date().toISOString(),
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
      }))
      .filter((entry) => entry.path.length > 0);
  } catch {
    return [];
  }
}

function readStoredActiveProjectId(): string {
  return cacheGetItem(ACTIVE_PROJECT_KEY) ?? '';
}

function persistProjects(projects: ProjectEntry[], activeProjectId: string): void {
  cacheSetItem(STORAGE_KEY, JSON.stringify(projects));

  if (activeProjectId) {
    cacheSetItem(ACTIVE_PROJECT_KEY, activeProjectId);
  } else {
    cacheRemoveItem(ACTIVE_PROJECT_KEY);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureRootProject(projects: ProjectEntry[], homeDirectory: string): ProjectEntry[] {
  const normalizedHome = homeDirectory.trim();
  if (!normalizedHome) {
    return projects;
  }

  const rootId = createProjectIdFromPath(normalizedHome);
  const rootProject = projects.find((project) => project.id === rootId || project.path === normalizedHome);
  if (rootProject) {
    return projects.map((project) =>
      project.id === rootProject.id
        ? { ...project, path: normalizedHome, label: getProjectLabel(normalizedHome, normalizedHome) }
        : project,
    );
  }

  const root: ProjectEntry = {
    id: rootId,
    path: normalizedHome,
    label: getProjectLabel(normalizedHome, normalizedHome),
    addedAt: nowIso(),
    updatedAt: nowIso(),
  };

  return [root, ...projects];
}

function upsertProjectPath(projects: ProjectEntry[], path: string, homeDirectory: string): ProjectEntry[] {
  const existingIndex = projects.findIndex((project) => project.path === path);
  const label = getProjectLabel(path, homeDirectory);

  if (existingIndex >= 0) {
    const next = [...projects];
    next[existingIndex] = { ...next[existingIndex]!, path, label, updatedAt: nowIso() };
    return next;
  }

  const entry: ProjectEntry = {
    id: createProjectIdFromPath(path),
    path,
    label,
    addedAt: nowIso(),
    updatedAt: nowIso(),
  };

  return [...projects, entry];
}

function syncProjectsWithSessions(projects: ProjectEntry[], sessions: SessionInfo[], homeDirectory: string): ProjectEntry[] {
  let next = [...projects];
  const seen = new Set(next.map((project) => project.path));

  for (const session of sessions) {
    const normalized = normalizeProjectPath(session.cwd, homeDirectory) ?? session.cwd;
    if (!seen.has(normalized)) {
      next = upsertProjectPath(next, normalized, homeDirectory);
      seen.add(normalized);
    }
  }

  return next;
}

const initialProjects = readStoredProjects();
const initialActiveProjectId = readStoredActiveProjectId();

export const useProjectStore = create<ProjectState>((set, get) => ({
  homeDirectory: '/home/manu',
  projects: initialProjects,
  activeProjectId: initialActiveProjectId,

  setHomeDirectory: (homeDirectory) => {
    set((state) => {
      const nextHome = homeDirectory.trim() || state.homeDirectory;
      const projects = ensureRootProject(state.projects, nextHome);
      const activeProjectId = projects.some((project) => project.id === state.activeProjectId)
        ? state.activeProjectId
        : createProjectIdFromPath(nextHome);
      persistProjects(projects, activeProjectId);
      return {
        homeDirectory: nextHome,
        projects,
        activeProjectId,
      };
    });
  },

  hydrate: (homeDirectory, sessions) => {
    set((state) => {
      const nextHome = homeDirectory.trim() || state.homeDirectory;
      let projects = ensureRootProject(state.projects, nextHome);
      projects = syncProjectsWithSessions(projects, sessions, nextHome);
      const activeProjectId = projects.some((project) => project.id === state.activeProjectId)
        ? state.activeProjectId
        : createProjectIdFromPath(nextHome);
      persistProjects(projects, activeProjectId);
      return {
        homeDirectory: nextHome,
        projects,
        activeProjectId,
      };
    });
  },

  addProject: (inputPath) => {
    const { homeDirectory } = get();
    const normalized = normalizeProjectPath(inputPath, homeDirectory);
    if (!normalized) {
      return null;
    }

    const existing = get().projects.find((project) => project.path === normalized);
    if (existing) {
      set({ activeProjectId: existing.id });
      persistProjects(get().projects, existing.id);
      return existing;
    }

    const nextProjects = ensureRootProject(get().projects, homeDirectory);
    const entry: ProjectEntry = {
      id: createProjectIdFromPath(normalized),
      path: normalized,
      label: getProjectLabel(normalized, homeDirectory),
      addedAt: nowIso(),
      updatedAt: nowIso(),
    };

    const updatedProjects = [...nextProjects, entry];
    set({ projects: updatedProjects, activeProjectId: entry.id });
    persistProjects(updatedProjects, entry.id);
    return entry;
  },

  removeProject: (id) => {
    const state = get();
    const nextProjects = state.projects.filter((project) => project.id !== id);
    const fallbackProject = nextProjects[0];
    const activeProjectId = state.activeProjectId === id ? (fallbackProject?.id ?? '') : state.activeProjectId;
    const projects = ensureRootProject(nextProjects, state.homeDirectory);
    const nextActiveId = projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : projects[0]?.id ?? '';
    set({ projects, activeProjectId: nextActiveId });
    persistProjects(projects, nextActiveId);
  },

  selectProject: (id) => {
    const project = get().projects.find((entry) => entry.id === id);
    if (!project) {
      return;
    }
    set({ activeProjectId: id });
    persistProjects(get().projects, id);
  },

  syncFromSessions: (sessions) => {
    set((state) => {
      const projects = ensureRootProject(syncProjectsWithSessions(state.projects, sessions, state.homeDirectory), state.homeDirectory);
      const activeProjectId = projects.some((project) => project.id === state.activeProjectId)
        ? state.activeProjectId
        : createProjectIdFromPath(state.homeDirectory);
      persistProjects(projects, activeProjectId);
      return {
        projects,
        activeProjectId,
      };
    });
  },

  getActiveProject: () => get().projects.find((project) => project.id === get().activeProjectId),
}));
