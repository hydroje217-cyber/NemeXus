import { Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// Android SAF writes can crash when Expo native packages drift out of sync.
// Keep native exports on the share sheet path, which avoids createSAFFileAsync.

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

  return `${format.toUpperCase()} export is ready. Choose a destination from the share sheet to save it.`;
}
