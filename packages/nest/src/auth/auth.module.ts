import { Module } from '@nestjs/common';

import { FluxUploadAuthGuard } from './auth.guard.js';

@Module({
  providers: [FluxUploadAuthGuard],
  exports: [FluxUploadAuthGuard],
})
export class FluxUploadAuthModule {}
