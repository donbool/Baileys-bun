import type { URL } from 'url'
import type { SocketConfig } from '../../Types'
import { BunWebSocketClient } from './bun-websocket'
import type { AbstractSocketClient } from './types'
import { WebSocketClient } from './websocket'

export * from './types'
export * from './bun-websocket'
export * from './websocket'

const isBunRuntime = () =>
	typeof process !== 'undefined' && typeof (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun === 'string'

export const makeSocketClient = (url: URL, config: SocketConfig): AbstractSocketClient => {
	return isBunRuntime() ? new BunWebSocketClient(url, config) : new WebSocketClient(url, config)
}
