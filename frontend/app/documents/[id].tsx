/**
 * documents/[id].tsx — DEPRECATED, superseded by documents/[id]/index.tsx
 * Expo Router uses the folder form [id]/index.tsx for /documents/:id.
 * This file must keep a default export to suppress the "missing default export" warning.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function DocumentDetailLegacy() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/documents/${id}` as any} />;
}
