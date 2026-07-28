import request from 'supertest';
import { app } from '../index';
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { registry } from '../routes/capsule';

describe('Skill Capsule Registry', () => {
    let publicKeyPem: string;
    let privateKeyPem: string;

    beforeAll(() => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
        });

        publicKeyPem = publicKey.export({
            type: 'spki',
            format: 'pem'
        }).toString();

        privateKeyPem = privateKey.export({
            type: 'pkcs8',
            format: 'pem'
        }).toString();

        process.env.CAPSULE_PUBLIC_KEY = publicKeyPem;
        process.env.TEST_ALLOW_ALL_CAPSULES = 'false';
        process.env.SANDBOX_API_KEY = 'test-sandbox-key';
    });

    afterAll(() => {
        delete process.env.CAPSULE_PUBLIC_KEY;
        delete process.env.TEST_ALLOW_ALL_CAPSULES;
    });

    function getAuthHeaders(payload: any, key: string = 'test-sandbox-key') {
        const payloadStr = payload && Object.keys(payload).length > 0 ? stringify(payload) : '';
        const timestampStr = Date.now().toString();
        const nonce = 'test-nonce-' + Math.random().toString(36).substring(7);
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(`${timestampStr}:${nonce}:${payloadStr}`);


        return {
            'x-axiom-timestamp': timestampStr,
            'x-axiom-nonce': nonce,
            'x-axiom-signature': hmac.digest('hex')
        };
    }

    const createValidCapsule = () => {
        const manifest = {
            id: 'test-capsule-1',
            version: '1.0.0',
            entrypoint: 'main.py',
            language: 'python',
            author: '0x123',
            required_hardware_tier: 'minimal-edge',
            attestation_policy: 'tee-only',
            scopes: {
                network: true,
                storage: true,
                resource_limits: {
                    mem_mb: 512,
                    cpu_cores: 1,
                    time_s: 30
                }
            }
        };

        const binary_base64 = Buffer.from('print("Hello from capsule")').toString('base64');
        const payloadToSign = stringify({ manifest, binary_base64 });

        const sign = crypto.createSign('SHA256');
        sign.update(payloadToSign);
        sign.end();
        const signature = sign.sign({ key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN }, 'base64');

        return {
            manifest,
            binary_base64,
            signatures: [signature]
        };
    };

    it('should publish and verify a valid signed capsule', async () => {
        const validCapsule = createValidCapsule();
        const payloadStr = stringify(validCapsule);

        const pubRes = await request(app)
            .post('/capsule/publish')
            .set(getAuthHeaders(validCapsule))
            .set('Content-Type', 'application/json')
            .send(payloadStr)
            .expect(200);

        expect(pubRes.body.status).toBe('published');

        const verifyRes = await request(app)
            .get(`/capsule/${validCapsule.manifest.id}/verify`)
            .set(getAuthHeaders(''))
            .expect(200);

        expect(verifyRes.body.verified).toBe(true);
    });

    it('should reject a tampered capsule (replay attack simulation)', async () => {
        const tamperedCapsule = createValidCapsule();
        tamperedCapsule.manifest.scopes.resource_limits.mem_mb = 1024;
        const payloadStr = stringify(tamperedCapsule);

        const pubRes = await request(app)
            .post('/capsule/publish')
            .set(getAuthHeaders(tamperedCapsule))
            .set('Content-Type', 'application/json')
            .send(payloadStr)
            .expect(403);

        expect(pubRes.body.error).toContain('Signature verification failed');
    });

    it('should execute a valid capsule', async () => {
        const validCapsule = createValidCapsule();
        const payloadStr = stringify(validCapsule);

        await request(app)
            .post('/capsule/publish')
            .set(getAuthHeaders(validCapsule))
            .set('Content-Type', 'application/json')
            .send(payloadStr)
            .expect(200);

        const execPayload = {};
        const execPayloadStr = '{}';
        const execRes = await request(app)
            .post(`/capsule/${validCapsule.manifest.id}/execute`)
            .set(getAuthHeaders({}))
            .set('Content-Type', 'application/json')
            .send(execPayloadStr);

        expect(execRes.status).not.toBe(403);
    });

    it('should reject execution of tampered capsule if it somehow was loaded', async () => {
        const validCapsule = createValidCapsule();
        const payloadStr = stringify(validCapsule);

        await request(app)
            .post('/capsule/publish')
            .set(getAuthHeaders(validCapsule))
            .set('Content-Type', 'application/json')
            .send(payloadStr)
            .expect(200);

        const storedCapsule = registry.get(validCapsule.manifest.id);
        const tamperedCapsule = { ...storedCapsule, signatures: [Buffer.from('invalid_signature').toString('base64')] };
        registry.set(validCapsule.manifest.id, tamperedCapsule);

        const execPayload = {};
        const execPayloadStr = '{}';
        await request(app)
            .post(`/capsule/${validCapsule.manifest.id}/execute`)
            .set(getAuthHeaders({}))
            .set('Content-Type', 'application/json')
            .send(execPayloadStr)
            .expect(403);
    });

    it('fuzz manifest fields', async () => {
        const validCapsule = createValidCapsule();
        delete (validCapsule.manifest as any).entrypoint;
        const payloadStr = stringify(validCapsule);

        const pubRes = await request(app)
            .post('/capsule/publish')
            .set(getAuthHeaders(validCapsule))
            .set('Content-Type', 'application/json')
            .send(payloadStr)
            .expect(400);

        expect(pubRes.body.error).toContain('Manifest missing required field');
    });
});
