'use client';

import { useRef, useState } from 'react';

type BluetoothRequestDeviceOptionsLike = {
  acceptAllDevices?: boolean;
  optionalServices?: string[];
};

type BluetoothRemoteGATTServerLike = {
  connected: boolean;
  connect: () => Promise<BluetoothRemoteGATTServerLike>;
  disconnect: () => void;
  getPrimaryServices: () => Promise<BluetoothRemoteGATTServiceLike[]>;
};

type BluetoothCharacteristicPropertiesLike = {
  read?: boolean;
};

type BluetoothRemoteGATTCharacteristicLike = {
  uuid: string;
  properties: BluetoothCharacteristicPropertiesLike;
  readValue: () => Promise<DataView>;
};

type BluetoothRemoteGATTServiceLike = {
  uuid: string;
  getCharacteristics: () => Promise<BluetoothRemoteGATTCharacteristicLike[]>;
};

type BluetoothDeviceLike = EventTarget & {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServerLike;
};

type BluetoothLike = {
  requestDevice: (options: BluetoothRequestDeviceOptionsLike) => Promise<BluetoothDeviceLike>;
};

declare global {
  interface Navigator {
    bluetooth?: BluetoothLike;
  }
}

const toFriendlyBluetoothError = (error: unknown): string => {
  if (error instanceof DOMException) {
    if (error.name === 'NotFoundError') {
      return 'No BLE device was selected.';
    }

    if (error.name === 'NetworkError') {
      return `BLE connection failed. Ensure the ESP32 is in range and not already connected elsewhere. (${error.message})`;
    }

    if (error.name === 'SecurityError') {
      return 'BLE service access was denied. Ensure NEXT_PUBLIC_NFC_BLE_SERVICE_UUID is correct and requested via optionalServices.';
    }
  }

  if (error instanceof Error && error.message) {
    return `Connection attempt failed. ${error.message}`;
  }

  return 'Connection attempt failed.';
};

const getErrorDetails = (error: unknown): { name: string; message: string } => {
  if (error instanceof DOMException) {
    return { name: error.name, message: error.message };
  }

  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message };
  }

  return { name: 'UnknownError', message: 'Unknown BLE error.' };
};

const decodeDataView = (value: DataView): string => {
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new TextDecoder().decode(bytes);
};

const nfcBleServiceUuid = process.env.NEXT_PUBLIC_NFC_BLE_SERVICE_UUID?.trim().toLowerCase() ?? '';

type NfcReadableCharacteristic = {
  id: string;
  serviceUuid: string;
  characteristicUuid: string;
  label: string;
};

type BlePhase =
  | 'idle'
  | 'requestDevice'
  | 'connectGatt'
  | 'discoverPrimaryServices'
  | 'discoverReadableCharacteristics'
  | 'connected'
  | 'readValue'
  | 'disconnected';

export function useNfcBleBridge() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isNfcConnected, setIsNfcConnected] = useState(false);
  const [nfcDeviceName, setNfcDeviceName] = useState<string | null>(null);
  const [nfcDeviceId, setNfcDeviceId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDeviceLike | null>(null);
  const [availableNfcCharacteristics, setAvailableNfcCharacteristics] = useState<NfcReadableCharacteristic[]>([]);
  const [selectedNfcCharacteristicId, setSelectedNfcCharacteristicId] = useState<string | null>(null);
  const [isReadingNfc, setIsReadingNfc] = useState(false);
  const [nfcLatestRawText, setNfcLatestRawText] = useState<string | null>(null);
  const [nfcReadError, setNfcReadError] = useState<string | null>(null);
  const [blePhase, setBlePhase] = useState<BlePhase>('idle');
  const [lastSuccessfulBlePhase, setLastSuccessfulBlePhase] = useState<BlePhase>('idle');
  const [lastBleErrorName, setLastBleErrorName] = useState<string | null>(null);
  const [lastBleErrorMessage, setLastBleErrorMessage] = useState<string | null>(null);
  const readableCharacteristicMapRef = useRef<Record<string, BluetoothRemoteGATTCharacteristicLike>>({});

  const connectNfcDevice = async () => {
    if (!navigator.bluetooth) {
      setConnectionError('Web Bluetooth is not available in this browser.');
      return;
    }

    if (!nfcBleServiceUuid) {
      setConnectionError('Missing NEXT_PUBLIC_NFC_BLE_SERVICE_UUID. Add it to services/web/.env.local and restart the dev server.');
      return;
    }

    setConnectionError(null);
    setNfcReadError(null);
    setNfcLatestRawText(null);
    setLastBleErrorName(null);
    setLastBleErrorMessage(null);
    setIsConnecting(true);

    try {
      setBlePhase('requestDevice');
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [nfcBleServiceUuid],
      });
      setLastSuccessfulBlePhase('requestDevice');

      if (!device.gatt) {
        throw new Error('Selected device does not expose a BLE GATT server.');
      }

      setBlePhase('connectGatt');
      if (!device.gatt.connected) {
        await device.gatt.connect();
      }
      setLastSuccessfulBlePhase('connectGatt');

      setBlePhase('discoverPrimaryServices');
      const services = await device.gatt.getPrimaryServices();
      setLastSuccessfulBlePhase('discoverPrimaryServices');

      const configuredService = services.find((service) => service.uuid.toLowerCase() === nfcBleServiceUuid);
      if (!configuredService) {
        throw new Error(
          `Configured service ${nfcBleServiceUuid} was not found on the selected device. Choose the ESP32 that exposes this service.`
        );
      }

      setBlePhase('discoverReadableCharacteristics');
      const configuredCharacteristics = await configuredService.getCharacteristics();
      const discoveredReadableCharacteristics: NfcReadableCharacteristic[] = [];
      const characteristicMap: Record<string, BluetoothRemoteGATTCharacteristicLike> = {};

      for (const characteristic of configuredCharacteristics) {
        if (!characteristic.properties.read) {
          continue;
        }

        const id = `${configuredService.uuid}:${characteristic.uuid}`;
        discoveredReadableCharacteristics.push({
          id,
          serviceUuid: configuredService.uuid,
          characteristicUuid: characteristic.uuid,
          label: `${configuredService.uuid.slice(0, 8)}... / ${characteristic.uuid.slice(0, 8)}...`,
        });
        characteristicMap[id] = characteristic;
      }

      if (discoveredReadableCharacteristics.length === 0) {
        throw new Error(
          `Service ${configuredService.uuid} is available, but no readable characteristics were found. Enable the read property on at least one characteristic in the ESP32 firmware.`
        );
      }
      setLastSuccessfulBlePhase('discoverReadableCharacteristics');

      if (connectedDevice?.gatt?.connected) {
        connectedDevice.gatt.disconnect();
      }

      const handleDisconnect = () => {
        setIsNfcConnected(false);
        setNfcDeviceName(null);
        setNfcDeviceId(null);
      };

      device.addEventListener('gattserverdisconnected', handleDisconnect);
      setConnectedDevice(device);
      setNfcDeviceName(device.name || 'Unnamed ESP32');
      setNfcDeviceId(device.id);
      setIsNfcConnected(true);
      setBlePhase('connected');
      setLastSuccessfulBlePhase('connected');
      setAvailableNfcCharacteristics(discoveredReadableCharacteristics);
      readableCharacteristicMapRef.current = characteristicMap;
      setSelectedNfcCharacteristicId(discoveredReadableCharacteristics[0]?.id ?? null);
      setNfcReadError(null);
      setConnectionError(null);
    } catch (error) {
      const details = getErrorDetails(error);
      setLastBleErrorName(details.name);
      setLastBleErrorMessage(details.message);
      setConnectionError(toFriendlyBluetoothError(error));
      setIsNfcConnected(false);
      setNfcDeviceName(null);
      setNfcDeviceId(null);
      setAvailableNfcCharacteristics([]);
      readableCharacteristicMapRef.current = {};
      setSelectedNfcCharacteristicId(null);
    } finally {
      setIsConnecting(false);
    }
  };

  const readNfcCharacteristic = async () => {
    if (!isNfcConnected) {
      setNfcReadError('Connect a BLE device before reading characteristic data.');
      setLastBleErrorName('ReadPreconditionError');
      setLastBleErrorMessage('No connected BLE device when attempting to read characteristic.');
      return;
    }

    if (!selectedNfcCharacteristicId) {
      setNfcReadError('Select a readable characteristic first.');
      setLastBleErrorName('ReadPreconditionError');
      setLastBleErrorMessage('No characteristic selected for BLE read.');
      return;
    }

    const characteristic = readableCharacteristicMapRef.current[selectedNfcCharacteristicId];
    if (!characteristic) {
      setNfcReadError('Selected characteristic is no longer available. Reconnect and try again.');
      setLastBleErrorName('ReadPreconditionError');
      setLastBleErrorMessage('Selected characteristic was not found in local BLE characteristic cache.');
      return;
    }

    setIsReadingNfc(true);
    setBlePhase('readValue');
    setLastBleErrorName(null);
    setLastBleErrorMessage(null);
    setNfcReadError(null);

    try {
      const value = await characteristic.readValue();
      const raw = decodeDataView(value);
      setNfcLatestRawText(raw);
      setLastSuccessfulBlePhase('readValue');
    } catch (error) {
      const details = getErrorDetails(error);
      setLastBleErrorName(details.name);
      setLastBleErrorMessage(details.message);
      setNfcReadError(error instanceof Error ? error.message : 'Failed to read BLE characteristic.');
    } finally {
      setIsReadingNfc(false);
      setBlePhase(isNfcConnected ? 'connected' : 'idle');
    }
  };

  const disconnectNfcDevice = () => {
    if (connectedDevice?.gatt?.connected) {
      connectedDevice.gatt.disconnect();
    }
    setBlePhase('disconnected');
    setLastSuccessfulBlePhase('disconnected');
    setIsNfcConnected(false);
    setNfcDeviceName(null);
    setNfcDeviceId(null);
    setConnectedDevice(null);
    setAvailableNfcCharacteristics([]);
    readableCharacteristicMapRef.current = {};
    setSelectedNfcCharacteristicId(null);
    setIsReadingNfc(false);
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
    blePhase,
    lastSuccessfulBlePhase,
    lastBleErrorName,
    lastBleErrorMessage,
    setSelectedNfcCharacteristicId,
    connectNfcDevice,
    readNfcCharacteristic,
    disconnectNfcDevice,
  };
}
