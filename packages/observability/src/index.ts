export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Readonly<
  Record<string, boolean | number | string | null | undefined>
>;

function errorFields(error: unknown): Record<string, string> {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }

  return { errorName: "UnknownError", errorMessage: "Unknown failure" };
}

export function log(
  level: LogLevel,
  event: string,
  context: LogContext = {},
  error?: unknown,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
    ...(error === undefined ? {} : errorFields(error)),
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}
