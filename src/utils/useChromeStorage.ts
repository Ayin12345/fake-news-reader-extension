import { useEffect, useState } from 'react';
import { getStorage, setStorage } from './storage';

export function useChromeStorage<K extends string, V>(
  key: K,
  defaultValue: V,
): [V, (v: V) => void, boolean] {
  const [value, setValue] = useState<V>(defaultValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const initial = await getStorage(key as any);
        if (alive) {
          setValue((initial as V) ?? defaultValue);
          setReady(true);
        }
      } catch {
        setReady(true);
      }
    })();
    const onChanged = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local') return;
      if (key in changes) {
        setValue((changes as any)[key].newValue as V);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [key, defaultValue]);

  const update = (v: V) => {
    setValue(v);
    setStorage(key as any, v as any);
  };

  return [value, update, ready];
} 