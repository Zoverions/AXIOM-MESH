import {
  createGatewayClient,
  GatewayClientError
} from '/vendor/axiom-client.mjs';
import { createHumanPresenter } from '/presentation.mjs';
import {
  buildSocialActorCreateRequest,
  buildSocialPersonaCreateRequest,
  buildSocialPublicationCreateRequest,
  buildSocialPublicationRetractRequest,
  buildSocialPublicationSupersedeRequest
} from '/social-workflows.mjs';

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

const state = {
  client: null,
  session: null,
  route: 'overview',
  lastIntent: null,
  pendingIntent: null,
  social: {
    pending: null,
    last: null
  },
  vault: {
    pending: null,
    last: null
  }
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
  state.social.pending = null;
  state.social.last = null;
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
  const localOnly = response.network_effect === 'none'
    && response.remote_distribution === false
    && response.federation === false
    && response.delivery === false;
  const activeActors = actors.filter(actor => (
    actor?.status === 'active' && actor?.custody === 'owner-local'
  ));
  const activeActor = activeActors.length === 1 ? activeActors[0] : null;
  const activePersonas = activeActor
    ? personas.filter(persona => (
      persona?.status === 'active'
      && persona?.actor_id === activeActor.actor_id
      && persona?.protected_persona?.attribution_mode === 'pseudonymous'
      && persona?.public_projection?.attribution_mode === 'pseudonymous'
    ))
    : [];
  const activePersona = activePersonas.length === 1 ? activePersonas[0] : null;
  const review = element('div', { className: 'stack', attrs: { id: 'social-review' } });
  const result = element('div', { className: 'stack', attrs: { id: 'social-result' } });
  const cancelWait = element('button', {
    className: 'button button-secondary',
    text: 'Cancel pending Social wait',
    attrs: { type: 'button', disabled: '' }
  });
  let activeController;

  const renderLast = () => {
    result.replaceChildren();
    const last = state.social.last;
    if (!last) return;
    const actions = [];
    if (last.model.retrySameRequest && state.social.pending) {
      const retry = element('button', {
        className: 'button button-primary',
        text: 'Retry same request safely',
        attrs: { type: 'button' }
      });
      retry.addEventListener('click', () => executePending());
      actions.push(retry);
    }
    result.append(humanExplanation(
      last.model,
      'Raw Social intent result and evidence',
      last.raw,
      actions
    ));
  };

  const renderReview = () => {
    review.replaceChildren();
    const pending = state.social.pending;
    if (!pending) return;
    const send = element('button', {
      className: 'button button-primary',
      text: 'Send reviewed Social request',
      attrs: { type: 'button' }
    });
    const change = element('button', {
      className: 'button button-secondary',
      text: 'Cancel without sending',
      attrs: { type: 'button' }
    });
    send.addEventListener('click', () => executePending());
    change.addEventListener('click', async () => {
      state.social.pending = null;
      announce('Social review closed without sending; nothing has been sent');
      await renderSocial();
    });
    review.append(humanExplanation(
      human.requestPreview(pending.body),
      'Exact local Social request to submit',
      pending.body,
      [send, change]
    ));
  };

  const executePending = async () => {
    const pending = state.social.pending;
    if (!pending || activeController) return;
    activeController = new AbortController();
    cancelWait.disabled = false;
    review.replaceChildren();
    result.replaceChildren(notice('Submitting the reviewed local Social request through the existing policy and evidence path…'));
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
      state.social.last = { model, raw };
      state.social.pending = null;
      announce(`${model.title}; local Social state is refreshing`);
      await renderSocial();
    } catch (error) {
      const raw = serializableError(error);
      const model = human.intentFailure({
        request: pending.body,
        error: raw,
        idempotencyKey: pending.idempotencyKey
      });
      state.social.last = { model, raw };
      if (!model.retrySameRequest) {
        state.social.pending = null;
        announce('Local Social request did not complete');
        await renderSocial();
        return;
      }
      renderLast();
      renderReview();
      announce('Social outcome is not confirmed; Retry same request safely preserves the exact request key');
    } finally {
      activeController = null;
      cancelWait.disabled = true;
    }
  };

  const startReview = body => {
    if (!localOnly || state.social.pending) return;
    state.social.pending = {
      body,
      idempotencyKey: `axiom-one:social:${crypto.randomUUID()}`
    };
    renderReview();
    announce('Local Social review is ready; nothing has been sent');
    review.scrollIntoView({ block: 'nearest' });
  };

  cancelWait.addEventListener('click', () => activeController?.abort());

  const lifecycleControls = element('div', { className: 'stack' });
  if (!localOnly) {
    lifecycleControls.append(notice('Social mutation is blocked because the owner snapshot did not prove the exact local-only, no-delivery boundary.'));
  } else if (activeActors.length > 1) {
    lifecycleControls.append(notice('Social mutation is blocked because more than one active owner-local actor was returned. Resolve the ambiguous actor state first.'));
  } else if (!activeActor) {
    const createActor = element('button', {
      className: 'button button-primary',
      text: 'Create local Social actor',
      attrs: { type: 'button' }
    });
    createActor.disabled = Boolean(state.social.pending);
    createActor.addEventListener('click', () => startReview(buildSocialActorCreateRequest()));
    lifecycleControls.append(
      notice('Create one owner-local actor through a reviewed request. No federation, delivery, relay, or external identity provider is involved.'),
      element('div', { className: 'actions' }, [createActor])
    );
  } else if (activePersonas.length > 1) {
    lifecycleControls.append(notice('Social publication is blocked because more than one active pseudonymous persona is bound to the local actor. Resolve the ambiguous persona state first.'));
  } else if (!activePersona) {
    const createPersona = element('button', {
      className: 'button button-primary',
      text: 'Create pseudonymous persona',
      attrs: { type: 'button' }
    });
    createPersona.disabled = Boolean(state.social.pending);
    createPersona.addEventListener('click', () => startReview(
      buildSocialPersonaCreateRequest({ actor: activeActor })
    ));
    lifecycleControls.append(
      notice('The current product boundary permits one active pseudonymous publication persona. Protected actor linkage remains owner-local.'),
      element('div', { className: 'actions' }, [createPersona])
    );
  } else {
    const composeForm = element('form', { className: 'stack' });
    const publicationText = element('textarea', {
      attrs: {
        id: 'social-publication-text',
        name: 'publication',
        required: '',
        maxlength: '65536',
        placeholder: 'Write a local Social publication.'
      }
    });
    const reviewPublication = element('button', {
      className: 'button button-primary',
      text: 'Review local publication',
      attrs: { type: 'submit' }
    });
    reviewPublication.disabled = Boolean(state.social.pending);
    composeForm.append(
      notice('Publication boundary: text/plain · public · listed · human-authored · owner-local. No federation or remote delivery occurs.'),
      field('Publication text', publicationText, 'social-publication-text'),
      element('div', { className: 'actions' }, [reviewPublication])
    );
    composeForm.addEventListener('submit', event => {
      event.preventDefault();
      if (!publicationText.value.trim()) {
        publicationText.setCustomValidity('Enter publication text containing at least one visible character.');
        publicationText.reportValidity();
        return;
      }
      publicationText.setCustomValidity('');
      startReview(buildSocialPublicationCreateRequest({
        actor: activeActor,
        persona: activePersona,
        text: publicationText.value
      }));
    });
    lifecycleControls.append(composeForm);
  }

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
      const controls = [];
      const editable = localOnly
        && activeActor
        && activePersona
        && status === 'active'
        && publication.retracted !== true
        && projection.persona_id === activePersona.persona_id;
      if (editable) {
        const editText = element('textarea', {
          attrs: {
            'aria-label': `Edit ${projection.publication_id ?? 'publication'}`,
            maxlength: '65536'
          }
        });
        editText.value = text;
        const edit = element('button', {
          className: 'button button-secondary',
          text: 'Review edit',
          attrs: { type: 'button' }
        });
        const retract = element('button', {
          className: 'button button-secondary',
          text: 'Review retraction',
          attrs: { type: 'button' }
        });
        edit.disabled = Boolean(state.social.pending);
        retract.disabled = Boolean(state.social.pending);
        edit.addEventListener('click', () => {
          if (!editText.value.trim()) {
            editText.setCustomValidity('Enter replacement text containing at least one visible character.');
            editText.reportValidity();
            return;
          }
          editText.setCustomValidity('');
          startReview(buildSocialPublicationSupersedeRequest({
            actor: activeActor,
            persona: activePersona,
            previousPublication: projection,
            text: editText.value
          }));
        });
        retract.addEventListener('click', () => startReview(
          buildSocialPublicationRetractRequest({
            actor: activeActor,
            previousPublication: projection
          })
        ));
        controls.push(
          notice('Edits append a superseding publication; retractions append a retraction. Neither operation erases prior local evidence.'),
          editText,
          element('div', { className: 'actions' }, [edit, retract])
        );
      }
      return element('article', { className: 'card full' }, [
        element('span', {
          className: `badge ${status === 'active' ? 'good' : 'pending'}`,
          text: status
        }),
        element('h2', { text }),
        element('p', {
          text: `${projection.created_at ?? 'time unavailable'} · ${projection.authorship_mode ?? 'authorship unspecified'} · ${projection.discoverability ?? 'discoverability unspecified'}`
        }),
        projection.supersedes_digest
          ? element('p', { text: `Supersedes: ${projection.supersedes_digest}` })
          : element('p', { text: 'Original local publication projection.' }),
        ...controls,
        rawDetails('Inspect exact publication projection', publication)
      ]);
    }))
    : empty('No local publications are visible to this authenticated principal.');

  view.replaceChildren(
    header('Owner-local Social corpus',
      'Create and inspect local social identity, persona, and append-only publication history through reviewed requests. The authenticated owner remains the only browser-side authority context.'),
    grid([
      metricCard('Actors', String(actors.length), 'Owner-local actor identities'),
      metricCard('Personas', String(personas.length), 'Publication personas'),
      metricCard('Publications', String(publications.length), 'Bounded corpus entries'),
      card('Network effect', localOnly ? 'None. No federation or remote distribution occurs.' : 'Unexpected network-effect value returned; Social writes are blocked.', {
        wide: true,
        badge: [localOnly ? 'No federation' : 'Blocked', localOnly ? 'good' : 'danger']
      })
    ]),
    element('section', { className: 'stack', attrs: { 'aria-labelledby': 'social-lifecycle-heading' } }, [
      element('h2', { text: 'Reviewed local lifecycle', attrs: { id: 'social-lifecycle-heading' } }),
      notice('Every Social write is reviewed before submission. Until you choose Send reviewed Social request, nothing has been sent.'),
      lifecycleControls,
      cancelWait
    ]),
    review,
    result,
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
  if (state.social.pending) renderReview();
  renderLast();
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
        element('span', { className: 'badge good', text: 'Owner-scoped provenance' }),
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
  linkButton.disabled = Boolean(state.vault.pending) || objects.length < 2;
  if (state.vault.pending) renderReview();
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
