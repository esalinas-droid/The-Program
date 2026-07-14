import React, { useMemo, useRef } from 'react';
import { LayoutChangeEvent } from 'react-native';
import {
  Gesture,
  type GestureType,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants/theme';

/**
 * DragSection — long-press drag-to-reorder for a single visual section.
 *
 * Renders `data` as a vertical stack of Animated rows (NOT a FlatList — the
 * parent screen stays a plain ScrollView). Drag is isolated to this section:
 * a row can never leave its own group. The row's `renderItem` receives a
 * pre-built Pan gesture that the caller wraps around the drag handle (grip)
 * so the handle — not the whole card — starts the drag.
 */

const LONG_PRESS_MS = 400;

interface DragSectionProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  /** gesture must be attached (via GestureDetector) to the drag handle inside the row. */
  renderItem: (item: T, index: number, gesture: GestureType) => React.ReactNode;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onActiveChange?: (active: boolean) => void;
}

function DragSectionInner<T>({
  data,
  keyExtractor,
  renderItem,
  onReorder,
  onActiveChange,
}: DragSectionProps<T>) {
  const activeIndex = useSharedValue(-1);
  const hoverIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const activeHeight = useSharedValue(0);
  const liftScale = useSharedValue(1);
  const heights = useSharedValue<number[]>([]);
  const heightsRef = useRef<number[]>([]);

  const setActive = (active: boolean) => {
    if (active) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onActiveChange?.(active);
  };
  const commit = (from: number, to: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onActiveChange?.(false);
    onReorder(from, to);
  };
  const endOnly = () => onActiveChange?.(false);

  const onItemLayout = (index: number, e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (heightsRef.current[index] === h) return;
    heightsRef.current[index] = h;
    heights.value = [...heightsRef.current];
  };

  const count = data.length;

  // Build one Pan gesture per row. Memoised on data identity so unrelated parent
  // re-renders (e.g. scrollEnabled toggle) never recreate a gesture mid-drag.
  const gestures = useMemo(() => {
    return data.map((_, index) =>
      Gesture.Pan()
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart(() => {
          'worklet';
          activeIndex.value = index;
          hoverIndex.value = index;
          dragY.value = 0;
          activeHeight.value = heights.value[index] ?? 0;
          liftScale.value = withTiming(1.04, { duration: 120 });
          runOnJS(setActive)(true);
        })
        .onUpdate((e) => {
          'worklet';
          dragY.value = e.translationY;
          const h = heights.value;
          if (!h || h.length === 0) return;
          const from = index;
          let draggedTop = 0;
          for (let k = 0; k < from; k++) draggedTop += h[k] ?? 0;
          const draggedCenter = draggedTop + (h[from] ?? 0) / 2 + dragY.value;
          let target = 0;
          let top = 0;
          for (let j = 0; j < h.length; j++) {
            const c = top + (h[j] ?? 0) / 2;
            top += h[j] ?? 0;
            if (j === from) continue;
            if (c < draggedCenter) target += 1;
          }
          hoverIndex.value = target;
        })
        .onFinalize(() => {
          'worklet';
          if (activeIndex.value === index) {
            const from = index;
            const to = hoverIndex.value;
            if (to >= 0 && to !== from) runOnJS(commit)(from, to);
            else runOnJS(endOnly)();
          }
          activeIndex.value = -1;
          hoverIndex.value = -1;
          dragY.value = 0;
          liftScale.value = withTiming(1, { duration: 120 });
        }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, count]);

  return (
    <>
      {data.map((item, index) => (
        <DragRow
          key={keyExtractor(item)}
          index={index}
          activeIndex={activeIndex}
          hoverIndex={hoverIndex}
          dragY={dragY}
          activeHeight={activeHeight}
          liftScale={liftScale}
          onLayout={(e) => onItemLayout(index, e)}
        >
          {renderItem(item, index, gestures[index])}
        </DragRow>
      ))}
    </>
  );
}

interface DragRowProps {
  index: number;
  activeIndex: SharedValue<number>;
  hoverIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  activeHeight: SharedValue<number>;
  liftScale: SharedValue<number>;
  onLayout: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}

function DragRow({
  index, activeIndex, hoverIndex, dragY, activeHeight, liftScale, onLayout, children,
}: DragRowProps) {
  const style = useAnimatedStyle(() => {
    const isActive = activeIndex.value === index;
    if (isActive) {
      return {
        transform: [{ translateY: dragY.value }, { scale: liftScale.value }],
        zIndex: 999,
        elevation: 8,
        shadowColor: COLORS.primary,
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      };
    }
    const from = activeIndex.value;
    const to = hoverIndex.value;
    const ah = activeHeight.value;
    let shift = 0;
    if (from !== -1 && from !== index && to !== -1) {
      if (from < to && index > from && index <= to) shift = -ah;
      else if (to < from && index >= to && index < from) shift = ah;
    }
    return {
      transform: [{ translateY: withSpring(shift, { damping: 22, stiffness: 220 }) }, { scale: 1 }],
      zIndex: 0,
      elevation: 0,
      shadowOpacity: 0,
    };
  });

  return (
    <Animated.View style={style} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

export const DragSection = React.memo(DragSectionInner) as typeof DragSectionInner;
