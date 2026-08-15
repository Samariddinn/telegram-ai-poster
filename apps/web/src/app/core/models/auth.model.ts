export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
  };
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  inviteCode: string;
}
