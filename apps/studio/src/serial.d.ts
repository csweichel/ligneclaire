type SerialParity = "none" | "even" | "odd";
type SerialFlowControl = "none" | "hardware";

type SerialPortOpenOptions = Readonly<{
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: SerialParity;
  flowControl?: SerialFlowControl;
}>;

type SerialPortInfo = Readonly<{
  usbVendorId?: number;
  usbProductId?: number;
}>;

type USBDeviceFilter = Readonly<{
  usbVendorId?: number;
  usbProductId?: number;
}>;

interface SerialPort extends EventTarget {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: SerialPortOpenOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

interface SerialRequestOptions {
  filters?: readonly USBDeviceFilter[];
}

interface Serial extends EventTarget {
  requestPort(options?: SerialRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<readonly SerialPort[]>;
}

interface Navigator {
  serial?: Serial;
}
