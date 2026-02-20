'use client';

import { useMemo, useState } from 'react';

type NDEFRecordLike = {
  recordType?: string;
  data?: DataView;
};

type NDEFMessageLike = {
  records?: NDEFRecordLike[];
};

type NDEFReadingEventLike = Event & {
  message: NDEFMessageLike;
};

type NDEFReaderLike = {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  write: (data: string | NDEFMessageLike) => Promise<void>;
  onreading: ((event: NDEFReadingEventLike) => void) | null;
  onreadingerror: (() => void) | null;
};

declare global {
  interface Window {
    NDEFReader?: new () => NDEFReaderLike;
  }
}

const decodeRecords = (message: NDEFMessageLike): string | null => {
  if (!message.records?.length) {
    return null;
  }

  const textRecord = message.records.find((record) => record.recordType === 'text' && record.data);
  if (!textRecord?.data) {
    return null;
  }

  return new TextDecoder().decode(textRecord.data);
};

export function useNFC() {
  const [isReading, setIsReading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [lastWritten, setLastWritten] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSupported = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return typeof window.NDEFReader !== 'undefined';
  }, []);

  const readTag = async (): Promise<string> => {
    if (!isSupported || !window.NDEFReader) {
      throw new Error('WebNFC is not supported in this browser.');
    }

    setError(null);
    setIsReading(true);
    const abortController = new AbortController();

    try {
      const reader = new window.NDEFReader();
      await reader.scan({ signal: abortController.signal });

      const payload = await new Promise<string>((resolve, reject) => {
        reader.onreading = (event: NDEFReadingEventLike) => {
          const textPayload = decodeRecords(event.message);
          if (!textPayload) {
            reject(new Error('Tag read succeeded but text payload was empty.'));
            return;
          }

          resolve(textPayload);
        };

        reader.onreadingerror = () => reject(new Error('Failed to read NFC tag.'));
      });

      setLastRead(payload);
      return payload;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown NFC read error.';
      setError(message);
      throw err;
    } finally {
      abortController.abort();
      setIsReading(false);
    }
  };

  const writeTag = async (payload: string): Promise<void> => {
    if (!isSupported || !window.NDEFReader) {
      throw new Error('WebNFC is not supported in this browser.');
    }

    setError(null);
    setIsWriting(true);

    try {
      const reader = new window.NDEFReader();
      await reader.write(payload);
      setLastWritten(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown NFC write error.';
      setError(message);
      throw err;
    } finally {
      setIsWriting(false);
    }
  };

  const mockRead = (payload: string): string => {
    // TODO: DEMO ONLY - REVISIT FOR PRODUCTION.
    setError(null);
    setLastRead(payload);
    return payload;
  };

  const mockWrite = (payload: string): void => {
    // TODO: DEMO ONLY - REVISIT FOR PRODUCTION.
    setError(null);
    setLastWritten(payload);
  };

  return {
    isSupported,
    isReading,
    isWriting,
    lastRead,
    lastWritten,
    error,
    readTag,
    writeTag,
    mockRead,
    mockWrite,
  };
}
