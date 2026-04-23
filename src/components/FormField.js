import { forwardRef, useContext, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardScrollContext } from './ScreenShell';
import { useTheme } from '../context/ThemeContext';

const FormField = forwardRef(function FormField({
  label,
  value,
  onChangeText,
  icon = null,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  editable = true,
  secureTextEntry = false,
  autoCapitalize = 'sentences',
  returnKeyType = 'done',
  onSubmitEditing,
  blurOnSubmit,
  submitBehavior,
  onFocus,
  onBlur,
}, ref) {
  const { palette, isDark } = useTheme();
  const styles = useMemo(() => createStyles(palette, isDark), [palette, isDark]);
  const resolvedBlurOnSubmit = blurOnSubmit ?? (returnKeyType === 'next' ? false : undefined);
  const [focused, setFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef(null);
  const { scrollToField } = useContext(KeyboardScrollContext);

  useImperativeHandle(ref, () => inputRef.current);

  function handleFocus(event) {
    if (editable) {
      setFocused(true);
      Animated.spring(focusAnim, {
        toValue: 1,
        friction: 7,
        tension: 140,
        useNativeDriver: true,
      }).start();
      scrollToField(inputRef.current, multiline ? 150 : 120);
    }

    onFocus?.(event);
  }

  function handleBlur(event) {
    setFocused(false);
    Animated.spring(focusAnim, {
      toValue: 0,
      friction: 7,
      tension: 140,
      useNativeDriver: true,
    }).start();

    onBlur?.(event);
  }

  const animatedWrapStyle = {
    transform: [
      {
        scale: focusAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.015],
        }),
      },
      {
        translateY: focusAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -2],
        }),
      },
    ],
  };

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, focused ? styles.labelFocused : null]}>{label}</Text>
      <Animated.View
        style={[
          styles.inputWrap,
          animatedWrapStyle,
          focused ? styles.inputWrapFocused : null,
          !editable ? styles.inputWrapDisabled : null,
        ]}
      >
        <View style={styles.inputRow}>
          {icon ? <View style={[styles.iconWrap, focused ? styles.iconWrapFocused : null]}>{icon}</View> : null}
          <TextInput
            ref={inputRef}
            editable={editable}
            multiline={multiline}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmitEditing}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder || label}
            placeholderTextColor={palette.ink500}
            style={[
              styles.input,
              icon ? styles.inputWithIcon : null,
              multiline ? styles.multiline : null,
              !editable ? styles.disabled : null,
            ]}
            value={value}
            keyboardType={keyboardType}
            secureTextEntry={secureTextEntry}
            autoCapitalize={autoCapitalize}
            returnKeyType={returnKeyType}
            blurOnSubmit={resolvedBlurOnSubmit}
            submitBehavior={submitBehavior}
          />
        </View>
      </Animated.View>
    </View>
  );
});

export default FormField;

function createStyles(palette, isDark) {
  return StyleSheet.create({
    wrapper: {
      gap: 8,
    },
    label: {
      color: palette.ink700,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    labelFocused: {
      color: palette.teal600,
    },
    inputWrap: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.lineStrong,
      backgroundColor: isDark ? '#0C1621' : '#F9FCFF',
      shadowColor: '#0F172A',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    inputWrapFocused: {
      borderColor: palette.teal500,
      backgroundColor: palette.card,
      shadowOpacity: isDark ? 0.14 : 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    inputWrapDisabled: {
      borderColor: palette.line,
      backgroundColor: isDark ? '#111D29' : '#EAF0F6',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconWrap: {
      width: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapFocused: {
      transform: [{ scale: 1.05 }],
    },
    input: {
      minHeight: 50,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: palette.ink900,
      fontSize: 15,
      flex: 1,
    },
    inputWithIcon: {
      paddingLeft: 0,
    },
    multiline: {
      minHeight: 110,
      textAlignVertical: 'top',
    },
    disabled: {
      backgroundColor: isDark ? '#111D29' : '#EAF0F6',
      color: palette.ink500,
    },
  });
}
