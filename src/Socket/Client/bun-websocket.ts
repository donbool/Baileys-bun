import { DEFAULT_ORIGIN } from '../../Defaults'
import { AbstractSocketClient } from './types'

type BunWebSocketOptions = {
	headers?: HeadersInit
}

type BunWebSocketConstructor = new (url: string | URL, options?: BunWebSocketOptions) => WebSocket

const BunWebSocket = globalThis.WebSocket as unknown as BunWebSocketConstructor

const toBuffer = async (data: unknown): Promise<Buffer> => {
	if (Buffer.isBuffer(data)) {
		return data
	}

	if (typeof data === 'string') {
		return Buffer.from(data)
	}

	if (data instanceof ArrayBuffer) {
		return Buffer.from(data)
	}

	if (ArrayBuffer.isView(data)) {
		return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
	}

	if (typeof Blob !== 'undefined' && data instanceof Blob) {
		return Buffer.from(await data.arrayBuffer())
	}

	throw new Error(`Unsupported WebSocket message type: ${Object.prototype.toString.call(data)}`)
}

export class BunWebSocketClient extends AbstractSocketClient {
	protected socket: WebSocket | null = null
	private connectTimeout: ReturnType<typeof setTimeout> | null = null

	get isOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN
	}
	get isClosed(): boolean {
		return this.socket === null || this.socket.readyState === WebSocket.CLOSED
	}
	get isClosing(): boolean {
		return this.socket === null || this.socket.readyState === WebSocket.CLOSING
	}
	get isConnecting(): boolean {
		return this.socket?.readyState === WebSocket.CONNECTING
	}

	connect() {
		if (this.socket) {
			return
		}

		if (this.config.agent) {
			throw new Error('Bun WebSocket transport does not support Node HTTP agents. Run Baileys on Node when using agent.')
		}

		const headers = new Headers(this.config.options?.headers)
		if (!headers.has('origin')) {
			headers.set('Origin', DEFAULT_ORIGIN)
		}

		this.socket = new BunWebSocket(this.url, { headers })
		this.socket.binaryType = 'arraybuffer'

		this.connectTimeout = setTimeout(() => {
			if (!this.isConnecting) {
				return
			}

			this.emit('error', new Error(`WebSocket connect timed out after ${this.config.connectTimeoutMs}ms`))
			this.socket?.close()
		}, this.config.connectTimeoutMs)

		this.socket.addEventListener('open', event => {
			this.clearConnectTimeout()
			this.emit('open', event)
		})

		this.socket.addEventListener('message', event => {
			void toBuffer(event.data)
				.then(data => this.emit('message', data))
				.catch(error => this.emit('error', error))
		})

		this.socket.addEventListener('error', event => {
			this.clearConnectTimeout()
			this.emit('error', event instanceof Error ? event : new Error('WebSocket error'))
		})

		this.socket.addEventListener('close', event => {
			this.clearConnectTimeout()
			this.emit('close', event)
		})
	}

	async close() {
		if (!this.socket) {
			return
		}

		if (this.socket.readyState === WebSocket.CLOSED) {
			this.socket = null
			return
		}

		const socket = this.socket
		const closePromise = new Promise<void>(resolve => {
			socket.addEventListener('close', () => resolve(), { once: true })
		})

		socket.close()
		await closePromise
		this.socket = null
	}

	send(str: string | Uint8Array, cb?: (err?: Error) => void): boolean {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			cb?.(new Error('WebSocket is not open'))
			return false
		}

		try {
			this.socket.send(str)
			cb?.()
			return true
		} catch (error) {
			cb?.(error instanceof Error ? error : new Error(String(error)))
			return false
		}
	}

	private clearConnectTimeout() {
		if (this.connectTimeout) {
			clearTimeout(this.connectTimeout)
			this.connectTimeout = null
		}
	}
}
