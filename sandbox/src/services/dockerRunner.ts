import { spawn } from 'child_process';

export async function runCode(language: string, code: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        let command: string;
        let args: string[];

        if (language === 'python' || language === 'python3') {
            command = 'docker';
            args = ['run', '--rm', '--network=none', '--memory=256m', '--cpus=0.5', '--pids-limit=50', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only', '--tmpfs=/tmp', 'python:3.9-slim', 'python', '-c', code];
        } else if (language === 'javascript' || language === 'node') {
            command = 'docker';
            args = ['run', '--rm', '--network=none', '--memory=256m', '--cpus=0.5', '--pids-limit=50', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only', '--tmpfs=/tmp', 'node:18-alpine', 'node', '-e', code];
        } else {
            return reject(new Error(`Unsupported language: ${language}`));
        }

        const proc = spawn(command, args);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Add a timeout to kill long-running processes (10 seconds)
        const timer = setTimeout(() => {
            proc.kill();
            resolve({ stdout, stderr: stderr + '\nExecution timed out' });
        }, 10000);

        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({ stdout, stderr });
        });

        proc.on('error', (error) => {
            clearTimeout(timer);
            resolve({ stdout: '', stderr: error.message || 'Execution failed' });
        });
    });
}
