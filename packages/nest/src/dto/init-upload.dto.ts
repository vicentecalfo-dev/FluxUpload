import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class InitUploadDto {
  @ApiProperty({ example: 'video.mp4' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  public fileName!: string;

  @ApiProperty({ example: 10485760 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public fileSize!: number;

  @ApiProperty({ example: 'video/mp4' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  public contentType!: string;

  @ApiProperty({ example: 1730228400000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  public lastModified!: number;

  @ApiPropertyOptional({ example: 16777216 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public chunkSize?: number;

  @ApiPropertyOptional({ example: 'tenant-a/invoices' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public prefix?: string;
}
