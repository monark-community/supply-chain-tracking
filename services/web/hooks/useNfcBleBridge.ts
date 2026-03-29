'use client';

import { useState } from 'react';

type NfcPayloadSnapshot = {
  tempMin: number;
  tempMax: number;
  humiMin: number;
  humiMax: number;
  flag2: number;
  hasBatchId: boolean;
  batchId: number | null;
  byteLength: number;
};

type BlePhase =
  | 'idle'
  | 'requestDevice'
  | 'connectGatt'
  | 'discoverPrimaryServices'
  | 'connected'
  | 'readValue'
  | 'disconnected';

const BLE_DISABLED_MESSAGE = 'BLE bridge has been deprecated. Use NFC Console WebNFC scan/write flow instead.';

export function useNfcBleBridge() {
  const [isConnecting] = useState(false);
  const [isNfcConnected] = useState(false);
  const [nfcDeviceName] = useState<string | null>(null);
  const [nfcDeviceId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [availableNfcCharacteristics] = useState<Array<{ id: string; serviceUuid: string; characteristicUuid: string; label: string }>>([]);
  const [selectedNfcCharacteristicId, setSelectedNfcCharacteristicId] = useState<string | null>(null);
  const [isReadingNfc] = useState(false);
  const [nfcLatestRawText] = useState<string | null>(null);
  const [nfcReadError, setNfcReadError] = useState<string | null>(null);
  const [nfcPayloadSnapshot] = useState<NfcPayloadSnapshot | null>(null);
  const [blePhase] = useState<BlePhase>('disconnected');
  const [lastSuccessfulBlePhase] = useState<BlePhase>('disconnected');
  const [lastBleErrorName] = useState<string | null>('BleDisabled');
  const [lastBleErrorMessage] = useState<string | null>(BLE_DISABLED_MESSAGE);

  const connectNfcDevice = async () => {
    setConnectionError(BLE_DISABLED_MESSAGE);
  };

  const readNfcPayloadSnapshot = async (): Promise<NfcPayloadSnapshot | null> => {
    setNfcReadError(BLE_DISABLED_MESSAGE);
    return null;
  };

  const setActiveBatchOnHardware = async (batchId: number) => {
    void batchId;
    throw new Error(BLE_DISABLED_MESSAGE);
  };

  const clearActiveBatchOnHardware = async () => {
    throw new Error(BLE_DISABLED_MESSAGE);
  };

  const readActiveBatchIdFromHardware = async (): Promise<number | null> => {
    setNfcReadError(BLE_DISABLED_MESSAGE);
    return null;
  };

  const readNfcCharacteristic = async () => {
    setNfcReadError(BLE_DISABLED_MESSAGE);
  };

  const disconnectNfcDevice = () => {
    setConnectionError(BLE_DISABLED_MESSAGE);
  };

  return {
    isConnecting,
    isNfcConnected,
    nfcDeviceName,
    nfcDeviceId,
    connectionError,
    availableNfcCharacteristics,
    selectedNfcCharacteristicId,
    isReadingNfc,
    nfcLatestRawText,
    nfcReadError,
    nfcPayloadSnapshot,
    blePhase,
    lastSuccessfulBlePhase,
    lastBleErrorName,
    lastBleErrorMessage,
    setSelectedNfcCharacteristicId,
    connectNfcDevice,
    readNfcPayloadSnapshot,
    setActiveBatchOnHardware,
    clearActiveBatchOnHardware,
    readActiveBatchIdFromHardware,
    readNfcCharacteristic,
    disconnectNfcDevice,
  };
}
