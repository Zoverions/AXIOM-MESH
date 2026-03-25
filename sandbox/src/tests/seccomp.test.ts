import fs from 'fs';
import path from 'path';

describe('Sandbox Seccomp Policy configuration', () => {
    let seccompConfig: any;

    beforeAll(() => {
        const configPath = path.resolve(__dirname, '../../security/seccomp-default.json');
        const configContent = fs.readFileSync(configPath, 'utf-8');
        seccompConfig = JSON.parse(configContent);
    });

    it('should exist and be a valid JSON file', () => {
        expect(seccompConfig).toBeDefined();
        expect(typeof seccompConfig).toBe('object');
    });

    it('should have a default action of SCMP_ACT_ERRNO to block everything not explicitly allowed', () => {
        expect(seccompConfig.defaultAction).toBe('SCMP_ACT_ERRNO');
    });

    it('should support required architectures x86_64, x86, and x32', () => {
        expect(seccompConfig.architectures).toContain('SCMP_ARCH_X86_64');
        expect(seccompConfig.architectures).toContain('SCMP_ARCH_X86');
        expect(seccompConfig.architectures).toContain('SCMP_ARCH_X32');
    });

    it('should explicitly allow critical basic syscalls', () => {
        const allowedSyscalls = seccompConfig.syscalls.find((s: any) => s.action === 'SCMP_ACT_ALLOW');
        expect(allowedSyscalls).toBeDefined();

        const names = allowedSyscalls.names;
        const requiredSyscalls = ['read', 'write', 'exit', 'exit_group', 'futex', 'clock_gettime', 'rt_sigreturn', 'brk', 'mmap', 'munmap', 'mprotect', 'close', 'lseek', 'getpid', 'gettid'];

        for (const sys of requiredSyscalls) {
            expect(names).toContain(sys);
        }
    });

    it('should not allow dangerous syscalls like execve or ptrace', () => {
        const allowedSyscalls = seccompConfig.syscalls.find((s: any) => s.action === 'SCMP_ACT_ALLOW');
        expect(allowedSyscalls).toBeDefined();

        const names = allowedSyscalls.names;
        expect(names).not.toContain('execve');
        expect(names).not.toContain('ptrace');
        expect(names).not.toContain('mount');
        expect(names).not.toContain('unshare');
        expect(names).not.toContain('clone');
        expect(names).not.toContain('setns');
    });
});
