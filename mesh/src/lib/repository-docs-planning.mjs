import { ValidationError, assertPlainObject, assertString, canonicalJson } from './canonical.mjs';
import { REPOSITORY_DOCS_EFFECT_POLICY } from './repository-docs-effect.mjs';

function assertDocsPath(raw) {
  const path = assertString(raw, 'proposed_change.path', { min: 1, max: 240 });
  if (
    path.startsWith('/')
    || path.includes('\\')
    || path.includes('\u0000')
    || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new ValidationError('repository docs planning path is not canonical');
  }
  const allowed = REPOSITORY_DOCS_EFFECT_POLICY.allowed_root_files.includes(path)
    || REPOSITORY_DOCS_EFFECT_POLICY.allowed_roots.some(root => path.startsWith(root));
  if (!allowed) throw new ValidationError(`repository docs planning path is outside the docs-only ceiling: ${path}`);
  return path;
}

function normalizeProposedChange(raw, index) {
  const value = assertPlainObject(raw, `proposed_changes[${index}]`);
  const unknown = Object.keys(value).filter(key => !['path', 'operation', 'new_content'].includes(key));
  if (unknown.length) {
    throw new ValidationError(`proposed_changes[${index}] contains unsupported fields: ${unknown.join(', ')}`);
  }
  const path = assertDocsPath(value.path);
  const operation = assertString(value.operation, `proposed_changes[${index}].operation`, {
    max: 16,
    pattern: /^(create|update)$/
  });
  const content = assertString(value.new_content, `proposed_changes[${index}].new_content`, {
    min: 0,
    max: REPOSITORY_DOCS_EFFECT_POLICY.max_file_bytes
  });
  if (content.includes('\u0000')) throw new ValidationError('repository docs planning does not permit binary/NUL content');
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > REPOSITORY_DOCS_EFFECT_POLICY.max_file_bytes) {
    throw new ValidationError('repository docs planning file exceeds byte ceiling');
  }
  return { path, operation, new_content: content, new_bytes: bytes };
}

export function normalizeRepositoryDocsProposedChanges(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > REPOSITORY_DOCS_EFFECT_POLICY.max_files) {
    throw new ValidationError(`repository docs planning requires 1-${REPOSITORY_DOCS_EFFECT_POLICY.max_files} proposed changes`);
  }
  const changes = raw.map(normalizeProposedChange).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(changes.map(change => change.path)).size !== changes.length) {
    throw new ValidationError('repository docs planning paths must be unique');
  }
  const totalBytes = changes.reduce((sum, change) => sum + change.new_bytes, 0);
  if (totalBytes > REPOSITORY_DOCS_EFFECT_POLICY.max_total_bytes) {
    throw new ValidationError('repository docs planning exceeds total byte ceiling');
  }
  return JSON.parse(canonicalJson(changes.map(({ new_bytes: ignoredBytes, ...change }) => change)));
}
