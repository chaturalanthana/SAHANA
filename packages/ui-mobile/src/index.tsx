import type { PressableProps, TextInputProps } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native';
import { color, fontSize, lineHeight, space } from '@sahana/design-tokens';

type ButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
};

export function Button({ label, loading = false, disabled, ...props }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      style={{
        minHeight: 44,
        borderRadius: 8,
        backgroundColor: inactive ? color.border : color.primary,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space[4],
      }}
      {...props}
    >
      <Text style={{ color: color.primaryText, fontSize: fontSize.dense, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({ label, error, ...props }: TextFieldProps) {
  return (
    <View style={{ gap: space[1] }}>
      <Text style={{ color: color.text, fontSize: fontSize.dense, fontWeight: '600' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.muted}
        style={{
          minHeight: 44,
          borderWidth: 1,
          borderColor: color.border,
          borderRadius: 8,
          paddingHorizontal: space[3],
          color: color.text,
          fontSize: fontSize.body,
          lineHeight: fontSize.body * lineHeight.body,
          backgroundColor: color.surface,
        }}
        {...props}
      />
      {error ? <Text style={{ color: color.danger, fontSize: fontSize.label }}>{error}</Text> : null}
    </View>
  );
}
