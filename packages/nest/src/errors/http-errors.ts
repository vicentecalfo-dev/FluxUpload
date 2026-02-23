import {
  ConflictException,
  GoneException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

export class UploadSessionNotFoundException extends NotFoundException {
  public constructor(uploadId: string) {
    super(`Upload session '${uploadId}' was not found.`);
  }
}

export class UploadSessionExpiredException extends GoneException {
  public constructor(uploadId: string) {
    super(`Upload session '${uploadId}' has expired.`);
  }
}

export class UploadSessionConflictException extends ConflictException {
  public constructor(message: string) {
    super(message);
  }
}

export class StorageOperationException extends InternalServerErrorException {
  public constructor(message: string) {
    super(message);
  }
}
