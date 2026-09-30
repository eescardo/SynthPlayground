/** Preserve later review artifacts even when an earlier scenario cannot run on the PR base. */
export async function runCaptureScenarios<T extends string>(
  scenarios: readonly T[],
  capture: (scenario: T) => Promise<void>
): Promise<void> {
  const failures: Error[] = [];
  for (const scenario of scenarios) {
    try {
      await capture(scenario);
    } catch (cause) {
      const detail = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
      failures.push(new Error(`[${scenario}] ${detail}`, { cause }));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `${failures.length} capture scenario(s) failed:\n\n${failures.map((failure) => failure.message).join("\n\n")}`
    );
  }
}
