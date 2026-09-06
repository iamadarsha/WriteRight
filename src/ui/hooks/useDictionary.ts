import { useCallback, useEffect, useState } from 'react';
import { sendToBackground } from '@/messaging';
import { watchDictionary } from '@/storage/dictionary';

/** The personal dictionary, live (§11.4). Writes go through the background so
 * the engine's copy is re-synced in one place. */
export function useDictionary(): {
  words: readonly string[];
  loading: boolean;
  add: (word: string) => Promise<void>;
  remove: (word: string) => Promise<void>;
  importText: (text: string) => Promise<number>;
  clear: () => Promise<void>;
} {
  const [words, setWords] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await sendToBackground({ type: 'GET_DICTIONARY' });
      if (alive && res.ok) {
        setWords(res.data.words);
        setLoading(false);
      }
    })();
    const unwatch = watchDictionary((w) => {
      if (alive) setWords(w);
    });
    return () => {
      alive = false;
      unwatch();
    };
  }, []);

  const add = useCallback(async (word: string) => {
    const res = await sendToBackground({
      type: 'ADD_DICTIONARY_WORD',
      word,
    });
    if (res.ok) setWords(res.data.words);
  }, []);

  const remove = useCallback(async (word: string) => {
    const res = await sendToBackground({
      type: 'REMOVE_DICTIONARY_WORD',
      word,
    });
    if (res.ok) setWords(res.data.words);
  }, []);

  const importText = useCallback(async (text: string) => {
    const res = await sendToBackground({ type: 'IMPORT_DICTIONARY', text });
    if (res.ok) {
      setWords(res.data.words);
      return res.data.added;
    }
    return 0;
  }, []);

  const clear = useCallback(async () => {
    const res = await sendToBackground({ type: 'CLEAR_DICTIONARY' });
    if (res.ok) setWords(res.data.words);
  }, []);

  return { words, loading, add, remove, importText, clear };
}
