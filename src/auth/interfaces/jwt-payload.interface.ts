export interface JwtPayload {
    sub: string;         // typically user ID
    email: string;
    role: string;        // or use enum Role if typed
  }
  