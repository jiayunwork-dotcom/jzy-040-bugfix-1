/**
 * Shared physical types for the Hagen-Poiseuille kernel.
 *
 * All quantities use coherent SI units:
 *   R   radius              [m]
 *   L   length              [m]
 *   dp  pressure drop Δp    [Pa]
 *   mu  dynamic viscosity μ [Pa·s]
 *   rho density ρ           [kg/m³]
 *   Q   volume flow rate    [m³/s]
 *   v   velocity            [m/s]
 *   Re  Reynolds number     [-]
 *   tau wall shear stress   [Pa]
 */

export interface GeometryParams {
  /** Pipe inner radius R [m]. */
  radius: number;
  /** Pipe length L [m]. */
  length: number;
}

export interface FluidParams {
  /** Dynamic viscosity μ [Pa·s]. */
  viscosity: number;
  /** Fluid density ρ [kg/m³]. */
  density: number;
}

export interface PhysicsParams extends GeometryParams, FluidParams {}

/** Result of a forward Hagen-Poiseuille evaluation. */
export interface ForwardResult {
  /** Volume flow rate Q [m³/s]. */
  flowRate: number;
  /** Cross-sectional mean velocity v̄ [m/s]. */
  meanVelocity: number;
  /** Centerline maximum velocity v_max = 2·v̄ [m/s]. */
  maxVelocity: number;
  /** Reynolds number based on mean velocity and diameter (2R). */
  reynoldsNumber: number;
  /** Wall shear stress τ_w [Pa]; independent of viscosity. */
  wallShearStress: number;
  /** Flow regime; only "laminar" results are ever returned. */
  regime: 'laminar';
}

/** Result of an inverse evaluation: pressure drop required for a target Q. */
export interface InverseResult {
  /** Required pressure drop Δp [Pa]. */
  pressureDrop: number;
  /** Echoed target volume flow rate [m³/s]. */
  targetFlowRate: number;
  /** Cross-sectional mean velocity at the target flow [m/s]. */
  meanVelocity: number;
  /** Centerline velocity at the target flow [m/s]. */
  maxVelocity: number;
  /** Reynolds number at the target flow. */
  reynoldsNumber: number;
  /** Wall shear stress at the solved pressure drop [Pa]. */
  wallShearStress: number;
  regime: 'laminar';
}

/** A named, reusable bundle of geometry + fluid properties. */
export interface PipeSpec extends PhysicsParams {
  name: string;
}
