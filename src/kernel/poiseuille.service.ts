import { Injectable } from '@nestjs/common';
import {
  ForwardResult,
  FluidParams,
  GeometryParams,
  PhysicsParams,
} from './types';
import {
  assertNonNegativePressureDrop,
  assertPositive,
  FlowException,
} from './flow.exception';
import { ErrorCode } from './error-codes';
import {
  LAMINAR_REYNOLDS_LIMIT,
  ReynoldsService,
} from './reynolds.service';
import { ShearService } from './shear.service';

/**
 * Forward Hagen-Poiseuille kernel (circular straight pipe, steady, laminar,
 * Newtonian, incompressible).
 *
 *   Q     = π R⁴ Δp / (8 μ L)        (radius to the FOURTH power)
 *   v̄    = Q / (π R²) = R² Δp / (8 μ L)
 *   v_max = 2 v̄
 *   τ_w   = R Δp / (2L)              (viscosity-independent)
 *   Re    = v̄ · 2R · ρ / μ
 *
 * Both the single-point and scan HTTP paths run through {@link evaluate}:
 * there is exactly one flow-calculation implementation.
 */
@Injectable()
export class PoiseuilleService {
  constructor(
    private readonly reynolds: ReynoldsService,
    private readonly shear: ShearService,
  ) {}

  /** Validate all inputs; called before any arithmetic. */
  validate(
    geometry: GeometryParams,
    fluid: FluidParams,
    pressureDrop: number,
  ): void {
    assertPositive(geometry.radius, ErrorCode.INVALID_RADIUS, 'radius');
    assertPositive(geometry.length, ErrorCode.INVALID_LENGTH, 'length');
    assertPositive(fluid.viscosity, ErrorCode.INVALID_VISCOSITY, 'viscosity');
    assertPositive(fluid.density, ErrorCode.INVALID_DENSITY, 'density');
    assertNonNegativePressureDrop(pressureDrop);
  }

  /**
   * Evaluate one operating point.
   *
   * @throws {FlowException} not_laminar when Re >= 2300
   *         (Δp = 0 is a legal, exactly-zero-flow laminar point).
   */
  evaluate(params: PhysicsParams & { pressureDrop: number }): ForwardResult {
    const { radius, length, viscosity, density, pressureDrop } = params;
    this.validate({ radius, length }, { viscosity, density }, pressureDrop);

    // Q = π R⁴ Δp / (8 μ L)
    const flowRate =
      (Math.PI * radius ** 4 * pressureDrop) / (8 * viscosity * length);
    // v̄ = Q / (π R²)
    const meanVelocity = flowRate / (Math.PI * radius ** 2);
    const maxVelocity = 2 * meanVelocity;
    const reynoldsNumber = this.reynolds.compute(
      meanVelocity,
      { radius, length },
      { viscosity, density },
    );
    const wallShearStress = this.shear.compute(
      { radius, length },
      pressureDrop,
    );

    if (!this.reynolds.isLaminar(reynoldsNumber)) {
      throw new FlowException(
        ErrorCode.NOT_LAMINAR,
        `Reynolds number ${reynoldsNumber.toExponential(3)} reaches the ` +
          `laminar limit (Re >= ${LAMINAR_REYNOLDS_LIMIT}); the laminar ` +
          'Hagen-Poiseuille formula does not apply to this operating point.',
        {
          reynoldsNumber,
          threshold: LAMINAR_REYNOLDS_LIMIT,
        },
      );
    }

    return {
      flowRate,
      meanVelocity,
      maxVelocity,
      reynoldsNumber,
      wallShearStress,
      regime: 'laminar',
    };
  }
}
