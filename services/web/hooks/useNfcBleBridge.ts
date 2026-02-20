'use client';

import { useRef, useState } from 'react';

type BluetoothRequestDeviceOptionsLike = {
  acceptAllDevices?: boolean;
  filters?: Array<{
    services?: string[];
    namePrefix?: string;
  }>;
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
      const loweredMessage = error.message.toLowerCase();
      if (loweredMessage.includes('service') || loweredMessage.includes('services')) {
        return 'Connected to a BLE device, but the configured service was not discovered. Ensure you selected the ESP32 device and no other app is connected to it.';
      }
      return 'No BLE device was selected (or no matching BLE device is currently available).';
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
const nfcBleDeviceNamePrefix = process.env.NEXT_PUBLIC_NFC_BLE_DEVICE_NAME_PREFIX?.trim() ?? 'ESP32';
const nfcBleLegacyServiceUuid = '0110efbe-edfe-0d1c-2b3a-4f5e6d7c8b9a';

const isDomExceptionNamed = (error: unknown, name: string): boolean =>
  error instanceof DOMException && error.name === name;

const getServiceCandidates = (): string[] => {
  const candidates = [nfcBleServiceUuid, nfcBleLegacyServiceUuid]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(candidates));
};

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

    const serviceCandidates = getServiceCandidates();
    if (serviceCandidates.length === 0) {
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
      let device: BluetoothDeviceLike;
      try {
        device = await navigator.bluetooth.requestDevice({
          filters: serviceCandidates.map((uuid) => ({ services: [uuid] })),
          optionalServices: serviceCandidates,
        });
      } catch (error) {
        // Some stacks advertise the device name but omit the custom service UUID in ADV data.
        // Fallback to namePrefix filtering so the user can still pick the ESP32 and validate services after connect.
        if (!isDomExceptionNamed(error, 'NotFoundError')) {
          throw error;
        }

        device = await navigator.bluetooth.requestDevice({
          filters: [{ namePrefix: nfcBleDeviceNamePrefix || 'ESP32' }],
          optionalServices: serviceCandidates,
        });
      }
      setLastSuccessfulBlePhase('requestDevice');

      if (device.name && nfcBleDeviceNamePrefix && !device.name.startsWith(nfcBleDeviceNamePrefix)) {
        throw new Error(
          `Selected device "${device.name}" does not match expected device prefix "${nfcBleDeviceNamePrefix}". Please select your ESP32 device.`
        );
      }

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

      const discoveredUuids = services.map((service) => service.uuid.toLowerCase());
      const configuredService = services.find((service) => serviceCandidates.includes(service.uuid.toLowerCase()));
      if (!configuredService) {
        throw new Error(
          `Expected BLE service(s) not found. Expected one of: ${serviceCandidates.join(', ')}. Discovered: ${discoveredUuids.join(', ') || 'none'}.`
        );
      }

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
      setAvailableNfcCharacteristics([]);
      readableCharacteristicMapRef.current = {};
      setSelectedNfcCharacteristicId(null);
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
