/**
 * AskCoachButton — small teal pill that pre-fills coach chat with a seed prompt.
 *
 * Usage:
 *   <AskCoachButton seedPrompt="Look at my squat history..." />
 *   <AskCoachButton seedPrompt="..." label="Review with Coach" size="sm" />
 */
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { setCoachSeed } from '../store/coachSeedStore';

const TEAL   = '#4DCEA6';
const BG_TL  = '#0D1F1A';
const BORDER = '#1D3A30';

interface AskCoachButtonProps {
  seedPrompt: string;
  triggerName?: string;
  label?: string;
  size?: 'sm' | 'md';
  style?: object;
}

export default function AskCoachButton({
  seedPrompt, triggerName, label = 'Ask Coach', size = 'sm', style,
}: AskCoachButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    setCoachSeed({ seedPrompt, triggerName });
    router.push('/tools/coach');
  };

  const isSmall = size === 'sm';

  return (
    <TouchableOpacity
      style={[b.btn, isSmall ? b.btnSm : b.btnMd, style]}
      onPress={handlePress}
      activeOpacity={0.75}
    >
      <MaterialCommunityIcons
        name="star-shooting-outline"
        size={isSmall ? 12 : 14}
        color={TEAL}
      />
      <Text style={[b.label, isSmall ? b.labelSm : b.labelMd]}>{label}</Text>
    </TouchableOpacity>
  );
}

const b = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BG_TL,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: BORDER,
    alignSelf: 'flex-start',
  },
  btnSm: { paddingHorizontal: 10, paddingVertical: 6, height: 30 },
  btnMd: { paddingHorizontal: 14, paddingVertical: 9, height: 38 },
  label:   { color: TEAL, fontWeight: '600' },
  labelSm: { fontSize: 11 },
  labelMd: { fontSize: 13 },
});
