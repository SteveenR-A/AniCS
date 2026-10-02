import type { DownloadTask } from '@/types';

/** Backend insertion order survives restarts and timestamp ties. */
export function orderDownloadTasks(tasks: Map<string, DownloadTask>): Map<string, DownloadTask> {
  return new Map([...tasks.entries()].sort(([, a], [, b]) => {
    if (a.queueOrder != null && b.queueOrder != null) return a.queueOrder - b.queueOrder;
    if (a.queueOrder != null) return -1;
    if (b.queueOrder != null) return 1;
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  }));
}
