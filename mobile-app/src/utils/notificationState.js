import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const READ_KEYS_PREFIX = 'nemexus.notificationReadKeys.v1';
const UNREAD_COUNT_PREFIX = 'nemexus.notificationUnreadCount.v1';

function getUserStorageSuffix(profile) {
  return String(profile?.id || profile?.email || 'office-user').replace(/[^a-zA-Z0-9_.:-]/g, '_');
}

export function getNotificationReadStorageKey(profile) {
  return `${READ_KEYS_PREFIX}.${getUserStorageSuffix(profile)}`;
}

export function getNotificationUnreadCountStorageKey(profile) {
  return `${UNREAD_COUNT_PREFIX}.${getUserStorageSuffix(profile)}`;
}

async function readStorageValue(key) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function writeStorageValue(key, value) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function loadNotificationReadKeys(profile) {
  try {
    const rawValue = await readStorageValue(getNotificationReadStorageKey(profile));
    const parsed = rawValue ? JSON.parse(rawValue) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveNotificationReadKeys(profile, readKeys) {
  try {
    await writeStorageValue(getNotificationReadStorageKey(profile), JSON.stringify(readKeys || {}));
  } catch {
    // Notification read state is a convenience cache; ignore storage failures.
  }
}

export async function loadNotificationUnreadCount(profile) {
  try {
    const rawValue = await readStorageValue(getNotificationUnreadCountStorageKey(profile));
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export async function saveNotificationUnreadCount(profile, unreadCount) {
  try {
    await writeStorageValue(getNotificationUnreadCountStorageKey(profile), String(Math.max(0, Number(unreadCount) || 0)));
  } catch {
    // Notification read state is a convenience cache; ignore storage failures.
  }
}
