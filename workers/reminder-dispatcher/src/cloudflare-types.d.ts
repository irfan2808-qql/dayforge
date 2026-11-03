interface ScheduledEvent { scheduledTime: number; cron: string; }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; }
