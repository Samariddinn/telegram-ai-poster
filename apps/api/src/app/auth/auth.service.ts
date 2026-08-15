import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto, LoginDto, AuthResponse } from '@telegram-ai-poster/shared-dto';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const expectedInvite = this.config.get<string>('INVITE_CODE');
    if (!expectedInvite || dto.inviteCode !== expectedInvite) {
      throw new UnauthorizedException('Invalid invite code');
    }

    const existing = await this.users.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.users.create(dto.username, passwordHash);

    return this.buildResponse(user.id, user.username);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildResponse(user.id, user.username);
  }

  private buildResponse(userId: string, username: string): AuthResponse {
    const accessToken = this.jwt.sign({ sub: userId, username });
    return {
      accessToken,
      user: { id: userId, username },
    };
  }
}
