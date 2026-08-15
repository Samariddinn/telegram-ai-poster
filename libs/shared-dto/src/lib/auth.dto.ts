import { IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username may only contain letters, numbers, and underscores',
  })
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  inviteCode!: string;
}

export class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  password!: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
  };
}
