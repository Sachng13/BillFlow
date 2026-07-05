const PREFIX = "[billing]";

export function log(step: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`${PREFIX} ${step}`, details);
  } else {
    console.log(`${PREFIX} ${step}`);
  }
}

export function logWarn(step: string, details?: Record<string, unknown>) {
  if (details) {
    console.warn(`${PREFIX} ${step}`, details);
  } else {
    console.warn(`${PREFIX} ${step}`);
  }
}

export function logError(step: string, err: unknown, details?: Record<string, unknown>) {
  console.error(`${PREFIX} ${step}`, { ...details, error: err });
}
