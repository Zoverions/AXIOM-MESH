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
            if (targetId === 'settings') fetchConfig();
            if (targetId === 'logs') fetchLogs();
        });
    });

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
});

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

            document.getElementById('LLM_PROVIDER').value = data.LLM_PROVIDER || '';
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
            LLM_PROVIDER: document.getElementById('LLM_PROVIDER').value,
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
