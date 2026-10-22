import { useEffect, useState } from 'react';
import { rower, type RowerState } from './ble';

/** Live rower state (status, last sample) for any component. */
export function useRower(): RowerState {
  const [state, setState] = useState<RowerState>(rower.state);
  useEffect(() => rower.onState(setState), []);
  return state;
}
