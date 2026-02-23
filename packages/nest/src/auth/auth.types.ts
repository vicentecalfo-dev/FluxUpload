export interface AuthUser {
  ownerId: string;
  token: string;
}

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
    [key: string]: string | string[] | undefined;
  };
  user?: AuthUser;
  [key: string]: unknown;
}
