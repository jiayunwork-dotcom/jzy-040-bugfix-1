import { IsNumber, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for POST /specs. Only structural checks live here (must be a number /
 * string). Positivity is enforced by the domain layer so every call site
 * reports the same structured code (invalid_radius, invalid_length, …).
 */
export class RegisterSpecDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  radius!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  length!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  viscosity!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  density!: number;
}
