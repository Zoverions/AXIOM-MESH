import { spawn } from 'child_process';

export interface SeccompPolicy {
  defaultAction: string;
  syscalls: {
    names: string[];
    action: string;
  }[];
}

export interface SandboxHardeningConfig {
  // Layer 1: Docker defaults (existing)
  dockerSecurity: {
    networkMode: 'none';
    capDrop: 'ALL';
    securityOpts: ['no-new-privileges:true'];
    readOnlyRootFs: boolean;
  };

  // Layer 2: Namespace-level isolation (implement airgap.rs integration)
  networkNamespace: {
    enabled: boolean;
    vethPairIsolation: boolean;
    iptablesLockdown: boolean;
    udsControlSocket: string; // /var/run/axiom-airgap.sock
  };

  // Layer 3: System call filtering
  seccomp: {
    profile: 'default' | 'axiom-strict' | 'custom';
    customPolicy: SeccompPolicy;
    auditMode: boolean; // Log before blocking for debugging
  };

  // Layer 4: Resource exhaustion prevention
  cgroupsV2: {
    cpuQuota: string;     // e.g., "100000/1000000" (10%)
    memoryMax: string;    // e.g., "512M"
    pidsMax: number;      // e.g., 64
    ioWeight: number;     // 10-1000
  };
}

export class NetworkNamespaceController {
  private udsSocketPath: string;
  private strictIsolation: boolean;

  constructor(udsSocketPath: string = '/var/run/axiom-airgap.sock') {
    this.udsSocketPath = udsSocketPath;
    // Fail closed in production unless explicitly disabled.
    this.strictIsolation = process.env.AIRGAP_STRICT !== '0' && process.env.NODE_ENV === 'production';
  }

  private async _sendSocatCommand(payloadObj: any, description: string): Promise<void> {
    const pid = payloadObj.pid;
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(payloadObj);
      console.log(`Sending ${description} command for PID ${pid} to airgap socket at ${this.udsSocketPath}`);
      try {
        const socat = spawn('socat', ['-', `UNIX-CONNECT:${this.udsSocketPath}`]);

        socat.on('close', (code) => {
          if (code === 0) {
            console.log(`${description} successful for process ${pid}`);
            resolve();
            return;
          }

          // In non-production/test workflows we can operate in fail-open mode to keep local execution usable.
          if (!this.strictIsolation && code === 1) {
            console.warn(`${description} returned code 1 for process ${pid}; continuing in non-strict mode.`);
            resolve();
            return;
          }

          reject(new Error(`socat process exited with code ${code}`));
        });

        socat.on('error', (err) => {
          if (this.strictIsolation) {
            reject(new Error(`socat error during ${description} for process ${pid}: ${err.message}`));
            return;
          }
          // In local and test workflows the socket may not exist; keep behavior fail-open.
          console.warn(`socat error during ${description} for process ${pid}: ${err.message} (non-strict mode)`);
          resolve();
        });

        if (socat.stdin) {
            socat.stdin.write(payload);
            socat.stdin.end();
        } else {
            resolve();
        }
      } catch(e) {
          if (this.strictIsolation) {
            reject(e instanceof Error ? e : new Error(String(e)));
            return;
          }
          resolve();
      }
    });
  }

  async isolateProcess(pid: number): Promise<void> {
    return this._sendSocatCommand({ action: "isolate", pid }, "isolation");
  }

  async applyCgroupLimits(pid: number, config: any): Promise<void> {
    return this._sendSocatCommand({ action: "cgroups", pid, config }, "cgroups limits");
  }

  async applySeccompProfile(pid: number, profile: any): Promise<void> {
    return this._sendSocatCommand({ action: "seccomp", pid, profile }, "seccomp profile");
  }

  async restoreNetworking(pid: number): Promise<void> {
    return this._sendSocatCommand({ action: "restore", pid }, "restore");
  }
}
