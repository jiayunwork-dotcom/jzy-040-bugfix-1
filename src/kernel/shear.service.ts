import { Injectable } from '@nestjs/common';
import { GeometryParams } from './types';

/**
 * Wall shear-stress computation, kept in its own module.
 *
 * τ_w = R · Δp / (2L)
 *
 * Only radius, pressure drop and length enter here: the wall shear stress is
 * intentionally independent of viscosity.
 */
@Injectable()
export class ShearService {
  compute(geometry: GeometryParams, pressureDrop: number): number {
    return (geometry.radius * pressureDrop) / (2 * geometry.length);
  }
}
