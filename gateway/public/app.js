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

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");

            navButtons.forEach(b => b.classList.remove("active"));
            tabs.forEach(t => t.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById(targetId).classList.add("active");

            // Auto-refresh logic on tab load
            if (targetId === 'status') fetchStatus();
            if (targetId === 'agents') fetchAgents();
            if (targetId === 'swarms') fetchSwarms();
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

    let ws = null;

    function connectWebSocket() {
        const apiKey = localStorage.getItem('GATEWAY_API_KEY') || '';
        const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${wsProtocol}://${location.hostname}:3001?apiKey=${encodeURIComponent(apiKey)}`;

        ws = new WebSocket(wsUrl);

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
                    appendMessage('agent', data.response);
                } else {
                    appendMessage('system', JSON.stringify(data));
                }
            } catch (e) {
                appendMessage('system', `Received: ${event.data}`);
            }
        };

        ws.onerror = (error) => {
            appendMessage('system', 'WebSocket Error. Please check your API Key and connection.');
            console.error('WebSocket Error: ', error);
        };

        ws.onclose = () => {
            appendMessage('system', 'Disconnected from Gateway.');
        };
    }

    // Initial connection
    connectWebSocket();

    function appendMessage(sender, text) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${sender}-message`;

        // rudimentary markdown rendering or pre-formatting
        const pre = document.createElement("pre");
        pre.textContent = text;
        msgDiv.appendChild(pre);

        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        appendMessage('user', text);
        chatInput.value = '';

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ content: text }));
        } else {
            appendMessage('system', 'Cannot send: WebSocket offline.');
        }
    }

    chatSendBtn.addEventListener("click", sendMessage);
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });
});

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

    // --- Swarm / Orchestration Logic ---
    async function fetchSwarms() {
        const grid = document.getElementById('swarms-grid');
        grid.innerHTML = '<p>Loading active swarms...</p>';
        try {
            const res = await fetch('/api/v1/swarms');
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
                    headers: { 'Content-Type': 'application/json' },
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
                headers: { 'Content-Type': 'application/json' },
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

    document.getElementById('refresh-logs').addEventListener('click', fetchLogs);
