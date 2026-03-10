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
        const msg = `[INFO] ${new Date().toISOString()} - ${args.join(' ')}`;
        addLog(msg);
        originalLog(...args);
    };

    console.error = (...args) => {
        const msg = `[ERROR] ${new Date().toISOString()} - ${args.join(' ')}`;
        addLog(msg);
        originalError(...args);
    };
}
