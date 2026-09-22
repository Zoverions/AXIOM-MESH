import {
  createGatewayClient,
  GatewayClientError
} from '/vendor/axiom-client.mjs';
import { createHumanPresenter } from '/presentation.mjs';
import { buildBrowserOrganizeDraft } from '/local-organize.mjs';

const ROUTES = new Set([
  'overview',
  'ask',
  'social',
  'approvals',
  'vault',
  'receipts',
  'share',
  'explore'
]);

// Actual AXIOM-MESH substrate mark (repo-root logo.png bytes, base64).
// Shown only where the mesh/network itself is represented: the connection
// line, the footer affiliation, and mesh provenance badges. The product mark
// (AXIOM One) lives in /icon.svg and the header brand slot.
const MESH_LOGO = 'data:image/png;base64,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';

const state = {
  client: null,
  session: null,
  route: 'overview',
  lastIntent: null,
  pendingIntent: null,
  vault: {
    pending: null,
    last: null,
    organizePending: null,
    organizeDraft: null
  }
};

const view = document.querySelector('#view');
const connectPanel = document.querySelector('#connect-panel');
const connectForm = document.querySelector('#connect-form');
const tokenInput = document.querySelector('#token-input');
const disconnectButton = document.querySelector('#disconnect-button');
const connectionDot = document.querySelector('#connection-dot');
const connectionLabel = document.querySelector('#connection-label');
const connectionSummary = document.querySelector('.connection-summary');
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
    connectionSummary.classList.add('is-connected');
    connectionLabel.textContent = 'Connected · your AXIOM-MESH node';
    announce('Connected to your AXIOM-MESH node');
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
  connectionSummary.classList.remove('is-connected');
  connectionLabel.textContent = 'Not connected';
  state.lastIntent = null;
  state.pendingIntent = null;
  state.vault.pending = null;
  state.vault.last = null;
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
  connectionSummary.classList.remove('is-connected');
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
      social: renderSocial,
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
      card('No production AI', 'External model adapters are not configured. A local organizer stub can draft suggestions only; Ask still begins with a transparent echo test.')
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
    notice('AI is not enabled as a production provider. This Ask path reviews and sends system.echo through Gateway → Hypervisor → Sandbox → Grid. Vault can run a local organizer stub for draft suggestions only.'),
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

async function renderSocial() {
  const response = await state.client.call('social.get', {
    query: { publication_limit: 100 }
  });
  const actors = Array.isArray(response.actors) ? response.actors : [];
  const personas = Array.isArray(response.personas) ? response.personas : [];
  const publications = Array.isArray(response.corpus?.publications)
    ? response.corpus.publications
    : [];
  const transitions = Array.isArray(response.corpus?.transitions)
    ? response.corpus.transitions
    : [];
  const localOnly = response.network_effect === 'none';

  const actorCards = actors.length
    ? element('div', { className: 'stack' }, actors.map(actor => element('article', {
      className: 'card full'
    }, [
      element('span', { className: 'badge good', text: actor.custody ?? 'owner-local' }),
      element('h2', { text: actor.actor_id ?? 'Local actor' }),
      element('p', { text: `Status: ${actor.status ?? 'unknown'}` }),
      rawDetails('Inspect actor projection', actor)
    ])))
    : empty('No local social actor is visible to this authenticated principal.');

  const personaCards = personas.length
    ? element('div', { className: 'stack' }, personas.map(persona => {
      const projection = persona.public_projection ?? {};
      return element('article', { className: 'card full' }, [
        element('span', { className: 'badge good', text: persona.status ?? 'unknown' }),
        element('h2', { text: projection.display_name ?? persona.persona_id ?? 'Publication persona' }),
        element('p', { text: `Actor: ${persona.actor_id ?? 'unknown'} · Attribution: ${projection.attribution_mode ?? persona.protected_persona?.attribution_mode ?? 'unspecified'}` }),
        rawDetails('Inspect persona projection', persona)
      ]);
    }))
    : empty('No publication persona is visible to this authenticated principal.');

  const publicationCards = publications.length
    ? element('div', { className: 'stack' }, publications.map(publication => {
      const projection = publication.publication ?? {};
      const status = publication.status ?? 'unknown';
      const text = typeof projection.content?.text === 'string'
        ? projection.content.text
        : 'No text projection is available.';
      return element('article', { className: 'card full' }, [
        element('span', {
          className: `badge ${status === 'active' ? 'good' : 'pending'}`,
          text: status
        }),
        element('h2', { text: text }),
        element('p', {
          text: `${projection.created_at ?? 'time unavailable'} · ${projection.authorship_mode ?? 'authorship unspecified'} · ${projection.discoverability ?? 'discoverability unspecified'}`
        }),
        projection.supersedes_digest
          ? element('p', { text: `Supersedes: ${projection.supersedes_digest}` })
          : element('p', { text: 'Original local publication projection.' }),
        rawDetails('Inspect exact publication projection', publication)
      ]);
    }))
    : empty('No local publications are visible to this authenticated principal.');

  view.replaceChildren(
    header('Owner-local Social corpus',
      'Inspect the social identity, persona, and append-only publication history already held by this node. This read surface derives the owner only from the authenticated principal.'),
    grid([
      metricCard('Actors', String(actors.length), 'Owner-local actor identities'),
      metricCard('Personas', String(personas.length), 'Publication personas'),
      metricCard('Publications', String(publications.length), 'Bounded corpus entries'),
      card('Network effect', localOnly ? 'None. No federation or remote distribution occurs.' : 'Unexpected network-effect value returned; inspect the raw response.', {
        wide: true,
        badge: [localOnly ? 'No federation' : 'Inspect', localOnly ? 'good' : 'danger']
      })
    ]),
    notice('This tranche is read-only in AXIOM One. Local actor/persona/publication mutation already exists in the kernel, but browser write controls remain disabled until their human explanation and reviewed-request flows are separately bound and tested.'),
    element('section', { className: 'stack', attrs: { 'aria-labelledby': 'social-actors-heading' } }, [
      element('h2', { text: 'Local actor custody', attrs: { id: 'social-actors-heading' } }),
      actorCards
    ]),
    element('section', { className: 'stack', attrs: { 'aria-labelledby': 'social-personas-heading' } }, [
      element('h2', { text: 'Publication personas', attrs: { id: 'social-personas-heading' } }),
      personaCards
    ]),
    element('section', { className: 'stack', attrs: { 'aria-labelledby': 'social-corpus-heading' } }, [
      element('h2', { text: 'Append-only publication corpus', attrs: { id: 'social-corpus-heading' } }),
      publicationCards
    ]),
    grid([
      metricCard('Retraction records', String(transitions.length), 'Visible transitions for selected corpus entries'),
      metricCard('Truncated', response.corpus?.truncated ? 'Yes' : 'No', 'Publication limit: 100')
    ]),
    rawDetails('Raw owner-local Social snapshot', response)
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
  const edges = response.edges ?? [];
  const objectTitle = item => typeof item.payload_json?.content?.title === 'string'
    ? item.payload_json.content.title
    : item.object_id ?? item.id ?? 'Memory object';
  const objectLabels = new Map(objects.map(item => {
    const objectId = item.object_id ?? item.id;
    return [objectId, objectTitle(item)];
  }));
  const form = element('form', { className: 'stack' });
  const title = element('input', {
    attrs: {
      id: 'memory-title',
      name: 'title',
      required: '',
      maxlength: '200',
      placeholder: 'A short private title'
    }
  });
  const text = element('textarea', {
    attrs: {
      id: 'memory-text',
      name: 'text',
      required: '',
      maxlength: '10000',
      placeholder: 'Write the private note that this node should retain.'
    }
  });
  const create = element('button', {
    className: 'button button-primary',
    text: 'Review private note',
    attrs: { type: 'submit' }
  });
  const cancel = element('button', {
    className: 'button button-secondary',
    text: 'Cancel pending lifecycle request',
    attrs: { type: 'button', disabled: '' }
  });
  form.append(
    notice('Creating a note writes encrypted local state and append-only evidence. It does not send data to an external provider.'),
    field('Title', title, 'memory-title'),
    field('Private note', text, 'memory-text'),
    element('div', { className: 'actions' }, [create, cancel])
  );
  const provenanceForm = element('form', { className: 'stack' });
  const sourceObject = element('select', {
    attrs: { id: 'provenance-source', name: 'source', required: '' }
  }, [
    element('option', {
      text: 'Choose the source record',
      attrs: { value: '', disabled: '', selected: '' }
    }),
    ...objects.map(item => {
      const objectId = item.object_id ?? item.id ?? '';
      return element('option', {
        text: `${objectTitle(item)} (${objectId.slice(0, 20)}...)`,
        attrs: { value: objectId }
      });
    })
  ]);
  const relation = element('select', {
    attrs: { id: 'provenance-relation', name: 'relation', required: '' }
  }, [
    element('option', { text: 'is derived from', attrs: { value: 'derived-from' } }),
    element('option', { text: 'supports', attrs: { value: 'supports' } }),
    element('option', { text: 'corrects without replacing', attrs: { value: 'corrects' } })
  ]);
  const targetObject = element('select', {
    attrs: { id: 'provenance-target', name: 'target', required: '' }
  }, [
    element('option', {
      text: 'Choose the target record',
      attrs: { value: '', disabled: '', selected: '' }
    }),
    ...objects.map(item => {
      const objectId = item.object_id ?? item.id ?? '';
      return element('option', {
        text: `${objectTitle(item)} (${objectId.slice(0, 20)}...)`,
        attrs: { value: objectId }
      });
    })
  ]);
  const linkButton = element('button', {
    className: 'button button-primary',
    text: 'Review provenance link',
    attrs: { type: 'submit' }
  });
  provenanceForm.append(
    notice('A provenance link records direction and context without changing, hiding, or deleting either record.'),
    field('Source record', sourceObject, 'provenance-source'),
    field('Relationship', relation, 'provenance-relation'),
    field('Target record', targetObject, 'provenance-target'),
    element('ul', { className: 'data-list' }, [
      element('li', {}, [
        element('strong', { text: 'Derived from' }),
        element('span', { text: 'The source record was derived from the target record.' })
      ]),
      element('li', {}, [
        element('strong', { text: 'Supports' }),
        element('span', { text: 'The source record provides support for the target record.' })
      ]),
      element('li', {}, [
        element('strong', { text: 'Corrects' }),
        element('span', { text: 'The source record corrects the target; both records remain active and visible.' })
      ])
    ]),
    objects.length < 2
      ? empty('Create at least two active memory records before linking provenance.')
      : element('div', { className: 'actions' }, [linkButton])
  );

  const organizeForm = element('form', { className: 'stack' });
  const organizeSource = element('select', {
    attrs: { id: 'organize-source', name: 'organize_source' }
  });
  organizeSource.append(element('option', {
    text: 'Paste or type selected text below',
    attrs: { value: '' }
  }));
  const noteTextById = new Map();
  for (const item of objects) {
    const objectId = item.object_id ?? item.id;
    if (typeof objectId !== 'string' || !objectId) continue;
    const noteText = typeof item.payload_json?.content?.text === 'string'
      ? item.payload_json.content.text
      : '';
    noteTextById.set(objectId, noteText.slice(0, 8000));
    organizeSource.append(element('option', {
      text: objectTitle(item),
      attrs: { value: objectId }
    }));
  }
  const organizeText = element('textarea', {
    attrs: {
      id: 'organize-text',
      name: 'organize_text',
      required: '',
      maxlength: '8000',
      placeholder: 'Owner-selected note text to organize locally as a draft suggestion.'
    }
  });
  const organizePurpose = element('input', {
    attrs: {
      id: 'organize-purpose',
      name: 'organize_purpose',
      maxlength: '512',
      value: 'owner-local-organize-draft'
    }
  });
  const organizeSubmit = element('button', {
    className: 'button button-primary',
    text: 'Review local organize',
    attrs: { type: 'submit' }
  });
  organizeForm.append(
    notice('Local organizer stub only. AI is not enabled as a production provider. The result is a draft suggestion and does not mutate Vault until a separate confirmed memory.put write.'),
    field('Include from active note (optional)', organizeSource, 'organize-source'),
    field('Selected note text', organizeText, 'organize-text'),
    field('Purpose', organizePurpose, 'organize-purpose'),
    element('div', { className: 'actions' }, [organizeSubmit])
  );
  organizeSource.addEventListener('change', () => {
    const fromNote = noteTextById.get(organizeSource.value) ?? '';
    if (fromNote) organizeText.value = fromNote;
  });

  const organizeReview = element('div', { className: 'stack', attrs: { id: 'organize-review' } });
  const organizeResult = element('div', { className: 'stack', attrs: { id: 'organize-result' } });

  const renderOrganizeDraft = draft => {
    organizeResult.replaceChildren();
    if (!draft) return;
    const facts = element('dl', { className: 'fact-list' }, [
      element('dt', { text: 'Provider' }),
      element('dd', { text: draft.provider_id }),
      element('dt', { text: 'Model' }),
      element('dd', { text: draft.model }),
      element('dt', { text: 'Purpose' }),
      element('dd', { text: draft.purpose }),
      element('dt', { text: 'Data scope' }),
      element('dd', { text: `${draft.data_scope.kind}; max ${draft.data_scope.max_chars} chars` }),
      element('dt', { text: 'Budget' }),
      element('dd', { text: `in ${draft.budget.max_input_chars} / out ${draft.budget.max_output_chars} / ${draft.budget.max_wall_ms}ms` }),
      element('dt', { text: 'Timeout' }),
      element('dd', { text: `${draft.timeout_ms}ms` }),
      element('dt', { text: 'Cancel' }),
      element('dd', { text: draft.cancel.allowed ? draft.cancel.signal : 'denied' }),
      element('dt', { text: 'Retention' }),
      element('dd', { text: `${draft.retention.kind}; persist=${draft.retention.persist}` }),
      element('dt', { text: 'Note digest' }),
      element('dd', { text: draft.note_digest }),
      element('dt', { text: 'Integrity vs truth' }),
      element('dd', { text: draft.integrity_vs_truth })
    ]);
    const save = element('button', {
      className: 'button button-primary',
      text: 'Review save draft as private note',
      attrs: { type: 'button' }
    });
    const discard = element('button', {
      className: 'button button-secondary',
      text: 'Discard draft',
      attrs: { type: 'button' }
    });
    save.addEventListener('click', () => {
      startReview({
        action: 'memory.put',
        input: {
          kind: 'note',
          content: {
            title: draft.suggestion.title.slice(0, 200),
            text: draft.suggestion.summary_text.slice(0, 10000)
          },
          metadata: { source: 'axiom-one-local-preview' }
        },
        purpose: 'owner-memory-from-organize-draft'
      });
      announce('Draft save requires a separate reviewed memory.put path');
    });
    discard.addEventListener('click', () => {
      state.vault.organizeDraft = null;
      organizeResult.replaceChildren();
      announce('Local organize draft discarded; Vault unchanged');
    });
    organizeResult.append(
      element('article', { className: 'card full' }, [
        element('span', { className: 'badge pending', text: 'Draft suggestion only' }),
        element('h2', { text: draft.suggestion.title }),
        element('p', { text: 'This local organizer stub draft is not a Mesh grant, approval, or production AI result.' }),
        element('pre', { text: draft.suggestion.summary_text }),
        facts,
        element('div', { className: 'actions' }, [save, discard])
      ])
    );
  };

  organizeForm.addEventListener('submit', event => {
    event.preventDefault();
    const pending = {
      body: {
        action: 'ai.local-organize',
        input: { text: organizeText.value },
        purpose: organizePurpose.value || 'owner-local-organize-draft'
      }
    };
    state.vault.organizePending = pending;
    const run = element('button', {
      className: 'button button-primary',
      text: 'Run local organizer stub',
      attrs: { type: 'button' }
    });
    const change = element('button', {
      className: 'button button-secondary',
      text: 'Change selection',
      attrs: { type: 'button' }
    });
    run.addEventListener('click', async () => {
      try {
        const draft = await buildBrowserOrganizeDraft({
          includedText: pending.body.input.text,
          purpose: pending.body.purpose,
          principalId: state.session?.principal_id || 'local-owner'
        });
        state.vault.organizeDraft = draft;
        state.vault.organizePending = null;
        organizeReview.replaceChildren();
        renderOrganizeDraft(draft);
        announce('Local organize draft ready; Vault was not mutated');
      } catch (error) {
        organizeResult.replaceChildren(errorBox(error, 'Local organize draft failed closed'));
        announce('Local organize draft failed closed');
      }
    });
    change.addEventListener('click', () => {
      state.vault.organizePending = null;
      organizeReview.replaceChildren();
      organizeText.focus();
      announce('Local organize review closed without running');
    });
    organizeReview.replaceChildren(humanExplanation(
      human.requestPreview(pending.body),
      'Local organize request (not a Mesh intent)',
      pending.body,
      [run, change]
    ));
    announce('Local organize review is ready; nothing has been written');
  });


  const review = element('div', { className: 'stack', attrs: { id: 'vault-review' } });
  const result = element('div', { className: 'stack', attrs: { id: 'vault-result' } });
  let activeController;

  const renderLast = () => {
    result.replaceChildren();
    const last = state.vault.last;
    if (!last) return;
    const actions = [];
    if (last.model.retrySameRequest && state.vault.pending) {
      const retry = element('button', {
        className: 'button button-primary',
        text: 'Retry same request safely',
        attrs: { type: 'button' }
      });
      retry.addEventListener('click', () => executePending());
      actions.push(retry);
    }
    const exportId = typeof last.raw?.export_id === 'string' ? last.raw.export_id : null;
    const inspection = element('div', { className: 'stack' });
    if (exportId && last.model.state === 'completed') {
      const inspect = element('button', {
        className: 'button button-secondary',
        text: 'Inspect export record',
        attrs: { type: 'button' }
      });
      const reveal = element('button', {
        className: 'button button-secondary',
        text: 'Reveal bundle in this page',
        attrs: { type: 'button' }
      });
      inspect.addEventListener('click', async () => {
        inspect.disabled = true;
        inspection.replaceChildren(notice('Loading the owner-scoped export record…'));
        try {
          const record = await state.client.call('exports.get', { params: { id: exportId } });
          inspection.replaceChildren(rawDetails('Owner-scoped export record', record, true));
          announce('Export record loaded');
        } catch (error) {
          inspection.replaceChildren(errorBox(error, 'Export record is unavailable'));
        } finally {
          inspect.disabled = false;
        }
      });
      reveal.addEventListener('click', async () => {
        reveal.disabled = true;
        inspection.replaceChildren(notice('Loading the selected bundle into this open page only. It is not stored by AXIOM One.'));
        try {
          const bundle = await state.client.call('export_bundles.get', { params: { id: exportId } });
          inspection.replaceChildren(
            notice('Sensitive export content is visible below. AXIOM One has not saved it in browser storage.'),
            rawDetails('Revealed local export bundle', bundle, true)
          );
          announce('Local export bundle revealed in this page');
        } catch (error) {
          inspection.replaceChildren(errorBox(error, 'Export bundle is unavailable'));
        } finally {
          reveal.disabled = false;
        }
      });
      actions.push(inspect, reveal);
    }
    result.append(
      humanExplanation(last.model, 'Raw result and evidence', last.raw, actions),
      inspection
    );
  };

  const renderReview = () => {
    review.replaceChildren();
    const pending = state.vault.pending;
    if (!pending) return;
    const send = element('button', {
      className: 'button button-primary',
      text: 'Send reviewed lifecycle request',
      attrs: { type: 'button' }
    });
    const change = element('button', {
      className: 'button button-secondary',
      text: 'Cancel without sending',
      attrs: { type: 'button' }
    });
    send.addEventListener('click', () => executePending());
    change.addEventListener('click', async () => {
      state.vault.pending = null;
      announce('Memory lifecycle review closed without sending');
      await renderVault();
    });
    review.append(humanExplanation(
      human.requestPreview(pending.body),
      'Exact lifecycle request to submit',
      pending.body,
      [send, change]
    ));
  };

  const executePending = async () => {
    const pending = state.vault.pending;
    if (!pending || activeController) return;
    activeController = new AbortController();
    cancel.disabled = false;
    review.replaceChildren();
    result.replaceChildren(notice('Submitting the reviewed lifecycle request through the local policy and evidence path…'));
    try {
      const raw = await state.client.call('intents.submit', {
        body: pending.body,
        idempotencyKey: pending.idempotencyKey,
        signal: activeController.signal
      });
      const model = human.intentSuccess({
        request: pending.body,
        response: raw,
        idempotencyKey: pending.idempotencyKey
      });
      state.vault.last = { model, raw };
      state.vault.pending = null;
      announce(`${model.title}; the Vault view is refreshing`);
      await renderVault();
    } catch (error) {
      const raw = serializableError(error);
      const model = human.intentFailure({
        request: pending.body,
        error: raw,
        idempotencyKey: pending.idempotencyKey
      });
      state.vault.last = { model, raw };
      if (!model.retrySameRequest) {
        state.vault.pending = null;
        announce('Lifecycle request did not complete');
        await renderVault();
        return;
      }
      create.disabled = Boolean(state.vault.pending);
      linkButton.disabled = Boolean(state.vault.pending) || objects.length < 2;
      renderLast();
      renderReview();
      announce('Lifecycle outcome is not confirmed; same-request recovery is available');
    } finally {
      activeController = null;
      cancel.disabled = true;
    }
  };

  const startReview = body => {
    if (state.vault.pending) return;
    state.vault.pending = {
      body,
      idempotencyKey: `axiom-one:vault:${crypto.randomUUID()}`
    };
    create.disabled = true;
    linkButton.disabled = true;
    renderReview();
    announce('Memory lifecycle review is ready; nothing has been sent');
    review.scrollIntoView({ block: 'nearest' });
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    const cleanTitle = title.value.trim();
    if (!cleanTitle) {
      title.setCustomValidity('Enter a title containing at least one visible character.');
      title.reportValidity();
      return;
    }
    title.setCustomValidity('');
    if (!text.value.trim()) {
      text.setCustomValidity('Enter a private note containing at least one visible character.');
      text.reportValidity();
      return;
    }
    text.setCustomValidity('');
    startReview({
      action: 'memory.put',
      input: {
        kind: 'note',
        content: { title: cleanTitle, text: text.value },
        metadata: { source: 'axiom-one-local-preview' }
      },
      purpose: 'private-memory-recording'
    });
  });
  cancel.addEventListener('click', () => activeController?.abort());
  provenanceForm.addEventListener('submit', event => {
    event.preventDefault();
    targetObject.setCustomValidity('');
    if (sourceObject.value === targetObject.value) {
      targetObject.setCustomValidity('Choose two different memory records for a provenance link.');
      targetObject.reportValidity();
      return;
    }
    startReview({
      action: 'memory.link',
      input: {
        from_id: sourceObject.value,
        to_id: targetObject.value,
        relation: relation.value,
        metadata: { source: 'axiom-one-local-preview' }
      },
      purpose: 'owner-memory-provenance'
    });
  });

  const records = objects.length
    ? element('div', { className: 'stack' }, objects.map(item => {
      const objectId = item.object_id ?? item.id;
      const title = objectTitle(item);
      const remove = element('button', {
        className: 'button button-secondary',
        text: 'Review removal',
        attrs: { type: 'button' }
      });
      const exportButton = element('button', {
        className: 'button button-secondary',
        text: 'Review selective export',
        attrs: { type: 'button' }
      });
      const validObject = typeof objectId === 'string' && objectId.length > 0;
      remove.disabled = !validObject || Boolean(state.vault.pending);
      exportButton.disabled = !validObject || Boolean(state.vault.pending);
      remove.addEventListener('click', () => startReview({
        action: 'memory.tombstone',
        input: {
          object_id: objectId,
          reason: 'Owner removed this record through AXIOM One local preview.'
        },
        confirmations: ['confirm:memory.tombstone'],
        purpose: 'owner-memory-tombstone'
      }));
      exportButton.addEventListener('click', () => startReview({
        action: 'export.create',
        input: { types: ['memory'], object_ids: [objectId] },
        purpose: 'owner-selective-memory-export'
      }));
      return element('article', { className: 'card full' }, [
        element('span', { className: 'badge good', text: 'Encrypted local record' }),
        element('h2', { text: title }),
        element('p', { text: `${item.kind ?? 'record'} · ${item.created_at ?? 'time unavailable'}` }),
        element('div', { className: 'actions' }, [remove, exportButton]),
        rawDetails('Inspect exact memory record', item)
      ]);
    }))
    : empty('No active memory objects are visible to this principal.');

  const provenance = edges.length
    ? element('div', { className: 'stack' }, edges.map(item => {
      const source = objectLabels.get(item.from_id) ?? item.from_id ?? 'Unknown source';
      const target = objectLabels.get(item.to_id) ?? item.to_id ?? 'Unknown target';
      const relationLabel = {
        'derived-from': 'is derived from',
        supports: 'supports',
        corrects: 'corrects without replacing'
      }[item.relation] ?? 'has an unmapped relationship with';
      return element('article', { className: 'card full' }, [
        element('span', { className: 'mesh-affil' }, [
          meshMark(),
          element('span', { className: 'badge good', text: 'Owner-scoped provenance' })
        ]),
        element('h2', { text: `${source} ${relationLabel} ${target}` }),
        element('p', { text: 'Both linked records remain independently visible. This edge grants no authority and sends no data.' }),
        rawDetails('Inspect exact provenance edge', item)
      ]);
    }))
    : empty('No active provenance links are visible to this principal.');

  view.replaceChildren(
    header('Private vault',
      'Create, link, inspect, tombstone, and selectively export owner-scoped encrypted memory through explicit reviewed local requests.'),
    grid([
      metricCard('Objects', String(objects.length), 'Visible memory records'),
      metricCard('Links', String(response.edges?.length ?? 0), 'Visible provenance edges'),
      card('Lifecycle boundary', 'Hard deletion, restore, background export, sharing, bulk ingestion, and browser persistence remain unavailable.', {
        wide: true,
        badge: ['Bounded preview', 'pending']
      })
    ]),
    element('section', { className: 'stack', attrs: { 'aria-labelledby': 'create-memory-heading' } }, [
      element('h2', { text: 'Create a private note', attrs: { id: 'create-memory-heading' } }),
      form
    ]),
    element('section', { className: 'stack', attrs: { 'aria-labelledby': 'organize-memory-heading' } }, [
      element('h2', { text: 'Local organize (draft only)', attrs: { id: 'organize-memory-heading' } }),
      organizeForm
    ]),
    organizeReview,
    organizeResult,
    element('section', { className: 'stack', attrs: { 'aria-labelledby': 'link-memory-heading' } }, [
      element('h2', { text: 'Record provenance', attrs: { id: 'link-memory-heading' } }),
      provenanceForm
    ]),
    review,
    result,
    element('section', { className: 'stack', attrs: { 'aria-labelledby': 'memory-records-heading' } }, [
      element('h2', { text: 'Active memory records', attrs: { id: 'memory-records-heading' } }),
      records
    ]),
    element('section', { className: 'stack', attrs: { 'aria-labelledby': 'memory-links-heading' } }, [
      element('h2', { text: 'Active provenance links', attrs: { id: 'memory-links-heading' } }),
      provenance
    ]),
    rawDetails('Raw memory response', response)
  );
  create.disabled = Boolean(state.vault.pending);
  organizeSubmit.disabled = Boolean(state.vault.pending);
  linkButton.disabled = Boolean(state.vault.pending) || objects.length < 2;
  if (state.vault.pending) renderReview();
  if (state.vault.organizeDraft) renderOrganizeDraft(state.vault.organizeDraft);
  renderLast();
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
    ['Owner-local Social', 'social.get'],
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

function meshMark() {
  return element('img', {
    className: 'mesh-mark',
    attrs: {
      src: MESH_LOGO,
      alt: 'AXIOM-MESH',
      width: '18',
      height: '18'
    }
  });
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
