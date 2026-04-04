import * as net from 'net';

class IpcClient {
    createAudioStream(streamId: string): net.Socket {
        // Connect to the Axiom Audio IPC socket in the Python Hypervisor
        const socket = net.createConnection('/tmp/axiom_audio.sock');

        socket.on('connect', () => {
            console.log(`[IPC] Connected stream ${streamId} to /tmp/axiom_audio.sock`);
            // Optionally, send a handshake/metadata with the streamId
            socket.write(JSON.stringify({ event: 'STREAM_INIT', streamId }) + '\n');
        });

        socket.on('error', (err) => {
            console.error(`[IPC] Error on stream ${streamId}:`, err);
        });

        return socket;
    }
}

export const ipcClient = new IpcClient();