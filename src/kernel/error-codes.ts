/**
 * Structured, machine-distinguishable error codes.
 *
 * `not_laminar` is the required sentinel returned whenever the Reynolds
 * number reaches or exceeds the laminar threshold (2300).
 */
export enum ErrorCode {
  /** Request body failed structural/type validation (HTTP 400). */
  INVALID_PAYLOAD = 'invalid_payload',
  /** Radius is not a strictly positive number. */
  INVALID_RADIUS = 'invalid_radius',
  /** Length is not a strictly positive number. */
  INVALID_LENGTH = 'invalid_length',
  /** Viscosity is not a strictly positive number. */
  INVALID_VISCOSITY = 'invalid_viscosity',
  /** Density is not a strictly positive number. */
  INVALID_DENSITY = 'invalid_density',
  /** Pressure drop is negative (backflow is out of scope). */
  INVALID_PRESSURE_DROP = 'invalid_pressure_drop',
  /** Target flow rate is not a strictly positive number. */
  INVALID_TARGET_FLOW = 'invalid_target_flow',
  /** Neither a registered spec name nor a full inline parameter set given. */
  MISSING_PARAMS = 'missing_params',
  /** Referenced spec name has not been registered. */
  UNKNOWN_SPEC = 'unknown_spec',
  /** Spec name already registered (no overwrite). */
  SPEC_EXISTS = 'spec_exists',
  /** Reynolds number >= 2300: laminar assumption does not hold. */
  NOT_LAMINAR = 'not_laminar',
  /** Unknown HTTP route or method. */
  ROUTE_NOT_FOUND = 'route_not_found',
  /** Anything unexpected; logged server-side, never a stack trace leak. */
  INTERNAL_ERROR = 'internal_error',
}

/** Default HTTP status mapping for the structured error codes. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.INVALID_PAYLOAD]: 400,
  [ErrorCode.INVALID_RADIUS]: 400,
  [ErrorCode.INVALID_LENGTH]: 400,
  [ErrorCode.INVALID_VISCOSITY]: 400,
  [ErrorCode.INVALID_DENSITY]: 400,
  [ErrorCode.INVALID_PRESSURE_DROP]: 400,
  [ErrorCode.INVALID_TARGET_FLOW]: 400,
  [ErrorCode.MISSING_PARAMS]: 400,
  [ErrorCode.UNKNOWN_SPEC]: 404,
  [ErrorCode.SPEC_EXISTS]: 409,
  [ErrorCode.NOT_LAMINAR]: 422,
  [ErrorCode.ROUTE_NOT_FOUND]: 404,
  [ErrorCode.INTERNAL_ERROR]: 500,
};
