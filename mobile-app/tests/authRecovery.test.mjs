import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'src', 'utils', 'authRecovery.js');
const tempDir = await mkdtemp(path.join(tmpdir(), 'nemexus-auth-recovery-'));
const tempModulePath = path.join(tempDir, 'authRecovery.mjs');

try {
  await writeFile(tempModulePath, await readFile(sourcePath, 'utf8'));

  const { isRecoveryUrl, readRecoveryParams } = await import(pathToFileURL(tempModulePath).href);

  assert.equal(isRecoveryUrl('nemexus://reset-password?code=abc123'), true);
  assert.deepEqual(
    {
      code: readRecoveryParams('nemexus://reset-password?code=abc123').code,
      isResetPasswordPath:
        readRecoveryParams('nemexus://reset-password?code=abc123').isResetPasswordPath,
    },
    {
      code: 'abc123',
      isResetPasswordPath: true,
    }
  );

  assert.equal(
    isRecoveryUrl('exp://192.168.1.25:8081/--/reset-password?code=expo-code'),
    true
  );
  assert.equal(
    readRecoveryParams('exp://192.168.1.25:8081/--/reset-password?code=expo-code').code,
    'expo-code'
  );

  const hashTokenUrl =
    'nemexus://reset-password#access_token=access123&refresh_token=refresh123&type=recovery';
  assert.equal(isRecoveryUrl(hashTokenUrl), true);
  assert.equal(readRecoveryParams(hashTokenUrl).accessToken, 'access123');
  assert.equal(readRecoveryParams(hashTokenUrl).refreshToken, 'refresh123');

  const tokenHashUrl = 'nemexus://reset-password?token_hash=hash123&type=recovery';
  assert.equal(isRecoveryUrl(tokenHashUrl), true);
  assert.equal(readRecoveryParams(tokenHashUrl).tokenHash, 'hash123');

  const webHashRouteUrl = 'https://example.test/#/reset-password?code=web-code';
  assert.equal(isRecoveryUrl(webHashRouteUrl), true);
  assert.equal(readRecoveryParams(webHashRouteUrl).code, 'web-code');

  assert.equal(isRecoveryUrl('nemexus://site-selection'), false);

  console.log('auth recovery utility tests passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
