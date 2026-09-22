import { Injectable } from '@nestjs/common';
import { FluidParams, GeometryParams } from './types';

/** Reynolds number at which the laminar assumption is rejected. */
export const LAMINAR_REYNOLDS_LIMIT = 2300;

/**
 * Reynolds-number computation, kept in its own module.
 *
 * Re = v̄ · D · ρ / μ with D = 2R (mean velocity, pipe diameter).
 */
@Injectable()
export class ReynoldsService {
  /** Reynolds number for a mean velocity through a given geometry/fluid. */
  compute(
    meanVelocity: number,
    geometry: GeometryParams,
    fluid: FluidParams,
  ): number {
    const diameter = 2 * geometry.radius;
    return (meanVelocity * diameter * fluid.density) / fluid.viscosity;
  }

  /** True while strictly below the laminar threshold (Re < 2300). */
  isLaminar(reynoldsNumber: number): boolean {
    return reynoldsNumber < LAMINAR_REYNOLDS_LIMIT;
  }
}
