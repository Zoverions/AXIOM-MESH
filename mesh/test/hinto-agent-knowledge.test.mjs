import assert from 'node:assert/strict';
import test from 'node:test';

const MODULE_URL = new URL('../../agent-readiness/hinto-knowledge-client.mjs', import.meta.url);
const BASE_URL = 'https://app.hintoai.com/api/external/v2';

async function loadModule() {
  try {
    return await import(`${MODULE_URL.href}?t=${Date.now()}`);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

async function loadCreateClient() {
  const module = await loadModule();
  return module?.createHintoKnowledgeClient;
}

function streamBodyFromBytes(bytes, { chunkSize = 8 } = {}) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.byteLength);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
    cancel() {
      offset = bytes.byteLength;
    },
  });
}

function fakeResponse(body, { status = 200, contentType = 'application/json', contentLength, chunkSize = 8 } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const bytes = new TextEncoder().encode(text);
  const headers = {
    get(name) {
      const key = name.toLowerCase();
      if (key === 'content-type') return contentType;
      if (key === 'content-length') {
        if (contentLength === null) return null;
        if (contentLength !== undefined) return String(contentLength);
        return String(bytes.byteLength);
      }
      return null;
    },
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    body: streamBodyFromBytes(bytes, { chunkSize }),
    async text() {
      throw new Error('text() must not be used for bounded reads in tests');
    },
    async json() {
      throw new Error('json() must not be used for bounded reads in tests');
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
  assert.equal(calls[0].init.redirect, 'error');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
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
  assert.equal(calls[0].init.redirect, 'error');
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

test('oversized streamed JSON responses fail closed on byte budget mid-read', async () => {
  const module = await loadModule();
  assert.equal(typeof module?.readBoundedResponseText, 'function');
  const createClient = module.createHintoKnowledgeClient;
  const payload = { id: 'project-too-large-for-limit', pad: 'x'.repeat(64) };
  const client = createClient({
    apiKey: 'hinto_test_key',
    maxJsonBytes: 16,
    transport: async () => fakeResponse(payload, { chunkSize: 4, contentLength: null }),
  });

  await assert.rejects(client.getProject(), /Hinto API response exceeds size limit/);
});

test('declared Content-Length over budget rejects without opening the body stream', async () => {
  const createClient = await requireCreateClient();
  let bodyAccessed = false;
  const client = createClient({
    apiKey: 'hinto_test_key',
    maxJsonBytes: 16,
    transport: async () => {
      const response = {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            if (name.toLowerCase() === 'content-length') return '9999';
            return null;
          },
        },
        async text() {
          throw new Error('text() must not be used');
        },
      };
      Object.defineProperty(response, 'body', {
        get() {
          bodyAccessed = true;
          throw new Error('body must not be opened when Content-Length exceeds budget');
        },
      });
      return response;
    },
  });

  await assert.rejects(client.getProject(), /Hinto API response exceeds size limit/);
  assert.equal(bodyAccessed, false);
});
