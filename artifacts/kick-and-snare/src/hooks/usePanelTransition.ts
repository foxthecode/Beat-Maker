import { useState, useRef, useCallback } from 'react';

type PanelState = 'hidden' | 'entering' | 'active' | 'exiting';

export function usePanelTransition(initialOpen = false) {
  const [state, setState] = useState<PanelState>(initialOpen ? 'active' : 'hidden');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('entering');
    requestAnimationFrame(() => requestAnimationFrame(() => setState('active')));
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('exiting');
    timerRef.current = setTimeout(() => setState('hidden'), 300);
  }, []);

  const toggle = useCallback(() => {
    if (state === 'hidden' || state === 'exiting') show();
    else hide();
  }, [state, show, hide]);

  const set = useCallback((open: boolean) => { open ? show() : hide(); }, [show, hide]);

  return {
    visible: state !== 'hidden',
    isOpen: state === 'active' || state === 'entering',
    className: state === 'entering' ? 'ks-panel-enter'
      : state === 'active' ? 'ks-panel-active'
      : state === 'exiting' ? 'ks-panel-exit'
      : 'ks-panel-enter',
    show, hide, toggle, set,
  };
}
