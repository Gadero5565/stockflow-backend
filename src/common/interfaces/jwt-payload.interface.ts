export type JwtTokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  type: JwtTokenType;

  // Refresh tokens use a unique JWT ID so token rotation always
  // produces a different signed token, even when two tokens are
  // issued within the same second.
  jti?: string;
}
