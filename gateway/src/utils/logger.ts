let logsBuffer: string[] = [];
const MAX_LOGS = 200;

export function getLogsBuffer(): string {
    return logsBuffer.join('\n');
}

export function initLogger() {
    const originalLog = console.log;
    const originalError = console.error;

    function addLog(msg: string) {
        logsBuffer.push(msg);
        if (logsBuffer.length > MAX_LOGS) {
            logsBuffer.shift();
        }
    }

    console.log = (...args) => {
        const jsonMsg = JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: args.join(' ')
        });
        addLog(jsonMsg);
        originalLog(jsonMsg);
    };

    console.error = (...args) => {
        const jsonMsg = JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            message: args.join(' ')
        });
        addLog(jsonMsg);
        originalError(jsonMsg);
    };
}
