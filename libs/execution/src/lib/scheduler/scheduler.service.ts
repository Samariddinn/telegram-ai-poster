import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@telegram-ai-poster/prisma';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const WORKFLOW_QUEUE_NAME = 'workflow-executions';

/**
 * Owns the schedule side of things in Redis, via BullMQ's Job Scheduler API
 * (repeatable jobs, one per workflow, keyed by workflow id). Used by the api
 * process to register/deregister schedules (docs §1: "Registers and
 * deregisters schedules in Redis but never executes them") and by the
 * worker process to consume the queue and reconcile on boot.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private connection!: IORedis;
  private queue!: Queue<{ workflowId: string }>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL is not set');
    }

    // BullMQ requires this for its blocking commands.
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(WORKFLOW_QUEUE_NAME, { connection: this.connection });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    await this.connection?.quit();
  }

  getQueue(): Queue<{ workflowId: string }> {
    return this.queue;
  }

  /**
   * Rule 1 (docs §5): every mutation is remove-then-add. `upsertJobScheduler`
   * is idempotent on `workflowId` as the scheduler id, so a plain upsert —
   * replacing whatever schedule (if any) previously existed under that id —
   * already satisfies "always deregister before registering". Returns the
   * schedule key to store on the workflow row (just the workflow id itself,
   * since that's what we use as the scheduler id).
   */
  async registerSchedule(workflowId: string, intervalMinutes: number): Promise<string> {
    await this.queue.upsertJobScheduler(workflowId, { every: intervalMinutes * 60_000 }, { data: { workflowId } });
    return workflowId;
  }

  async deregisterSchedule(scheduleKey: string | null | undefined): Promise<void> {
    if (!scheduleKey) {
      return;
    }
    await this.queue.removeJobScheduler(scheduleKey);
  }

  /**
   * Rule 2 (docs §5): reconcile on boot. Repairs drift between Redis and
   * Postgres in both directions — deletes schedules with no matching
   * enabled workflow, creates schedules for enabled workflows that have
   * none. Rule 3: Postgres always wins.
   */
  async reconcile(): Promise<void> {
    const [enabledWorkflows, schedulers] = await Promise.all([
      this.prisma.workflow.findMany({ where: { enabled: true } }),
      this.queue.getJobSchedulers(),
    ]);

    const schedulerIds = new Set(schedulers.map((s) => s.id ?? s.key));
    const enabledIds = new Set(enabledWorkflows.map((w) => w.id));

    for (const scheduler of schedulers) {
      const id = scheduler.id ?? scheduler.key;
      if (!enabledIds.has(id)) {
        this.logger.warn(`Reconcile: removing orphaned schedule for workflow ${id}`);
        await this.queue.removeJobScheduler(id);
      }
    }

    for (const workflow of enabledWorkflows) {
      if (!schedulerIds.has(workflow.id)) {
        this.logger.warn(`Reconcile: registering missing schedule for workflow ${workflow.id}`);
        await this.registerSchedule(workflow.id, workflow.intervalMinutes);
        await this.prisma.workflow.update({ where: { id: workflow.id }, data: { scheduleKey: workflow.id } });
      } else if (workflow.scheduleKey !== workflow.id) {
        // Redis is fine but Postgres's cached key is stale — fix the record, not the schedule.
        await this.prisma.workflow.update({ where: { id: workflow.id }, data: { scheduleKey: workflow.id } });
      }
    }
  }
}
