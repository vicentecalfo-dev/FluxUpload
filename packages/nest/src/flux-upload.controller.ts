import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { FluxUploadAuthGuard } from './auth/auth.guard.js';
import type { AuthenticatedRequest } from './auth/auth.types.js';
import { CommitPartsDto } from './dto/commit-parts.dto.js';
import { CompleteUploadDto } from './dto/complete-upload.dto.js';
import { InitUploadDto } from './dto/init-upload.dto.js';
import { SignPartsDto } from './dto/sign-parts.dto.js';
import {
  FluxUploadService,
  type CompleteUploadResponse,
  type InitUploadResponse,
  type SignPartsResponse,
  type UploadStatusResponse,
} from './flux-upload.service.js';

@ApiTags('Flux Upload')
@ApiBearerAuth()
@UseGuards(FluxUploadAuthGuard)
@Controller('uploads')
export class FluxUploadController {
  public constructor(
    @Inject(FluxUploadService)
    private readonly uploadService: FluxUploadService,
  ) {}

  @Post('init')
  @ApiOperation({ summary: 'Initialize a multipart upload session.' })
  @ApiBody({ type: InitUploadDto })
  @ApiResponse({ status: 201, description: 'Upload session created.' })
  public async initUpload(
    @Req() request: AuthenticatedRequest,
    @Body() dto: InitUploadDto,
  ): Promise<InitUploadResponse> {
    return this.uploadService.initUpload(getOwnerId(request), dto);
  }

  @Post(':uploadId/parts/sign')
  @ApiOperation({ summary: 'Sign one or more upload part URLs.' })
  @ApiBody({ type: SignPartsDto })
  @ApiResponse({ status: 201, description: 'Pre-signed URLs returned.' })
  public async signParts(
    @Req() request: AuthenticatedRequest,
    @Param('uploadId', new ParseUUIDPipe({ version: '4' })) uploadId: string,
    @Body() dto: SignPartsDto,
  ): Promise<SignPartsResponse> {
    return this.uploadService.signParts(getOwnerId(request), uploadId, dto);
  }

  @Post(':uploadId/parts/commit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Commit uploaded part metadata (ETags) to DB.' })
  @ApiBody({ type: CommitPartsDto })
  @ApiResponse({ status: 204, description: 'Committed.' })
  public async commitParts(
    @Req() request: AuthenticatedRequest,
    @Param('uploadId', new ParseUUIDPipe({ version: '4' })) uploadId: string,
    @Body() dto: CommitPartsDto,
  ): Promise<void> {
    await this.uploadService.commitParts(getOwnerId(request), uploadId, dto);
  }

  @Get(':uploadId/status')
  @ApiOperation({ summary: 'Retrieve upload session status and uploaded parts.' })
  @ApiResponse({ status: 200, description: 'Status returned.' })
  public async getStatus(
    @Req() request: AuthenticatedRequest,
    @Param('uploadId', new ParseUUIDPipe({ version: '4' })) uploadId: string,
  ): Promise<UploadStatusResponse> {
    return this.uploadService.getStatus(getOwnerId(request), uploadId);
  }

  @Post(':uploadId/complete')
  @ApiOperation({ summary: 'Complete the multipart upload.' })
  @ApiBody({ type: CompleteUploadDto })
  @ApiResponse({ status: 201, description: 'Upload completed.' })
  public async completeUpload(
    @Req() request: AuthenticatedRequest,
    @Param('uploadId', new ParseUUIDPipe({ version: '4' })) uploadId: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<CompleteUploadResponse> {
    return this.uploadService.completeUpload(getOwnerId(request), uploadId, dto);
  }

  @Post(':uploadId/abort')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Abort the multipart upload.' })
  @ApiResponse({ status: 204, description: 'Upload aborted.' })
  public async abortUpload(
    @Req() request: AuthenticatedRequest,
    @Param('uploadId', new ParseUUIDPipe({ version: '4' })) uploadId: string,
  ): Promise<void> {
    await this.uploadService.abortUpload(getOwnerId(request), uploadId);
  }
}

function getOwnerId(request: AuthenticatedRequest): string {
  const ownerId = request.user?.ownerId;
  if (!ownerId) {
    throw new UnauthorizedException('Missing authenticated user context.');
  }

  return ownerId;
}
