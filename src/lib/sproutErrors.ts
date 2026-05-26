export type SproutErrorSeverity = "error" | "warning" | "info";

export interface SproutError {
  source: string;
  severity: SproutErrorSeverity;
  message: string;
  error?: string;
  phase?: string;
  details?: Record<string, string | number | boolean | null | undefined>;
}

export type SproutErrorInput = SproutError | string | null;
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
    typeof candidate.message === "string" &&
    (candidate.severity === "error" || candidate.severity === "warning" || candidate.severity === "info")
  );
};

export const createSproutError = ({
  source,
  severity = "error",
  message,
  error,
  phase,
  details
}: {
  source: string;
  severity?: SproutErrorSeverity;
  message: string;
  error?: string;
  phase?: string;
  details?: SproutError["details"];
}): SproutError => ({
  source,
  severity,
  message,
  error,
  phase,
  details
});

export const normalizeSproutError = (value: SproutErrorInput, fallbackSource = "app"): SproutError | null => {
  if (value === null) {
    return null;
  }
  if (isSproutError(value)) {
    return value;
  }
  return createSproutError({
    source: fallbackSource,
    severity: "error",
    message: value,
    error: value
  });
};

export const reportSproutErrorToConsole = (error: SproutError): void => {
  const payload = {
    source: error.source,
    phase: error.phase,
    error: error.error,
    severity: error.severity,
    details: error.details
  };
  if (error.severity === "warning") {
    console.warn(error.message, payload);
    return;
  }
  if (error.severity === "info") {
    console.info(error.message, payload);
    return;
  }
  console.error(error.message, payload);
};
