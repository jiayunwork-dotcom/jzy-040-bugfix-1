import { PoiseuilleService } from './poiseuille.service';
import { ReynoldsService } from './reynolds.service';
import { ShearService } from './shear.service';
import { FlowException } from './flow.exception';
import { ErrorCode } from './error-codes';

describe('PoiseuilleService (forward kernel)', () => {
  let service: PoiseuilleService;

  const base = {
    radius: 0.001, // 1 mm
    length: 1,
    viscosity: 0.001, // water-like
    density: 1000,
  };

  beforeEach(() => {
    service = new PoiseuilleService(new ReynoldsService(), new ShearService());
  });

  it('matches the analytical values on a reference point', () => {
    // Q = π * (1e-3)^4 * 1000 / (8 * 1e-3 * 1)
    const expectedQ = (Math.PI * 1e-12 * 1000) / (8 * 0.001);
    const r = service.evaluate({ ...base, pressureDrop: 1000 });
    expect(r.flowRate).toBeCloseTo(expectedQ, 20);
    expect(r.meanVelocity).toBeCloseTo(expectedQ / (Math.PI * 1e-6), 15);
    expect(r.maxVelocity).toBeCloseTo(2 * r.meanVelocity, 15);
    expect(r.reynoldsNumber).toBeCloseTo(
      (r.meanVelocity * 0.002 * 1000) / 0.001,
      10,
    );
    expect(r.wallShearStress).toBeCloseTo((0.001 * 1000) / 2, 15);
    expect(r.regime).toBe('laminar');
  });

  it('scales Q as R^4: doubling radius gives exactly 16x flow (not 4x)', () => {
    const r1 = service.evaluate({ ...base, pressureDrop: 1000 });
    const r2 = service.evaluate({ ...base, radius: 0.002, pressureDrop: 1000 });
    expect(r2.flowRate / r1.flowRate).toBeCloseTo(16, 10);
    // Guard against the classic R^2 mistake: 4x must be rejected.
    expect(r2.flowRate / r1.flowRate).not.toBeCloseTo(4, 5);
  });

  it('halves the flow when viscosity doubles', () => {
    const r1 = service.evaluate({ ...base, pressureDrop: 1000 });
    const r2 = service.evaluate({
      ...base,
      viscosity: 0.002,
      pressureDrop: 1000,
    });
    expect(r2.flowRate).toBeCloseTo(r1.flowRate / 2, 18);
  });

  it('returns exactly zero flow, velocities, shear at zero pressure drop', () => {
    const r = service.evaluate({ ...base, pressureDrop: 0 });
    expect(r.flowRate).toBe(0);
    expect(r.meanVelocity).toBe(0);
    expect(r.maxVelocity).toBe(0);
    expect(r.wallShearStress).toBe(0);
    expect(r.reynoldsNumber).toBe(0);
    expect(r.regime).toBe('laminar');
  });

  it('keeps wall shear stress unchanged when viscosity changes', () => {
    const r1 = service.evaluate({ ...base, pressureDrop: 500 });
    const r2 = service.evaluate({
      ...base,
      viscosity: 0.05,
      pressureDrop: 500,
    });
    expect(r2.wallShearStress).toBe(r1.wallShearStress);
    expect(r1.wallShearStress).toBeCloseTo(0.25, 15);
  });

  it('scales Q linearly with pressure drop and inversely with length', () => {
    const r1 = service.evaluate({ ...base, pressureDrop: 100 });
    const r2 = service.evaluate({ ...base, pressureDrop: 700 });
    expect(r2.flowRate / r1.flowRate).toBeCloseTo(7, 10);

    const r3 = service.evaluate({ ...base, length: 2, pressureDrop: 100 });
    expect(r3.flowRate).toBeCloseTo(r1.flowRate / 2, 18);
  });

  it('rejects non-positive radius / length / viscosity with distinct codes', () => {
    expect(() => service.evaluate({ ...base, radius: 0, pressureDrop: 1 })).toThrow(
      FlowException,
    );
    try {
      service.evaluate({ ...base, radius: -3, pressureDrop: 1 });
      fail('expected throw');
    } catch (e) {
      expect((e as FlowException).code).toBe(ErrorCode.INVALID_RADIUS);
    }
    try {
      service.evaluate({ ...base, length: 0, pressureDrop: 1 });
      fail('expected throw');
    } catch (e) {
      expect((e as FlowException).code).toBe(ErrorCode.INVALID_LENGTH);
    }
    try {
      service.evaluate({ ...base, viscosity: -1, pressureDrop: 1 });
      fail('expected throw');
    } catch (e) {
      expect((e as FlowException).code).toBe(ErrorCode.INVALID_VISCOSITY);
    }
    try {
      service.evaluate({ ...base, density: 0, pressureDrop: 1 });
      fail('expected throw');
    } catch (e) {
      expect((e as FlowException).code).toBe(ErrorCode.INVALID_DENSITY);
    }
  });

  it('rejects NaN / Infinity inputs', () => {
    expect(() =>
      service.evaluate({ ...base, radius: NaN, pressureDrop: 1 }),
    ).toThrow(FlowException);
    expect(() =>
      service.evaluate({ ...base, radius: Infinity, pressureDrop: 1 }),
    ).toThrow(FlowException);
  });

  it('rejects negative pressure drop (no backflow modeling)', () => {
    try {
      service.evaluate({ ...base, pressureDrop: -0.01 });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FlowException);
      expect((e as FlowException).code).toBe(
        ErrorCode.INVALID_PRESSURE_DROP,
      );
    }
  });

  it('refuses to compute a point at/above Re = 2300 with not_laminar', () => {
    // Water-like fluid, large radius/pressure crossing the threshold.
    const turbulent = {
      radius: 0.01,
      length: 1,
      viscosity: 0.001,
      density: 1000,
      pressureDrop: 100,
    };
    try {
      service.evaluate(turbulent);
      fail('expected not_laminar');
    } catch (e) {
      expect(e).toBeInstanceOf(FlowException);
      expect((e as FlowException).code).toBe(ErrorCode.NOT_LAMINAR);
      expect((e as FlowException).details?.reynoldsNumber as number).toBeGreaterThanOrEqual(
        2300,
      );
    }
  });

  it('accepts the boundary strictly below 2300 and rejects exactly 2300', () => {
    // Choose a radius that lands Re essentially on 2300.
    // v = R^2 dp/(8 mu L); Re = v*2R*rho/mu = R^3 dp rho /(4 mu^2 L)
    const mu = 0.001;
    const rho = 1000;
    const L = 1;
    const dp = 100;
    // R for Re 2300:
    const rLimit = (2300 * 4 * mu * mu * L / (dp * rho)) ** (1 / 3);
    expect(() =>
      service.evaluate({
        radius: rLimit * 1.000001,
        length: L,
        viscosity: mu,
        density: rho,
        pressureDrop: dp,
      }),
    ).toThrow(FlowException);

    // Slightly below is fine.
    const ok = service.evaluate({
      radius: rLimit * 0.9,
      length: L,
      viscosity: mu,
      density: rho,
      pressureDrop: dp,
    });
    expect(ok.reynoldsNumber).toBeLessThan(2300);
  });
});
