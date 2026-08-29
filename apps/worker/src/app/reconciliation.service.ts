import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerService } from '@telegram-ai-poster/execution';

/**
 * Rule 2 (docs §5): reconcile on boot. This is what makes the system
 * self-healing after a crashed deploy, a Redis restart, or a manual
 * database edit — no separate operational step required.
 */
@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly scheduler: SchedulerService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Reconciling schedules against Postgres...');
    await this.scheduler.reconcile();
    this.logger.log('Reconciliation complete.');
  }
}
