import {
  createGatewayClient,
  GatewayClientError
} from '/vendor/axiom-client.mjs';
import { createHumanPresenter } from '/presentation.mjs';

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
  lastIntent: null,
  pendingIntent: null
};

const view = document.querySelector('#view');
const connectPanel = document.querySelector('#connect-panel');
const connectForm = document.querySelector('#connect-form');
const tokenInput = document.querySelector('#token-input');
const disconnectButton = document.querySelector('#disconnect-button');
const connectionDot = document.querySelector('#connection-dot');
const connectionLabel = document.querySelector('#connection-label');
const announcement = document.querySelector('#announcement');
const human = createHumanPresenter(await loadHumanContract());

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
  state.pendingIntent = null;
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
    notice('AI is not enabled. This transparent workflow reviews and sends system.echo through Gateway → Hypervisor → Sandbox → Grid, then keeps its exact evidence available.'),
    field('Message', message, 'ask-message'),
    field('Purpose', purpose, 'ask-purpose'),
    element('div', { className: 'actions' }, [
      element('button', {
        className: 'button button-primary',
        text: 'Review request',
        attrs: { type: 'submit' }
      }),
      element('button', {
        className: 'button button-secondary',
        text: 'Cancel pending request',
        attrs: { type: 'button', id: 'cancel-intent', disabled: '' }
      })
    ])
  );
  const review = element('div', { className: 'stack', attrs: { id: 'intent-review' } });
  const result = element('div', { className: 'stack', attrs: { id: 'intent-result' } });
  const submit = form.querySelector('[type="submit"]');
  const cancel = form.querySelector('#cancel-intent');
  let activeController;

  const setEditingLocked = locked => {
    message.disabled = locked;
    purpose.disabled = locked;
    submit.disabled = locked;
  };

  const renderLastIntent = () => {
    result.replaceChildren();
    if (!state.lastIntent) return;
    const retry = state.lastIntent.model.retrySameRequest && state.pendingIntent
      ? element('button', {
        className: 'button button-primary',
        text: 'Retry same request safely',
        attrs: { type: 'button' }
      })
      : null;
    retry?.addEventListener('click', () => executePending());
    result.append(humanExplanation(
      state.lastIntent.model,
      'Raw result and evidence',
      state.lastIntent.raw,
      retry ? [retry] : []
    ));
  };

  const renderReview = pending => {
    const send = element('button', {
      className: 'button button-primary',
      text: 'Send reviewed request',
      attrs: { type: 'button' }
    });
    const change = element('button', {
      className: 'button button-secondary',
      text: 'Change request',
      attrs: { type: 'button' }
    });
    send.addEventListener('click', () => executePending());
    change.addEventListener('click', () => {
      state.pendingIntent = null;
      review.replaceChildren();
      setEditingLocked(false);
      message.focus();
      announce('Request review closed without sending');
    });
    review.replaceChildren(humanExplanation(
      human.requestPreview(pending.body),
      'Exact request to submit',
      pending.body,
      [send, change]
    ));
  };

  const executePending = async () => {
    const pending = state.pendingIntent;
    if (!pending || activeController) return;
    activeController = new AbortController();
    cancel.disabled = false;
    setEditingLocked(true);
    review.replaceChildren();
    result.replaceChildren(notice('Submitting the reviewed request through the local policy and evidence path…'));
    try {
      const response = await state.client.call('intents.submit', {
        body: pending.body,
        idempotencyKey: pending.idempotencyKey,
        signal: activeController.signal
      });
      state.lastIntent = {
        model: human.intentSuccess({
          request: pending.body,
          response,
          idempotencyKey: pending.idempotencyKey
        }),
        raw: response
      };
      state.pendingIntent = null;
      setEditingLocked(false);
      renderLastIntent();
      announce('Intent completed and its evidence is available');
    } catch (error) {
      const raw = serializableError(error);
      const model = human.intentFailure({
        request: pending.body,
        error: raw,
        idempotencyKey: pending.idempotencyKey
      });
      state.lastIntent = { model, raw };
      if (!model.retrySameRequest) {
        state.pendingIntent = null;
        setEditingLocked(false);
      }
      renderLastIntent();
      announce(model.state === 'uncertain'
        ? 'Intent outcome is not confirmed; same-request recovery is available'
        : 'Intent did not complete');
    } finally {
      activeController = null;
      cancel.disabled = true;
    }
  };

  cancel.addEventListener('click', () => activeController?.abort());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const pending = {
      body: {
        action: 'system.echo',
        input: { message: message.value },
        purpose: purpose.value || 'local-preview-echo'
      },
      idempotencyKey: `axiom-one:${crypto.randomUUID()}`
    };
    state.pendingIntent = pending;
    setEditingLocked(true);
    renderReview(pending);
    announce('Request review is ready; nothing has been sent');
  });
  if (state.pendingIntent && state.lastIntent?.model.retrySameRequest) {
    setEditingLocked(true);
  }
  renderLastIntent();
  view.replaceChildren(
    header('Ask, with the boundary visible',
      'Review one local deterministic action before submission, then inspect its policy, plan, execution, and recovery evidence without a hidden model.'),
    form,
    review,
    result
  );
}

async function renderApprovals() {
  const response = await state.client.call('approvals.list');
  const approvals = response.approvals ?? [];
  view.replaceChildren(
    header('Approvals',
      'Active, expired, and consumed one-use approvals are explained without adding, widening, or self-granting authority.'),
    approvals.length
      ? element('div', { className: 'stack' }, approvals.map(item => humanExplanation(
        human.approval(item),
        'Raw approval evidence',
        item
      )))
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
      'Every current kernel event kind has a bounded plain-language mapping while raw payload, trace, and event identifiers remain available.'),
    events.length
      ? element('div', { className: 'stack' }, events.map(item => humanExplanation(
        human.receipt(item),
        'Raw event evidence',
        item
      )))
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

function humanExplanation(model, rawLabel, raw, actions = []) {
  const facts = element('dl', { className: 'fact-list' });
  for (const item of model.facts) {
    facts.append(
      element('dt', { text: item.label }),
      element('dd', { text: item.value })
    );
  }
  const guidance = element('ul', { className: 'guidance-list' },
    model.guidance.map(item => element('li', { text: item })));
  const children = [
    element('span', { className: `badge ${toneBadge(model.tone)}`, text: model.badge }),
    element('h2', { text: model.title }),
    element('p', { text: model.summary })
  ];
  if (model.facts.length) children.push(facts);
  children.push(
    element('h3', { text: 'Authority and next steps' }),
    guidance
  );
  if (actions.length) children.push(element('div', { className: 'actions' }, actions));
  children.push(rawDetails(rawLabel, raw));
  return element('article', {
    className: `explanation tone-${model.tone}`,
    attrs: { 'data-outcome-state': model.state }
  }, children);
}

function toneBadge(tone) {
  if (['ready', 'complete'].includes(tone)) return 'good';
  if (['denied', 'blocked'].includes(tone)) return 'danger';
  return 'pending';
}

function serializableError(error) {
  if (!(error instanceof GatewayClientError)) {
    return {
      code: 'unexpected_client_failure',
      message: 'The local preview could not complete this operation.',
      status: 0,
      retryable: false
    };
  }
  return {
    code: error.code,
    message: error.message,
    status: error.status,
    traceId: error.traceId,
    details: error.details,
    retryable: error.retryable
  };
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

async function loadHumanContract() {
  const response = await fetch('/human-contract.json', {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error'
  });
  if (!response.ok || response.redirected) {
    throw new Error('AXIOM One human explanation contract is unavailable');
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 65_536) {
    throw new Error('AXIOM One human explanation contract is too large');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('AXIOM One human explanation contract is invalid');
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
