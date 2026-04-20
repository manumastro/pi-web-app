import { create } from 'zustand';

export type NotificationBase = {
  directory?: string;
  session?: string;
  time: number;
  viewed: boolean;
};

export type TurnCompleteNotification = NotificationBase & {
  type: 'turn-complete';
};

export type ErrorNotification = NotificationBase & {
  type: 'error';
  error?: { message?: string; code?: string };
};

export type Notification = TurnCompleteNotification | ErrorNotification;

type NotificationIndex = {
  session: {
    unseenCount: Record<string, number>;
    unseenHasError: Record<string, boolean>;
  };
  project: {
    unseenCount: Record<string, number>;
    unseenHasError: Record<string, boolean>;
  };
};

const MAX_NOTIFICATIONS = 500;
const NOTIFICATION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function pruneNotifications(list: Notification[]): Notification[] {
  const cutoff = Date.now() - NOTIFICATION_TTL_MS;
  const pruned = list.filter((notification) => notification.time >= cutoff);
  if (pruned.length <= MAX_NOTIFICATIONS) {
    return pruned;
  }
  return pruned.slice(pruned.length - MAX_NOTIFICATIONS);
}

function buildIndex(list: Notification[]): NotificationIndex {
  const index: NotificationIndex = {
    session: { unseenCount: {}, unseenHasError: {} },
    project: { unseenCount: {}, unseenHasError: {} },
  };

  for (const notification of list) {
    if (notification.viewed) {
      continue;
    }

    if (notification.session) {
      index.session.unseenCount[notification.session] = (index.session.unseenCount[notification.session] ?? 0) + 1;
      if (notification.type === 'error') {
        index.session.unseenHasError[notification.session] = true;
      }
    }

    if (notification.directory) {
      index.project.unseenCount[notification.directory] = (index.project.unseenCount[notification.directory] ?? 0) + 1;
      if (notification.type === 'error') {
        index.project.unseenHasError[notification.directory] = true;
      }
    }
  }

  return index;
}

export type NotificationStore = {
  list: Notification[];
  index: NotificationIndex;
  append: (notification: Notification) => void;
  markSessionViewed: (sessionId: string) => void;
  markProjectViewed: (directory: string) => void;
  sessionUnseenCount: (sessionId: string) => number;
  sessionHasError: (sessionId: string) => boolean;
  projectUnseenCount: (directory: string) => number;
  projectHasError: (directory: string) => boolean;
};

export const useNotificationStore = create<NotificationStore>()((set, get) => ({
  list: [],
  index: {
    session: { unseenCount: {}, unseenHasError: {} },
    project: { unseenCount: {}, unseenHasError: {} },
  },

  append: (notification) => {
    const next = pruneNotifications([...get().list, notification]);
    set({ list: next, index: buildIndex(next) });
  },

  markSessionViewed: (sessionId) => {
    const current = get();
    if ((current.index.session.unseenCount[sessionId] ?? 0) === 0) {
      return;
    }
    const next = current.list.map((notification) => (notification.session === sessionId && !notification.viewed ? { ...notification, viewed: true } : notification));
    set({ list: next, index: buildIndex(next) });
  },

  markProjectViewed: (directory) => {
    const current = get();
    if ((current.index.project.unseenCount[directory] ?? 0) === 0) {
      return;
    }
    const next = current.list.map((notification) => (notification.directory === directory && !notification.viewed ? { ...notification, viewed: true } : notification));
    set({ list: next, index: buildIndex(next) });
  },

  sessionUnseenCount: (sessionId) => get().index.session.unseenCount[sessionId] ?? 0,
  sessionHasError: (sessionId) => get().index.session.unseenHasError[sessionId] ?? false,
  projectUnseenCount: (directory) => get().index.project.unseenCount[directory] ?? 0,
  projectHasError: (directory) => get().index.project.unseenHasError[directory] ?? false,
}));

export function appendNotification(notification: Notification): void {
  useNotificationStore.getState().append(notification);
}

export function markSessionViewed(sessionId: string): void {
  useNotificationStore.getState().markSessionViewed(sessionId);
}
