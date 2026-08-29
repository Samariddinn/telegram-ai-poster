import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { SchedulerService } from './scheduler/scheduler.service';
import { TelegramService } from './telegram/telegram.service';
import { WorkflowRunnerService } from './workflow-runner.service';

/**
 * Relies on the consuming app's root module having already set up
 * ConfigModule.forRoot({ isGlobal: true }) and PrismaModule (itself
 * @Global()) — same convention apps/api's other modules already follow, no
 * need to re-import either here.
 */
@Module({
  providers: [EncryptionService, TelegramService, SchedulerService, WorkflowRunnerService],
  exports: [EncryptionService, TelegramService, SchedulerService, WorkflowRunnerService],
})
export class ExecutionModule {}
