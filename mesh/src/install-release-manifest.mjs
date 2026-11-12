import { pathToFileURL } from 'node:url';

import { canonicalJson, ValidationError } from './lib/canonical.mjs';
import {
  buildInstallReleaseManifestStatement,
  packageInstallReleaseManifestStatement
} from './lib/install-release-manifest.mjs';

const MAX_INPUT_BYTES=1_048_576;
const USAGE='Usage: node src/install-release-manifest.mjs <build-unsigned|package-detached> < input.json';
const PUBLIC_ERRORS=new Set([
  USAGE,
  `Install release manifest input exceeds ${MAX_INPUT_BYTES} bytes`,
  'Install release manifest input is not valid UTF-8',
  'Install release manifest input is not valid JSON',
  'Install release manifest input failed validation'
]);

export async function installReleaseManifestMain(
  argv=process.argv.slice(2),
  input=process.stdin
){
  if(argv.length!==1||!['build-unsigned','package-detached'].includes(argv[0])){
    throw new ValidationError(USAGE);
  }

  const chunks=[];
  let length=0;
  for await(const chunk of input){
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    length+=bytes.length;
    if(length>MAX_INPUT_BYTES){
      throw new ValidationError(`Install release manifest input exceeds ${MAX_INPUT_BYTES} bytes`);
    }
    chunks.push(bytes);
  }

  let source;
  try{
    source=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,length));
  }catch{
    throw new ValidationError('Install release manifest input is not valid UTF-8');
  }
  let value;
  try{
    value=JSON.parse(source);
  }catch{
    throw new ValidationError('Install release manifest input is not valid JSON');
  }
  try{
    return argv[0]==='build-unsigned'
      ?buildInstallReleaseManifestStatement(value)
      :packageInstallReleaseManifestStatement(value);
  }catch(error){
    if(error instanceof ValidationError){
      throw new ValidationError('Install release manifest input failed validation');
    }
    throw new Error('Install release manifest command failed');
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const statement=await installReleaseManifestMain();
    process.stdout.write(`${canonicalJson(statement)}\n`);
  }catch(error){
    const known=error instanceof ValidationError&&PUBLIC_ERRORS.has(error.message);
    const name=known?'ValidationError':'Error';
    const message=known?error.message:'Install release manifest command failed';
    process.stderr.write(`${name}: ${message}\n`);
    process.exitCode=1;
  }
}
