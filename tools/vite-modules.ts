import { createServer } from 'vite'

// Content, templates and the engine are TypeScript with extensionless imports, which Node
// can't resolve on its own. Vite's SSR module runner uses the same resolver the app builds
// with, and Vite is already a dependency, so the tools load through it (ADR-0042).

export type LoadModule = <M>(path: string) => Promise<M>

/** Boots a throwaway Vite server, runs `use`, and always closes the server afterwards. */
export async function withModules<T>(use: (load: LoadModule) => Promise<T>): Promise<T> {
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    return await use(<M,>(path: string) => server.ssrLoadModule(path) as Promise<M>)
  } finally {
    await server.close()
  }
}
