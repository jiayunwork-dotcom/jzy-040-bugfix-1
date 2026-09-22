import { InverseService } from './inverse.service';
import { PoiseuilleService } from './poiseuille.service';
import { ReynoldsService } from './reynolds.service';
import { ShearService } from './shear.service';
import { FlowException } from './flow.exception';
import { ErrorCode } from './error-codes';

describe('InverseService (pressure-drop inversion)', () => {
  let inverse: InverseService;
  let forward: PoiseuilleService;

  const params = {
    radius: 0.001,
    length: 1,
    viscosity: 0.001,
    density: 1000,
  };

  beforeEach(() => {
    const re = new ReynoldsService();
    const sh = new ShearService();
    inverse = new InverseService(re, sh);
    forward = new PoiseuilleService(re, sh);
  });

  it('solves Δp = 8 μ L Q / (π R⁴)', () => {
    const q = 3e-7;
    const r = inverse.solve({ ...params, targetFlowRate: q });
    const expectedDp =
      (8 * params.viscosity * params.length * q) /
      (Math.PI * params.radius ** 4);
    expect(r.pressureDrop).toBeCloseTo(expectedDp, 18);
    expect(r.targetFlowRate).toBe(q);
    expect(r.regime).toBe('laminar');
  });

  it('round-trips exactly: forward(inverse(Q)) recovers Q', () => {
    for (const q of [1e-9, 3.5e-7, 2e-6]) {
      const solved = inverse.solve({ ...params, targetFlowRate: q });
      const back = forward.evaluate({
        ...params,
        pressureDrop: solved.pressureDrop,
      });
      expect(back.flowRate).toBeCloseTo(q, 12);
      // Relative error is at floating-point round-off level.
      expect(Math.abs(back.flowRate - q) / q).toBeLessThan(1e-12);
    }
  });

  it('agrees with the forward path on velocities, Re and shear', () => {
    const q = 3e-7;
    const solved = inverse.solve({ ...params, targetFlowRate: q });
    const back = forward.evaluate({
      ...params,
      pressureDrop: solved.pressureDrop,
    });
    expect(solved.meanVelocity).toBeCloseTo(back.meanVelocity, 14);
    expect(solved.maxVelocity).toBeCloseTo(back.maxVelocity, 14);
    expect(solved.reynoldsNumber).toBeCloseTo(back.reynoldsNumber, 12);
    expect(solved.wallShearStress).toBeCloseTo(back.wallShearStress, 14);
  });

  it('rejects non-positive target flow', () => {
    for (const q of [0, -1e-9, NaN]) {
      try {
        inverse.solve({ ...params, targetFlowRate: q });
        fail(`expected throw for q=${q}`);
      } catch (e) {
        expect(e).toBeInstanceOf(FlowException);
        expect((e as FlowException).code).toBe(
          ErrorCode.INVALID_TARGET_FLOW,
        );
      }
    }
  });

  it('rejects invalid geometry/fluid before solving', () => {
    try {
      inverse.solve({ ...params, radius: 0, targetFlowRate: 1e-8 });
      fail('expected throw');
    } catch (e) {
      expect((e as FlowException).code).toBe(ErrorCode.INVALID_RADIUS);
    }
  });

  it('refuses a target flow that would force Re >= 2300', () => {
    // big pipe + water: a 1e-4 m³/s target is turbulent
    try {
      inverse.solve({
        radius: 0.01,
        length: 1,
        viscosity: 0.001,
        density: 1000,
        targetFlowRate: 1e-4,
      });
      fail('expected not_laminar');
    } catch (e) {
      expect(e).toBeInstanceOf(FlowException);
      expect((e as FlowException).code).toBe(ErrorCode.NOT_LAMINAR);
    }
  });

  it('does not hand back a pressure drop for an unattainable target', () => {
    // Find the boundary target flow and ensure anything >= it is refused;
    // the last laminar target is accepted and round-trips.
    const radius = 0.005;
    const length = 2;
    const viscosity = 0.002;
    const density = 900;
    // Re = v D rho/mu with v = Q/(pi R^2)
    const qAtLimit =
      (2300 * viscosity * Math.PI * radius ** 2) /
      (2 * radius * density);
    expect(() =>
      inverse.solve({
        radius,
        length,
        viscosity,
        density,
        targetFlowRate: qAtLimit,
      }),
    ).toThrow(FlowException);

    const ok = inverse.solve({
      radius,
      length,
      viscosity,
      density,
      targetFlowRate: qAtLimit * 0.9,
    });
    const back = forward.evaluate({
      radius,
      length,
      viscosity,
      density,
      pressureDrop: ok.pressureDrop,
    });
    expect(back.flowRate).toBeCloseTo(qAtLimit * 0.9, 12);
    expect(back.reynoldsNumber).toBeLessThan(2300);
  });
});
