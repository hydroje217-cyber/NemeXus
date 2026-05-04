import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import NemeXusApp from './src/NemeXusApp';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AnimatedSplash from './AnimatedSplash';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <View style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <NemeXusApp />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
      {showSplash ? <AnimatedSplash onFinish={() => setShowSplash(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
});
