import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const STORAGE_KEY = 'nemexus.readingDrafts.v1';
const STORAGE_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ''}reading-drafts.json`;

function canUseWebStorage() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage;
}

function createDraftKey(site) {
  return `${site?.type || 'site'}:${site?.id || 'unknown'}`;
}

async function readDraftMap() {
  try {
    if (canUseWebStorage()) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    }

    if (!STORAGE_FILE) {
      return {};
    }

    const info = await FileSystem.getInfoAsync(STORAGE_FILE);
    if (!info.exists) {
      return {};
    }

    const raw = await FileSystem.readAsStringAsync(STORAGE_FILE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeDraftMap(map) {
  const value = JSON.stringify(map);

  if (canUseWebStorage()) {
    window.localStorage.setItem(STORAGE_KEY, value);
    return;
  }

  if (!STORAGE_FILE) {
    return;
  }

  await FileSystem.writeAsStringAsync(STORAGE_FILE, value);
}

export async function loadReadingDraft(site) {
  const drafts = await readDraftMap();
  return drafts[createDraftKey(site)] || null;
}

export async function saveReadingDraft(site, draft) {
  if (!site?.id || !site?.type) {
    return;
  }

  const drafts = await readDraftMap();
  drafts[createDraftKey(site)] = {
    ...draft,
    saved_at: new Date().toISOString(),
  };
  await writeDraftMap(drafts);
}

export async function clearReadingDraft(site) {
  const drafts = await readDraftMap();
  delete drafts[createDraftKey(site)];
  await writeDraftMap(drafts);
}
