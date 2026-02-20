'use client';

import { useState } from 'react';

type BluetoothRemoteGATTServerLike = {
  connected: boolean;
  connect: () => Promise<BluetoothRemoteGATTServerLike>;
  disconnect: () => void;
};

type BluetoothDeviceLike = EventTarget & {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServerLike;
};

type BluetoothLike = {
  requestDevice: (options: { acceptAllDevices: true }) => Promise<BluetoothDeviceLike>;
};

declare global {
  interface Navigator {
    bluetooth?: BluetoothLike;
  }
}

export function useNfcBleBridge() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isNfcConnected, setIsNfcConnected] = useState(false);
  const [nfcDeviceName, setNfcDeviceName] = useState<string | null>(null);
  const [nfcDeviceId, setNfcDeviceId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDeviceLike | null>(null);

  const connectNfcDevice = async () => {
    if (!navigator.bluetooth) {
      setConnectionError('Web Bluetooth is not available in this browser.');
      return;
    }

    setConnectionError(null);
    setIsConnecting(true);

    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });

      if (device.gatt && !device.gatt.connected) {
        await device.gatt.connect();
      }

      const handleDisconnect = () => {
        setIsNfcConnected(false);
      };

      device.addEventListener('gattserverdisconnected', handleDisconnect);
      setConnectedDevice(device);
      setNfcDeviceName(device.name || 'Unnamed ESP32');
      setNfcDeviceId(device.id);
      setIsNfcConnected(true);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Failed to connect to NFC device over BLE.');
      setIsNfcConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectNfcDevice = () => {
    if (connectedDevice?.gatt?.connected) {
      connectedDevice.gatt.disconnect();
    }
    setIsNfcConnected(false);
  };

  return {
    isConnecting,
    isNfcConnected,
    nfcDeviceName,
    nfcDeviceId,
    connectionError,
    connectNfcDevice,
    disconnectNfcDevice,
  };
}
