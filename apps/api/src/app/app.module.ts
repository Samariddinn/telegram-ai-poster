import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@telegram-ai-poster/prisma';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CredentialsModule } from './credentials/credentials.module';
import { DestinationsModule } from './destinations/destinations.module';
import { UsersModule } from './users/users.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    CredentialsModule,
    DestinationsModule,
    WorkflowsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
