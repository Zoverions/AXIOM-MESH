const HINTO_API_V2_BASE = 'https://app.hintoai.com/api/external/v2';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_JSON_BYTES = 2_000_000;

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

export function createHintoKnowledgeClient({
  apiKey,
  transport = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxJsonBytes = MAX_JSON_BYTES,
} = {}) {
  const key = requireText(apiKey, 'HINTO_API_KEY');
  if (typeof transport !== 'function') {
    throw new Error('Hinto transport is required');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Hinto timeoutMs must be a positive integer');
  }
  if (!Number.isInteger(maxJsonBytes) || maxJsonBytes <= 0) {
    throw new Error('Hinto maxJsonBytes must be a positive integer');
  }

  async function request(path) {
    let response;
    try {
      response = await transport(`${HINTO_API_V2_BASE}${path}`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'X-API-Key': key,
          Accept: 'application/json',
        },
      });
    } catch {
      throw new Error('Hinto API unavailable');
    }

    if (!response?.ok) {
      const status = Number.isInteger(response?.status) ? response.status : 'unknown';
      throw new Error(`Hinto API request failed (${status})`);
    }

    let bodyText;
    try {
      bodyText = await response.text();
    } catch {
      throw new Error('Hinto API returned invalid JSON');
    }

    if (typeof bodyText !== 'string') {
      throw new Error('Hinto API returned invalid JSON');
    }
    if (bodyText.length > maxJsonBytes) {
      throw new Error('Hinto API response exceeds size limit');
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      throw new Error('Hinto API returned invalid JSON');
    }
  }

  return Object.freeze({
    getProject() {
      return request('/project');
    },

    getProjectStructure() {
      return request('/project/structure');
    },

    listArticles({ folderId } = {}) {
      const params = new URLSearchParams();
      if (folderId !== undefined && folderId !== null && String(folderId).trim() !== '') {
        params.set('folderId', String(folderId));
      }
      const query = params.size > 0 ? `?${params.toString()}` : '';
      return request(`/articles${query}`);
    },

    getArticleMarkdown(articleId) {
      const id = requireText(articleId, 'Hinto article id');
      return request(`/articles/${encodeURIComponent(id)}?format=markdown`);
    },
  });
}
