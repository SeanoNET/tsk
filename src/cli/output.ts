export interface CliOutput<T = unknown> {
  ok: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export function success<T>(data: T, meta?: Record<string, unknown>): CliOutput<T> {
  return { ok: true, data, meta };
}

export function failure(message: string, meta?: Record<string, unknown>): CliOutput<string> {
  return { ok: false, data: message, meta };
}

export function printResult(result: CliOutput, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!result.ok) {
    console.error(`Error: ${result.data}`);
  }
}
