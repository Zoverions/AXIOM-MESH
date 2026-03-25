import fs from 'fs';
import path from 'path';

describe('Sandbox AppArmor Profile configuration', () => {
    let apparmorProfile: string;

    beforeAll(() => {
        const configPath = path.resolve(__dirname, '../../security/apparmor-profile');
        apparmorProfile = fs.readFileSync(configPath, 'utf-8');
    });

    it('should have a profile named axiom-sandbox', () => {
        expect(apparmorProfile).toMatch(/profile axiom-sandbox flags=/);
    });

    it('should deny raw, packet, inet, and inet6 network access', () => {
        expect(apparmorProfile).toContain('deny network raw');
        expect(apparmorProfile).toContain('deny network packet');
        expect(apparmorProfile).toContain('deny network inet');
        expect(apparmorProfile).toContain('deny network inet6');
    });

    it('should deny mounting', () => {
        expect(apparmorProfile).toMatch(/deny mount\s*,/);
        expect(apparmorProfile).toMatch(/deny umount\s*,/);
        expect(apparmorProfile).toMatch(/deny pivot_root\s*,/);
    });

    it('should deny ptracing', () => {
        expect(apparmorProfile).toMatch(/deny ptrace\s*,/);
    });

    it('should restrict proc access', () => {
        expect(apparmorProfile).toContain('deny /proc/kcore rw');
        expect(apparmorProfile).toContain('deny /proc/sysrq-trigger rw');
        expect(apparmorProfile).toContain('deny /proc/bus/** rw');
    });

    it('should deny sensitive file access', () => {
        expect(apparmorProfile).toMatch(/deny \/etc\/passwd r\s*,/);
        expect(apparmorProfile).toMatch(/deny \/etc\/shadow r\s*,/);
        expect(apparmorProfile).toMatch(/deny \/etc\/group r\s*,/);
    });

    it('should allow /tmp usage', () => {
        expect(apparmorProfile).toMatch(/\/tmp\/\*\* rw\s*,/);
    });
});
