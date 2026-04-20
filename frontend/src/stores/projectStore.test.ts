import { beforeEach, describe, expect, it } from 'vitest';
import { createProjectIdFromPath } from '@/lib/path';
import { useProjectStore } from './projectStore';

const homeDirectory = '/home/manu';
const rootProjectId = createProjectIdFromPath(homeDirectory);

beforeEach(() => {
  useProjectStore.setState({
    homeDirectory,
    projects: [
      {
        id: rootProjectId,
        path: homeDirectory,
        label: '~',
        addedAt: '2026-04-19T10:00:00.000Z',
        updatedAt: '2026-04-19T10:00:00.000Z',
      },
    ],
    activeProjectId: rootProjectId,
  });
});

describe('projectStore', () => {
  it('adds projects only from the home directory namespace', () => {
    const added = useProjectStore.getState().addProject('~/openchamber');

    expect(added).not.toBeNull();
    expect(added?.path).toBe('/home/manu/openchamber');
    expect(added?.label).toBe('openchamber');
    expect(useProjectStore.getState().activeProjectId).toBe(added?.id);
    expect(useProjectStore.getState().addProject('/tmp/project')).toBeNull();
  });

  it('keeps the home project as the default root project', () => {
    const activeProject = useProjectStore.getState().getActiveProject();

    expect(activeProject?.path).toBe(homeDirectory);
    expect(activeProject?.label).toBe('~');
  });
});
