import {
  JBD_SERVICE, JBD_NOTIFY, JBD_WRITE, JBD_CMD_BASIC, JBD_CMD_CELLS,
  buildJbdRequest, parseJbdFrame, parseJbdBasicInfo, parseJbdCellVoltages, JbdFrameAssembler,
  type JbdBasicInfo,
} from "./bms/jbd";

export const isBluetoothSupported = typeof navigator !== "undefined" && "bluetooth" in navigator;

function requireBluetooth() {
  if (!isBluetoothSupported) {
    throw new Error("Web Bluetooth isn't supported in this browser. Use Chrome or Edge on desktop or Android (not iOS Safari), over HTTPS or localhost.");
  }
}

export interface JbdReadResult { deviceName: string; basic: JbdBasicInfo; cellVoltagesV: number[] }

/** Reads a JBD / Xiaoxiang BMS: pack info (SoC, cycles, temperatures) then per-cell voltages. */
export async function readJbdBms(): Promise<JbdReadResult> {
  requireBluetooth();
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [JBD_SERVICE] });
  const server = await device.gatt?.connect();
  if (!server) throw new Error("Couldn't open a Bluetooth connection to that device.");
  try {
    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(JBD_SERVICE);
    } catch {
      throw new Error("That device doesn't expose the JBD/Xiaoxiang BMS service (0xFF00). It may use a different BMS protocol, which needs its own adapter.");
    }
    const notify = await service.getCharacteristic(JBD_NOTIFY);
    const write = await service.getCharacteristic(JBD_WRITE);

    const assembler = new JbdFrameAssembler();
    const inbox: Uint8Array[] = [];
    let wake: (() => void) | null = null;
    notify.addEventListener("characteristicvaluechanged", (ev) => {
      const dv = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (!dv) return;
      inbox.push(...assembler.push(new Uint8Array(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength))));
      wake?.();
    });
    await notify.startNotifications();

    const ask = async (command: number): Promise<Uint8Array> => {
      inbox.length = 0;
      const req = buildJbdRequest(command);
      const w: BluetoothRemoteGATTCharacteristic = write;
      if (typeof w.writeValueWithoutResponse === "function") await w.writeValueWithoutResponse(req.buffer as ArrayBuffer);
      else await w.writeValue(req.buffer as ArrayBuffer);
      const deadline = Date.now() + 5000;
      for (;;) {
        while (inbox.length) {
          const f = parseJbdFrame(inbox.shift()!);
          if (f.command === command) return f.data;
        }
        const left = deadline - Date.now();
        if (left <= 0) throw new Error("The BMS didn't answer within 5 seconds.");
        await new Promise<void>((resolve) => { const t = setTimeout(resolve, left); wake = () => { clearTimeout(t); resolve(); }; });
      }
    };

    const basic = parseJbdBasicInfo(await ask(JBD_CMD_BASIC));
    const cellVoltagesV = parseJbdCellVoltages(await ask(JBD_CMD_CELLS));
    return { deviceName: device.name ?? "Unnamed BMS", basic, cellVoltagesV };
  } finally {
    if (device.gatt?.connected) device.gatt.disconnect();
  }
}

/** Generic fallback: the standard BLE Battery Service (0x180F) many devices expose.
 *  This is only a device's own battery %, NOT a pack's cell data. */
export async function readStandardBatteryLevel(): Promise<{ deviceName: string; batteryLevelPct: number | null }> {
  requireBluetooth();
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ["battery_service"] });
  const server = await device.gatt?.connect();
  if (!server) throw new Error("Couldn't open a Bluetooth connection to that device.");
  try {
    const service = await server.getPrimaryService("battery_service");
    const level = await (await service.getCharacteristic("battery_level")).readValue();
    return { deviceName: device.name ?? "Unnamed device", batteryLevelPct: level.getUint8(0) };
  } catch {
    return { deviceName: device.name ?? "Unnamed device", batteryLevelPct: null };
  } finally {
    if (device.gatt?.connected) device.gatt.disconnect();
  }
}