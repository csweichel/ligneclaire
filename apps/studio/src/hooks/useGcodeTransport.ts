import type {
  GcodeOversizeHandling,
  HeightMeshFile,
  PlotterDeviceSummary,
} from "@ligneclaire/node-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetchTextArtifact } from "../api";
import type { ResolvedGcodeRotationDeg } from "../lib/gcodeOrientation";
import { parseGcodePreview } from "../lib/gcode";
import type {
  CurrentDocumentState,
  GcodeLogEntry,
  GcodePreparedArtifact,
  GcodeTransportModel,
  GcodeTransportSettings,
  GcodeTransportStatus,
  GcodeTransportTarget,
  MachinePosition,
  SerialTransportJobRequest,
  SerialTransportJobResult,
  StudioStatus,
} from "../types";

type UseGcodeTransportArgs = Readonly<{
  current: CurrentDocumentState | null;
  deviceId: string;
  heightMesh: HeightMeshFile | null;
  oversizeHandling: GcodeOversizeHandling;
  plotters: readonly PlotterDeviceSummary[];
  rotationDeg: ResolvedGcodeRotationDeg;
  selectedProgramId: string;
  setStatus: (status: StudioStatus) => void;
}>;

type SerialNavigator = Navigator & {
  serial?: Serial;
};

type AckWaiter = Readonly<{
  reject: (reason?: unknown) => void;
  resolve: (result: AckResult) => void;
}>;

type AckResult = Readonly<{
  status: "ack" | "error" | "timeout";
  line?: string;
}>;

const encoder = new TextEncoder();
const genericTransportDefaults: GcodeTransportSettings = {
  target: "serial",
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
  lineEnding: "lf",
  responseMode: "ack",
  ackPattern: "^(ok|OK)$",
  errorPattern: "^(error|ERROR|alarm|ALARM)",
  readyPattern: "^(Grbl|start)",
  alarmResetCommand: "$X",
  ackTimeoutMs: 3000,
  lineDelayMs: 0,
  connectDelayMs: 250,
};

function serialNavigator(): SerialNavigator {
  return navigator as SerialNavigator;
}

function supportsSerial(): boolean {
  return typeof window !== "undefined" && "serial" in serialNavigator();
}

function snapshotValue(value: unknown): string {
  return JSON.stringify(value);
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function describePort(port: SerialPort | null): string | null {
  if (!port) {
    return null;
  }

  const info = port.getInfo();
  const vendor = info.usbVendorId ? `0x${info.usbVendorId.toString(16).padStart(4, "0")}` : "unknown";
  const product = info.usbProductId ? `0x${info.usbProductId.toString(16).padStart(4, "0")}` : "unknown";
  return `${vendor}:${product}`;
}

function lineEndingValue(lineEnding: GcodeTransportSettings["lineEnding"]): string {
  return lineEnding === "crlf" ? "\r\n" : "\n";
}

function commandLines(command: string): readonly string[] {
  return command
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function compileRegex(pattern: string): RegExp | null {
  if (!pattern) {
    return null;
  }

  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function parseCoordinateTriplet(value: string): Readonly<{
  x: number;
  y: number;
  z: number;
}> | null {
  const values = value
    .split(",")
    .slice(0, 3)
    .map((part) => Number(part.trim()));

  if (values.length < 3 || !values.every(Number.isFinite)) {
    return null;
  }

  return {
    x: values[0]!,
    y: values[1]!,
    z: values[2]!,
  };
}

function isStatusReport(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("<") && trimmed.endsWith(">");
}

function parseMachinePosition(line: string): MachinePosition | null {
  if (!isStatusReport(line)) {
    return null;
  }

  const parts = line.trim().slice(1, -1).split("|");
  let machinePosition: ReturnType<typeof parseCoordinateTriplet> = null;
  let workPosition: ReturnType<typeof parseCoordinateTriplet> = null;
  let workOffset: ReturnType<typeof parseCoordinateTriplet> = null;

  for (const part of parts.slice(1)) {
    if (part.startsWith("WPos:")) {
      workPosition = parseCoordinateTriplet(part.slice(5));
      continue;
    }

    if (part.startsWith("MPos:")) {
      machinePosition = parseCoordinateTriplet(part.slice(5));
      continue;
    }

    if (part.startsWith("WCO:")) {
      workOffset = parseCoordinateTriplet(part.slice(4));
    }
  }

  if (workPosition) {
    return {
      ...workPosition,
      source: "work",
    };
  }

  if (machinePosition && workOffset) {
    return {
      x: machinePosition.x - workOffset.x,
      y: machinePosition.y - workOffset.y,
      z: machinePosition.z - workOffset.z,
      source: "work",
    };
  }

  if (machinePosition) {
    return {
      ...machinePosition,
      source: "machine",
    };
  }

  return null;
}

function nextTransportSettings(
  plotter: PlotterDeviceSummary | undefined,
  existing: GcodeTransportSettings
): GcodeTransportSettings {
  const serialDefaults =
    plotter?.transport?.kind === "serial"
      ? plotter.transport
      : undefined;

  return {
    target: existing.target,
    baudRate: serialDefaults?.baudRate ?? genericTransportDefaults.baudRate,
    dataBits: serialDefaults?.dataBits ?? genericTransportDefaults.dataBits,
    stopBits: serialDefaults?.stopBits ?? genericTransportDefaults.stopBits,
    parity: serialDefaults?.parity ?? genericTransportDefaults.parity,
    flowControl: serialDefaults?.flowControl ?? genericTransportDefaults.flowControl,
    lineEnding: serialDefaults?.lineEnding ?? genericTransportDefaults.lineEnding,
    responseMode: serialDefaults?.responseMode ?? genericTransportDefaults.responseMode,
    ackPattern: serialDefaults?.ackPattern ?? genericTransportDefaults.ackPattern,
    errorPattern: serialDefaults?.errorPattern ?? genericTransportDefaults.errorPattern,
    readyPattern: serialDefaults?.readyPattern ?? genericTransportDefaults.readyPattern,
    alarmResetCommand:
      serialDefaults?.alarmResetCommand ?? genericTransportDefaults.alarmResetCommand,
    ackTimeoutMs: serialDefaults?.ackTimeoutMs ?? genericTransportDefaults.ackTimeoutMs,
    lineDelayMs: serialDefaults?.lineDelayMs ?? genericTransportDefaults.lineDelayMs,
    connectDelayMs: serialDefaults?.connectDelayMs ?? genericTransportDefaults.connectDelayMs,
  };
}

export function useGcodeTransport({
  current,
  deviceId,
  heightMesh,
  oversizeHandling,
  plotters,
  rotationDeg,
  selectedProgramId,
  setStatus,
}: UseGcodeTransportArgs): GcodeTransportModel {
  const [settings, setSettings] = useState<GcodeTransportSettings>(genericTransportDefaults);
  const [connectionState, setConnectionState] = useState<GcodeTransportStatus["connectionState"]>(
    supportsSerial() ? "disconnected" : "unsupported"
  );
  const [jobState, setJobState] = useState<GcodeTransportStatus["jobState"]>("idle");
  const [logs, setLogs] = useState<readonly GcodeLogEntry[]>([]);
  const [preparedArtifact, setPreparedArtifact] = useState<GcodePreparedArtifact | null>(null);
  const [progress, setProgress] = useState<GcodeTransportStatus["progress"]>({
    totalLines: 0,
    sentLines: 0,
    acknowledgedLines: 0,
    errorLines: 0,
  });
  const [portLabel, setPortLabel] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastMachineError, setLastMachineError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [position, setPosition] = useState<MachinePosition | null>(null);
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const readLoopPromiseRef = useRef<Promise<void> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const pendingAckRef = useRef<AckWaiter | null>(null);
  const responseListenerRef = useRef<((line: string) => void) | null>(null);
  const statusRequestInFlightRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const pauseRequestedRef = useRef(false);
  const jobStartedAtRef = useRef<number | null>(null);

  const selectedPlotter = useMemo(
    () => plotters.find((plotter) => plotter.id === deviceId),
    [deviceId, plotters]
  );
  const currentSnapshot = useMemo(
    () =>
      selectedProgramId && current && deviceId
        ? snapshotValue({
            programId: selectedProgramId,
            params: current.params,
            programState: current.programState,
            deviceId,
            rotationDeg,
            oversizeHandling,
            heightMesh,
          })
        : null,
    [current, deviceId, heightMesh, oversizeHandling, rotationDeg, selectedProgramId]
  );

  useEffect(() => {
    setSettings((existing) => nextTransportSettings(selectedPlotter, existing));
  }, [selectedPlotter?.id, selectedPlotter?.transport]);

  useEffect(() => {
    if (!supportsSerial()) {
      return;
    }

    const handleDisconnect = (event: Event) => {
      const serialEvent = event as Event & {
        target?: SerialPort;
      };
      if (serialEvent.target && serialEvent.target === portRef.current) {
        portRef.current = null;
        setConnectionState("disconnected");
        setPortLabel(null);
        setPosition(null);
        appendLog("error", "Serial device disconnected.");
      }
    };

    serialNavigator().serial?.addEventListener("disconnect", handleDisconnect);
    return () => {
      serialNavigator().serial?.removeEventListener("disconnect", handleDisconnect);
    };
  }, []);

  useEffect(() => {
    return () => {
      void cleanupPort();
    };
  }, []);

  function appendLog(level: GcodeLogEntry["level"], message: string): void {
    setLogs((existing) => [
      ...existing.slice(-199),
      {
        id: `${Date.now()}-${existing.length}`,
        level,
        message,
        timeLabel: nowLabel(),
      },
    ]);
  }

  function rememberError(message: string, machineLine?: string | null): void {
    setLastError(message);
    if (machineLine) {
      setLastMachineError(machineLine);
    }
  }

  function clearErrorState(): void {
    setLastError(null);
    setLastMachineError(null);
  }

  async function requestStatus(): Promise<void> {
    if (
      !portRef.current ||
      !writerRef.current ||
      connectionState !== "connected" ||
      statusRequestInFlightRef.current ||
      jobState === "preparing" ||
      jobState === "sending" ||
      jobState === "paused"
    ) {
      return;
    }

    statusRequestInFlightRef.current = true;
    try {
      await writerRef.current.write(encoder.encode("?"));
    } catch {
      // Ignore polling failures and let normal transport errors surface elsewhere.
    } finally {
      statusRequestInFlightRef.current = false;
    }
  }

  async function cleanupPort(): Promise<void> {
    pendingAckRef.current?.reject(new Error("Connection closed."));
    pendingAckRef.current = null;
    responseListenerRef.current = null;
    statusRequestInFlightRef.current = false;
    setPosition(null);

    const reader = readerRef.current;
    try {
      await reader?.cancel();
    } catch {
      // Ignore reader cancellation failures.
    }
    try {
      reader?.releaseLock();
    } catch {
      // Ignore reader release failures.
    }
    readerRef.current = null;

    const writer = writerRef.current;
    try {
      writer?.releaseLock();
    } catch {
      // Ignore writer release failures.
    }
    writerRef.current = null;

    try {
      await readLoopPromiseRef.current;
    } catch {
      // Ignore read loop failures on shutdown.
    }
    readLoopPromiseRef.current = null;

    const port = portRef.current;
    portRef.current = null;
    if (port) {
      try {
        await port.close();
      } catch {
        // Ignore close failures.
      }
    }
  }

  async function connect(): Promise<void> {
    if (!supportsSerial()) {
      setStatus({
        tone: "error",
        message: "Browser USB serial is not available in this browser.",
      });
      return;
    }

    try {
      if (portRef.current) {
        await cleanupPort();
      }

      clearErrorState();
      setConnectionState("connecting");
      appendLog("system", "Requesting serial device access...");
      const filters: USBDeviceFilter[] =
        selectedPlotter?.transport?.kind === "serial" &&
        (selectedPlotter.transport.usbVendorId || selectedPlotter.transport.usbProductId)
          ? [
              {
                usbVendorId: selectedPlotter.transport.usbVendorId,
                usbProductId: selectedPlotter.transport.usbProductId,
              },
            ].filter(
              (filter) =>
                filter.usbVendorId !== undefined || filter.usbProductId !== undefined
            )
          : [];
      const port = await serialNavigator().serial!.requestPort(
        filters.length > 0 ? { filters } : undefined
      );

      await port.open({
        baudRate: settings.baudRate,
        dataBits: settings.dataBits,
        stopBits: settings.stopBits,
        parity: settings.parity,
        flowControl: settings.flowControl,
      });

      portRef.current = port;
      setPortLabel(describePort(port));
      setConnectionState("connected");
      appendLog("system", `Connected to ${describePort(port) ?? "serial device"}.`);

      const reader = port.readable?.getReader() ?? null;
      if (!reader) {
        throw new Error("Serial device does not expose a readable stream.");
      }
      readerRef.current = reader;
      readLoopPromiseRef.current = (async () => {
        let buffer = "";
        const decoder = new TextDecoder();
        const ackPattern = compileRegex(settings.ackPattern);
        const errorPattern = compileRegex(settings.errorPattern);
        const readyPattern = compileRegex(settings.readyPattern);

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split(/\r?\n/);
          buffer = chunks.pop() ?? "";

          for (const line of chunks.map((chunk) => chunk.trim()).filter(Boolean)) {
            const parsedPosition = parseMachinePosition(line);
            if (parsedPosition || isStatusReport(line)) {
              if (parsedPosition) {
                setPosition(parsedPosition);
              }
              continue;
            }

            setLastResponse(line);
            appendLog("rx", line);
            responseListenerRef.current?.(line);

            if (errorPattern?.test(line)) {
              rememberError(line, line);
              if (pendingAckRef.current) {
                pendingAckRef.current.resolve({
                  status: "error",
                  line,
                });
                pendingAckRef.current = null;
                setProgress((existing) => ({
                  ...existing,
                  errorLines: existing.errorLines + 1,
                }));
              }
              continue;
            }

            if (ackPattern?.test(line)) {
              if (pendingAckRef.current) {
                pendingAckRef.current.resolve({
                  status: "ack",
                  line,
                });
                pendingAckRef.current = null;
                setProgress((existing) => ({
                  ...existing,
                  acknowledgedLines: existing.acknowledgedLines + 1,
                }));
              }
              continue;
            }

            if (readyPattern?.test(line)) {
              appendLog("system", `Device ready: ${line}`);
            }
          }
        }
      })().catch((error) => {
        const message =
          error instanceof Error ? error.message : "Serial reader stopped unexpectedly.";
        rememberError(message);
        appendLog(
          "error",
          message
        );
      });

      writerRef.current = port.writable?.getWriter() ?? null;

      if (settings.connectDelayMs > 0) {
        await pause(settings.connectDelayMs);
      }

      setStatus({
        tone: "success",
        message: "Serial device connected.",
      });
      void requestStatus();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to connect serial device.";
      await cleanupPort();
      setConnectionState("disconnected");
      rememberError(message);
      setStatus({
        tone: "error",
        message,
      });
      appendLog("error", message);
    }
  }

  useEffect(() => {
    if (connectionState !== "connected") {
      return;
    }

    void requestStatus();
    const interval = window.setInterval(() => {
      void requestStatus();
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [connectionState, jobState]);

  async function disconnect(): Promise<void> {
    cancelRequestedRef.current = true;
    pauseRequestedRef.current = false;
    await cleanupPort();
    setConnectionState(supportsSerial() ? "disconnected" : "unsupported");
    setPortLabel(null);
    setJobState("idle");
    setStatus({
      tone: "neutral",
      message: "Serial device disconnected.",
    });
    appendLog("system", "Serial device disconnected.");
  }

  async function prepare(): Promise<GcodePreparedArtifact | null> {
    if (!selectedProgramId || !current || !deviceId) {
      return null;
    }

    try {
      setJobState("preparing");
      setStatus({
        tone: "neutral",
        message: "Generating G-code...",
      });
      const response = await apiFetchTextArtifact("/api/export/gcode", {
        programId: selectedProgramId,
        params: current.params,
        programState: current.programState,
        deviceId,
        rotationDeg,
        oversizeHandling,
        heightMesh,
        downloadName: `${selectedProgramId}-${current.slug}.gcode`,
      });
      const artifact: GcodePreparedArtifact = {
        fileName: response.fileName,
        content: response.content,
        lines: response.content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
        preview: parseGcodePreview(response.content),
        snapshot: currentSnapshot,
        generatedAt: new Date().toISOString(),
      };
      setPreparedArtifact(artifact);
      setProgress({
        totalLines: artifact.lines.length,
        sentLines: 0,
        acknowledgedLines: 0,
        errorLines: 0,
      });
      setJobState("ready");
      setStatus({
        tone: "success",
        message: `Prepared ${artifact.fileName}.`,
      });
      appendLog("system", `Prepared ${artifact.fileName} with ${artifact.lines.length} lines.`);
      return artifact;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate G-code.";
      setJobState("failed");
      rememberError(message);
      setStatus({
        tone: "error",
        message,
      });
      appendLog("error", message);
      return null;
    }
  }

  async function waitForResume(): Promise<void> {
    while (pauseRequestedRef.current && !cancelRequestedRef.current) {
      await pause(50);
    }
  }

  async function waitForAck(timeoutMs: number): Promise<AckResult> {
    return await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingAckRef.current = null;
        resolve({
          status: "timeout",
        });
      }, timeoutMs);

      pendingAckRef.current = {
        resolve: (status) => {
          window.clearTimeout(timeout);
          resolve(status);
        },
        reject: (reason) => {
          window.clearTimeout(timeout);
          reject(reason);
        },
      };
    });
  }

  async function sendSerialLines(
    lines: readonly string[],
    ackTimeoutMs = settings.ackTimeoutMs
  ): Promise<void> {
    if (!writerRef.current || !portRef.current) {
      throw new Error("Connect a serial device first.");
    }

    const writer = writerRef.current;
    const ending = lineEndingValue(settings.lineEnding);
    const responseMode = settings.responseMode;

    for (let index = 0; index < lines.length; index += 1) {
      if (cancelRequestedRef.current) {
        throw new Error("Transmission cancelled.");
      }

      await waitForResume();

      const line = lines[index]!;
      await writer.write(encoder.encode(`${line}${ending}`));
      setProgress((existing) => ({
        ...existing,
        sentLines: index + 1,
      }));
      appendLog("tx", line);

      if (responseMode === "ack") {
        const ackResult = await waitForAck(ackTimeoutMs);
        if (ackResult.status === "error") {
          const message = ackResult.line
            ? `Machine error on line ${index + 1}: ${ackResult.line}`
            : `Machine error on line ${index + 1}.`;
          rememberError(message, ackResult.line ?? null);
          throw new Error(message);
        }
        if (ackResult.status === "timeout") {
          const message = `No acknowledgement received for line ${index + 1}.`;
          rememberError(message);
          appendLog("error", `Timed out waiting for acknowledgement on line ${index + 1}.`);
          throw new Error(message);
        }
      } else if (settings.lineDelayMs > 0) {
        await pause(settings.lineDelayMs);
      }
    }
  }

  async function sendVirtualLines(lines: readonly string[]): Promise<void> {
    for (let index = 0; index < lines.length; index += 1) {
      if (cancelRequestedRef.current) {
        throw new Error("Transmission cancelled.");
      }

      await waitForResume();

      setProgress((existing) => ({
        ...existing,
        sentLines: index + 1,
        acknowledgedLines: index + 1,
      }));
      appendLog("tx", lines[index]!);
      await pause(Math.max(4, settings.lineDelayMs));
    }
  }

  async function runSerialJob(
    request: SerialTransportJobRequest
  ): Promise<SerialTransportJobResult> {
    if (!portRef.current || !writerRef.current) {
      throw new Error("Connect a serial device before starting a serial job.");
    }

    if (
      jobState === "preparing" ||
      jobState === "sending" ||
      jobState === "paused"
    ) {
      throw new Error("Finish the current transport job before starting another one.");
    }

    const responseLines: string[] = [];
    cancelRequestedRef.current = false;
    pauseRequestedRef.current = false;
    jobStartedAtRef.current = Date.now();
    clearErrorState();
    responseListenerRef.current = (line) => {
      responseLines.push(line);
      request.onResponseLine?.(line);
    };
    setProgress({
      totalLines: request.lines.length,
      sentLines: 0,
      acknowledgedLines: 0,
      errorLines: 0,
    });
    setJobState("sending");
    setStatus({
      tone: "neutral",
      message: `${request.label} in progress...`,
    });
    appendLog("system", `Starting ${request.label}.`);
    if (
      settings.responseMode === "ack" &&
      request.ackTimeoutMs !== undefined &&
      request.ackTimeoutMs !== settings.ackTimeoutMs
    ) {
      appendLog("system", `Using ${request.ackTimeoutMs} ms ACK timeout for ${request.label}.`);
    }

    try {
      await sendSerialLines(request.lines, request.ackTimeoutMs);
      setJobState("complete");
      clearErrorState();
      setStatus({
        tone: "success",
        message: `${request.label} complete.`,
      });
      appendLog(
        "system",
        `${request.label} complete in ${Date.now() - (jobStartedAtRef.current ?? Date.now())} ms.`
      );
      return {
        label: request.label,
        durationMs: Date.now() - (jobStartedAtRef.current ?? Date.now()),
        responseLines,
      };
    } catch (error) {
      if (cancelRequestedRef.current) {
        setJobState("cancelled");
        setStatus({
          tone: "neutral",
          message: `${request.label} cancelled.`,
        });
        appendLog("system", `${request.label} cancelled.`);
      } else {
        setJobState("failed");
        rememberError(
          error instanceof Error ? error.message : `${request.label} failed.`
        );
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : `${request.label} failed.`,
        });
        appendLog(
          "error",
          error instanceof Error ? error.message : `${request.label} failed.`
        );
      }
      throw error;
    } finally {
      responseListenerRef.current = null;
      void requestStatus();
    }
  }

  async function resetAlarm(): Promise<void> {
    const lines = commandLines(settings.alarmResetCommand);
    if (lines.length === 0) {
      const message = "This transport does not define an alarm reset command.";
      rememberError(message);
      setStatus({
        tone: "error",
        message,
      });
      appendLog("error", message);
      return;
    }

    try {
      await runSerialJob({
        label: "Alarm reset",
        lines,
      });
    } catch {
      // runSerialJob already recorded the device response and status.
    }
  }

  async function zeroCurrentPosition(): Promise<void> {
    try {
      await runSerialJob({
        label: "Zero current position",
        lines: ["G92 X0 Y0 Z0"],
      });
      void requestStatus();
    } catch {
      // runSerialJob already recorded the device response and status.
    }
  }

  async function send(): Promise<void> {
    const artifact =
      preparedArtifact && preparedArtifact.snapshot === currentSnapshot
        ? preparedArtifact
        : await prepare();

    if (!artifact) {
      return;
    }

    if (settings.target === "serial" && connectionState !== "connected") {
      const message = "Connect a serial device before sending G-code.";
      rememberError(message);
      setStatus({
        tone: "error",
        message,
      });
      return;
    }

    cancelRequestedRef.current = false;
    pauseRequestedRef.current = false;
    jobStartedAtRef.current = Date.now();
    clearErrorState();
    setProgress({
      totalLines: artifact.lines.length,
      sentLines: 0,
      acknowledgedLines: 0,
      errorLines: 0,
    });
    setJobState("sending");
    appendLog(
      "system",
      settings.target === "virtual"
        ? "Starting virtual transmission."
        : "Starting serial transmission."
    );

    try {
      if (settings.target === "virtual") {
        await sendVirtualLines(artifact.lines);
      } else {
        await sendSerialLines(artifact.lines);
      }

      setJobState("complete");
      clearErrorState();
      setStatus({
        tone: "success",
        message: `Sent ${artifact.fileName}.`,
      });
      appendLog("system", `Transmission complete in ${Date.now() - (jobStartedAtRef.current ?? Date.now())} ms.`);
    } catch (error) {
      if (cancelRequestedRef.current) {
        setJobState("cancelled");
        setStatus({
          tone: "neutral",
          message: "Transmission cancelled.",
        });
        appendLog("system", "Transmission cancelled.");
      } else {
        setJobState("failed");
        rememberError(
          error instanceof Error ? error.message : "G-code transmission failed."
        );
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : "G-code transmission failed.",
        });
        appendLog(
          "error",
          error instanceof Error ? error.message : "G-code transmission failed."
        );
      }
    }
  }

  function pauseJob(): void {
    pauseRequestedRef.current = true;
    setJobState("paused");
    appendLog("system", "Transmission paused.");
  }

  function resumeJob(): void {
    pauseRequestedRef.current = false;
    setJobState("sending");
    appendLog("system", "Transmission resumed.");
  }

  function cancelJob(): void {
    cancelRequestedRef.current = true;
    pendingAckRef.current?.reject(new Error("Transmission cancelled."));
    pendingAckRef.current = null;
  }

  function clearLogs(): void {
    setLogs([]);
  }

  function setTarget(target: GcodeTransportTarget): void {
    setSettings((existing) => ({
      ...existing,
      target,
    }));
  }

  function updateSettings(patch: Partial<GcodeTransportSettings>): void {
    setSettings((existing) => ({
      ...existing,
      ...patch,
    }));
  }

  return {
    supported: supportsSerial(),
    settings,
    connectionState,
    portLabel,
    jobState,
    preparedArtifact,
    preparedStale:
      preparedArtifact !== null &&
      currentSnapshot !== null &&
      preparedArtifact.snapshot !== currentSnapshot,
    progress,
    logs,
    canResetAlarm: commandLines(settings.alarmResetCommand).length > 0,
    lastError,
    lastMachineError,
    lastResponse,
    position,
    connect,
    disconnect,
    prepare,
    resetAlarm,
    zeroCurrentPosition,
    runSerialJob,
    send,
    pause: pauseJob,
    resume: resumeJob,
    cancel: cancelJob,
    clearLogs,
    setTarget,
    updateSettings,
  };
}
