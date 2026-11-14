import { DTM_BASE_URL } from './dtm.ts'
import type {
  AbortRequest,
  AbortResponse,
  GridInfo,
  PlanRequest,
  PlanResponse,
  ViewshedRequest,
  ViewshedResponse,
  WorkerResponse,
} from './routerTypes.ts'

type Pending = { resolve: (v: never) => void; reject: (e: Error) => void }

class RouterClient {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  private readyPromise: Promise<GridInfo | null> | null = null

  private ensure(): Promise<GridInfo | null> {
    if (this.readyPromise) return this.readyPromise
    this.worker = new Worker(new URL('../workers/router.worker.ts', import.meta.url), { type: 'module' })
    this.readyPromise = new Promise((resolve) => {
      this.worker!.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data
        if (m.type === 'ready') {
          resolve(m.ok ? m.grid : null)
          return
        }
        const p = this.pending.get(m.id)
        if (!p) return
        this.pending.delete(m.id)
        if (m.type === 'error') p.reject(new Error(m.message))
        else p.resolve(m as never)
      }
      this.worker!.onerror = () => resolve(null)
      this.worker!.postMessage({ type: 'init', baseUrl: DTM_BASE_URL })
    })
    return this.readyPromise
  }

  async ready(): Promise<GridInfo | null> {
    return this.ensure()
  }

  private async call<T>(msg: { id: number }): Promise<T> {
    const grid = await this.ensure()
    if (!grid) throw new Error('No local DTM loaded')
    return new Promise<T>((resolve, reject) => {
      this.pending.set(msg.id, { resolve: resolve as (v: never) => void, reject })
      this.worker!.postMessage(msg)
    })
  }

  plan(req: Omit<PlanRequest, 'type' | 'id'>): Promise<PlanResponse> {
    return this.call<PlanResponse>({ type: 'plan', id: this.nextId++, ...req } as PlanRequest)
  }

  abort(req: Omit<AbortRequest, 'type' | 'id'>): Promise<AbortResponse> {
    return this.call<AbortResponse>({ type: 'abort', id: this.nextId++, ...req } as AbortRequest)
  }

  viewshed(req: Omit<ViewshedRequest, 'type' | 'id'>): Promise<ViewshedResponse> {
    return this.call<ViewshedResponse>({ type: 'viewshed', id: this.nextId++, ...req } as ViewshedRequest)
  }
}

export const router = new RouterClient()
