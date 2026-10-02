import {
  createPublicKey,
  verify as verifySignature
} from 'node:crypto';
import { types as utilTypes } from 'node:util';

import manifestPolicy from '../../config/install-release-manifest-policy.json' with { type: 'json' };
import installTargets from '../../config/install-targets.json' with { type: 'json' };
import hostInstallPolicy from '../../config/host-install-policy.json' with { type: 'json' };
import capabilityRegistry from '../../config/capabilities.json' with { type: 'json' };
import applicationCatalog from '../../config/application-catalog.json' with { type: 'json' };
import serviceNetworkPolicy from '../../config/service-network-policy.json' with { type: 'json' };
import sourceSetupPolicy from '../../config/setup.json' with { type: 'json' };
import { MIGRATIONS } from '../grid/migrations.mjs';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './canonical.mjs';

export const INSTALL_RELEASE_MANIFEST_SCHEMA='axiom-install-release-manifest.v1';
export const INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA='axiom-install-release-manifest-package.v1';
export const INSTALL_RELEASE_MANIFEST_POLICY_SCHEMA='axiom-install-release-manifest-policy.v1';

// Trusted signers carry SPKI public-key PEM only. createPublicKey would also accept
// private-key encodings and derive a public key, admitting release private keys.
const SPKI_PUBLIC_KEY_PEM=/^-----BEGIN PUBLIC KEY-----\r?\n(?:[A-Za-z0-9+/]+={0,2}\r?\n)+-----END PUBLIC KEY-----\r?\n?$/;
const CHANNELS=Object.freeze(['development','candidate','stable']);
const PROFILES=Object.freeze(['personal-local','infrastructure-node']);
const ARTIFACT_KINDS=Object.freeze([
  'source-archive','oci-image','axiom-host-image',
  'documentation-bundle','sbom','provenance'
]);
const INSTALLABLE_ARTIFACT_KINDS=Object.freeze([
  'source-archive','oci-image','axiom-host-image'
]);
const REQUIRED_EVIDENCE_ARTIFACT_KINDS=Object.freeze([
  'documentation-bundle','sbom','provenance'
]);
const PLATFORMS=Object.freeze(['any','linux']);
const ARCHITECTURES=Object.freeze(['any','x64','arm64']);
const ROLLBACK_MODES=Object.freeze([
  'in-place-compatible','backup-restore-required','migration-specific'
]);
const REQUIRED_NON_CLAIMS=Object.freeze([
  'signature-does-not-grant-install-authority',
  'artifact-presence-does-not-prove-runtime-safety',
  'axiom-host-image-does-not-prove-secure-or-measured-boot',
  'manifest-does-not-enroll-node-or-start-services',
  'manifest-does-not-prove-artifact-bytes',
  'manifest-does-not-prove-node-readiness'
]);
const SHA256=/^[a-f0-9]{64}$/;
const REVISION=/^[a-f0-9]{40}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$/;
const VERSION=/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const BASE64URL=/^[A-Za-z0-9_-]{64,256}$/;

export function validateInstallReleaseManifestPolicy(policy=manifestPolicy){
  exactObject(policy,'Install release manifest policy',[
    'schema','version','status','signature_algorithm','trusted_signer_role',
    'allowed_channels','max_validity_seconds','install_profiles',
    'allowed_artifact_kinds','installable_artifact_kinds',
    'required_evidence_artifact_kinds','allowed_platforms',
    'allowed_architectures','authority'
  ]);
  if(
    policy.schema!==INSTALL_RELEASE_MANIFEST_POLICY_SCHEMA
    ||policy.version!==1
    ||policy.status!=='verifier-implemented-signer-custody-external'
    ||policy.signature_algorithm!=='Ed25519'
    ||policy.trusted_signer_role!=='release-installer-authority'
    ||policy.max_validity_seconds!==2_678_400
    ||!sameStringArray(policy.allowed_channels,CHANNELS)
    ||!sameStringArray(policy.install_profiles,PROFILES)
    ||!sameStringArray(policy.allowed_artifact_kinds,ARTIFACT_KINDS)
    ||!sameStringArray(policy.installable_artifact_kinds,INSTALLABLE_ARTIFACT_KINDS)
    ||!sameStringArray(policy.required_evidence_artifact_kinds,REQUIRED_EVIDENCE_ARTIFACT_KINDS)
    ||!sameStringArray(policy.allowed_platforms,PLATFORMS)
    ||!sameStringArray(policy.allowed_architectures,ARCHITECTURES)
  ) throw new ValidationError('Install release manifest policy weakens the v1 contract');

  exactObject(policy.authority,'Install release manifest authority policy',[
    'manifest_grants_install_authority','manifest_grants_mesh_authority',
    'manifest_grants_network_authority','manifest_enrolls_node',
    'manifest_starts_services','manifest_mutates_host',
    'manifest_may_claim_production_promotion'
  ]);
  if(Object.values(policy.authority).some(value=>value!==false)){
    throw new ValidationError('Install release manifest policy cannot grant authority or mutate the host');
  }

  return Object.freeze({
    valid:true,
    schema:policy.schema,
    policy_digest:digestObject(policy),
    signer_custody:'external',
    authority_effect:'none',
    host_mutation_authorized:false
  });
}

export function verifyInstallReleaseManifest(packageValue,options={}){
  if(options===null||typeof options!=='object'||utilTypes.isProxy(options)){
    throw new ValidationError('Install release manifest options must be an object');
  }
  const {
    trustedSigners,
    evaluatedAt,
    policy=manifestPolicy,
    currentInstallTargets=installTargets,
    currentHostInstallPolicy=hostInstallPolicy,
    currentCapabilityRegistry=capabilityRegistry,
    currentApplicationCatalog=applicationCatalog,
    currentServiceNetworkPolicy=serviceNetworkPolicy,
    currentSourceSetupPolicy=sourceSetupPolicy,
    migrationGeneration=MIGRATIONS.length
  }=options;
  const policyResult=validateInstallReleaseManifestPolicy(policy);
  exactObject(packageValue,'Install release manifest package',[
    'schema','manifest','signature'
  ]);
  if(packageValue.schema!==INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA){
    throw new ValidationError('Install release manifest package schema is invalid');
  }

  const manifest=validateManifest(packageValue.manifest,{
    policy,
    currentInstallTargets,
    currentHostInstallPolicy,
    currentCapabilityRegistry,
    currentApplicationCatalog,
    currentServiceNetworkPolicy,
    currentSourceSetupPolicy,
    migrationGeneration
  });

  const evaluationTime=parseInstant(evaluatedAt,'evaluatedAt');
  const issuedAt=parseInstant(manifest.issued_at,'manifest issued_at');
  const validUntil=parseInstant(manifest.valid_until,'manifest valid_until');
  if(validUntil<=issuedAt) throw new ValidationError('Install release manifest validity window is invalid');
  if((validUntil-issuedAt)/1000>policy.max_validity_seconds){
    throw new ValidationError('Install release manifest validity exceeds policy');
  }
  if(issuedAt>evaluationTime) throw new ValidationError('Install release manifest is future-issued');
  if(validUntil<=evaluationTime) throw new ValidationError('Install release manifest is expired');

  const signer=trustedSignerFor(manifest.signing_key_id,trustedSigners,policy);
  exactObject(packageValue.signature,'Install release manifest signature',[
    'algorithm','key_id','digest','signature'
  ]);
  const signature=packageValue.signature;
  const body=canonicalJson(manifest);
  const bodyDigest=sha256(body);
  if(
    signature.algorithm!==policy.signature_algorithm
    ||signature.key_id!==manifest.signing_key_id
    ||signature.digest!==bodyDigest
    ||!BASE64URL.test(signature.signature)
  ) throw new ValidationError('Install release manifest signature metadata is invalid');

  let publicKey;
  try{
    publicKey=createPublicKey(signer.public_key);
  }catch{
    throw new ValidationError('Trusted release signer public key is invalid');
  }
  if(publicKey.asymmetricKeyType!=='ed25519'){
    throw new ValidationError('Trusted release signer must use Ed25519');
  }
  const normalizedPem=`${signer.public_key.replace(/\r\n/g,'\n').replace(/\n?$/,'')}\n`;
  if(publicKey.export({type:'spki',format:'pem'})!==normalizedPem){
    throw new ValidationError('Trusted release signer public key is not canonical SPKI PEM');
  }

  let verified=false;
  try{
    verified=verifySignature(
      null,
      Buffer.from(body),
      publicKey,
      Buffer.from(signature.signature,'base64url')
    );
  }catch{
    verified=false;
  }
  if(!verified) throw new ValidationError('Install release manifest signature verification failed');

  return deepFreeze({
    valid:true,
    schema:INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA,
    manifest_schema:manifest.schema,
    release_id:manifest.release_id,
    kernel_version:manifest.kernel_version,
    channel:manifest.channel,
    source_revision:manifest.source_revision,
    evaluated_at:new Date(evaluationTime).toISOString(),
    valid_until:manifest.valid_until,
    signer_key_id:manifest.signing_key_id,
    signature_verified:true,
    control_plane_bound:true,
    install_profile_binding_complete:true,
    artifact_metadata_bound:true,
    artifact_bytes_verified:false,
    artifact_count:manifest.artifacts.length,
    install_profiles:manifest.install_profiles.map(item=>item.id),
    policy_digest:policyResult.policy_digest,
    manifest_digest:bodyDigest,
    production_promoted:false,
    production_promotion_established:false,
    release_input_cryptographically_valid:true,
    host_plan_required_separately:true,
    host_mutation_authorized:false,
    installation_authority_granted:false,
    mesh_authority_granted:false,
    network_authority_granted:false,
    node_enrolled:false,
    services_started:false,
    authority_effect:'none',
    network_effect:'none'
  });
}

/**
 * Verify local artifact bytes against one artifact metadata record.
 *
 * The artifact metadata must come from the result of a just-verified manifest
 * (`verifyInstallReleaseManifest`); this byte check alone is not
 * manifest-backed provenance (`manifest_bound: false`) and must not be used as
 * an install gate until the manifest-bound overload lands.
 */
export function verifyInstallReleaseArtifact(artifact,bytes,options={}){
  if(options===null||typeof options!=='object'||utilTypes.isProxy(options)){
    throw new ValidationError('Release artifact options must be an object');
  }
  const {policy=manifestPolicy}=options;
  validateInstallReleaseManifestPolicy(policy);
  validateArtifact(artifact,new Set(PROFILES),policy);
  if(utilTypes.isProxy(bytes)||!utilTypes.isUint8Array(bytes)){
    throw new ValidationError('Release artifact bytes must be a Buffer or Uint8Array');
  }
  let buffer;
  try{
    buffer=Buffer.from(new Uint8Array(bytes));
  }catch{
    throw new ValidationError('Release artifact bytes are unreadable');
  }
  if(buffer.length!==artifact.byte_length){
    throw new ValidationError(`Release artifact byte length mismatch: ${artifact.artifact_id}`);
  }
  if(sha256(buffer)!==artifact.sha256){
    throw new ValidationError(`Release artifact digest mismatch: ${artifact.artifact_id}`);
  }
  return Object.freeze({
    valid:true,
    artifact_id:artifact.artifact_id,
    artifact_kind:artifact.kind,
    artifact_bytes_verified:true,
    sha256:artifact.sha256,
    byte_length:artifact.byte_length,
    manifest_bound:false,
    host_mutation_authorized:false,
    authority_effect:'none'
  });
}

function validateManifest(manifest,context){
  exactObject(manifest,'Install release manifest',[
    'schema','version','release_id','kernel_version','channel',
    'production_promoted','source_revision','issued_at','valid_until',
    'signing_key_id','install_profiles','toolchain','data_compatibility',
    'control_plane','artifacts','non_claims',
    'installation_grants_authority','host_mutation_authorized',
    'authority_effect','network_effect'
  ]);
  if(
    manifest.schema!==INSTALL_RELEASE_MANIFEST_SCHEMA
    ||manifest.version!==1
    ||!ID.test(manifest.release_id)
    ||!VERSION.test(manifest.kernel_version)
    ||!context.policy.allowed_channels.includes(manifest.channel)
    ||manifest.production_promoted!==false
    ||!REVISION.test(manifest.source_revision)
    ||!ID.test(manifest.signing_key_id)
    ||manifest.installation_grants_authority!==false
    ||manifest.host_mutation_authorized!==false
    ||manifest.authority_effect!=='none'
    ||manifest.network_effect!=='none'
  ) throw new ValidationError('Install release manifest identity or authority boundary is invalid');

  for(const current of [
    context.currentInstallTargets,
    context.currentHostInstallPolicy,
    context.currentCapabilityRegistry,
    context.currentSourceSetupPolicy
  ]){
    if(current?.kernel_version!==manifest.kernel_version){
      throw new ValidationError('Install release manifest kernel version does not match current control plane');
    }
  }

  validateInstallProfiles(manifest.install_profiles,context);
  validateToolchain(manifest.toolchain,context.currentSourceSetupPolicy);
  validateDataCompatibility(manifest.data_compatibility,context.migrationGeneration);
  validateControlPlane(manifest.control_plane,context);

  plainArray(manifest.artifacts,'Install release artifacts',{min:4,max:128});
  const artifactIds=new Set();
  const profileIds=new Set(manifest.install_profiles.map(item=>item.id));
  for(const artifact of manifest.artifacts){
    validateArtifact(artifact,profileIds,context.policy);
    if(artifactIds.has(artifact.artifact_id)){
      throw new ValidationError('Install release artifact id is duplicated');
    }
    artifactIds.add(artifact.artifact_id);
  }
  for(const kind of context.policy.required_evidence_artifact_kinds){
    if(!manifest.artifacts.some(artifact=>artifact.kind===kind)){
      throw new ValidationError(`Install release manifest is missing required ${kind} evidence`);
    }
  }
  for(const profileId of profileIds){
    const installable=manifest.artifacts.some(artifact=>
      context.policy.installable_artifact_kinds.includes(artifact.kind)
      &&artifact.required_for_profiles.includes(profileId)
    );
    if(!installable){
      throw new ValidationError(`Install release profile lacks an installable artifact: ${profileId}`);
    }
  }

  stringArray(manifest.non_claims,'Install release non_claims',{min:REQUIRED_NON_CLAIMS.length,max:64,itemMax:160});
  for(const required of REQUIRED_NON_CLAIMS){
    if(!manifest.non_claims.includes(required)){
      throw new ValidationError(`Install release manifest is missing non-claim: ${required}`);
    }
  }
  return manifest;
}

function validateInstallProfiles(value,context){
  plainArray(value,'Install release profiles',{min:1,max:PROFILES.length});
  const allowed=new Set(context.policy.install_profiles);
  const currentTargets=new Map(
    (context.currentInstallTargets?.targets??[]).map(target=>[target.id,target])
  );
  const seen=new Set();
  for(const profile of value){
    exactObject(profile,'Install release profile binding',['id','target_status']);
    if(
      !allowed.has(profile.id)
      ||seen.has(profile.id)
      ||currentTargets.get(profile.id)?.status!==profile.target_status
    ) throw new ValidationError('Install release profile binding is invalid or stale');
    seen.add(profile.id);
  }
}

function validateToolchain(toolchain,setupPolicy){
  exactObject(toolchain,'Install release toolchain',[
    'node_engine','node_ci_version','node_hosted_production_version',
    'node_container_version','npm_minimum_version','npm_major_exclusive',
    'npm_compatibility_minimum_version','npm_compatibility_major_exclusive'
  ]);
  if(
    toolchain.node_engine!==setupPolicy?.runtime?.engine
    ||toolchain.node_ci_version!==setupPolicy?.runtime?.ci_version
    ||toolchain.node_hosted_production_version!==setupPolicy?.runtime?.hosted_production_version
    ||toolchain.node_container_version!==setupPolicy?.runtime?.production_version
    ||toolchain.npm_minimum_version!==setupPolicy?.package_manager?.minimum_version
    ||toolchain.npm_major_exclusive!==setupPolicy?.package_manager?.maximum_major_exclusive
    ||toolchain.npm_compatibility_minimum_version!==setupPolicy?.package_manager?.compatibility_minimum_version
    ||toolchain.npm_compatibility_major_exclusive!==setupPolicy?.package_manager?.compatibility_maximum_major_exclusive
  ) throw new ValidationError('Install release toolchain binding is stale');
}

function validateDataCompatibility(value,migrationGeneration){
  exactObject(value,'Install release data compatibility',[
    'migration_generation','rollback_mode','minimum_compatible_kernel'
  ]);
  if(
    !Number.isSafeInteger(value.migration_generation)
    ||value.migration_generation<0
    ||value.migration_generation!==migrationGeneration
    ||!ROLLBACK_MODES.includes(value.rollback_mode)
    ||!VERSION.test(value.minimum_compatible_kernel)
  ) throw new ValidationError('Install release data compatibility binding is invalid');
}

function validateControlPlane(value,context){
  exactObject(value,'Install release control plane',[
    'install_targets_sha256','host_install_policy_sha256',
    'capability_registry_sha256','application_catalog_sha256',
    'service_network_policy_sha256','source_setup_policy_sha256'
  ]);
  const expected={
    install_targets_sha256:digestObject(context.currentInstallTargets),
    host_install_policy_sha256:digestObject(context.currentHostInstallPolicy),
    capability_registry_sha256:digestObject(context.currentCapabilityRegistry),
    application_catalog_sha256:digestObject(context.currentApplicationCatalog),
    service_network_policy_sha256:digestObject(context.currentServiceNetworkPolicy),
    source_setup_policy_sha256:digestObject(context.currentSourceSetupPolicy)
  };
  for(const [key,expectedDigest] of Object.entries(expected)){
    if(!SHA256.test(value[key])||value[key]!==expectedDigest){
      throw new ValidationError(`Install release control-plane binding is stale: ${key}`);
    }
  }
}

function validateArtifact(artifact,profileIds,policy=manifestPolicy){
  exactObject(artifact,'Install release artifact',[
    'artifact_id','kind','platform','architecture','media_type',
    'locator','sha256','byte_length','required_for_profiles'
  ]);
  if(
    !ID.test(artifact.artifact_id)
    ||!policy.allowed_artifact_kinds.includes(artifact.kind)
    ||!policy.allowed_platforms.includes(artifact.platform)
    ||!policy.allowed_architectures.includes(artifact.architecture)
    ||typeof artifact.media_type!=='string'
    ||artifact.media_type.length<3
    ||artifact.media_type.length>160
    ||typeof artifact.locator!=='string'
    ||artifact.locator.length<1
    ||artifact.locator.length>2048
    ||!SHA256.test(artifact.sha256)
    ||!Number.isSafeInteger(artifact.byte_length)
    ||artifact.byte_length<1
    ||artifact.byte_length>1_000_000_000_000
  ) throw new ValidationError('Install release artifact metadata is invalid');

  stringArray(artifact.required_for_profiles,'Install release artifact profiles',{
    min:1,max:PROFILES.length,itemMax:64
  });
  for(const profileId of artifact.required_for_profiles){
    if(!profileIds.has(profileId)){
      throw new ValidationError('Install release artifact references an unbound install profile');
    }
  }
}

function trustedSignerFor(keyId,trustedSigners,policy){
  plainArray(trustedSigners,'Trusted release signers',{min:1,max:256});
  const ids=new Set();
  let found=null;
  for(const signer of trustedSigners){
    exactObject(signer,'Trusted release signer',[
      'key_id','public_key','roles','status'
    ]);
    stringArray(signer.roles,'Trusted release signer roles',{min:1,max:32,itemMax:128});
    if(
      !ID.test(signer.key_id)
      ||ids.has(signer.key_id)
      ||typeof signer.public_key!=='string'
      ||signer.public_key.length<32
      ||signer.public_key.length>16_384
      ||!SPKI_PUBLIC_KEY_PEM.test(signer.public_key)
      ||!['active','retired','revoked'].includes(signer.status)
    ) throw new ValidationError('Trusted release signer inventory is invalid');
    ids.add(signer.key_id);
    if(signer.key_id===keyId) found=signer;
  }
  if(!found||found.status!=='active'||!found.roles.includes(policy.trusted_signer_role)){
    throw new ValidationError('Release signer is not actively trusted for install manifests');
  }
  return found;
}

function parseInstant(value,label){
  if(typeof value!=='string') throw new ValidationError(`${label} must be an ISO timestamp`);
  const parsed=Date.parse(value);
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString()!==value){
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return parsed;
}

function sameStringArray(value,expected){
  stringArray(value,'Policy string array',{min:expected.length,max:expected.length,itemMax:128});
  return canonicalJson(value)===canonicalJson(expected);
}

function stringArray(value,label,{min=0,max=64,itemMax=512}={}){
  plainArray(value,label,{min,max});
  const seen=new Set();
  for(const item of value){
    if(
      typeof item!=='string'
      ||item.length<1
      ||item.length>itemMax
      ||seen.has(item)
    ) throw new ValidationError(`${label} contains invalid or duplicate values`);
    seen.add(item);
  }
  return value;
}

function plainArray(value,label,{min=0,max=64}={}){
  if(utilTypes.isProxy(value)) throw new ValidationError(`${label} cannot be a Proxy`);
  if(
    !Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Array.prototype
    ||value.length<min
    ||value.length>max
  ) throw new ValidationError(`${label} has invalid cardinality or prototype`);
  const allowed=new Set(['length']);
  for(let index=0;index<value.length;index+=1){
    const key=String(index);
    allowed.add(key);
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')){
      throw new ValidationError(`${label} must be dense enumerable data`);
    }
  }
  for(const key of Reflect.ownKeys(value)){
    if(typeof key==='symbol'||!allowed.has(key)){
      throw new ValidationError(`${label} contains custom array state`);
    }
  }
  return value;
}

function exactObject(value,label,keys){
  if(utilTypes.isProxy(value)) throw new ValidationError(`${label} cannot be a Proxy`);
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null){
    throw new ValidationError(`${label} must be a plain object`);
  }
  const actual=Reflect.ownKeys(value);
  if(actual.some(key=>typeof key==='symbol')){
    throw new ValidationError(`${label} cannot contain symbol keys`);
  }
  for(const key of actual){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')){
      throw new ValidationError(`${label} must contain only enumerable data properties`);
    }
  }
  if(actual.map(String).sort().join(',')!==[...keys].sort().join(',')){
    throw new ValidationError(`${label} key inventory drifted`);
  }
  return value;
}

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
