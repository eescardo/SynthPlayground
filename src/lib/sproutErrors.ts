export type SproutErrorSeverity = "error" | "warning" | "info";

export type SproutErrorDetails = Record<string, string | number | boolean | null | undefined>;

export interface SproutError {
  source: string;
  code: string;
  severity: SproutErrorSeverity;
  message: string;
  error: Error;
  details?: SproutErrorDetails;
}

export interface SerializableSproutErrorDetails extends SproutErrorDetails {
  errorMessage: string;
  errorName: string;
  remoteStack?: string;
}

export interface SerializableSproutError {
  source: string;
  code: string;
  severity: SproutErrorSeverity;
  message: string;
  details: SerializableSproutErrorDetails;
}

export type SproutErrorInput = SproutError | null;
export type SproutErrorSetter = (
  value: SproutErrorInput | ((previous: SproutError | null) => SproutErrorInput)
) => void;

export const isSproutError = (value: unknown): value is SproutError => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SproutError>;
  return (
    typeof candidate.source === "string" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    candidate.error instanceof Error &&
    (candidate.severity === "error" || candidate.severity === "warning" || candidate.severity === "info")
  );
};

export const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
};

export const createSproutError = ({
  source,
  code,
  severity,
  message,
  error,
  details
}: {
  source: string;
  code: string;
  severity: SproutErrorSeverity;
  message: string;
  error: Error;
  details?: SproutError["details"];
}): SproutError => ({
  source,
  code,
  severity,
  message,
  error,
  details
});

export const hydrateSerializableSproutError = (input: SerializableSproutError): SproutError => {
  const remoteStack = input.details.remoteStack;
  const remoteCause = new Error(input.details.errorMessage);
  remoteCause.name = input.details.errorName;
  if (remoteStack) {
    remoteCause.stack = remoteStack;
  }
  const error = new Error(input.message, { cause: remoteCause });
  error.name = "RemoteWorkletError";
  if (remoteStack) {
    error.stack = remoteStack;
  }
  return createSproutError({
    source: input.source,
    code: input.code,
    severity: input.severity,
    message: input.message,
    error,
    details: input.details
  });
};

export const reportSproutErrorToConsole = (error: SproutError): void => {
  const payload = {
    source: error.source,
    code: error.code,
    severity: error.severity,
    details: error.details
  };
  if (error.severity === "warning") {
    console.warn(error.message, error.error, payload);
    return;
  }
  if (error.severity === "info") {
    console.info(error.message, error.error, payload);
    return;
  }
  console.error(error.message, error.error, payload);
};
