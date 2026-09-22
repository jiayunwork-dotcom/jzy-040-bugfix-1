import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/global-exception.filter';
import { DEMO_SPEC_NAME } from '../src/specs/spec-seeder.service';

describe('Poiseuille HTTP API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let agent: ReturnType<typeof request>;

  const inline = {
    radius: 0.001,
    length: 1,
    viscosity: 0.001,
    density: 1000,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    // Listen on an ephemeral port and point supertest at the URL. Passing the
    // app object directly makes supertest spin up its own implicit server,
    // which resets connections under concurrent requests.
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    agent = request(baseUrl);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('meta', () => {
    it('GET /v1/health reports ok and the laminar threshold', async () => {
      const res = await agent.get('/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.laminarReynoldsLimit).toBe(2300);
    });

    it('unknown route returns structured route_not_found', async () => {
      const res = await agent.get('/v1/no-such-thing').expect(404);
      expect(res.body.error.code).toBe('route_not_found');
    });

    it('seeds a clearly laminar demo spec at startup', async () => {
      const res = await agent.get('/v1/specs').expect(200);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
      expect(res.body.specs.map((s: { name: string }) => s.name)).toContain(
        DEMO_SPEC_NAME,
      );
    });
  });

  describe('forward', () => {
    it('computes a laminar point inline', async () => {
      const res = await agent
        .post('/v1/flow/forward')
        .send({ ...inline, pressureDrop: 1000 })
        .expect(200);
      expect(res.body.flowRate).toBeCloseTo(3.9269908169872414e-7, 18);
      expect(res.body.maxVelocity).toBeCloseTo(2 * res.body.meanVelocity, 14);
      expect(res.body.reynoldsNumber).toBeCloseTo(250, 8);
      expect(res.body.wallShearStress).toBeCloseTo(0.5, 12);
      expect(res.body.regime).toBe('laminar');
    });

    it('doubling radius multiplies flow by 16, viscosity doubling halves it', async () => {
      const a = await agent
        .post('/v1/flow/forward')
        .send({ ...inline, pressureDrop: 1000 })
        .expect(200);
      const doubled = await agent
        .post('/v1/flow/forward')
        .send({ ...inline, radius: 0.002, pressureDrop: 1000 })
        .expect(200);
      expect(doubled.body.flowRate / a.body.flowRate).toBeCloseTo(16, 9);

      const viscous = await agent
        .post('/v1/flow/forward')
        .send({ ...inline, viscosity: 0.002, pressureDrop: 1000 })
        .expect(200);
      expect(viscous.body.flowRate).toBeCloseTo(a.body.flowRate / 2, 15);
      // shear ignores viscosity
      expect(viscous.body.wallShearStress).toBe(a.body.wallShearStress);
    });

    it('zero pressure drop is exactly zero flow', async () => {
      const res = await agent
        .post('/v1/flow/forward')
        .send({ ...inline, pressureDrop: 0 })
        .expect(200);
      expect(res.body.flowRate).toBe(0);
      expect(res.body.meanVelocity).toBe(0);
      expect(res.body.maxVelocity).toBe(0);
      expect(res.body.reynoldsNumber).toBe(0);
      expect(res.body.wallShearStress).toBe(0);
    });

    it.each([
      ['non-positive radius', { ...inline, radius: 0, pressureDrop: 100 }, 'invalid_radius'],
      ['negative length', { ...inline, length: -1, pressureDrop: 100 }, 'invalid_length'],
      ['zero viscosity', { ...inline, viscosity: 0, pressureDrop: 100 }, 'invalid_viscosity'],
      ['zero density', { ...inline, density: 0, pressureDrop: 100 }, 'invalid_density'],
      ['negative pressureDrop', { ...inline, pressureDrop: -1 }, 'invalid_pressure_drop'],
      ['NaN radius', { ...inline, radius: 'NaN', pressureDrop: 100 }, 'invalid_payload'],
      ['missing field', { radius: 0.001, pressureDrop: 100 }, 'missing_params'],
    ])('rejects %s with code %s', async (_label, body, code) => {
      const res = await agent
        .post('/v1/flow/forward')
        .send(body)
        .expect(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe(code);
      expect(res.body.error.message).toEqual(expect.any(String));
    });

    it('returns not_laminar (422) instead of a turbulent result', async () => {
      const res = await agent
        .post('/v1/flow/forward')
        .send({
          radius: 0.01,
          length: 1,
          viscosity: 0.001,
          density: 1000,
          pressureDrop: 100,
        })
        .expect(422);
      expect(res.body.error.code).toBe('not_laminar');
      expect(res.body.error.details.reynoldsNumber).toBeGreaterThanOrEqual(2300);
      expect(res.body).not.toHaveProperty('flowRate');
    });
  });

  describe('inverse', () => {
    it('round-trips: inverse Δp reproduces the target flow via forward', async () => {
      const target = 3e-7;
      const inv = await agent
        .post('/v1/flow/inverse')
        .send({ ...inline, targetFlowRate: target })
        .expect(200);
      expect(inv.body.pressureDrop).toBeGreaterThan(0);
      expect(inv.body.reynoldsNumber).toBeLessThan(2300);

      const fwd = await agent
        .post('/v1/flow/forward')
        .send({ ...inline, pressureDrop: inv.body.pressureDrop })
        .expect(200);
      expect(fwd.body.flowRate).toBeCloseTo(target, 12);
      expect(Math.abs(fwd.body.flowRate - target) / target).toBeLessThan(1e-12);
    });

    it('rejects non-positive target flow', async () => {
      const res = await agent
        .post('/v1/flow/inverse')
        .send({ ...inline, targetFlowRate: 0 })
        .expect(400);
      expect(res.body.error.code).toBe('invalid_target_flow');
    });

    it('refuses an unattainable (turbulent) target with not_laminar', async () => {
      const res = await agent
        .post('/v1/flow/inverse')
        .send({
          radius: 0.01,
          length: 1,
          viscosity: 0.001,
          density: 1000,
          targetFlowRate: 1e-4,
        })
        .expect(422);
      expect(res.body.error.code).toBe('not_laminar');
      expect(res.body).not.toHaveProperty('pressureDrop');
    });
  });

  describe('named specs', () => {
    it('registers a spec, computes by name, and refuses duplicate names', async () => {
      await agent
        .post('/v1/specs')
        .send({
          name: 'e2e-chip',
          radius: 0.0008,
          length: 0.02,
          viscosity: 0.003,
          density: 950,
        })
        .expect(201);

      const byName = await agent
        .post('/v1/flow/forward')
        .send({ specName: 'e2e-chip', pressureDrop: 250 })
        .expect(200);
      const inlineRes = await agent
        .post('/v1/flow/forward')
        .send({
          radius: 0.0008,
          length: 0.02,
          viscosity: 0.003,
          density: 950,
          pressureDrop: 250,
        })
        .expect(200);
      expect(byName.body).toEqual(inlineRes.body);

      const dup = await agent
        .post('/v1/specs')
        .send({
          name: 'e2e-chip',
          radius: 0.0009,
          length: 0.02,
          viscosity: 0.003,
          density: 950,
        })
        .expect(409);
      expect(dup.body.error.code).toBe('spec_exists');
    });

    it('rejects an unknown spec name on calculation', async () => {
      const res = await agent
        .post('/v1/flow/forward')
        .send({ specName: 'unregistered', pressureDrop: 1 })
        .expect(404);
      expect(res.body.error.code).toBe('unknown_spec');
    });

    it('validates spec registration values with typed codes', async () => {
      const res = await agent
        .post('/v1/specs')
        .send({
          name: 'bad',
          radius: -1,
          length: 1,
          viscosity: 1,
          density: 1,
        })
        .expect(400);
      expect(res.body.error.code).toBe('invalid_radius');
    });

    it('rejects structurally malformed spec registration bodies', async () => {
      const res = await agent
        .post('/v1/specs')
        .send({ name: 'bad2', radius: 'wide', length: 1, viscosity: 1, density: 1 })
        .expect(400);
      expect(res.body.error.code).toBe('invalid_payload');
    });
  });

  describe('scans', () => {
    it('radius scan agrees with single-point calls and traces the 16x curve', async () => {
      const res = await agent
        .post('/v1/flow/scan/radius')
        .send({
          ...inline,
          pressureDrop: 800,
          points: [
            { radius: 0.001 },
            { radius: 0.002 },
            { radius: -1 },
            { radius: 0.01 },
          ],
        })
        .expect(200);
      expect(res.body.count).toBe(4);
      expect(res.body.okCount).toBe(2);
      expect(res.body.errorCount).toBe(2);

      const [r1, r2, bad, turbulent] = res.body.results;
      expect(r1.status).toBe('ok');
      expect(r2.status).toBe('ok');

      const single1 = await agent
        .post('/v1/flow/forward')
        .send({ ...inline, radius: 0.001, pressureDrop: 800 });
      const single2 = await agent
        .post('/v1/flow/forward')
        .send({ ...inline, radius: 0.002, pressureDrop: 800 });
      expect(r1.result).toEqual(single1.body);
      expect(r2.result).toEqual(single2.body);
      expect(r2.result.flowRate / r1.result.flowRate).toBeCloseTo(16, 9);

      expect(bad.status).toBe('error');
      expect(bad.error.code).toBe('invalid_radius');
      expect(turbulent.status).toBe('error');
      expect(turbulent.error.code).toBe('not_laminar');
    });

    it('flow scan agrees with single-point inverse calls', async () => {
      const targets = [1e-8, 4e-8];
      const res = await agent
        .post('/v1/flow/scan/flow')
        .send({
          ...inline,
          points: targets.map((t) => ({ targetFlowRate: t })),
        })
        .expect(200);
      expect(res.body.okCount).toBe(2);

      for (let i = 0; i < targets.length; i += 1) {
        const single = await agent
          .post('/v1/flow/inverse')
          .send({ ...inline, targetFlowRate: targets[i] });
        expect(res.body.results[i].result).toEqual(single.body);
      }
    });

    it('rejects an empty point list', async () => {
      const res = await agent
        .post('/v1/flow/scan/radius')
        .send({ ...inline, pressureDrop: 1, points: [] })
        .expect(400);
      expect(res.body.error.code).toBe('invalid_payload');
    });
  });

  describe('concurrency', () => {
    it('handles interleaved independent requests without cross-talk', async () => {
      const N = 40;
      const calls = Array.from({ length: N }, (_unused, i) => {
        const radius = 0.0005 + (i % 10) * 0.0001;
        const viscosity = 0.001 + (i % 3) * 0.0005;
        const pressureDrop = 100 + (i % 5) * 50;
        return agent
          .post('/v1/flow/forward')
          .send({ radius, length: 1, viscosity, density: 1000, pressureDrop })
          .expect(200)
          .then((res) => {
            const expectedQ =
              (Math.PI * radius ** 4 * pressureDrop) /
              (8 * viscosity * 1);
            expect(res.body.flowRate).toBeCloseTo(expectedQ, 12);
          });
      });
      await Promise.all(calls);
    });

    it('forward + inverse calls stay consistent under concurrent load', async () => {
      const targets = Array.from({ length: 20 }, (_u, i) => 1e-8 + i * 1e-8);
      await Promise.all(
        targets.map(async (q) => {
          const inv = await agent
            .post('/v1/flow/inverse')
            .send({ ...inline, targetFlowRate: q })
            .expect(200);
          const fwd = await agent
            .post('/v1/flow/forward')
            .send({ ...inline, pressureDrop: inv.body.pressureDrop })
            .expect(200);
          expect(fwd.body.flowRate).toBeCloseTo(q, 12);
        }),
      );
    });
  });
});
