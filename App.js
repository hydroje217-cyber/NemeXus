import NemeXusApp from './src/NemeXusApp';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <NemeXusApp />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
