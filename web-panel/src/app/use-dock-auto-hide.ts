import { useCallback, useRef, useState, type UIEvent } from 'react';

const SCROLL_HIDE_THRESHOLD_PX = 60;
const SCROLL_REVEAL_DEAD_ZONE_PX = 4;

export function useDockAutoHide() {
  const [hidden, setHidden] = useState(false);
  const lastScrollRef = useRef(0);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const y = event.currentTarget.scrollTop;
    if (y > lastScrollRef.current && y > SCROLL_HIDE_THRESHOLD_PX) {
      setHidden(true);
    } else if (y < lastScrollRef.current - SCROLL_REVEAL_DEAD_ZONE_PX) {
      setHidden(false);
    }

    lastScrollRef.current = y;
  }, []);

  return { hidden, onScroll };
}
