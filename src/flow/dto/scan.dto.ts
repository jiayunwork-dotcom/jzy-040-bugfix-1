import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BaseParamsDto } from './calc.dto';

/** One point of a radius scan: only the radius varies per point. */
export class RadiusScanPointDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  radius!: number;
}

/** One point of a target-flow scan: only the target flow varies per point. */
export class FlowScanPointDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  targetFlowRate!: number;
}

/** Sweep radii at a fixed pressure drop (the Q ∝ R⁴ curve). */
export class RadiusScanDto extends BaseParamsDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  pressureDrop!: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'points must contain at least one entry' })
  @ValidateNested({ each: true })
  @Type(() => RadiusScanPointDto)
  points!: RadiusScanPointDto[];
}

/** Sweep target flow rates through one fixed geometry/fluid. */
export class FlowScanDto extends BaseParamsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'points must contain at least one entry' })
  @ValidateNested({ each: true })
  @Type(() => FlowScanPointDto)
  points!: FlowScanPointDto[];
}
