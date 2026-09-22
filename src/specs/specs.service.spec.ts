import { SpecsService } from './specs.service';
import { FlowException } from '../kernel/flow.exception';
import { ErrorCode } from '../kernel/error-codes';

describe('SpecsService (in-memory registry)', () => {
  let service: SpecsService;
  const valid = {
    radius: 1e-3,
    length: 0.5,
    viscosity: 0.01,
    density: 1000,
  };

  beforeEach(() => {
    service = new SpecsService();
  });

  it('registers and retrieves a named spec', () => {
    const spec = service.register('chip-a', valid);
    expect(spec.name).toBe('chip-a');
    expect(service.get('chip-a')).toEqual({ name: 'chip-a', ...valid });
    expect(service.has('chip-a')).toBe(true);
  });

  it('trims spec names', () => {
    service.register('  chip-b ', valid);
    expect(service.has('chip-b')).toBe(true);
  });

  it('rejects empty names', () => {
    expect(() => service.register('   ', valid)).toThrow(FlowException);
  });

  it('refuses to overwrite an existing name with spec_exists', () => {
    service.register('chip-a', valid);
    try {
      service.register('chip-a', { ...valid, radius: 2e-3 });
      fail('expected spec_exists');
    } catch (e) {
      expect(e).toBeInstanceOf(FlowException);
      expect((e as FlowException).code).toBe(ErrorCode.SPEC_EXISTS);
    }
    // Original untouched.
    expect(service.get('chip-a').radius).toBe(1e-3);
  });

  it('rejects unknown names with unknown_spec', () => {
    try {
      service.get('ghost');
      fail('expected unknown_spec');
    } catch (e) {
      expect(e).toBeInstanceOf(FlowException);
      expect((e as FlowException).code).toBe(ErrorCode.UNKNOWN_SPEC);
    }
  });

  it('validates values at registration time', () => {
    try {
      service.register('bad', { ...valid, radius: 0 });
      fail('expected invalid_radius');
    } catch (e) {
      expect((e as FlowException).code).toBe(ErrorCode.INVALID_RADIUS);
    }
    expect(service.has('bad')).toBe(false);
  });

  it('lists a snapshot of all specs', () => {
    service.register('a', valid);
    service.register('b', { ...valid, viscosity: 0.1 });
    const list = service.list();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.name).sort()).toEqual(['a', 'b']);
    // Snapshot: mutating the returned array does not corrupt the registry.
    list.length = 0;
    expect(service.list()).toHaveLength(2);
  });
});
