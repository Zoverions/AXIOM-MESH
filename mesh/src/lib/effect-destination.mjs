import { ValidationError, assertString } from './canonical.mjs';

export const LOCAL_EFFECT_DESTINATION = 'local';

/**
 * Resolve the effect destination from AXIOM-authorized execution facts.
 *
 * The destination is never accepted from the caller. Current built-in tools are
 * local kernel effects. Future provider/remote adapters must define and verify
 * their own canonical destinations before they can be admitted here.
 */
export function effectDestinationForTool(tool) {
  const value = assertString(tool, 'execution tool', {
    max: 160,
    pattern: /^[a-z][a-z0-9._-]+$/
  });
  if (value.startsWith('builtin.')) return LOCAL_EFFECT_DESTINATION;
  throw new ValidationError(
    `Execution tool ${value} does not have a verified effect destination`
  );
}
