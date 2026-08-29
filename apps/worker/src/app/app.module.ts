import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExecutionModule } from '@telegram-ai-poster/execution';
import { PrismaModule } from '@telegram-ai-poster/prisma';
import { ReconciliationService } from './reconciliation.service';
import { WorkflowProcessorService } from './workflow-processor.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    ExecutionModule,
  ],
  providers: [WorkflowProcessorService, ReconciliationService],
})
export class AppModule {}
