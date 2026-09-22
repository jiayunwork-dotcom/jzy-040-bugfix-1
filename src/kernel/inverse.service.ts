import { Injectable } from '@nestjs/common';
import {
  FluidParams,
  GeometryParams,
  InverseResult,
  PhysicsParams,
} from './types';
import {
  assertPositive,
  assertPositiveTargetFlow,
  FlowException,
} from './flow.exception';
import { ErrorCode } from './error-codes';
import {
  LAMINAR_REYNOLDS_LIMIT,
  ReynoldsService,
} from './reynolds.service';
import { ShearService } from './shear.service';

/**
 * Inverse Hagen-Poiseuille kernel: given a target volume flow rate Q, solve
 * for the driving pressure drop
 *
 *   Δp = 8 μ L Q / (π R⁴)
 *
 * The inverse is a first-class path with the same validation and Reynolds
 * gating as the forward path. The solved Δp reproduces the target Q when fed
 * back through {@link PoiseuilleService} (the inverse is algebraically exact).
 */
@Injectable()
export class InverseService {
  constructor(
    private readonly reynolds: ReynoldsService,
    private readonly shear: ShearService,
  ) {}

  /** Validate geometry, fluid and target flow before any arithmetic. */
  validate(
    geometry: GeometryParams,
    fluid: FluidParams,
    targetFlowRate: number,
  ): void {
    assertPositive(geometry.radius, ErrorCode.INVALID_RADIUS, 'radius');
    assertPositive(geometry.length, ErrorCode.INVALID_LENGTH, 'length');
    assertPositive(fluid.viscosity, ErrorCode.INVALID_VISCOSITY, 'viscosity');
    assertPositive(fluid.density, ErrorCode.INVALID_DENSITY, 'density');
    assertPositiveTargetFlow(targetFlowRate);
  }

  /**
   * Solve one inverse operating point.
   *
   * @throws {FlowException} not_laminar when reaching Q already pushes
   *         Re >= 2300 — such a target is unattainable in the laminar regime.
   */
  solve(params: PhysicsParams & { targetFlowRate: number }): InverseResult {
    const { radius, length, viscosity, density, targetFlowRate } = params;
    this.validate(
      { radius, length },
      { viscosity, density },
      targetFlowRate,
    );

    // v̄ = Q / (π R²); gate on Re before returning a pressure drop.
    const diameter = 2 * radius;
    const meanVelocity = targetFlowRate / (Math.PI * diameter ** 2);
    const maxVelocity = 2 * meanVelocity;
    const reynoldsNumber = this.reynolds.compute(
      meanVelocity,
      { radius, length },
      { viscosity, density },
    );

    if (!this.reynolds.isLaminar(reynoldsNumber)) {
      throw new FlowException(
        ErrorCode.NOT_LAMINAR,
        `Target flow rate ${targetFlowRate.toExponential(3)} m³/s implies ` +
          `Re ${reynoldsNumber.toExponential(3)} (>= ${LAMINAR_REYNOLDS_LIMIT}); ` +
          'this target is unattainable in the laminar regime.',
        {
          reynoldsNumber,
          threshold: LAMINAR_REYNOLDS_LIMIT,
          targetFlowRate,
        },
      );
    }

    // Δp = 8 μ L Q / (π R⁴)
    const pressureDrop =
      (8 * viscosity * length * targetFlowRate) /
      (Math.PI * radius ** 4);

    return {
      pressureDrop,
      targetFlowRate,
      meanVelocity,
      maxVelocity,
      reynoldsNumber,
      wallShearStress: this.shear.compute({ radius, length }, pressureDrop),
      regime: 'laminar',
    };
  }
}
