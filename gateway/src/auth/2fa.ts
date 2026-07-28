import speakeasy from 'speakeasy';
import { generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse } from '@simplewebauthn/server';
// import { encrypt, decrypt } from 'crypto-js'; // reuse existing offline-first encryption

// Called from existing API-key middleware after bond verification
export async function setupTOTP(nodeId: string) {
  const secret = speakeasy.generateSecret({ length: 20 });
  const qr = `otpauth://totp/AXIOM-MESH:${nodeId}?secret=${secret.base32}`;
  // Store hash only on-chain via registerRecovery
  return { qr, secret: secret.base32 };
}

export async function setupPasskey() {
  // WebAuthn options — returns to browser for registration
  return await generateAuthenticationOptions({ rpID: "AXIOM-MESH", userVerification: "preferred" });
}

// Recovery endpoint — pulls bundle from MeshStore
export async function recoverMesh(nodeId: string, totpCode: string, passkeyResponse: any) {
  // Verify against DualLedgerIdentity commitments (Go RPC call)
  // const bundleCID = await getRecoveryBundleCID(nodeId); // from contract
  // const bundle = await ipfsGet(bundleCID); // existing MeshStore
  // decrypt + restore CRDT + swarm rejoin
}
