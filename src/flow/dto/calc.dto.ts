import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Geometry/fluid may be provided either by referencing a registered spec
 * (`specName`) or inline. Type-level checks live here; semantic checks
 * (positivity, unknown names, spec-vs-inline completeness) live in the
 * domain layer so every path reports the same structured error codes.
 */
export abstract class BaseParamsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  specName?: string;

  @IsOptional()
  @ValidateIf((o) => o.specName === undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  radius?: number;

  @IsOptional()
  @ValidateIf((o) => o.specName === undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  length?: number;

  @IsOptional()
  @ValidateIf((o) => o.specName === undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  viscosity?: number;

  @IsOptional()
  @ValidateIf((o) => o.specName === undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  density?: number;
}

/** Forward request: geometry/fluid plus a non-negative pressure drop. */
export class ForwardDto extends BaseParamsDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  pressureDrop!: number;
}

/** Inverse request: geometry/fluid plus a strictly positive target flow. */
export class InverseDto extends BaseParamsDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  targetFlowRate!: number;
}
