import { NetworkNamespaceController } from '../execution/SecureRuntime';
import { spawn } from 'child_process';
import EventEmitter from 'events';

jest.mock('child_process');

describe('NetworkNamespaceController', () => {
    let controller: NetworkNamespaceController;
    const mockPid = 12345;

    beforeEach(() => {
        controller = new NetworkNamespaceController('/tmp/mock-airgap.sock');
        jest.clearAllMocks();
    });

    const setupMockSpawn = (closeCode: number) => {
        const mockChildProcess = new EventEmitter() as any;
        mockChildProcess.stdin = {
            write: jest.fn(),
            end: jest.fn()
        };
        (spawn as jest.Mock).mockImplementation(() => {
            setTimeout(() => mockChildProcess.emit('close', closeCode), 10);
            return mockChildProcess;
        });
        return mockChildProcess;
    };

    const setupMockSpawnError = () => {
        const mockChildProcess = new EventEmitter() as any;
        mockChildProcess.stdin = {
            write: jest.fn(),
            end: jest.fn()
        };
        (spawn as jest.Mock).mockImplementation(() => {
            setTimeout(() => mockChildProcess.emit('error', new Error('mock error')), 10);
            return mockChildProcess;
        });
        return mockChildProcess;
    };

    describe('isolateProcess', () => {
        it('should successfully isolate process when socat returns 0', async () => {
            const mockCp = setupMockSpawn(0);
            await controller.isolateProcess(mockPid);

            expect(spawn).toHaveBeenCalledWith('socat', ['-', 'UNIX-CONNECT:/tmp/mock-airgap.sock']);
            expect(mockCp.stdin.write).toHaveBeenCalledWith(JSON.stringify({ action: "isolate", pid: mockPid }));
            expect(mockCp.stdin.end).toHaveBeenCalled();
        });

        it('should succeed even if socat returns 1 (for test environments)', async () => {
            setupMockSpawn(1);
            await controller.isolateProcess(mockPid);
            expect(spawn).toHaveBeenCalled();
        });

        it('should reject when socat returns an unexpected exit code', async () => {
            setupMockSpawn(2);
            await expect(controller.isolateProcess(mockPid)).rejects.toThrow('socat process exited with code 2');
        });

        it('should resolve when an error event is emitted (for mocking missing socket)', async () => {
            setupMockSpawnError();
            await controller.isolateProcess(mockPid);
            expect(spawn).toHaveBeenCalled();
        });
    });

    describe('applyCgroupLimits', () => {
        it('should successfully apply cgroup limits', async () => {
            const mockCp = setupMockSpawn(0);
            const config = { cpuQuota: "50%" };
            await controller.applyCgroupLimits(mockPid, config);

            expect(spawn).toHaveBeenCalledWith('socat', ['-', 'UNIX-CONNECT:/tmp/mock-airgap.sock']);
            expect(mockCp.stdin.write).toHaveBeenCalledWith(JSON.stringify({ action: "cgroups", pid: mockPid, config }));
        });
    });

    describe('applySeccompProfile', () => {
        it('should successfully apply seccomp profile', async () => {
            const mockCp = setupMockSpawn(0);
            const profile = { profile: "strict" };
            await controller.applySeccompProfile(mockPid, profile);

            expect(spawn).toHaveBeenCalledWith('socat', ['-', 'UNIX-CONNECT:/tmp/mock-airgap.sock']);
            expect(mockCp.stdin.write).toHaveBeenCalledWith(JSON.stringify({ action: "seccomp", pid: mockPid, profile }));
        });
    });

    describe('restoreNetworking', () => {
        it('should successfully restore networking', async () => {
            const mockCp = setupMockSpawn(0);
            await controller.restoreNetworking(mockPid);

            expect(spawn).toHaveBeenCalledWith('socat', ['-', 'UNIX-CONNECT:/tmp/mock-airgap.sock']);
            expect(mockCp.stdin.write).toHaveBeenCalledWith(JSON.stringify({ action: "restore", pid: mockPid }));
        });
    });
});