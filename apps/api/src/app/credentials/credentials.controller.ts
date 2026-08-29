import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CreateCredentialDto } from '@telegram-ai-poster/shared-dto';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CredentialsService } from './credentials.service';

@Controller('credentials')
@UseGuards(JwtAuthGuard)
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateCredentialDto) {
    return this.credentials.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.credentials.findAllForUser(user.id);
  }

  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  validate(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.credentials.validate(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.credentials.remove(user.id, id);
  }
}
