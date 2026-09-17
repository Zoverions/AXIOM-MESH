import assert from 'node:assert/strict';
import test from 'node:test';

const MODULE_URL = new URL('../../agent-readiness/hinto-knowledge-client.mjs', import.meta.url);
const BASE_URL = 'https://app.hintoai.com/api/external/v2';

async function loadCreateClient() {
  try {
    const module = await import(MODULE_URL.href);
    return module.createHintoKnowledgeClient;
  } catch {
    return undefined;
  }
}

function fakeResponse(body, { status = 200, contentType = 'application/json' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? contentType : null;
      },
    },
    async json() {
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

async function requireCreateClient() {
  const createClient = await loadCreateClient();
  assert.equal(
    typeof createClient,
    'function',
    'expected agent-readiness/hinto-knowledge-client.mjs to export createHintoKnowledgeClient'
  );
  return createClient;
}

test('Hinto knowledge client requires an explicit API key', async () => {
  const createClient = await requireCreateClient();

  assert.throws(
    () => createClient({ apiKey: '', transport: async () => fakeResponse({}) }),
    /HINTO_API_KEY is required/
  );
});

test('getProject uses the fixed Hinto v2 origin and X-API-Key header', async () => {
  const createClient = await requireCreateClient();
  const calls = [];
  const client = createClient({
    apiKey: 'hinto_test_key',
    transport: async (url, init) => {
      calls.push({ url, init });
      return fakeResponse({ id: 'project-1' });
    },
  });

  const result = await client.getProject();

  assert.deepEqual(result, { id: 'project-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/project`);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['X-API-Key'], 'hinto_test_key');
  assert.equal(calls[0].init.headers.Accept, 'application/json');
});

test('getProjectStructure reads the project tree without widening authority', async () => {
  const createClient = await requireCreateClient();
  const calls = [];
  const client = createClient({
    apiKey: 'hinto_test_key',
    transport: async (url, init) => {
      calls.push({ url, init });
      return fakeResponse({ folders: [], articles: [] });
    },
  });

  const result = await client.getProjectStructure();

  assert.deepEqual(result, { folders: [], articles: [] });
  assert.equal(calls[0].url, `${BASE_URL}/project/structure`);
  assert.equal(calls[0].init.method, 'GET');
});

test('listArticles stays read-only and supports an optional folder filter', async () => {
  const createClient = await requireCreateClient();
  const calls = [];
  const client = createClient({
    apiKey: 'hinto_test_key',
    transport: async (url, init) => {
      calls.push({ url, init });
      return fakeResponse({ articles: [] });
    },
  });

  await client.listArticles({ folderId: 'folder / 7' });

  assert.equal(calls[0].url, `${BASE_URL}/articles?folderId=folder+%2F+7`);
  assert.equal(calls[0].init.method, 'GET');
});

test('getArticleMarkdown encodes the article id and requests Markdown representation', async () => {
  const createClient = await requireCreateClient();
  const calls = [];
  const client = createClient({
    apiKey: 'hinto_test_key',
    transport: async (url, init) => {
      calls.push({ url, init });
      return fakeResponse({ id: 'article / 9', content: '# Guide' });
    },
  });

  const result = await client.getArticleMarkdown('article / 9');

  assert.deepEqual(result, { id: 'article / 9', content: '# Guide' });
  assert.equal(calls[0].url, `${BASE_URL}/articles/article%20%2F%209?format=markdown`);
  assert.equal(calls[0].init.method, 'GET');
});

test('non-success responses fail closed without echoing the API key', async () => {
  const createClient = await requireCreateClient();
  const secret = 'hinto_secret_should_not_leak';
  const client = createClient({
    apiKey: secret,
    transport: async () => fakeResponse({ error: secret }, { status: 401 }),
  });

  await assert.rejects(
    client.getProject(),
    (error) => {
      assert.match(error.message, /Hinto API request failed \(401\)/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    }
  );
});

test('transport failures fail closed without exposing transport or credential details', async () => {
  const createClient = await requireCreateClient();
  const secret = 'hinto_secret_should_not_leak';
  const client = createClient({
    apiKey: secret,
    transport: async () => {
      throw new Error(`socket failure ${secret}`);
    },
  });

  await assert.rejects(
    client.getProject(),
    (error) => {
      assert.equal(error.message, 'Hinto API unavailable');
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    }
  );
});
