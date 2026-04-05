document.addEventListener("DOMContentLoaded", () => {
    // --- Authentication ---
    const apiKeyInput = document.getElementById('dashboard-api-key');
    const savedKey = localStorage.getItem('GATEWAY_API_KEY');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }

    apiKeyInput.addEventListener('change', (e) => {
        localStorage.setItem('GATEWAY_API_KEY', e.target.value);
        // Reconnect WebSocket if key changes
        if (ws && ws.readyState !== WebSocket.CLOSED) {
            ws.close();
        }
        connectWebSocket();
    });

    function getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('GATEWAY_API_KEY') || ''}`
        };
    }

    // --- Navigation Tabs ---
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabs = document.querySelectorAll(".tab-content");
    const navSearch = document.getElementById("nav-search");

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");
            if (!targetId) return;

            navButtons.forEach(b => b.classList.remove("active"));
            tabs.forEach(t => t.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById(targetId).classList.add("active");

            // Auto-refresh logic on tab load
            if (targetId === 'memory') fetchMemory();
            if (targetId === 'agents') fetchAgents();
            if (targetId === 'swarms') fetchSwarms();
            if (targetId === 'comprehensive') fetchComprehensiveDashboard();
            if (targetId === 'tester' && window.initTester) window.initTester();
            if (targetId === 'settings') fetchConfig();
            if (targetId === 'logs') fetchLogs();
        });
    });

    if (navSearch) {
        navSearch.addEventListener("input", () => {
            const query = navSearch.value.trim().toLowerCase();
            navButtons.forEach(btn => {
                const label = btn.textContent.toLowerCase();
                btn.style.display = label.includes(query) ? "" : "none";
            });
        });
    }

    // --- Operator Cockpit History Array ---
    const auditHistory = [];

    // --- Chat WebSocket Logic ---
    const chatMessages = document.getElementById("chat-messages");
    const chatInput = document.getElementById("chat-input");
    const chatSendBtn = document.getElementById("chat-send");
    const chatConnectionStatus = document.getElementById("chat-connection-status");
    const jumpToInputBtn = document.getElementById("jump-to-input");
    const responseStyleSelect = document.getElementById("response-style");
    const consentScopeSelect = document.getElementById("consent-scope");
    const innovationGoalInput = document.getElementById("innovation-goal");
    const innovationRiskSelect = document.getElementById("innovation-risk");
    const innovationOutput = document.getElementById("innovation-output");
    const generateInnovationBtn = document.getElementById("generate-innovation-btn");
    const injectInnovationToChatBtn = document.getElementById("inject-innovation-to-chat-btn");
    const handwritingTextInput = document.getElementById("handwriting-text");
    const handwritingLevelSelect = document.getElementById("handwriting-level");
    const generateHandwritingBtn = document.getElementById("generate-handwriting-btn");
    const clearTraceBtn = document.getElementById("clear-trace-btn");
    const handwritingPreview = document.getElementById("handwriting-preview");
    const traceCanvas = document.getElementById("trace-canvas");

    // --- Session ID Management ---
    let sessionId = localStorage.getItem('axiom_session_id');
    if (!sessionId) {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            sessionId = 'sess_' + crypto.randomUUID();
        } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const array = new Uint8Array(16);
            crypto.getRandomValues(array);
            sessionId = 'sess_' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        } else {
            // Fallback for extremely legacy environments (not expected in AxiomMesh)
            sessionId = 'sess_' + Date.now() + Math.floor(Math.random() * 1000);
        }
        localStorage.setItem('axiom_session_id', sessionId);
    }

    let ws = null;

    function setConnectionStatus(isConnected) {
        if (!chatConnectionStatus) return;
        chatConnectionStatus.textContent = isConnected ? "Connected" : "Offline";
        chatConnectionStatus.classList.toggle("connected", isConnected);
        chatConnectionStatus.classList.toggle("disconnected", !isConnected);
    }

    function updateSendState() {
        if (!chatSendBtn || !chatInput) return;
        const hasText = chatInput.value.trim().length > 0;
        const online = ws && ws.readyState === WebSocket.OPEN;
        chatSendBtn.disabled = !(hasText && online);
    }

    function connectWebSocket() {
        const apiKey = localStorage.getItem('GATEWAY_API_KEY') || '';
        const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${wsProtocol}://${location.hostname}:3001?apiKey=${encodeURIComponent(apiKey)}`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setConnectionStatus(true);
            appendMessage('system', 'Connected to AxiomMesh Gateway.');
            updateSendState();
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.status === 'pending') return;

                if (data.error) {
                    appendMessage('system', `Error: ${data.error}`);
                } else if (data.response) {
                    appendMessage('agent', data.response, data.confidence, data.provenance, data.trace_id);
                    if (data.audit_trail) {
                        auditHistory.push({
                            intent_id: data.intent_id,
                            audit_trail: data.audit_trail,
                            timestamp: new Date().toLocaleTimeString()
                        });
                        renderCockpitList();
                    }
                } else {
                    appendMessage('system', JSON.stringify(data));
                }
            } catch (e) {
                appendMessage('system', `Received: ${event.data}`);
            }
        };

        ws.onerror = (error) => {
            setConnectionStatus(false);
            updateSendState();
            appendMessage('system', 'WebSocket Error. Please check your API Key and connection.');
            console.error('WebSocket Error: ', error);
        };

        ws.onclose = () => {
            setConnectionStatus(false);
            updateSendState();
            appendMessage('system', 'Disconnected from Gateway.');
        };
    }

    // Initial connection
    connectWebSocket();

    function appendMessage(sender, text, confidence, provenance, traceId) {
        const emptyHint = chatMessages.querySelector(".empty-chat-hint");
        if (emptyHint) emptyHint.remove();

        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${sender}-message`;

        // rudimentary markdown rendering or pre-formatting
        const pre = document.createElement("pre");
        pre.textContent = text;
        msgDiv.appendChild(pre);

        if (sender === 'agent' && (confidence !== undefined || provenance?.length > 0)) {
            const metaDiv = document.createElement("div");
            metaDiv.className = "message-meta";

            let metaHtml = "";
            if (confidence !== undefined) {
                const confPercent = (confidence * 100).toFixed(1);
                const confColor = confidence > 0.8 ? '#4caf50' : (confidence > 0.5 ? '#ffeb3b' : '#f44336');
                metaHtml += `<span style="color: ${confColor}; font-weight: bold;">Confidence: ${confPercent}%</span>`;
            }
            if (provenance?.length > 0) {
                metaHtml += ` | <span>Sources: ${provenance.join(', ')}</span>`;
            }
            if (traceId) {
                metaHtml += ` | <span>Trace: ${traceId}</span>`;
            }
            metaHtml += ` | <span>${new Date().toLocaleTimeString()}</span>`;
            metaDiv.innerHTML = metaHtml;
            msgDiv.appendChild(metaDiv);
        }

        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            appendMessage('system', 'Cannot send: WebSocket offline.');
            updateSendState();
            return;
        }

        appendMessage('user', text);
        chatInput.value = '';
        updateSendState();

        const style = responseStyleSelect ? responseStyleSelect.value : 'standard';
        const consentScope = consentScopeSelect ? consentScopeSelect.value : 'allowed';

        // Using REST for chat temporarily if WebSocket structure expects only input/session_id
        // Or inject style into the message if supported. Let's send via WebSocket metadata if available.
        // Actually, intent_parser is strict. We'll update the websocket payload slightly.
        if (ws.readyState === WebSocket.OPEN) {
            const payload = {
                id: crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now(),
                identity_hash: sessionId,
                modality: style || 'text',
                session_id: sessionId,
                conversation_id: sessionId,
                actor_id: sessionId,
                consent_scope: consentScope,
                input: text,
                timestamp: Date.now()
            };
            ws.send(JSON.stringify(payload));
        }
    }

    chatSendBtn.addEventListener("click", sendMessage);
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });
    chatInput.addEventListener("input", updateSendState);

    if (jumpToInputBtn) {
        jumpToInputBtn.addEventListener("click", () => chatInput.focus());
    }

    document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            chatInput.focus();
            chatInput.select();
        }
    });

    const frontierModules = [
        "self-healing policy graph",
        "zero-knowledge provenance lattice",
        "attention-indexed anomaly mirror",
        "economic trust shock absorber",
        "cross-swarm federated planner",
        "predictive resource balancer"
    ];
    const edgeCapabilities = [
        "streaming counterfactual simulation",
        "cryptographic memory compression",
        "consensus-time reputation sculpting",
        "adversarial intent shadowing",
        "quantized confidence telemetry",
        "autonomous rollback choreography"
    ];
    const impactProfiles = {
        bold: "maximize strategic asymmetry, accept controlled experimental volatility",
        balanced: "pursue measurable innovation while preserving operator observability",
        conservative: "prioritize safety guarantees and reversible rollout checkpoints"
    };

    function pickRandom(items) {
        if (!items || items.length === 0) return null;
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const array = new Uint32Array(1);
            crypto.getRandomValues(array);
            const index = array[0] % items.length;
            return items[index];
        }
        return items[Math.floor(Math.random() * items.length)];
    }

    function buildInnovationBlueprint() {
        const goal = innovationGoalInput?.value?.trim() || "next-generation autonomous coordination";
        const risk = innovationRiskSelect?.value || "balanced";
        const moduleA = pickRandom(frontierModules);
        const moduleB = pickRandom(frontierModules.filter(item => item !== moduleA));
        const capability = pickRandom(edgeCapabilities);

        const blueprint = [
            `Feature Name: ${goal.split(" ").slice(0, 4).join(" ")} Hyperloop`,
            "",
            "Core Thesis:",
            `Fuse ${moduleA} with ${moduleB} to create a continuously adapting execution fabric.`,
            "",
            "Novel Mechanism:",
            `Use ${capability} to detect weak signals early, then auto-route intents through confidence-aware execution lanes.`,
            "",
            "Deployment Shape:",
            `Risk posture: ${risk.toUpperCase()} — ${impactProfiles[risk]}.`,
            "Roll out behind a canary policy, collect trace-level telemetry, and enable one-click rollback for degraded confidence bands.",
            "",
            "Why this is unique:",
            "It links intelligence, cryptographic trust, and infrastructure elasticity into a single operator-controlled feedback loop."
        ].join("\n");

        innovationOutput.textContent = blueprint;
    }

    if (generateInnovationBtn) {
        generateInnovationBtn.addEventListener("click", buildInnovationBlueprint);
    }

    if (injectInnovationToChatBtn) {
        injectInnovationToChatBtn.addEventListener("click", () => {
            const blueprint = innovationOutput.textContent.trim();
            if (!blueprint || blueprint.startsWith('Press "Generate')) return;
            chatInput.value = `Let's execute this feature concept:\n\n${blueprint}`;

            navButtons.forEach(b => b.classList.remove("active"));
            tabs.forEach(t => t.classList.remove("active"));
            const chatBtn = document.querySelector('.nav-btn[data-target="chat"]');
            if (chatBtn) chatBtn.classList.add("active");
            document.getElementById("chat").classList.add("active");
            chatInput.focus();
        });
    }

    function buildHandwritingRows(text, level) {
        const seed = (text || "abc").replace(/[^a-zA-Z ]/g, "").trim() || "abc";
        const clean = seed.slice(0, 24);
        const repeats = level === "advanced" ? 1 : (level === "intermediate" ? 2 : 3);
        const rows = [];
        const units = clean.split(/\s+/).filter(Boolean);
        units.forEach((unit) => {
            const uppercase = unit.toUpperCase();
            rows.push(`<div class="handwriting-row"><strong>Trace:</strong> <span class="trace-guide">${`${uppercase} `.repeat(repeats + 1)}</span></div>`);
            rows.push(`<div class="handwriting-row"><strong>Print:</strong> ${"_ ".repeat(Math.max(8, unit.length * 4))}</div>`);
        });
        rows.push('<div class="handwriting-row"><strong>Sentence:</strong> Trace once, then print twice with finger-spaced gaps.</div>');
        return rows.join("");
    }

    if (generateHandwritingBtn && handwritingPreview) {
        generateHandwritingBtn.addEventListener("click", () => {
            handwritingPreview.innerHTML = buildHandwritingRows(handwritingTextInput?.value, handwritingLevelSelect?.value || "beginner");
        });
        handwritingPreview.innerHTML = buildHandwritingRows("abc", "beginner");
    }

    if (traceCanvas) {
        const ctx = traceCanvas.getContext("2d");
        let drawing = false;

        function pointFromEvent(evt) {
            const rect = traceCanvas.getBoundingClientRect();
            const source = evt.touches ? evt.touches[0] : evt;
            return { x: source.clientX - rect.left, y: source.clientY - rect.top };
        }

        function startDraw(evt) {
            drawing = true;
            const { x, y } = pointFromEvent(evt);
            ctx.beginPath();
            ctx.moveTo(x, y);
            evt.preventDefault();
        }

        function draw(evt) {
            if (!drawing) return;
            const { x, y } = pointFromEvent(evt);
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.strokeStyle = "#bb86fc";
            ctx.lineTo(x, y);
            ctx.stroke();
            evt.preventDefault();
        }

        function stopDraw() {
            drawing = false;
            ctx.beginPath();
        }

        traceCanvas.addEventListener("mousedown", startDraw);
        traceCanvas.addEventListener("mousemove", draw);
        traceCanvas.addEventListener("mouseup", stopDraw);
        traceCanvas.addEventListener("mouseleave", stopDraw);
        traceCanvas.addEventListener("touchstart", startDraw, { passive: false });
        traceCanvas.addEventListener("touchmove", draw, { passive: false });
        traceCanvas.addEventListener("touchend", stopDraw);

        if (clearTraceBtn) {
            clearTraceBtn.addEventListener("click", () => {
                ctx.clearRect(0, 0, traceCanvas.width, traceCanvas.height);
            });
        }
    }

    // --- Operator Cockpit Render Logic ---
    function renderCockpitList() {
        const listContainer = document.getElementById('cockpit-intent-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        if (auditHistory.length === 0) {
            listContainer.innerHTML = '<p style="color: #666;">No interactions recorded yet.</p>';
            return;
        }

        auditHistory.slice().reverse().forEach((entry, index) => {
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.style.width = '100%';
            btn.style.marginBottom = '5px';
            btn.style.backgroundColor = 'var(--card-bg)';
            btn.style.border = '1px solid var(--border)';
            btn.textContent = `[${entry.timestamp}] ${entry.audit_trail.intent_replay.content.substring(0, 20)}...`;

            btn.addEventListener('click', () => {
                showCockpitDetails(entry);
                // Highlight active button
                Array.from(listContainer.children).forEach(c => c.style.borderLeft = 'none');
                btn.style.borderLeft = '3px solid var(--accent)';
            });

            listContainer.appendChild(btn);
        });
    }

    function showCockpitDetails(entry) {
        document.getElementById('cockpit-details').style.display = 'block';
        const trail = entry.audit_trail;

        // Intent Replay
        document.getElementById('cockpit-replay-content').textContent = trail.intent_replay.content;
        document.getElementById('cockpit-replay-channel').textContent = trail.intent_replay.channel;
        document.getElementById('cockpit-replay-sender').textContent = trail.intent_replay.sender;

        // Safety Decisions
        const safetyList = document.getElementById('cockpit-safety-list');
        safetyList.innerHTML = '';
        for (const [key, value] of Object.entries(trail.safety_decisions)) {
            const li = document.createElement('li');
            li.style.marginBottom = '8px';
            li.style.fontFamily = 'monospace';

            let color = '#ccc';
            if (value === 'Passed' || value === false || value === 'Allowed') color = '#4caf50'; // Green
            if (value === 'Failed' || value === true || value === 'Blocked') color = '#f44336'; // Red

            li.innerHTML = `<strong>${key}:</strong> <span style="color: ${color};">${value}</span>`;
            safetyList.appendChild(li);
        }

        // Why this answer
        const whyList = document.getElementById('cockpit-why-list');
        whyList.innerHTML = '';
        for (const [key, value] of Object.entries(trail.why_this_answer)) {
            const li = document.createElement('li');
            li.style.marginBottom = '8px';
            li.innerHTML = `<strong>${key.replace(/_/g, ' ')}:</strong> ${value}`;
            whyList.appendChild(li);
        }
    }

    // --- Memory Logic ---
    async function fetchMemory() {
        const grid = document.getElementById('memory-grid');
        const showAll = document.getElementById('show-all-memory').checked;
        grid.innerHTML = '<p>Loading memory states...</p>';
        try {
            const url = showAll ? '/api/v1/memory' : `/api/v1/memory?session_id=${sessionId}`;
            const res = await fetch(url, { headers: getAuthHeaders() });
            const data = await res.json();

            if (data.memories && data.memories.length > 0) {
                grid.innerHTML = '';
                data.memories.forEach(mem => {
                    const card = document.createElement('div');
                    card.className = 'agent-card';
                    card.style.position = 'relative';
                    const consent = mem.metadata?.consent || 'allowed';
                    card.innerHTML = `
                        <h3>ID: ${mem.id.substring(0, 8)}...</h3>
                        <p><strong>Content:</strong> <textarea class="edit-memory-content" data-id="${mem.id}" style="width: 100%; min-height: 60px; background: #333; color: white; border: 1px solid #555; padding: 5px;">${mem.content}</textarea></p>
                        <p><strong>Session:</strong> ${mem.metadata?.session_id || 'Unknown'}</p>
                        <p><strong>Consent Scope:</strong>
                            <select class="edit-memory-consent" data-id="${mem.id}" style="padding: 5px; border-radius: 4px; border: 1px solid #444; background: #333; color: white;">
                                <option value="allowed" ${consent === 'allowed' ? 'selected' : ''}>Allowed for Training & Context</option>
                                <option value="context_only" ${consent === 'context_only' ? 'selected' : ''}>Context Only (Do Not Train)</option>
                                <option value="revoked" ${consent === 'revoked' ? 'selected' : ''}>Revoked (Do Not Use)</option>
                            </select>
                        </p>
                        <button class="save-memory-btn" data-id="${mem.id}" style="margin-top: 10px; background-color: #4caf50;">Save</button>
                        <button class="delete-memory-btn" data-id="${mem.id}" style="margin-top: 10px; background-color: #d9534f;">Forget</button>
                    `;
                    grid.appendChild(card);
                });

                document.querySelectorAll('.delete-memory-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const id = e.target.getAttribute('data-id');
                        await fetch(`/api/v1/memory/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
                        fetchMemory();
                    });
                });

                document.querySelectorAll('.save-memory-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const id = e.target.getAttribute('data-id');
                        const contentEl = document.querySelector(`.edit-memory-content[data-id="${id}"]`);
                        const consentEl = document.querySelector(`.edit-memory-consent[data-id="${id}"]`);

                        const newContent = contentEl.value;
                        const newConsent = consentEl.value;

                        await fetch(`/api/v1/memory/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                            body: JSON.stringify({
                                content: newContent,
                                metadata: { consent: newConsent }
                            })
                        });

                        btn.textContent = 'Saved!';
                        setTimeout(() => { btn.textContent = 'Save'; }, 2000);
                    });
                });
            } else {
                grid.innerHTML = '<p>No memories found.</p>';
            }
        } catch (error) {
            console.error('Failed to fetch memory:', error);
            grid.innerHTML = '<p>Failed to load memory states. Is the hypervisor offline?</p>';
        }
    }

    const refreshMemoryBtn = document.getElementById('refresh-memory');
    if (refreshMemoryBtn) {
        refreshMemoryBtn.addEventListener('click', fetchMemory);
    }
    const showAllMemoryCb = document.getElementById('show-all-memory');
    if (showAllMemoryCb) {
        showAllMemoryCb.addEventListener('change', fetchMemory);
    }
    const forgetSessionMemoryBtn = document.getElementById('forget-session-memory');
    if (forgetSessionMemoryBtn) {
        forgetSessionMemoryBtn.addEventListener('click', async () => {
            const res = await fetch(`/api/v1/memory?session_id=${sessionId}`, { headers: getAuthHeaders() });
            const data = await res.json();
            const memories = data.memories || [];
            await Promise.all(memories.map((mem) => fetch(`/api/v1/memory/${mem.id}`, { method: 'DELETE', headers: getAuthHeaders() })));
            fetchMemory();
        });
    }

    // --- Agents Logic ---
    async function fetchAgents() {
        const grid = document.getElementById('agents-grid');
        grid.innerHTML = '<p>Loading agent states...</p>';
        try {
            const res = await fetch('/api/v1/agents', { headers: getAuthHeaders() });
            const data = await res.json();

            if (data.agents && data.agents.length > 0) {
                grid.innerHTML = '';
                data.agents.forEach(agent => {
                    const card = document.createElement('div');
                    card.className = 'agent-card';
                    card.innerHTML = `
                        <h3>${agent.name}</h3>
                        <p><strong>State:</strong> <span class="status">${agent.status}</span></p>
                        <p><strong>Current Task:</strong> ${agent.current_task}</p>
                        <p><strong>Next Plan:</strong> ${agent.next_plan}</p>
                    `;
                    grid.appendChild(card);
                });
            } else {
                grid.innerHTML = '<p>No active agents found.</p>';
            }
        } catch (error) {
            console.error('Failed to fetch agents:', error);
            grid.innerHTML = '<p>Failed to load agent states. Is the hypervisor offline?</p>';
        }
    }

    // --- Comprehensive Dashboard Logic ---
    async function fetchComprehensiveDashboard() {
        const dashboardSection = document.getElementById('comprehensive');
        try {
            const res = await fetch('/api/v1/dashboard/comprehensive', { headers: getAuthHeaders() });
            const data = await res.json();

            // Render Mesh
            const meshToggle = document.getElementById('greater-mesh-toggle');
            if (meshToggle) meshToggle.checked = data.mesh_status.connected_to_greater_mesh;

            const nodesVisual = document.getElementById('private-nodes-visual');
            if (nodesVisual) {
                nodesVisual.innerHTML = data.mesh_status.private_nodes.map(n => `
                    <div style="padding: 10px; border: 1px solid var(--border); border-radius: 4px; background: #333; text-align: center;">
                        <strong style="color: var(--accent);">${n.id}</strong><br>
                        <small>${n.role}</small><br>
                        <span style="color: ${n.status === 'active' ? '#4caf50' : '#ffeb3b'}">${n.status}</span>
                    </div>
                `).join('');
            }

            // Render Security
            const secVisual = document.getElementById('security-status-visual');
            if (secVisual) {
                secVisual.innerHTML = `
                    <p><strong>Overall Status:</strong> <span style="color: #4caf50;">${data.security.status}</span></p>
                    <p><strong>WAF Active:</strong> ${data.security.waf_active ? 'Yes' : 'No'}</p>
                    <p><strong>Threat Level:</strong> ${data.security.threat_level}</p>
                    <p><strong>Last Scan:</strong> ${new Date(data.security.last_scan).toLocaleString()}</p>
                `;
            }

            // Render Models
            const localModelsList = document.getElementById('local-models-list');
            if (localModelsList) {
                localModelsList.innerHTML = data.models.local.map(m => `<li>${m}</li>`).join('');
            }
            const remoteModelsList = document.getElementById('remote-models-list');
            if (remoteModelsList) {
                remoteModelsList.innerHTML = data.models.remote.map(m => `<li>${m}</li>`).join('');
            }

            // Render Assets
            const nftsList = document.getElementById('nfts-list');
            if (nftsList) {
                nftsList.innerHTML = data.assets.nfts.map(n => `<li>${n}</li>`).join('');
            }
            const entitiesList = document.getElementById('entities-list');
            if (entitiesList) {
                entitiesList.innerHTML = data.assets.entities.map(e => `<li>${e}</li>`).join('');
            }

            // Render Governance
            const govVisual = document.getElementById('governance-visual');
            if (govVisual) {
                govVisual.innerHTML = `
                    <p><strong>Electoral System:</strong> ${data.governance.system}</p>
                    <p><strong>Template:</strong> ${data.governance.template}</p>
                    <p><strong>Election Status:</strong> ${data.governance.current_election_status}</p>
                    <p><strong>Representatives (Seats):</strong> ${data.governance.representatives}</p>
                `;
            }
        } catch (e) {
            console.error('Failed to fetch comprehensive dashboard data', e);
        }
    }

    // Connect Mesh Toggle interaction
    const meshToggle = document.getElementById('greater-mesh-toggle');
    if (meshToggle) {
        meshToggle.addEventListener('change', (e) => {
            console.log(`Connection to Greater Mesh is now ${e.target.checked ? 'ON' : 'OFF'}`);
            // Future logic to trigger backend endpoint
        });
    }

    // --- Swarm / Orchestration Logic ---
    async function fetchSwarms() {
        const grid = document.getElementById('swarms-grid');
        grid.innerHTML = '<p>Loading active swarms...</p>';
        try {
            const res = await fetch('/api/v1/swarms', { headers: getAuthHeaders() });
            const swarms = await res.json();

            if (swarms && swarms.length > 0) {
                grid.innerHTML = '';
                swarms.forEach(swarm => {
                    const card = document.createElement('div');
                    card.className = 'agent-card';
                    card.innerHTML = `
                        <h3>Swarm ID: <span style="font-size: 0.8em; font-weight: normal;">${swarm.id}</span></h3>
                        <p><strong>Task ID:</strong> ${swarm.taskId}</p>
                        <p><strong>Status:</strong> <span class="status">${swarm.status}</span></p>
                        <p><strong>Nodes:</strong> ${swarm.nodes.length}</p>
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border);">
                            <h4 style="margin: 0 0 10px 0; font-size: 0.9em; color: #aaa;">Join this Swarm</h4>
                            <div style="display: flex; gap: 10px;">
                                <input type="text" id="join-node-id-${swarm.id}" placeholder="Your Node ID" style="flex-grow: 1; padding: 5px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-color); color: var(--text-main);">
                                <button onclick="joinSwarm('${swarm.id}')" style="padding: 5px 10px; background-color: var(--card-bg); color: var(--text-main); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Join</button>
                            </div>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            } else {
                grid.innerHTML = '<p>No active swarms found.</p>';
            }
        } catch (error) {
            console.error('Failed to fetch swarms:', error);
            grid.innerHTML = '<p>Failed to load swarms. Is the grid service offline?</p>';
        }
    }

    const createSwarmBtn = document.getElementById('create-swarm-btn');
    if (createSwarmBtn) {
        createSwarmBtn.addEventListener('click', async () => {
            const taskId = document.getElementById('swarm-task-id').value.trim();
            const nodeId = document.getElementById('swarm-node-id').value.trim();

            if (!taskId || !nodeId) {
                alert('Please enter both Task ID and Creator Node ID.');
                return;
            }

            // Human approval checkpoint
            const approved = window.confirm(`[HUMAN APPROVAL REQUIRED]\n\nAre you sure you want to create a new swarm for task "${taskId}" using node "${nodeId}"? This is a high-impact action.`);
            if (!approved) return;

            // Optional: require ID generator if we didn't have UUID logic on client
            // Actually, we can generate a UUID locally or let the server/backend do it. The Go server expects an ID. Let's create one.
            const swarmId = crypto.randomUUID ? crypto.randomUUID() : 'swarm-' + Date.now();

            try {
                const res = await fetch('/api/v1/swarms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({
                        id: swarmId,
                        taskId: taskId,
                        nodes: [nodeId]
                    })
                });

                const result = await res.json();
                if (res.ok && result.status !== 'error') {
                    document.getElementById('swarm-task-id').value = '';
                    document.getElementById('swarm-node-id').value = '';
                    fetchSwarms();
                } else {
                    alert('Failed to create swarm: ' + (result.error || result.message || JSON.stringify(result)));
                }
            } catch (error) {
                alert('Network error when creating swarm.');
                console.error(error);
            }
        });
    }

    // Expose to window for inline onclick handler in cards
    window.joinSwarm = async function(swarmId) {
        const nodeIdInput = document.getElementById(`join-node-id-${swarmId}`);
        const nodeId = nodeIdInput ? nodeIdInput.value.trim() : '';

        if (!nodeId) {
            alert('Please enter your Node ID to join the swarm.');
            return;
        }

        // Human approval checkpoint
        const approved = window.confirm(`[HUMAN APPROVAL REQUIRED]\n\nAre you sure you want node "${nodeId}" to join swarm "${swarmId}"? This is a high-impact action.`);
        if (!approved) return;

        try {
            const res = await fetch('/api/v1/swarms/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    swarmId: swarmId,
                    nodeId: nodeId
                })
            });

            const result = await res.json();
            if (res.ok && result.status !== 'error') {
                if (nodeIdInput) nodeIdInput.value = '';
                fetchSwarms();
            } else {
                alert('Failed to join swarm: ' + (result.error || result.message || JSON.stringify(result)));
            }
        } catch (error) {
            alert('Network error when joining swarm.');
            console.error(error);
        }
    };

    // --- Network / Grid Logic ---
    async function fetchNetwork() {
        const grid = document.getElementById('network-grid');
        grid.innerHTML = '<p>Loading connected mesh nodes...</p>';
        try {
            const res = await fetch('/api/v1/network', { headers: getAuthHeaders() });
            const data = await res.json();

            if (data.nodes && data.nodes.length > 0) {
                grid.innerHTML = '';
                data.nodes.forEach(node => {
                    const card = document.createElement('div');
                    card.className = 'agent-card';
                    card.innerHTML = `
                        <h3>${node.id}</h3>
                        <p><strong>Status:</strong> <span class="status">${node.status}</span></p>
                        <p><strong>IP:</strong> ${node.ip}</p>
                        <p><strong>Latency:</strong> ${node.latency}</p>
                        <p><strong>Role:</strong> ${node.role}</p>
                    `;
                    grid.appendChild(card);
                });
            } else {
                grid.innerHTML = '<p>No connected nodes found.</p>';
            }
        } catch (error) {
            console.error('Failed to fetch network:', error);
            grid.innerHTML = '<p>Failed to load connected nodes. Is the grid service offline?</p>';
        }
    }

    // --- System Status Logic ---
    async function fetchStatus() {
        try {
            const res = await fetch('/api/v1/status', { headers: getAuthHeaders() });
            const data = await res.json();

            document.getElementById('status-gateway').textContent = data.gateway?.status || 'unknown';

            document.getElementById('status-hypervisor').textContent = data.hypervisor?.status || 'unknown';
            if (data.hypervisor?.dependencies) {
                document.getElementById('deps-hypervisor').textContent = 'Deps: ' + JSON.stringify(data.hypervisor.dependencies);
            }

            document.getElementById('status-sandbox').textContent = data.sandbox?.status || 'unknown';
            if (data.sandbox?.dependencies) {
                document.getElementById('deps-sandbox').textContent = 'Deps: ' + JSON.stringify(data.sandbox.dependencies);
            }

            document.getElementById('status-grid-node').textContent = data.grid?.status || 'unknown';
            if (data.grid?.dependencies) {
                document.getElementById('deps-grid').textContent = 'Deps: ' + JSON.stringify(data.grid.dependencies);
            }

            // Also fetch metrics
            const metricsRes = await fetch('/api/v1/metrics/system', { headers: getAuthHeaders() });
            const metricsData = await metricsRes.json();
            const metricsEl = document.getElementById('metrics-gateway');
            if (metricsEl) {
                metricsEl.textContent = `Requests: ${metricsData.requests} | Errors: ${metricsData.errors}`;
            }

        } catch (error) {
            console.error('Failed to fetch status:', error);
        }
    }

    // --- Configuration Logic ---
    async function fetchConfig() {
        try {
            const res = await fetch('/api/v1/config', { headers: getAuthHeaders() });
            const data = await res.json();

            document.getElementById('ALLOW_CLOUD_LLM').value = data.ALLOW_CLOUD_LLM || 'false';
            document.getElementById('LLM_PROVIDER').value = data.LLM_PROVIDER || '';
            document.getElementById('LOCAL_MODEL_FALLBACK').value = data.LOCAL_MODEL_FALLBACK || '';
            document.getElementById('OPENAI_API_KEY').value = data.OPENAI_API_KEY || '';
            document.getElementById('DISCORD_TOKEN').value = data.DISCORD_TOKEN || '';
            document.getElementById('WHATSAPP_SESSION').value = data.WHATSAPP_SESSION || '';
            document.getElementById('NCP_SERVERS').value = data.NCP_SERVERS || '';
        } catch (error) {
            console.error('Failed to fetch config:', error);
        }
    }

    const configForm = document.getElementById('config-form');
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgEl = document.getElementById('config-msg');
        msgEl.textContent = 'Saving...';

        const updates = {
            ALLOW_CLOUD_LLM: document.getElementById('ALLOW_CLOUD_LLM').value,
            LLM_PROVIDER: document.getElementById('LLM_PROVIDER').value,
            LOCAL_MODEL_FALLBACK: document.getElementById('LOCAL_MODEL_FALLBACK').value,
            OPENAI_API_KEY: document.getElementById('OPENAI_API_KEY').value,
            DISCORD_TOKEN: document.getElementById('DISCORD_TOKEN').value,
            WHATSAPP_SESSION: document.getElementById('WHATSAPP_SESSION').value,
            NCP_SERVERS: document.getElementById('NCP_SERVERS').value
        };

        try {
            const res = await fetch('/api/v1/config', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(updates)
            });
            const result = await res.json();
            if (result.status === 'success') {
                msgEl.style.color = 'green';
                msgEl.textContent = 'Configuration updated! A restart may be required.';
            } else {
                msgEl.style.color = 'red';
                msgEl.textContent = 'Error: ' + result.error;
            }
        } catch (error) {
            msgEl.style.color = 'red';
            msgEl.textContent = 'Network Error.';
            console.error(error);
        }

        setTimeout(() => msgEl.textContent = '', 5000);
    });

    // --- Logs & Troubleshooting Logic ---
    async function fetchLogs() {
        const logOutput = document.getElementById('log-output');
        logOutput.textContent = 'Loading logs...';
        try {
            const res = await fetch('/api/v1/logs', { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.logs) {
                logOutput.textContent = data.logs;
            } else {
                logOutput.textContent = data.error || 'No logs available.';
            }
            logOutput.scrollTop = logOutput.scrollHeight;
        } catch (error) {
            logOutput.textContent = 'Failed to fetch logs: ' + error.message;
        }
    }

    document.getElementById('refresh-logs')?.addEventListener('click', fetchLogs);

    // --- Council Logic ---
    async function fetchCouncilPhase() {
        try {
            const res = await fetch('/api/v1/council/phase', { headers: getAuthHeaders() });
            const data = await res.json();
            const phaseNameEl = document.getElementById('current-phase-name');
            const phaseIdEl = document.getElementById('current-phase-id');
            if (phaseNameEl) phaseNameEl.textContent = data.phaseName;
            if (phaseIdEl) phaseIdEl.textContent = data.phaseId;
        } catch (error) {
            console.error('Failed to fetch council phase:', error);
        }
    }

    document.getElementById('transition-phase-btn')?.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/v1/council/transition', { method: 'POST', headers: getAuthHeaders() });
            const data = await res.json();
            if (data.error) {
                alert(data.error);
            } else {
                fetchCouncilPhase();
            }
        } catch (error) {
            console.error('Failed to transition phase:', error);
        }
    });

    async function fetchCouncilRoles() {
        try {
            const res = await fetch('/api/v1/council/roles', { headers: getAuthHeaders() });
            const data = await res.json();
            const container = document.getElementById('roles-container');
            const select = document.getElementById('recommendation-role-select');
            if (!container) return;

            container.innerHTML = '';
            if (select) select.innerHTML = '<option value="">Select a Role to view recommendations</option>';

            const roles = data.roles || [];

            // Fetch members to display with roles
            const memRes = await fetch('/api/v1/council/members', { headers: getAuthHeaders() });
            const memData = await memRes.json();
            const members = memData.members || [];

            roles.forEach(role => {
                const memberInfo = members.find(m => m.roleId === role.id);
                const roleDiv = document.createElement('div');
                roleDiv.className = 'role-card';
                roleDiv.style.border = '1px solid #ccc';
                roleDiv.style.padding = '10px';
                roleDiv.style.marginBottom = '10px';

                roleDiv.innerHTML = `
                    <h3>${role.name}</h3>
                    <p><strong>Human Member:</strong> ${memberInfo ? memberInfo.humanMember : 'Unassigned'}</p>
                    <p><strong>AI Agent:</strong> ${memberInfo ? memberInfo.aiAgent : 'Unassigned'}</p>
                `;
                container.appendChild(roleDiv);

                if (select) {
                    const opt = document.createElement('option');
                    opt.value = role.id;
                    opt.textContent = role.name;
                    select.appendChild(opt);
                }
            });
        } catch (error) {
            console.error('Failed to fetch council roles:', error);
        }
    }

    document.getElementById('fetch-recommendations-btn')?.addEventListener('click', async () => {
        const select = document.getElementById('recommendation-role-select');
        const container = document.getElementById('recommendations-container');
        if (!select || !container || select.value === '') return;

        container.innerHTML = 'Loading recommendations...';
        try {
            const res = await fetch(`/api/v1/council/recommendations/${select.value}`, { headers: getAuthHeaders() });
            const data = await res.json();
            container.innerHTML = '';

            if (data.recommendations && data.recommendations.length > 0) {
                data.recommendations.forEach(rec => {
                    const div = document.createElement('div');
                    div.style.background = '#f9f9f9';
                    div.style.padding = '8px';
                    div.style.marginBottom = '5px';
                    div.innerHTML = `<strong>Candidate:</strong> ${rec.candidateAddress} | <strong>Score:</strong> ${rec.score}`;
                    container.appendChild(div);
                });
            } else {
                container.innerHTML = 'No recommendations found.';
            }
        } catch (error) {
            container.innerHTML = 'Error fetching recommendations.';
            console.error(error);
        }
    });

    // Standalone page initializers
    if (document.getElementById('network-grid')) {
        fetchNetwork();
    }
    if (document.getElementById('status-grid')) {
        fetchStatus();
    }
    if (document.getElementById('roles-container')) {
        fetchCouncilPhase();
        fetchCouncilRoles();
    }

});
