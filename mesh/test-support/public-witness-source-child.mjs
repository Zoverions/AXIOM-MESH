import { createPublicWitnessTransferPackage } from '../src/lib/public-witness-transfer.mjs';
import { canonicalJson } from '../src/lib/canonical.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const {
  credential,
  sourceAdmission,
  sourcePrivateKey,
  previousTransfer,
  transferId,
  createdAt,
  expiresAt,
  now
} = JSON.parse(input);
const transfer = createPublicWitnessTransferPackage({
  operation: 'observe-credential',
  request: { credential }
}, {
  sourceAdmission,
  sourcePrivateKey,
  previousTransfer,
  transferId,
  createdAt,
  expiresAt,
  now
});
process.stdout.write(canonicalJson(transfer));
