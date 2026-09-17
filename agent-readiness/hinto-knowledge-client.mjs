const HINTO_API_V2_BASE = 'https://app.hintoai.com/api/external/v2';

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

export function createHintoKnowledgeClient({ apiKey, transport = globalThis.fetch } = {}) {
  const key = requireText(apiKey, 'HINTO_API_KEY');
  if (typeof transport !== 'function') {
    throw new Error('Hinto transport is required');
  }

  async function request(path) {
    let response;
    try {
      response = await transport(`${HINTO_API_V2_BASE}${path}`, {
        method: 'GET',
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

    try {
      return await response.json();
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
