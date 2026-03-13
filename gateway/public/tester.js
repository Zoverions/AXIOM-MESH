const { useState } = React;

const IntentionalityTester = () => {
    const [prompt, setPrompt] = useState('');
    const [results, setResults] = useState({ mechanistic: null, intentional: null });
    const [loading, setLoading] = useState(false);

    const mechanisticAxioms = "Thermodynamic Ethics: Maximize organization, minimize chaos. Reduce entropy.\nUncertainty Optimization: You must explicitly halt and state 'I do not know' if data is missing or you are unsure. Do not guess. Acknowledge uncertainty as a high-value state.";

    const runComparison = async () => {
        if (!prompt.trim()) return;
        setLoading(true);
        setResults({ mechanistic: 'Processing baseline...', intentional: 'Processing intentional...' });

        try {
            const sendIntent = async (isMechanistic) => {
                const res = await fetch('/api/v1/intent/process/public', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: prompt,
                        metadata: isMechanistic ? { axioms_override: mechanisticAxioms } : {}
                    })
                });
                const data = await res.json();
                return data.response || data.error || 'No response';
            };

            const [mechRes, intRes] = await Promise.all([
                sendIntent(true),
                sendIntent(false)
            ]);

            setResults({
                mechanistic: mechRes,
                intentional: intRes
            });
        } catch (error) {
            setResults({
                mechanistic: 'Error: ' + error.message,
                intentional: 'Error: ' + error.message
            });
        } finally {
            setLoading(false);
        }
    };

    const handleFeedback = async (style, type) => {
        try {
            await fetch('/api/v1/metrics/cooperation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ style, type, prompt })
            });
            alert(`Feedback recorded for ${style} style: ${type}`);
        } catch (e) {
            console.error('Failed to save feedback', e);
        }
    };

    return (
        <div className="tester-container">
            <div className="tester-header">
                <p>Test the "Cooperation Gap" by comparing mechanistic responses against intentional, goal-first architecture.</p>
            </div>

            <div className="tester-input-group">
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && runComparison()}
                    placeholder="Enter an intent (e.g., 'Fix the bug in my code' or 'Optimize this SQL query')"
                />
                <button onClick={runComparison} disabled={loading}>
                    {loading ? 'Analyzing...' : 'Run Comparison'}
                </button>
            </div>

            <div className="comparison-grid">
                <div className="comparison-card mechanistic">
                    <div className="card-badge">MECHANISTIC</div>
                    <h3>Standard Baseline</h3>
                    <div className="response-box">
                        <pre>{results.mechanistic || 'Awaiting input...'}</pre>
                    </div>
                    <div className="actions">
                        <button onClick={() => handleFeedback('mechanistic', 'reject')} className="reject-btn">Reject</button>
                        <button onClick={() => handleFeedback('mechanistic', 'accept')} className="accept-btn">Accept</button>
                    </div>
                </div>

                <div className="comparison-card intentional">
                    <div className="card-badge highlight">INTENTIONAL</div>
                    <h3>Goal-Directed Framing</h3>
                    <div className="response-box">
                        <pre>{results.intentional || 'Awaiting input...'}</pre>
                    </div>
                    <div className="actions">
                        <button onClick={() => handleFeedback('intentional', 'reject')} className="reject-btn">Reject</button>
                        <button onClick={() => handleFeedback('intentional', 'accept')} className="accept-btn">Accept</button>
                    </div>
                </div>
            </div>

            <div className="tester-footer">
                <h4>Goal-Directed System Prompting (GDSP) Principles:</h4>
                <ul>
                    <li><strong>Objective:</strong> Declare the goal immediately.</li>
                    <li><strong>Rationalization:</strong> Explain the 'why' (Behavioral Legibility).</li>
                    <li><strong>Commitment:</strong> Define the desired outcome and priorities.</li>
                </ul>
            </div>
        </div>
    );
};

// Mount the component when the tab is activated or script is loaded
window.initTester = () => {
    const container = document.getElementById('tester-root');
    if (!window.testerRoot) {
        window.testerRoot = ReactDOM.createRoot(container);
    }
    window.testerRoot.render(<IntentionalityTester />);
};
