/* Acceptance walkthrough against a running server (node acceptance.js [port]). */
const http = require('http');

const port = Number(process.argv[2]) || 3400;
const base = `http://127.0.0.1:${port}/v1`;

function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? '' : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: `/v1${path}`,
        method,
        headers:
          body === undefined
            ? {}
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
              },
      },
      (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : {} }),
        );
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

const G = { radius: 0.001, length: 1, viscosity: 0.001, density: 1000 };

(async () => {
  console.log('1. forward proportionality');
  const a = await call('POST', '/flow/forward', { ...G, pressureDrop: 1000 });
  const dblR = await call('POST', '/flow/forward', {
    ...G,
    radius: 0.002,
    pressureDrop: 1000,
  });
  check(
    'radius doubled -> Q x16 (4th power, not square)',
    Math.abs(dblR.body.flowRate / a.body.flowRate - 16) < 1e-9,
    `ratio=${dblR.body.flowRate / a.body.flowRate}`,
  );
  const dblMu = await call('POST', '/flow/forward', {
    ...G,
    viscosity: 0.002,
    pressureDrop: 1000,
  });
  check(
    'viscosity doubled -> Q halved',
    Math.abs(dblMu.body.flowRate - a.body.flowRate / 2) / a.body.flowRate < 1e-12,
  );
  check('vmax = 2 * vmean', Math.abs(dblR.body.maxVelocity - 2 * dblR.body.meanVelocity) < 1e-15);

  console.log('2. zero pressure drop');
  const zero = await call('POST', '/flow/forward', { ...G, pressureDrop: 0 });
  check('Q is exactly 0 at dp=0', Object.is(zero.body.flowRate, -0) || zero.body.flowRate === 0);
  check('all velocities/shear/Re are 0 at dp=0',
    zero.body.meanVelocity === 0 && zero.body.maxVelocity === 0 &&
    zero.body.wallShearStress === 0 && zero.body.reynoldsNumber === 0);

  console.log('3. wall shear independent of viscosity');
  const s1 = await call('POST', '/flow/forward', { ...G, pressureDrop: 500 });
  const s2 = await call('POST', '/flow/forward', {
    ...G,
    viscosity: 0.073,
    pressureDrop: 500,
  });
  check('tau_w unchanged when viscosity changes', s1.body.wallShearStress === s2.body.wallShearStress);
  check('tau_w = R dp / 2L', Math.abs(s1.body.wallShearStress - (0.001 * 500) / 2) < 1e-15);

  console.log('4. inverse round-trip');
  const target = 2.71828e-7;
  const inv = await call('POST', '/flow/inverse', { ...G, targetFlowRate: target });
  check('inverse returns positive dp', inv.body.pressureDrop > 0);
  const back = await call('POST', '/flow/forward', { ...G, pressureDrop: inv.body.pressureDrop });
  check(
    'forward(inverse(Q)) == Q',
    Math.abs(back.body.flowRate - target) / target < 1e-12,
    `err=${Math.abs(back.body.flowRate - target) / target}`,
  );

  console.log('5. Reynolds gate');
  const turb = await call('POST', '/flow/forward', {
    radius: 0.01,
    length: 1,
    viscosity: 0.001,
    density: 1000,
    pressureDrop: 100,
  });
  check('forward turbulent point -> 422 not_laminar', turb.status === 422 && turb.body.error.code === 'not_laminar');
  const turbInv = await call('POST', '/flow/inverse', {
    radius: 0.01, length: 1, viscosity: 0.001, density: 1000, targetFlowRate: 1e-4,
  });
  check('inverse unattainable target -> 422 not_laminar', turbInv.status === 422 && turbInv.body.error.code === 'not_laminar');
  check('no pressureDrop leaked on refusal', !('pressureDrop' in turbInv.body));

  console.log('6. typed rejections (each blocked before arithmetic)');
  const cases = [
    [{ ...G, radius: 0, pressureDrop: 1 }, 400, 'invalid_radius'],
    [{ ...G, length: -1, pressureDrop: 1 }, 400, 'invalid_length'],
    [{ ...G, viscosity: 0, pressureDrop: 1 }, 400, 'invalid_viscosity'],
    [{ ...G, density: -2, pressureDrop: 1 }, 400, 'invalid_density'],
    [{ ...G, pressureDrop: -0.5 }, 400, 'invalid_pressure_drop'],
    [{ ...G, targetFlowRate: 0 }, 400, 'invalid_target_flow'],
    [{ specName: 'does-not-exist', pressureDrop: 1 }, 404, 'unknown_spec'],
    [{ radius: 0.001, pressureDrop: 1 }, 400, 'missing_params'],
  ];
  for (const [body, status, code] of cases) {
    const path = 'targetFlowRate' in body ? '/flow/inverse' : '/flow/forward';
    const r = await call('POST', path, body);
    check(`${code} -> ${status}`, r.status === status && r.body.error?.code === code,
      `got ${r.status}/${r.body.error?.code}`);
  }

  console.log('7. named specs + scan single-kernel parity');
  const reg = await call('POST', '/specs', {
    name: 'acc-chip', ...G,
  });
  check('register spec -> 201', reg.status === 201);
  const dup = await call('POST', '/specs', { name: 'acc-chip', ...G });
  check('duplicate spec -> 409 spec_exists', dup.status === 409 && dup.body.error.code === 'spec_exists');
  const byName = await call('POST', '/flow/forward', { specName: 'acc-chip', pressureDrop: 1000 });
  check('named spec result == inline result', JSON.stringify(byName.body) === JSON.stringify(a.body));
  const list = await call('GET', '/specs');
  const names = list.body.specs.map((s) => s.name);
  check('GET /specs echoes demo + registered', names.includes('demo-capillary') && names.includes('acc-chip'));

  const radii = [0.0008, 0.001, 0.0014];
  const scan = await call('POST', '/flow/scan/radius', {
    ...G,
    pressureDrop: 800,
    points: radii.map((radius) => ({ radius })),
  });
  let parity = true;
  for (let i = 0; i < radii.length; i += 1) {
    const single = await call('POST', '/flow/forward', { ...G, radius: radii[i], pressureDrop: 800 });
    if (JSON.stringify(single.body) !== JSON.stringify(scan.body.results[i].result)) parity = false;
  }
  check('scan points == single-point calls (one kernel)', parity);

  const mixed = await call('POST', '/flow/scan/radius', {
    ...G,
    pressureDrop: 1000,
    points: [{ radius: 0.001 }, { radius: -1 }, { radius: 0.01 }, { radius: 0.0012 }],
  });
  check(
    'scan isolates bad points (2 ok / 2 error, typed codes)',
    mixed.body.okCount === 2 &&
      mixed.body.errorCount === 2 &&
      mixed.body.results[1].error.code === 'invalid_radius' &&
      mixed.body.results[2].error.code === 'not_laminar',
  );

  console.log('8. seeded demo is deeply laminar');
  const demo = await call('POST', '/flow/forward', {
    specName: 'demo-capillary',
    pressureDrop: 1000,
  });
  check('demo Re << 2300', demo.body.reynoldsNumber < 1e-3 && demo.body.regime === 'laminar',
    `Re=${demo.body.reynoldsNumber}`);

  console.log('9. health + 404');
  const health = await call('GET', '/health');
  check('health ok with threshold 2300', health.status === 200 && health.body.laminarReynoldsLimit === 2300);
  const nf = await call('GET', '/nope');
  check('unknown route -> 404 route_not_found', nf.status === 404 && nf.body.error.code === 'route_not_found');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
