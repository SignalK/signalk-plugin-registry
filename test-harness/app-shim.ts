import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface CapturedRegistrations {
  providers: {
    history?: unknown
    weather?: unknown
    autopilot?: unknown
    resources?: unknown
    radar?: unknown
    ble?: unknown
  }
  putHandlers: Array<{ context: string; path: string }>
  httpRoutes: string[]
  unstubbedAccesses: string[]
  statusMessages: string[]
  errorMessages: string[]
  deltas: unknown[]
}

function createMockBus() {
  const bus: Record<string, unknown> = {}
  const chainMethods = [
    'onValue', 'onError', 'onEnd', 'skipDuplicates', 'map', 'filter',
    'take', 'first', 'toPromise', 'flatMap', 'flatMapLatest', 'merge',
    'debounce', 'debounceImmediate', 'throttle', 'delay',
    'bufferWithTime', 'bufferWithCount', 'combine', 'sampledBy',
    'scan', 'fold', 'zip', 'awaiting', 'not', 'log', 'doAction',
    'doLog', 'doError', 'doEnd', 'withHandler', 'name', 'withDescription',
    'skip', 'slidingWindow', 'startWith', 'mapEnd', 'skipWhile',
    'takeWhile', 'takeUntil', 'errors', 'mapError'
  ]
  for (const m of chainMethods) {
    bus[m] = (..._args: unknown[]) => bus
  }
  bus.onValue = (_cb: unknown) => () => {}
  bus.push = () => {}
  bus.plug = () => () => {}
  bus.end = () => {}
  return bus
}

// Plugins that gate behaviour on `app.config.version` (e.g.
// `semver.satisfies(app.config.version, '>=2.x')`) should see the server the
// slot actually installed, not a frozen constant. The runner forwards the
// resolved version through `SIGNALK_SERVER_VERSION`. The `master` slot's
// "version" is a 7-char git SHA, which isn't valid semver and would break any
// such check, so we only honour values that look like semver and otherwise
// fall back to the last stable release this harness was pinned to.
const FALLBACK_SERVER_VERSION = '2.24.0'

function resolveServerVersion(): string {
  const v = process.env.SIGNALK_SERVER_VERSION?.trim()
  return v && /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(v) ? v : FALLBACK_SERVER_VERSION
}

export interface CreateAppShimOptions {
  /**
   * Plugin names listed in `package.json` `signalk.requires`. When the list
   * includes a known cross-plugin API (currently only `signalk-container`),
   * the shim installs a minimal stub on globalThis so the plugin's `start()`
   * can complete instead of timing out waiting for the real companion.
   *
   * Activates: false for plugins like signalk-doctor / signalk-backup that
   * `await waitForContainerManager(...)` in start() would otherwise be the
   * dominant failure mode in the harness — the harness only constructs the
   * plugin under test, never the companion.
   */
  requires?: string[]
}

export function createAppShim(
  pluginId: string,
  options: CreateAppShimOptions = {}
): {
  app: unknown
  captured: CapturedRegistrations
  cleanup: () => void
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-plugin-test-'))
  const configPath = tmpDir
  const dataDir = path.join(tmpDir, 'plugin-config-data', pluginId)
  fs.mkdirSync(dataDir, { recursive: true })

  const captured: CapturedRegistrations = {
    providers: {},
    putHandlers: [],
    httpRoutes: [],
    unstubbedAccesses: [],
    statusMessages: [],
    errorMessages: [],
    deltas: []
  }

  const signalkModel: Record<string, unknown> = {
    self: {},
    vessels: {}
  }

  const onStopHandlers: Array<() => void> = []

  const app = {
    getSelfPath: (_path: string) => undefined,
    getPath: (_path: string) => undefined,
    getMetadata: (_path: string) => undefined,
    putSelfPath: (
      _path: string,
      _value: unknown,
      cb?: (result: { state: string }) => void
    ) => {
      cb?.({ state: 'COMPLETED' })
    },
    putPath: (
      _path: string,
      _value: unknown,
      cb?: (result: { state: string }) => void
    ) => {
      cb?.({ state: 'COMPLETED' })
    },
    queryRequest: (_requestId: string) => Promise.resolve({ state: 'COMPLETED' }),

    handleMessage: (id: string, delta: unknown) => {
      captured.deltas.push({ id, delta })
    },

    setPluginStatus: (msg: string) => {
      captured.statusMessages.push(msg)
    },
    setPluginError: (msg: string) => {
      captured.errorMessages.push(msg)
    },

    savePluginOptions: (
      config: unknown,
      cb?: () => void
    ) => {
      const configFile = path.join(tmpDir, 'plugin-config-data', `${pluginId}.json`)
      fs.writeFileSync(configFile, JSON.stringify(config))
      cb?.()
    },
    readPluginOptions: () => {
      const configFile = path.join(tmpDir, 'plugin-config-data', `${pluginId}.json`)
      if (fs.existsSync(configFile)) {
        return JSON.parse(fs.readFileSync(configFile, 'utf-8'))
      }
      return {}
    },
    getPluginOptions: () => ({}),
    getDataDirPath: () => dataDir,

    debug: (..._args: unknown[]) => {},
    error: (..._args: unknown[]) => {},

    registerPutHandler: (context: string, skPath: string, _callback: unknown, _source?: string) => {
      captured.putHandlers.push({ context, path: skPath })
      const deregister = () => {}
      onStopHandlers.push(deregister)
      return deregister
    },

    registerDeltaInputHandler: (_handler: unknown) => {
      return () => {}
    },

    registerHistoryProvider: (provider: unknown) => {
      captured.providers.history = provider
      onStopHandlers.push(() => { captured.providers.history = undefined })
    },
    registerHistoryApiProvider: (provider: unknown) => {
      captured.providers.history = provider
      onStopHandlers.push(() => { captured.providers.history = undefined })
    },
    registerWeatherProvider: (provider: unknown) => {
      captured.providers.weather = provider
      onStopHandlers.push(() => { captured.providers.weather = undefined })
    },
    registerAutopilotProvider: (provider: unknown, _devices?: string[]) => {
      captured.providers.autopilot = provider
      onStopHandlers.push(() => { captured.providers.autopilot = undefined })
    },
    registerResourceProvider: (provider: unknown) => {
      captured.providers.resources = provider
      onStopHandlers.push(() => { captured.providers.resources = undefined })
    },
    registerRadarProvider: (provider: unknown) => {
      captured.providers.radar = provider
      onStopHandlers.push(() => { captured.providers.radar = undefined })
    },
    registerBLEProvider: (provider: unknown) => {
      captured.providers.ble = provider
      onStopHandlers.push(() => { captured.providers.ble = undefined })
    },

    streambundle: {
      getSelfBus: (_path: string) => createMockBus(),
      getBus: (_path: string) => createMockBus(),
      getSelfStream: (_path: string) => createMockBus(),
      getAvailablePaths: () => []
    },

    subscriptionmanager: {
      subscribe: (
        _msg: unknown,
        unsubscribes: Array<() => void>,
        _errorCb: unknown,
        _deltaCb: unknown
      ) => {
        const unsub = () => {}
        unsubscribes?.push(unsub)
      }
    },

    signalk: signalkModel,
    selfId: 'urn:mrn:signalk:uuid:00000000-0000-0000-0000-000000000000',
    selfType: 'vessels',
    selfContext: 'vessels.urn:mrn:signalk:uuid:00000000-0000-0000-0000-000000000000',

    config: {
      configPath,
      appPath: tmpDir,
      version: resolveServerVersion(),
      name: 'signalk-server',
      basePath: '/signalk/v1',
      defaults: {}
    },

    on: (_event: string, _handler: unknown) => {},
    once: (_event: string, _handler: unknown) => {},
    emit: (_event: string, ..._args: unknown[]) => {},
    removeListener: (_event: string, _handler: unknown) => {},
    removeAllListeners: (_event?: string) => {},

    getSerialPorts: () => Promise.resolve({}),

    wrappedEmitter: {
      bindMethodsById: (_id: string) => ({
        on: () => {},
        removeListener: () => {}
      })
    },

    reportOutputMessages: (_count?: number) => {},

    resourcesApi: {
      register: (_pluginId: string, provider: unknown) => {
        captured.providers.resources = provider
      }
    },
    weatherApi: {
      register: (_pluginId: string, provider: unknown) => {
        captured.providers.weather = provider
      }
    },
    autopilotApi: {
      register: (_pluginId: string, provider: unknown, _devices?: string[]) => {
        captured.providers.autopilot = provider
      }
    },

    // BLE API (server >= 2.31.0). Models a server with the BLE API enabled
    // but no hardware behind it: no adapter managed, no providers, no
    // devices visible. Advertisement subscriptions succeed and never emit;
    // GATT calls reject with upstream's no-provider errors so a consumer
    // plugin fails on its own terms, exactly as on a hardware-less server.
    bleApi: {
      localBluetoothManaged: false,
      register: (_pluginId: string, provider: unknown) => {
        captured.providers.ble = provider
        onStopHandlers.push(() => { captured.providers.ble = undefined })
      },
      unRegister: (_pluginId: string) => {
        captured.providers.ble = undefined
      },
      onAdvertisement: (_pluginId: string, _callback: unknown) => () => {},
      getDevices: () => Promise.resolve([]),
      getDevice: (_mac: string) => Promise.resolve(null),
      subscribeGATT: (descriptor: unknown, _pluginId: string, _callback: unknown) => {
        const mac =
          descriptor && typeof descriptor === 'object'
            ? (descriptor as Record<string, unknown>).mac
            : undefined
        return Promise.reject(
          new Error(`No provider with GATT support and available slots can see ${mac}`)
        )
      },
      connectGATT: (mac: string, _pluginId: string) =>
        Promise.reject(new Error(`No provider with GATT support can see ${mac}`)),
      releaseGATTDevice: (_mac: string, _pluginId: string) => Promise.resolve(),
      getGATTClaims: () => new Map<string, string>()
    }
  }

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop in target) return target[prop as string]
      if (typeof prop === 'symbol') return undefined
      const propStr = String(prop)
      if (!captured.unstubbedAccesses.includes(propStr)) {
        captured.unstubbedAccesses.push(propStr)
      }
      return (..._args: unknown[]) => {}
    }
  }

  const proxiedApp = new Proxy(app as Record<string, unknown>, handler)

  const globalCleanups: Array<() => void> = []

  // Install cross-plugin global stubs the plugin's start() may await. The
  // harness never instantiates companion plugins, only the one under test,
  // so without these stubs every consumer plugin that polls
  // globalThis.__signalk_containerManager would time out at activation.
  const requires = options.requires ?? []
  if (requires.includes('signalk-container')) {
    const sentinelVersionSource = { kind: '__signalk_registry_stub__' }
    const stub = {
      // ContainerRuntimeInfo-shaped enough that the polling pattern
      // `m && m.getRuntime()` resolves truthy. Real plugins read fields
      // off the result (runtime name, version, isPodmanDockerShim, etc.) —
      // their downstream logic typically fails open when those are
      // undefined, which is what we want here.
      getRuntime: () => ({ runtime: 'stub', version: '0.0.0-harness-stub' }),
      whenReady: () => Promise.resolve(),
      // Recreate handlers that may be invoked from start():
      remove: () => Promise.resolve(),
      ensureRunning: () => Promise.resolve(),
      recreate: () => Promise.resolve(),
      getState: () => Promise.resolve({ state: 'missing' }),
      getContainerState: () => Promise.resolve({ state: 'missing' }),
      updates: {
        register: (_reg: unknown) => {},
        unregister: (_pluginId: string) => {},
        checkOne: () => Promise.resolve({ ok: false, fromCache: false }),
        checkAll: () => Promise.resolve([]),
        getLastResult: () => null,
        sources: {
          githubReleases: (_repo: string) => sentinelVersionSource,
          dockerHubTags: (_image: string) => sentinelVersionSource
        }
      }
    }
    const g = globalThis as Record<string, unknown>
    const priorValue = g.__signalk_containerManager
    const hadPrior = '__signalk_containerManager' in g
    g.__signalk_containerManager = stub
    globalCleanups.push(() => {
      if (hadPrior) g.__signalk_containerManager = priorValue
      else delete g.__signalk_containerManager
    })
  }

  const cleanup = () => {
    for (const handler of onStopHandlers) handler()
    for (const c of globalCleanups) c()
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }

  return { app: proxiedApp, captured, cleanup }
}
