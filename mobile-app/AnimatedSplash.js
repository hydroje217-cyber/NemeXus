import React from 'react';
import { View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

export default function AnimatedSplash({ onFinish }) {
  return (
    <View style={styles.container}>
      <LottieView
        source={require('./assets/animation/Splash.json')}
        style={styles.animation}
        autoPlay
        loop={false}
        resizeMode="contain"
        onAnimationFinish={onFinish}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030A11',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  animation: {
    width: '100%',
    height: '100%',
  },
});
