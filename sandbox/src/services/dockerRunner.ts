import { spawn } from 'child_process';
import * as net from 'net';
import { NetworkNamespaceController } from '../execution/SecureRuntime';

async function invokeAirgap(command: string, pid: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const socketPath = process.env.AIRGAP_SOCKET || '/var/run/axiom-airgap.sock';
        const client = net.createConnection(socketPath, () => {
            client.write(`${command} ${pid}\n`);
        });

        client.on('data', (data) => {
            const resp = data.toString().trim();
            if (resp === 'ok') {
                resolve();
            } else {
                reject(new Error(`Airgap error: ${resp}`));
            }
            client.end();
        });

        client.on('error', (err) => {
            // If the airgap listener is not running, we log a warning but don't strictly fail
            // since Docker's --network=none provides baseline isolation. In a fully hardened
            // environment, this could be changed to reject().
            console.warn(`Airgap UDS connection failed: ${err.message}. Relying on Docker isolation.`);
            resolve();
        });
    });
}

export async function runCode(language: string, code: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        let command: string;
        let args: string[];
        const seccompProfile = process.env.SANDBOX_SECCOMP_PROFILE || '/app/security/seccomp-default.json';
        const apparmorProfile = process.env.SANDBOX_APPARMOR_PROFILE || 'docker-default';
        const commonArgs = [
            'run',
            '--rm',
            '--network=none',
            '--memory=256m',
            '--memory-swap=256m',
            '--cpus=0.5',
            '--pids-limit=50',
            '--cap-drop=ALL',
            '--security-opt=no-new-privileges',
            `--security-opt=seccomp=${seccompProfile}`,
            `--security-opt=apparmor=${apparmorProfile}`,
            '--read-only',
            '--tmpfs=/tmp:rw,noexec,nosuid,size=64m',
            '--mount',
            'type=tmpfs,destination=/workspace,tmpfs-size=16777216,tmpfs-mode=1777'
        ];

        if (language === 'python' || language === 'python3') {
            command = 'docker';
            args = [...commonArgs, 'python:3.9-slim', 'python', '-c', code];
        } else if (language === 'javascript' || language === 'node') {
            command = 'docker';
            args = [...commonArgs, 'node:18-alpine', 'node', '-e', code];
        } else {
            return reject(new Error(`Unsupported language: ${language}`));
        }

        const proc = spawn(command, args);

        if (proc.pid) {
            // Best effort airgap integration. In a real environment, we'd need the
            // container's internal PID or wait for it to be created, but for
            // demonstration we pass the docker run process PID.
            invokeAirgap('lockdown', proc.pid).catch(err => console.error(err));

            const nnc = new NetworkNamespaceController();

            // Implement cgroup v2 limits via UDS
            nnc.applyCgroupLimits(proc.pid, {
                cpuQuota: "100000/1000000",
                memoryMax: "512M",
                pidsMax: 64,
                ioWeight: 100
            }).catch(err => console.error(err));

            // Implement custom seccomp-bpf profile to drop execve, ptrace, and mount via UDS
            // Includes namespace manipulation syscalls (unshare, setns, clone)
            nnc.applySeccompProfile(proc.pid, {
                defaultAction: "SCMP_ACT_ALLOW",
                syscalls: [
                    { names: ["execve", "ptrace", "mount", "unshare", "setns", "clone"], action: "SCMP_ACT_ERRNO" }
                ]
            }).catch(err => console.error(err));
        }

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
