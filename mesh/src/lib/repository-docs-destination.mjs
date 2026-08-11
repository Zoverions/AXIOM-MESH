import { ValidationError } from './canonical.mjs';
import { REPOSITORY_DOCS_EFFECT_POLICY } from './repository-docs-effect.mjs';

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const REPOSITORY_DOCS_EFFECT_DESTINATION = Object.freeze({
  scheme: 'github',
  repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
  value: `github:${REPOSITORY_DOCS_EFFECT_POLICY.repository}`
});

export function repositoryDocsEffectDestination() {
  const { repository, value } = REPOSITORY_DOCS_EFFECT_DESTINATION;
  if (!REPOSITORY.test(repository)) {
    throw new ValidationError('Repository-docs effect repository is not a canonical owner/repository identifier');
  }
  if (value !== `github:${repository}`) {
    throw new ValidationError('Repository-docs effect destination is not bound to the configured repository');
  }
  return value;
}
