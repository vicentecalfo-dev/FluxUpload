import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CompletePartDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public partNumber!: number;

  @ApiProperty({ example: '9f620878e06d28774406017480a59fd4' })
  @IsString()
  @MaxLength(255)
  public etag!: string;
}

export class CompleteUploadDto {
  @ApiPropertyOptional({ type: [CompletePartDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompletePartDto)
  public parts?: CompletePartDto[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  public useCommittedParts?: boolean;
}
