import { useEffect, useState } from 'react';
import { strap, type StrapState } from './ble';

/** Live strap state (status, bpm, battery) for any component. */
export function useStrap(): StrapState {
  const [state, setState] = useState<StrapState>(strap.state);
  useEffect(() => strap.onState(setState), []);
  return state;
}
