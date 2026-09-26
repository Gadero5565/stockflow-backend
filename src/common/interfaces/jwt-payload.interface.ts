export type JwtTokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  type: JwtTokenType;
}
