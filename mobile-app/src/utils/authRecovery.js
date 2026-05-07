function paramsFromUrlPart(value) {
  if (!value) {
    return new URLSearchParams();
  }

  const normalized = value.startsWith('?') || value.startsWith('#') ? value.slice(1) : value;
  return new URLSearchParams(normalized);
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function readHashRoute(hash) {
  if (!hash) {
    return {
      path: '',
      params: new URLSearchParams(),
    };
  }

  const normalized = hash.replace(/^#\/?/, '');
  const queryIndex = normalized.indexOf('?');

  if (queryIndex < 0) {
    return {
      path: normalized.includes('=') ? '' : normalized,
      params: paramsFromUrlPart(normalized.includes('=') ? normalized : ''),
    };
  }

  return {
    path: normalized.slice(0, queryIndex),
    params: paramsFromUrlPart(normalized.slice(queryIndex + 1)),
  };
}

function getFirstParam(paramSets, key) {
  for (const params of paramSets) {
    const value = params.get(key);
    if (value) {
      return value;
    }
  }

  return '';
}

export function readRecoveryParams(url) {
  if (!url) {
    return {};
  }

  const parsed = parseUrl(url);
  const hashRoute = readHashRoute(parsed?.hash || '');
  const queryParams = paramsFromUrlPart(parsed?.search || '');
  const hashParams = hashRoute.params;
  const paramSets = [queryParams, hashParams];
  const pathParts = [
    parsed?.hostname || '',
    parsed?.pathname || '',
    hashRoute.path || '',
  ]
    .join('/')
    .toLowerCase();
  const isResetPasswordPath =
    pathParts.includes('reset-password') || pathParts.includes('resetpassword');

  return {
    isResetPasswordPath,
    code: getFirstParam(paramSets, 'code'),
    tokenHash: getFirstParam(paramSets, 'token_hash'),
    accessToken: getFirstParam(paramSets, 'access_token'),
    refreshToken: getFirstParam(paramSets, 'refresh_token'),
    type: getFirstParam(paramSets, 'type'),
    errorCode: getFirstParam(paramSets, 'error_code'),
    errorDescription: getFirstParam(paramSets, 'error_description'),
  };
}

export function isRecoveryUrl(url) {
  const recovery = readRecoveryParams(url);

  return Boolean(
    recovery.type === 'recovery' ||
      recovery.errorDescription ||
      recovery.tokenHash ||
      recovery.accessToken ||
      recovery.refreshToken ||
      (recovery.code && recovery.isResetPasswordPath) ||
      recovery.isResetPasswordPath
  );
}
