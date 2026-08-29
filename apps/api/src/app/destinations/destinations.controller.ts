import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CreateDestinationDto, SendTestMessageDto } from '@telegram-ai-poster/shared-dto';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DestinationsService } from './destinations.service';

@Controller('destinations')
@UseGuards(JwtAuthGuard)
export class DestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.destinations.findAllForUser(user.id);
  }

  @Get('detect')
  detect(@CurrentUser() user: CurrentUserPayload, @Query('botCredentialId') botCredentialId: string) {
    return this.destinations.detect(user.id, botCredentialId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateDestinationDto) {
    return this.destinations.create(user.id, dto);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  sendTest(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: SendTestMessageDto) {
    return this.destinations.sendTest(user.id, id, dto.text);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.destinations.remove(user.id, id);
  }
}
