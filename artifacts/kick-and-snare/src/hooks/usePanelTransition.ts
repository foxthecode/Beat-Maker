import { useState, useRef, useCallback, useEffect } from 'react';

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

/**
 * Transition pour bottom sheet overlay (pop par-dessus le contenu).
 * Plus lent: 0.4s entrée, 0.3s sortie — on voit clairement le panneau remonter.
 * Utilise les classes CSS ks-sheet-* et ks-overlay-*.
 */
export function useSheetTransition(open?: boolean) {
  const [state, setState] = useState<PanelState>('hidden');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('entering');
    requestAnimationFrame(() => requestAnimationFrame(() => setState('active')));
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState('exiting');
    timerRef.current = setTimeout(() => setState('hidden'), 420);
  }, []);

  const toggle = useCallback(() => {
    if (state === 'hidden' || state === 'exiting') show();
    else hide();
  }, [state, show, hide]);

  // Sync with external `open` prop when provided
  useEffect(() => {
    if (open === undefined) return;
    open ? show() : hide();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return {
    visible: state !== 'hidden',
    isOpen: state === 'active' || state === 'entering',
    sheetClass: state === 'entering' ? 'ks-sheet-enter'
      : state === 'active' ? 'ks-sheet-active'
      : state === 'exiting' ? 'ks-sheet-exit'
      : 'ks-sheet-enter',
    overlayClass: state === 'entering' ? 'ks-overlay-enter'
      : state === 'active' ? 'ks-overlay-active'
      : state === 'exiting' ? 'ks-overlay-exit'
      : 'ks-overlay-enter',
    show, hide, toggle,
  };
}
