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
            console.error(`Airgap UDS connection failed: ${err.message}. Execution aborted due to isolation failure.`);
            reject(new Error(`Critical isolation failure: ${err.message}`));
        });
    });
}

export interface ResourceLimits {
    memory_mb?: number;
    cpu_ms?: number;
    io_weight?: number;
    gpu?: boolean;
}

export async function runCode(language: string, code: string, limitsOrUseTee?: ResourceLimits | boolean, useTeeParam?: boolean): Promise<{ stdout: string; stderr: string }> {
    let limits: ResourceLimits | undefined;
    let useTee: boolean = false;

    if (typeof limitsOrUseTee === 'boolean') {
        useTee = limitsOrUseTee;
    } else if (limitsOrUseTee !== undefined) {
        limits = limitsOrUseTee as ResourceLimits;
        if (useTeeParam !== undefined) {
            useTee = useTeeParam;
        }
    }

    if (typeof language !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(language)) {
        throw new Error('Invalid language identifier');
    }
    if (typeof code !== 'string') {
        throw new Error('Code must be a string');
    }

    const memoryMb = limits?.memory_mb || 256;
    const cpus = limits?.cpu_ms ? (limits.cpu_ms / 100).toFixed(2) : "0.5";

    return new Promise(async (resolve, reject) => {
        let command: string;
        let args: string[];
        const seccompProfile = process.env.SANDBOX_SECCOMP_PROFILE || '/app/security/seccomp-default.json';
        const defaultApparmor = process.env.NODE_ENV === 'production' ? 'axiom-sandbox' : 'docker-default';
        const apparmorProfile = process.env.SANDBOX_APPARMOR_PROFILE || defaultApparmor;
        const commonArgs = [
            'run',
            '--rm',
            '--runtime=runsc',
            '--network=none',
            `--memory=${memoryMb}m`,
            `--memory-swap=${memoryMb}m`,
            `--cpus=${cpus}`,
            '--pids-limit=50',
            '--cap-drop=ALL',
            '--security-opt=no-new-privileges',
            `--security-opt=seccomp=${seccompProfile}`,
            `--security-opt=apparmor=${apparmorProfile}`,
            '--read-only',
            '--tmpfs=/tmp:rw,noexec,nosuid,size=64m',
            '--mount',
            'type=tmpfs,destination=/workspace,tmpfs-size=16777216,tmpfs-mode=1777',
            '--user=1000:1000'
        ];

        commonArgs.push('--label=sandbox_execution=true');
        commonArgs.push('--label=monitor_syscalls=falco');

        // SUB-S.4 Sandbox: GPU acceleration for compute-heavy workloads
        if (limits !== undefined && limits.gpu === true) {
            // Enable NVIDIA container toolkit GPU access if configured
            commonArgs.push('--gpus=all');
        }

        if (useTee) {
            commonArgs.push('--device=/dev/sgx_enclave');
            commonArgs.push('--device=/dev/sgx_provision');
            commonArgs.push('-e');
            commonArgs.push('USE_TEE=1');
        }

        if (language === 'python' || language === 'python3') {
            command = 'docker';
            args = [...commonArgs, 'python:3.9-slim', 'python', '-c', code];
        } else if (language === 'javascript' || language === 'node') {
            command = 'docker';
            args = [...commonArgs, 'node:18-alpine', 'node', '-e', code];
        } else if (language === 'bash' || language === 'sh') {
            // SECURITY FIX: Bash execution disabled due to command injection risk
            // If shell execution is required, use a dedicated shell capsule with strict input validation
            return reject(new Error('Bash/shell execution is disabled for security. Use Python or JavaScript instead.'));
        } else {
            return reject(new Error(`Unsupported language: ${language}`));
        }

        const proc = spawn(command, args);

        if (proc.pid) {
            // CRITICAL: Wait for airgap isolation to complete before proceeding
            try {
                await invokeAirgap('lockdown', proc.pid);
            } catch (err) {
                proc.kill();
                return reject(new Error(`Critical isolation failure: ${err instanceof Error ? err.message : String(err)}`));
            }

            const nnc = new NetworkNamespaceController();

            const ioWeight = limits?.io_weight || 100;
            const cpuQuotaStr = limits?.cpu_ms ? `${limits.cpu_ms * 1000}/1000000` : "100000/1000000";

            try {
                await Promise.all([
                    nnc.applyCgroupLimits(proc.pid, {
                        cpuQuota: cpuQuotaStr,
                        memoryMax: `${memoryMb}M`,
                        pidsMax: 64,
                        ioWeight: ioWeight
                    }),
                    nnc.applySeccompProfile(proc.pid, {
                        defaultAction: "SCMP_ACT_ERRNO",
                        syscalls: [
                            { names: ["execve", "ptrace", "mount", "unshare", "setns", "clone"], action: "SCMP_ACT_ERRNO" }
                        ]
                    })
                ]);
            } catch (err) {
                proc.kill();
                return reject(new Error(`Critical hardening failure: ${err instanceof Error ? err.message : String(err)}`));
            }
        }

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

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
