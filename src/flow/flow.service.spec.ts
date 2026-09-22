import { FlowService } from './flow.service';
import { ParamsResolver } from './params.resolver';
import { SpecsService } from '../specs/specs.service';
import { PoiseuilleService } from '../kernel/poiseuille.service';
import { InverseService } from '../kernel/inverse.service';
import { ReynoldsService } from '../kernel/reynolds.service';
import { ShearService } from '../kernel/shear.service';
import { ErrorCode } from '../kernel/error-codes';

function createService(): { flow: FlowService; specs: SpecsService } {
  const specs = new SpecsService();
  const resolver = new ParamsResolver(specs);
  const re = new ReynoldsService();
  const sh = new ShearService();
  const flow = new FlowService(
    resolver,
    new PoiseuilleService(re, sh),
    new InverseService(re, sh),
  );
  return { flow, specs };
}

const inline = {
  radius: 0.001,
  length: 1,
  viscosity: 0.001,
  density: 1000,
};

describe('FlowService', () => {
  it('resolves a registered spec by name', () => {
    const { flow, specs } = createService();
    specs.register('chip', inline);
    const byName = flow.forward({ specName: 'chip', pressureDrop: 500 });
    const inlineResult = flow.forward({ ...inline, pressureDrop: 500 });
    expect(byName).toEqual(inlineResult);
  });

  it('rejects unknown spec names', () => {
    const { flow } = createService();
    try {
      flow.forward({ specName: 'missing', pressureDrop: 1 });
      fail('expected unknown_spec');
    } catch (e) {
      expect((e as { code: ErrorCode }).code).toBe(ErrorCode.UNKNOWN_SPEC);
    }
  });

  it('requires either specName or the full inline set', () => {
    const { flow } = createService();
    try {
      // radius present but the rest missing
      flow.forward({ radius: 0.001, pressureDrop: 1 } as never);
      fail('expected missing_params');
    } catch (e) {
      expect((e as { code: ErrorCode }).code).toBe(ErrorCode.MISSING_PARAMS);
    }
  });

  it('radius scan: single point and scan share one kernel (identical values)', () => {
    const { flow } = createService();
    const radii = [0.0008, 0.001, 0.0015];
    const scan = flow.radiusScan({
      ...inline,
      pressureDrop: 800,
      points: radii.map((radius) => ({ radius })),
    });
    expect(scan.okCount).toBe(3);
    expect(scan.errorCount).toBe(0);

    radii.forEach((radius, i) => {
      const single = flow.forward({ ...inline, radius, pressureDrop: 800 });
      expect(scan.results[i].status).toBe('ok');
      const point = scan.results[i];
      if (point.status === 'ok') {
        expect(point.result).toEqual(single);
      }
    });
  });

  it('radius scan traces the R^4 curve (16x at doubled R)', () => {
    const { flow } = createService();
    const scan = flow.radiusScan({
      ...inline,
      pressureDrop: 800,
      points: [{ radius: 0.001 }, { radius: 0.002 }],
    });
    const [a, b] = scan.results;
    if (
      a.status === 'ok' &&
      b.status === 'ok' &&
      'flowRate' in a.result &&
      'flowRate' in b.result
    ) {
      expect(
        (b.result.flowRate / a.result.flowRate),
      ).toBeCloseTo(16, 10);
    } else {
      fail('both scan points expected ok');
    }
  });

  it('isolates invalid / not_laminar scan points without killing the sweep', () => {
    const { flow } = createService();
    const scan = flow.radiusScan({
      ...inline,
      pressureDrop: 1000,
      points: [
        { radius: 0.001 }, // ok (Re = 250)
        { radius: -0.001 }, // invalid_radius
        { radius: 0.01 }, // not_laminar (Re huge)
        { radius: 0.0012 }, // ok
      ],
    });
    expect(scan.count).toBe(4);
    expect(scan.okCount).toBe(2);
    expect(scan.errorCount).toBe(2);
    expect(scan.results[0].status).toBe('ok');
    expect(scan.results[1].status).toBe('error');
    if (scan.results[1].status === 'error') {
      expect(scan.results[1].error.code).toBe(ErrorCode.INVALID_RADIUS);
    }
    expect(scan.results[2].status).toBe('error');
    if (scan.results[2].status === 'error') {
      expect(scan.results[2].error.code).toBe(ErrorCode.NOT_LAMINAR);
    }
    expect(scan.results[3].status).toBe('ok');
  });

  it('flow scan: inverse sweep matches single inverse calls and round-trips', () => {
    const { flow } = createService();
    const targets = [1e-8, 5e-8, 2e-7];
    const scan = flow.flowScan({
      ...inline,
      points: targets.map((targetFlowRate) => ({ targetFlowRate })),
    });
    expect(scan.okCount).toBe(3);

    targets.forEach((targetFlowRate, i) => {
      const single = flow.inverse({ ...inline, targetFlowRate });
      const point = scan.results[i];
      if (point.status === 'ok') {
        expect(point.result).toEqual(single);
      } else {
        fail('point should be ok');
      }
      // Cross-check against the forward single point.
      if (point.status === 'ok') {
        const fwd = flow.forward({
          ...inline,
          pressureDrop: single.pressureDrop,
        });
        expect(fwd.flowRate).toBeCloseTo(targetFlowRate, 12);
      }
    });
  });

  it('flow scan isolates a non-positive target point', () => {
    const { flow } = createService();
    const scan = flow.flowScan({
      ...inline,
      points: [{ targetFlowRate: 1e-8 }, { targetFlowRate: 0 }, { targetFlowRate: -1 }],
    });
    expect(scan.okCount).toBe(1);
    expect(scan.errorCount).toBe(2);
    if (scan.results[1].status === 'error') {
      expect(scan.results[1].error.code).toBe(
        ErrorCode.INVALID_TARGET_FLOW,
      );
    }
  });

  it('a radius scan with bad shared pressure drop fails before sweeping', () => {
    const { flow } = createService();
    expect(() =>
      flow.radiusScan({
        ...inline,
        pressureDrop: -5,
        points: [{ radius: 0.001 }],
      }),
    ).toThrow();
  });
});
