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
            if (targetId === 'status') fetchStatus();
            if (targetId === 'agents') fetchAgents();
            if (targetId === 'tester' && window.initTester) window.initTester();
            if (targetId === 'network') fetchNetwork();
            if (targetId === 'settings') fetchConfig();
            if (targetId === 'logs') fetchLogs();
        });
    });

    // --- Operator Cockpit History Array ---
    const auditHistory = [];

    // --- Chat WebSocket Logic ---
    const chatMessages = document.getElementById("chat-messages");
    const chatInput = document.getElementById("chat-input");
    const chatSendBtn = document.getElementById("chat-send");

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
                appendMessage('agent', data.response);
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
        appendMessage('system', 'WebSocket Error. See console.');
        console.error('WebSocket Error: ', error);
    };

    ws.onclose = () => {
        appendMessage('system', 'Disconnected from Gateway.');
    };

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
});

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
