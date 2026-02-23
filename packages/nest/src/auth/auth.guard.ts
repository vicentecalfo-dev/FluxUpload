import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

import { FLUX_UPLOAD_CONFIG, type FluxUploadConfig } from '../config/config.module.js';
import type { AuthenticatedRequest } from './auth.types.js';

@Injectable()
export class FluxUploadAuthGuard implements CanActivate {
  public constructor(
    @Inject(FLUX_UPLOAD_CONFIG)
    private readonly config: FluxUploadConfig,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token || token !== this.config.authToken) {
      throw new UnauthorizedException('Invalid token.');
    }

    request.user = {
      ownerId: deriveOwnerId(token),
      token,
    };

    return true;
  }
}

function deriveOwnerId(token: string): string {
  const [, candidate] = token.split(':', 2);
  if (candidate && candidate.length > 0) {
    return candidate;
  }

  return 'mvp-user';
}
