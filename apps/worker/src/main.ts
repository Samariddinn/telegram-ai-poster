import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

/**
 * No HTTP server — this process only consumes the workflow-executions
 * queue. It stays alive because WorkflowProcessorService holds an open
 * BullMQ Worker (and Redis connection) for its whole lifetime.
 */
async function bootstrap() {
  const logger = new Logger('Worker');
  await NestFactory.createApplicationContext(AppModule);
  logger.log('🔧 Worker process started — listening for scheduled workflow executions');
}

bootstrap();
