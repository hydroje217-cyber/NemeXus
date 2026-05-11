import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

function getContentEncoding({ base64Content, textContent }) {
  if (typeof base64Content === 'string') {
    return {
      contents: base64Content,
      encoding: FileSystem.EncodingType.Base64,
    };
  }

  return {
    contents: textContent || '',
    encoding: FileSystem.EncodingType.UTF8,
  };
}

async function readLocalFileAsBase64(localUri) {
  return FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function writeTemporaryExportFile({ fileName, base64Content, textContent }) {
  const exportDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;

  if (!exportDirectory) {
    throw new Error('No writable device directory is available for export.');
  }

  const fileUri = `${exportDirectory}${fileName}`;
  const { contents, encoding } = getContentEncoding({ base64Content, textContent });
  await FileSystem.writeAsStringAsync(fileUri, contents, { encoding });
  return fileUri;
}

async function saveWithAndroidStorageAccess({ fileName, mimeType, base64Content, textContent, localUri }) {
  const storageAccess = FileSystem.StorageAccessFramework;

  if (
    Platform.OS !== 'android' ||
    !storageAccess?.requestDirectoryPermissionsAsync ||
    !storageAccess?.createFileAsync ||
    !storageAccess?.writeAsStringAsync
  ) {
    return null;
  }

  const permissions = await storageAccess.requestDirectoryPermissionsAsync();

  if (!permissions.granted || !permissions.directoryUri) {
    return null;
  }

  const destinationUri = await storageAccess.createFileAsync(permissions.directoryUri, fileName, mimeType);
  const base64FromLocalFile = localUri ? await readLocalFileAsBase64(localUri) : null;
  const { contents, encoding } = getContentEncoding({
    base64Content: base64FromLocalFile || base64Content,
    textContent,
  });

  await storageAccess.writeAsStringAsync(destinationUri, contents, { encoding });
  return destinationUri;
}

export async function saveNativeExportFile({
  fileName,
  mimeType,
  dialogTitle,
  shareMessage,
  uti,
  base64Content,
  textContent,
  localUri,
}) {
  const savedUri = await saveWithAndroidStorageAccess({
    fileName,
    mimeType,
    base64Content,
    textContent,
    localUri,
  });

  if (savedUri) {
    return { action: 'saved', uri: savedUri };
  }

  const fileUri = localUri || await writeTemporaryExportFile({ fileName, base64Content, textContent });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle,
      UTI: uti,
    });
    return { action: 'shared', uri: fileUri };
  }

  await Share.share({
    message: shareMessage || `${fileName} saved to ${fileUri}`,
    title: fileName,
    url: fileUri,
  });

  return { action: 'shared', uri: fileUri };
}

export function buildNativeExportSuccessMessage(format, result) {
  if (result?.action === 'saved') {
    return `${format.toUpperCase()} export was saved to the folder you selected.`;
  }

  return `${format.toUpperCase()} export is ready.`;
}
