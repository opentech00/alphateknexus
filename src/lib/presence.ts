import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const FIELD_OPS_CHANNEL = 'field-ops';

export type CrewPresence = {
  employeeId: string;
  name: string;
  role: 'field' | 'dispatch';
  photoUrl?: string | null;
  jobId?: string | null;
  onlineAt: string;
};

/**
 * Tracks this device on a Realtime Presence channel and returns everyone currently live.
 * Presence is ephemeral: closing the app drops the badge without a database write.
 */
export function usePresence(opts: {
  channel: string;
  key: string | null;
  meta: CrewPresence | null;
  track?: boolean;
}): CrewPresence[] {
  const { channel, key, meta, track = true } = opts;
  const [peers, setPeers] = useState<CrewPresence[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const fingerprint = useMemo(
    () => (meta ? `${meta.employeeId}|${meta.role}|${meta.jobId || ''}|${meta.name}` : ''),
    [meta],
  );

  useEffect(() => {
    if (!key) {
      setPeers([]);
      return;
    }

    const ch = supabase.channel(channel, { config: { presence: { key } } });
    channelRef.current = ch;

    const sync = () => {
      const state = ch.presenceState();
      const next: CrewPresence[] = [];
      for (const entries of Object.values(state)) {
        for (const raw of entries as unknown as CrewPresence[]) {
          if (raw?.employeeId) next.push(raw);
        }
      }
      setPeers(next);
    };

    ch.on('presence', { event: 'sync' }, sync);
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && track && metaRef.current) {
        await ch.track(metaRef.current);
      }
    });

    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [channel, key, track, fingerprint]);

  return peers;
}

export function onlineEmployeeIds(peers: CrewPresence[]): Set<string> {
  return new Set(peers.filter((p) => p.role === 'field').map((p) => p.employeeId));
}
