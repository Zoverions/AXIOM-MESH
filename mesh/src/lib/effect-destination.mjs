import { ValidationError, assertString } from './canonical.mjs';
import { REPOSITORY_DOCS_EFFECT_POLICY } from './repository-docs-effect.mjs';
import { repositoryDocsEffectDestination } from './repository-docs-destination.mjs';

export const LOCAL_EFFECT_DESTINATION = 'local';

/**
 * Resolve the effect destination from AXIOM-authorized execution facts.
 *
 * The destination is never accepted from the caller. Built-in tools are local
 * kernel effects. The repository-docs adapter is the single currently verified
 * external adapter destination and is bound to its exact code-owned repository.
 * Every other provider/remote adapter remains unresolved and fails closed.
 */
export function effectDestinationForTool(tool) {
  const value = assertString(tool, 'execution tool', {
    max: 160,
    pattern: /^[a-z][a-z0-9._-]+$/
  });
  if (value.startsWith('builtin.')) return LOCAL_EFFECT_DESTINATION;
  if (value === REPOSITORY_DOCS_EFFECT_POLICY.tool) {
    return repositoryDocsEffectDestination();
  }
  throw new ValidationError(
    `Execution tool ${value} does not have a verified effect destination`
  );
}
