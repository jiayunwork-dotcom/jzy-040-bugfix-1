import { Injectable } from '@nestjs/common';
import { FluidParams, GeometryParams, PhysicsParams } from '../kernel/types';
import { FlowException } from '../kernel/flow.exception';
import { ErrorCode } from '../kernel/error-codes';
import { SpecsService } from '../specs/specs.service';

/** Geometry/fluid as carried by a request: spec reference or inline values. */
export interface ParamsRef {
  specName?: string;
  radius?: number;
  length?: number;
  viscosity?: number;
  density?: number;
}

/**
 * Resolves a request's geometry/fluid bundle:
 *  - with `specName`, look the registered spec up (unknown → unknown_spec);
 *  - otherwise the full inline set must be present (missing → missing_params).
 *
 * Semantic positivity validation is deliberately left to the kernel so the
 * same structured codes fire for single points and scans.
 */
@Injectable()
export class ParamsResolver {
  constructor(private readonly specs: SpecsService) {}

  resolve(ref: ParamsRef): PhysicsParams {
    if (ref.specName !== undefined && ref.specName !== null) {
      const spec = this.specs.get(ref.specName);
      return {
        radius: spec.radius,
        length: spec.length,
        viscosity: spec.viscosity,
        density: spec.density,
      };
    }

    const { radius, length, viscosity, density } = ref;
    const missing: string[] = [];
    (
      [
        ['radius', radius],
        ['length', length],
        ['viscosity', viscosity],
        ['density', density],
      ] as Array<[string, number | undefined]>
    ).forEach(([key, value]) => {
      if (typeof value !== 'number') missing.push(key);
    });

    if (missing.length > 0) {
      throw new FlowException(
        ErrorCode.MISSING_PARAMS,
        'Provide specName or all of: radius, length, viscosity, density.',
        { missing: missing.join(',') },
      );
    }

    return {
      radius: radius as number,
      length: length as number,
      viscosity: viscosity as number,
      density: density as number,
    };
  }
}

export type { GeometryParams, FluidParams };
