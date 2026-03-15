document.addEventListener("DOMContentLoaded", () => {
    // --- Navigation Tabs ---
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabs = document.querySelectorAll(".tab-content");

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");

            navButtons.forEach(b => b.classList.remove("active"));
            tabs.forEach(t => t.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById(targetId).classList.add("active");

            // Auto-refresh logic on tab load
            if (targetId === 'memory') fetchMemory();
            if (targetId === 'status') fetchStatus();
            if (targetId === 'agents') fetchAgents();
            if (targetId === 'tester' && window.initTester) window.initTester();
            if (targetId === 'network') fetchNetwork();
            if (targetId === 'settings') fetchConfig();
            if (targetId === 'logs') fetchLogs();
        });
    });

    // --- Chat WebSocket Logic ---
    const chatMessages = document.getElementById("chat-messages");
    const chatInput = document.getElementById("chat-input");
    const chatSendBtn = document.getElementById("chat-send");
    const responseStyleSelect = document.getElementById("response-style");

    // --- Session ID Management ---
    let sessionId = localStorage.getItem('axiom_session_id');
    if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('axiom_session_id', sessionId);
    }

    // Connect to Gateway WebSocket
    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${wsProtocol}://${location.hostname}:3001`);

    ws.onopen = () => {
        appendMessage('system', 'Connected to AxiomMesh Gateway.');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.status === 'pending') return; // Ignore pending

            if (data.error) {
                appendMessage('system', `Error: ${data.error}`);
            } else if (data.response) {
                appendMessage('agent', data.response, data.confidence, data.provenance);
            } else {
                appendMessage('system', JSON.stringify(data));
            }
        } catch (e) {
            appendMessage('system', `Received: ${event.data}`);
        }
    };

    ws.onerror = (error) => {
        appendMessage('system', 'WebSocket Error. See console.');
        console.error('WebSocket Error: ', error);
    };

    ws.onclose = () => {
        appendMessage('system', 'Disconnected from Gateway.');
    };

    function appendMessage(sender, text, confidence, provenance) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${sender}-message`;

        // rudimentary markdown rendering or pre-formatting
        const pre = document.createElement("pre");
        pre.textContent = text;
        msgDiv.appendChild(pre);

        if (sender === 'agent' && (confidence !== undefined || provenance?.length > 0)) {
            const metaDiv = document.createElement("div");
            metaDiv.className = "message-meta";
            metaDiv.style.fontSize = "0.8em";
            metaDiv.style.color = "#888";
            metaDiv.style.marginTop = "5px";

            let metaHtml = "";
            if (confidence !== undefined) {
                const confPercent = (confidence * 100).toFixed(1);
                const confColor = confidence > 0.8 ? '#4caf50' : (confidence > 0.5 ? '#ffeb3b' : '#f44336');
                metaHtml += `<span style="color: ${confColor}; font-weight: bold;">Confidence: ${confPercent}%</span>`;
            }
            if (provenance?.length > 0) {
                metaHtml += ` | <span>Sources: ${provenance.join(', ')}</span>`;
            }
            metaDiv.innerHTML = metaHtml;
            msgDiv.appendChild(metaDiv);
        }

        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        appendMessage('user', text);
        chatInput.value = '';

        const style = responseStyleSelect ? responseStyleSelect.value : 'standard';

        // Using REST for chat temporarily if WebSocket structure expects only input/session_id
        // Or inject style into the message if supported. Let's send via WebSocket metadata if available.
        // Actually, intent_parser is strict. We'll update the websocket payload slightly.
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ input: text, session_id: sessionId, modality: style }));
        } else {
            appendMessage('system', 'Cannot send: WebSocket offline.');
        }
    }

    chatSendBtn.addEventListener("click", sendMessage);
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });
});

    // --- Memory Logic ---
    async function fetchMemory() {
        const grid = document.getElementById('memory-grid');
        const showAll = document.getElementById('show-all-memory').checked;
        grid.innerHTML = '<p>Loading memory states...</p>';
        try {
            const url = showAll ? '/api/v1/memory' : `/api/v1/memory?session_id=${sessionId}`;
            const res = await fetch(url);
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
                        await fetch(`/api/v1/memory/${id}`, { method: 'DELETE' });
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
                            headers: { 'Content-Type': 'application/json' },
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

    // --- Agents Logic ---
    async function fetchAgents() {
        const grid = document.getElementById('agents-grid');
        grid.innerHTML = '<p>Loading agent states...</p>';
        try {
            const res = await fetch('/api/v1/agents');
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

    // --- Network / Grid Logic ---
    async function fetchNetwork() {
        const grid = document.getElementById('network-grid');
        grid.innerHTML = '<p>Loading connected mesh nodes...</p>';
        try {
            const res = await fetch('/api/v1/network');
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
            const res = await fetch('/api/v1/status');
            const data = await res.json();

            document.getElementById('status-gateway').textContent = data.gateway || 'unknown';
            document.getElementById('status-hypervisor').textContent = data.hypervisor || 'unknown';
            document.getElementById('status-sandbox').textContent = data.sandbox || 'unknown';
            document.getElementById('status-grid-node').textContent = data.grid || 'unknown';
        } catch (error) {
            console.error('Failed to fetch status:', error);
        }
    }

    // --- Configuration Logic ---
    async function fetchConfig() {
        try {
            const res = await fetch('/api/v1/config');
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
                headers: { 'Content-Type': 'application/json' },
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
            const res = await fetch('/api/v1/logs');
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

    document.getElementById('refresh-logs').addEventListener('click', fetchLogs);
