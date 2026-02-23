import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CommitPartDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public partNumber!: number;

  @ApiProperty({ example: '9f620878e06d28774406017480a59fd4' })
  @IsString()
  @MaxLength(255)
  public etag!: string;

  @ApiProperty({ required: false, example: 1048576 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  public size?: number;
}

export class CommitPartsDto {
  @ApiProperty({ type: [CommitPartDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CommitPartDto)
  public parts!: CommitPartDto[];
}
