import { Module } from '@nestjs/common';
import { FluxUploadModule } from '@flux-upload/nest';

@Module({
  imports: [FluxUploadModule.forRoot()],
})
export class AppModule {}
