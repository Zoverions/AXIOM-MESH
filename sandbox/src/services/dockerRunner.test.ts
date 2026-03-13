import { runCode } from './dockerRunner';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('child_process');

describe('dockerRunner', () => {
    let mockProcess: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        (spawn as jest.Mock).mockReturnValue(mockProcess);

        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should reject for unsupported languages', async () => {
        await expect(runCode('ruby', 'puts "Hello"')).rejects.toThrow('Unsupported language: ruby');
        expect(spawn).not.toHaveBeenCalled();
    });

    it('should successfully run python code', async () => {
        const code = 'print("Hello, Python!")';
        const promise = runCode('python', code);

        mockProcess.stdout.emit('data', Buffer.from('Hello, Python!\n'));
        mockProcess.emit('close', 0);

        const result = await promise;

        expect(spawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'python:3.9-slim', 'python', '-c', code
        ]);
        expect(result).toEqual({
            stdout: 'Hello, Python!\n',
            stderr: ''
        });
    });

    it('should successfully run javascript code', async () => {
        const code = 'console.log("Hello, JS!")';
        const promise = runCode('javascript', code);

        mockProcess.stdout.emit('data', Buffer.from('Hello, JS!\n'));
        mockProcess.emit('close', 0);

        const result = await promise;

        expect(spawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'node:18-alpine', 'node', '-e', code
        ]);
        expect(result).toEqual({
            stdout: 'Hello, JS!\n',
            stderr: ''
        });
    });

    it('should handle process spawn error', async () => {
        const code = 'print("Hello, Python!")';
        const promise = runCode('python', code);

        const error = new Error('Failed to start docker');
        mockProcess.emit('error', error);

        const result = await promise;

        expect(result).toEqual({
            stdout: '',
            stderr: 'Failed to start docker'
        });
    });

    it('should handle process spawn error without message', async () => {
        const code = 'print("Hello, Python!")';
        const promise = runCode('python', code);

        mockProcess.emit('error', {});

        const result = await promise;

        expect(result).toEqual({
            stdout: '',
            stderr: 'Execution failed'
        });
    });

    it('should capture stderr successfully', async () => {
        const code = 'print("Hello, Python!")';
        const promise = runCode('python', code);

        mockProcess.stderr.emit('data', Buffer.from('Some error log\n'));
        mockProcess.emit('close', 1);

        const result = await promise;

        expect(result).toEqual({
            stdout: '',
            stderr: 'Some error log\n'
        });
    });

    it('should handle timeout scenario', async () => {
        const code = 'while True: pass';
        const promise = runCode('python', code);

        // Advance timers by 10000ms
        jest.advanceTimersByTime(10000);

        const result = await promise;

        expect(mockProcess.kill).toHaveBeenCalled();
        expect(result).toEqual({
            stdout: '',
            stderr: '\nExecution timed out'
        });
    });
});
