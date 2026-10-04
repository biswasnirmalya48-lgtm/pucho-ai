/**
 * Minimal Server-Sent Events writer used by the chat stream.
 * Buffers into the socket, flushes after every event, and keeps a heartbeat
 * so proxies do not close an idle stream mid-answer.
 */
export function createSse(res) {
  let closed = false
  let heartbeat = null

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })

  const send = (event, data) => {
    if (closed || res.writableEnded) return
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`)
      res.flush?.()
    } catch {
      closed = true
    }
  }

  const ping = () => {
    if (closed || res.writableEnded) return
    try {
      res.write(': ping\n\n')
    } catch {
      closed = true
    }
  }

  heartbeat = setInterval(ping, 15_000)
  heartbeat.unref?.()

  return {
    send,
    /** Open the stream with retry hints for proxies. */
    open(info) {
      if (!closed) {
        res.write('retry: 3000\n\n')
        res.write(': pucho-stream\n\n')
      }
      send('open', { ok: true, ...info })
    },
    close() {
      if (heartbeat) clearInterval(heartbeat)
      heartbeat = null
      if (closed || res.writableEnded) return
      try {
        res.end()
      } catch {
        /* socket already gone */
      }
      closed = true
    },
    get closed() {
      return closed || !!res.writableEnded
    },
  }
}