import {
  createGatewayClient,
  GatewayClientError
} from '/vendor/axiom-client.mjs';

const ROUTES = new Set([
  'overview',
  'ask',
  'approvals',
  'vault',
  'receipts',
  'share',
  'explore'
]);

const state = {
  client: null,
  session: null,
  route: 'overview',
  lastIntent: null
};

const view = document.querySelector('#view');
const connectPanel = document.querySelector('#connect-panel');
const connectForm = document.querySelector('#connect-form');
const tokenInput = document.querySelector('#token-input');
const disconnectButton = document.querySelector('#disconnect-button');
const connectionDot = document.querySelector('#connection-dot');
const connectionLabel = document.querySelector('#connection-label');
const announcement = document.querySelector('#announcement');

connectForm.addEventListener('submit', async event => {
  event.preventDefault();
  const token = tokenInput.value;
  tokenInput.value = '';
  state.session = { token };
  state.client = createGatewayClient({ token: () => state.session?.token ?? '' });
  setViewBusy(true, 'Connecting to the local node');
  try {
    const status = await state.client.call('status.get');
    connectPanel.hidden = true;
    disconnectButton.hidden = false;
    connectionDot.classList.add('connected');
    connectionLabel.textContent = `Connected · ${status.kernel_version}`;
    announce('Connected to the local AXIOM node');
    await renderRoute();
  } catch (error) {
    clearSession();
    renderConnectionError(error);
  } finally {
    setViewBusy(false);
  }
});

disconnectButton.addEventListener('click', () => {
  clearSession();
  connectPanel.hidden = false;
  disconnectButton.hidden = true;
  connectionDot.classList.remove('connected');
  connectionLabel.textContent = 'Not connected';
  state.lastIntent = null;
  announce('Disconnected and cleared the in-memory token');
  renderRoute();
  tokenInput.focus();
});

window.addEventListener('hashchange', () => renderRoute());
window.addEventListener('pagehide', clearSession);
window.addEventListener('pageshow', () => {
  if (state.client) return;
  connectPanel.hidden = false;
  disconnectButton.hidden = true;
  connectionDot.classList.remove('connected');
  connectionLabel.textContent = 'Not connected';
  renderRoute();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.mjs', { scope: '/', type: 'module' })
    .catch(() => announce('Offline shell setup was unavailable'));
}

await renderRoute();

async function renderRoute() {
  const requested = location.hash.replace(/^#/, '') || 'overview';
  state.route = ROUTES.has(requested) ? requested : 'overview';
  if (requested !== state.route) history.replaceState(null, '', '#overview');
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === state.route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  setViewBusy(true, `Loading ${state.route}`);
  try {
    if (!state.client && state.route !== 'share') {
      renderDisconnected();
      return;
    }
    const renderer = {
      overview: renderOverview,
      ask: renderAsk,
      approvals: renderApprovals,
      vault: renderVault,
      receipts: renderReceipts,
      share: renderShare,
      explore: renderExplore
    }[state.route];
    await renderer();
  } catch (error) {
    renderError(error, `Could not load ${state.route}`);
  } finally {
    setViewBusy(false);
  }
}

function renderDisconnected() {
  view.replaceChildren(
    header('Your local node, in one place',
      'Connect above to inspect node health, submit a bounded intent, and review private state without using the command line.'),
    grid([
      card('Local by default', 'This preview talks only to the same-origin loopback service. It loads no remote fonts, analytics, or third-party assets.'),
      card('Authority stays visible', 'Every request still passes through the authenticated Gateway and the kernel policy path. This page grants no authority.'),
      card('No synthetic AI', 'External and local model adapters are not configured by this preview. Ask begins with a transparent echo test, not a simulated assistant.')
    ])
  );
}

async function renderOverview() {
  const [status, capabilities] = await Promise.all([
    state.client.call('status.get'),
    state.client.call('capabilities.list')
  ]);
  const counts = status.capability_counts ?? {};
  const runtime = status.runtime ?? {};
  view.replaceChildren(
    header('A clear view of this node',
      'Health and capability information comes from the authenticated Gateway. A healthy preview is not a production-promotion claim.'),
    grid([
      metricCard('Kernel', status.kernel_version, 'Current development build'),
      metricCard('Implemented', String(counts.implemented ?? 0), 'Registry-backed capabilities'),
      metricCard('Services', String(Object.keys(runtime).length), 'Gateway-reported runtime units'),
      card('Node state', summarizeRuntime(runtime), { wide: true, badge: ['Connected', 'good'] }),
      card('Capability registry', `${capabilities.capabilities?.length ?? 0} declared capabilities. Only registry entries marked implemented are runnable claims.`, {
        badge: ['Exact source', 'good']
      })
    ])
  );
}

async function renderAsk() {
  const form = element('form', { className: 'stack' });
  const message = element('textarea', {
    attrs: {
      id: 'ask-message',
      name: 'message',
      required: '',
      maxlength: '4096',
      placeholder: 'Write a message to send through the full local intent and evidence path.'
    }
  });
  const purpose = element('input', {
    attrs: {
      id: 'ask-purpose',
      name: 'purpose',
      maxlength: '512',
      value: 'local-preview-echo'
    }
  });
  form.append(
    notice('AI is not enabled. This transparent first workflow sends system.echo through Gateway → Hypervisor → Sandbox → Grid and returns its signed evidence result.'),
    field('Message', message, 'ask-message'),
    field('Purpose', purpose, 'ask-purpose'),
    element('div', { className: 'actions' }, [
      element('button', {
        className: 'button button-primary',
        text: 'Send bounded test',
        attrs: { type: 'submit' }
      }),
      element('button', {
        className: 'button button-secondary',
        text: 'Cancel pending request',
        attrs: { type: 'button', id: 'cancel-intent', disabled: '' }
      })
    ])
  );
  const result = element('div', { className: 'stack', attrs: { id: 'intent-result' } });
  if (state.lastIntent) result.append(intentResult(state.lastIntent));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const cancel = form.querySelector('#cancel-intent');
    const controller = new AbortController();
    submit.disabled = true;
    cancel.disabled = false;
    cancel.addEventListener('click', () => controller.abort(), { once: true });
    result.replaceChildren(notice('Submitting through the local policy and evidence path…'));
    try {
      const response = await state.client.call('intents.submit', {
        body: {
          action: 'system.echo',
          input: { message: message.value },
          purpose: purpose.value || 'local-preview-echo'
        },
        idempotencyKey: `axiom-one:${crypto.randomUUID()}`,
        signal: controller.signal
      });
      state.lastIntent = response;
      result.replaceChildren(intentResult(response));
      announce('Intent completed and its evidence is available');
    } catch (error) {
      result.replaceChildren(errorBox(error, 'The intent did not complete'));
      announce('Intent did not complete');
    } finally {
      submit.disabled = false;
      cancel.disabled = true;
    }
  });
  view.replaceChildren(
    header('Ask, with the boundary visible',
      'This first preview workflow is intentionally modest: one local deterministic action with no external provider or hidden model.'),
    form,
    result
  );
}

async function renderApprovals() {
  const response = await state.client.call('approvals.list');
  const approvals = response.approvals ?? [];
  view.replaceChildren(
    header('Approvals',
      'Approval records are shown exactly as this authenticated principal may read them. Creating and explaining approvals remains a later human-workflow gate.'),
    approvals.length
      ? list(approvals, item => ({
        title: item.approval_id ?? item.id ?? 'Approval',
        detail: `${item.status ?? 'unknown status'} · requester ${item.requester ?? 'unknown'}`
      }))
      : empty('No approval records are visible to this principal.'),
    rawDetails('Raw approval response', response)
  );
}

async function renderVault() {
  const response = await state.client.call('memory.list');
  const objects = response.objects ?? [];
  view.replaceChildren(
    header('Private vault',
      'Encrypted memory objects remain governed by the node. This preview reads metadata available to the current principal and does not copy it into browser storage.'),
    grid([
      metricCard('Objects', String(objects.length), 'Visible memory records'),
      metricCard('Links', String(response.edges?.length ?? 0), 'Visible provenance edges'),
      card('Lifecycle boundary', 'Create, ingestion, tombstone, deletion, export, and recovery controls are not promoted in this first shell increment.', {
        wide: true,
        badge: ['Read preview', 'pending']
      })
    ]),
    objects.length
      ? list(objects, item => ({
        title: item.object_id ?? item.id ?? 'Memory object',
        detail: `${item.type ?? 'record'} · ${item.created_at ?? 'time unavailable'}`
      }))
      : empty('No memory objects are visible to this principal.'),
    rawDetails('Raw memory response', response)
  );
}

async function renderReceipts() {
  const response = await state.client.call('events.list', { query: { limit: 50 } });
  const events = response.events ?? [];
  view.replaceChildren(
    header('Receipts and evidence timeline',
      'These are integrity-linked node events, not a claim that an external statement is true. Trace and event identifiers remain available for inspection.'),
    events.length
      ? list(events, item => ({
        title: item.kind ?? 'Node event',
        detail: `${item.occurred_at ?? item.created_at ?? 'time unavailable'} · ${item.event_id ?? item.id ?? 'identifier unavailable'}`
      }))
      : empty('No events are visible to this principal.'),
    rawDetails('Raw event response', response)
  );
}

async function renderShare() {
  view.replaceChildren(
    header('Share and Circles',
      'These surfaces are visible so the boundary is clear; they are not enabled by this preview.'),
    grid([
      card('Selective sharing', 'Pending owner-scope, consent, expiry, revocation, export, and deletion tests before a sharing control is enabled.', {
        badge: ['Unavailable', 'pending']
      }),
      card('AXIOM Circles', 'Pending invitation, device, membership, role, removal, conflict, and cross-Circle denial evidence.', {
        badge: ['Unavailable', 'pending']
      }),
      card('Remote recipients', 'No remote account, public federation, platform identity, or background transfer is configured.', {
        badge: ['No egress', 'good']
      })
    ]),
    notice('Nothing on this page sends data. Future sharing must show the recipient, purpose, information scope, retention, expiry, revocation, and evidence before transfer.')
  );
}

async function renderExplore() {
  const resources = [
    ['Node status', 'status.get'],
    ['Capabilities', 'capabilities.list'],
    ['Operations', 'operations.get'],
    ['Admitted nodes', 'nodes.list'],
    ['Capsules', 'capsules.list'],
    ['Imports', 'imports.list'],
    ['Backups', 'backups.list'],
    ['Audit continuity', 'audit.verify']
  ];
  const output = element('div', { className: 'stack' }, [
    empty('Choose a resource to inspect. Scope-protected resources may be denied; the denial will remain visible.')
  ]);
  const actions = element('div', { className: 'actions' });
  for (const [label, route] of resources) {
    const button = element('button', {
      className: 'button button-secondary',
      text: label,
      attrs: { type: 'button' }
    });
    button.addEventListener('click', async () => {
      button.disabled = true;
      output.replaceChildren(notice(`Loading ${label}…`));
      try {
        const response = await state.client.call(route);
        output.replaceChildren(rawDetails(label, response, true));
        announce(`${label} loaded`);
      } catch (error) {
        output.replaceChildren(errorBox(error, `${label} is unavailable`));
      } finally {
        button.disabled = false;
      }
    });
    actions.append(button);
  }
  view.replaceChildren(
    header('Explore exact node evidence',
      'Advanced inspection keeps raw responses available without implying that this preview understands or promotes every field.'),
    actions,
    output
  );
}

function intentResult(response) {
  return element('div', { className: 'card full' }, [
    element('span', { className: 'badge good', text: response.status ?? 'completed' }),
    element('h2', { text: response.idempotent_replay ? 'Existing result recovered' : 'Intent result' }),
    element('p', { text: response.message ?? 'The node returned a result with evidence.' }),
    rawDetails('Inspect result and evidence', response)
  ]);
}

function renderConnectionError(error) {
  view.replaceChildren(
    header('Connection was not established',
      'Check that the local node is running and that the token is current, then try again.'),
    errorBox(error, 'Could not authenticate to the local node')
  );
  connectPanel.hidden = false;
  tokenInput.focus();
}

function renderError(error, title) {
  view.replaceChildren(
    header(title, 'The preview keeps failures visible and does not replace missing data with a synthetic result.'),
    errorBox(error, title)
  );
}

function errorBox(error, title) {
  const code = error instanceof GatewayClientError ? error.code : 'unexpected_client_failure';
  const message = error instanceof GatewayClientError
    ? error.message
    : 'The local preview could not complete this operation.';
  const children = [
    element('strong', { text: title }),
    element('p', { text: message }),
    element('p', { text: `Code: ${code}` })
  ];
  if (error instanceof GatewayClientError && error.traceId) {
    children.push(element('p', { text: `Trace: ${error.traceId}` }));
  }
  return element('div', { className: 'error-box', attrs: { role: 'alert' } }, children);
}

function header(title, description) {
  return element('div', { className: 'view-header' }, [
    element('div', {}, [
      element('p', { className: 'eyebrow', text: state.route }),
      element('h1', { text: title }),
      element('p', { className: 'lede', text: description })
    ])
  ]);
}

function metricCard(title, value, description) {
  return element('article', { className: 'card' }, [
    element('h2', { text: title }),
    element('span', { className: 'metric', text: value }),
    element('p', { text: description })
  ]);
}

function card(title, description, { wide = false, badge: badgeValue } = {}) {
  const children = [];
  if (badgeValue) children.push(element('span', {
    className: `badge ${badgeValue[1] ?? ''}`.trim(),
    text: badgeValue[0]
  }));
  children.push(element('h2', { text: title }), element('p', { text: description }));
  return element('article', { className: `card${wide ? ' wide' : ''}` }, children);
}

function grid(children) {
  return element('div', { className: 'grid' }, children);
}

function field(label, control, id) {
  return element('div', { className: 'field' }, [
    element('label', { text: label, attrs: { for: id } }),
    control
  ]);
}

function list(items, project) {
  const container = element('ul', { className: 'data-list' });
  for (const item of items) {
    const projected = project(item);
    container.append(element('li', {}, [
      element('strong', { text: projected.title }),
      element('span', { text: projected.detail })
    ]));
  }
  return container;
}

function rawDetails(label, value, open = false) {
  return element('details', {
    className: 'raw-details',
    attrs: open ? { open: '' } : {}
  }, [
    element('summary', { text: label }),
    element('pre', { text: JSON.stringify(value, null, 2) })
  ]);
}

function notice(text) {
  return element('div', { className: 'notice', text });
}

function empty(text) {
  return element('div', { className: 'empty-state', text });
}

function element(tag, { className, text, attrs = {} } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function summarizeRuntime(runtime) {
  const entries = Object.entries(runtime);
  if (!entries.length) return 'No runtime detail was returned.';
  return entries
    .map(([name, value]) => `${name}: ${value?.status ?? value?.mode ?? 'reported'}`)
    .join(' · ');
}

function setViewBusy(busy, label = 'Loading') {
  view.setAttribute('aria-busy', String(busy));
  if (busy && !view.childElementCount) {
    view.replaceChildren(element('div', { className: 'loading', text: label }));
  }
}

function clearSession() {
  if (state.session) state.session.token = '';
  state.session = null;
  state.client = null;
}

function announce(message) {
  announcement.textContent = '';
  requestAnimationFrame(() => {
    announcement.textContent = message;
  });
}
