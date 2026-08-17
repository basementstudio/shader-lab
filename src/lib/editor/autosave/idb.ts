import {
  AUTOSAVE_DB_NAME,
  AUTOSAVE_DB_VERSION,
  AUTOSAVE_SAVED_INDEX,
  AUTOSAVE_STORE,
} from "@/lib/editor/autosave/limits"

let opening: Promise<IDBDatabase | null> | null = null

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined"
}

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result)
    source.onerror = () => reject(source.error)
  })
}

function upgrade(db: IDBDatabase): void {
  if (db.objectStoreNames.contains(AUTOSAVE_STORE)) {
    return
  }

  const store = db.createObjectStore(AUTOSAVE_STORE, { keyPath: "sessionId" })

  store.createIndex(AUTOSAVE_SAVED_INDEX, "savedAt")
}

export function openAutosaveDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null)
  }

  if (opening) {
    return opening
  }

  opening = new Promise<IDBDatabase | null>((resolve) => {
    const open = indexedDB.open(AUTOSAVE_DB_NAME, AUTOSAVE_DB_VERSION)

    open.onupgradeneeded = () => upgrade(open.result)
    open.onsuccess = () => {
      open.result.onversionchange = () => {
        open.result.close()
        opening = null
      }

      resolve(open.result)
    }
    open.onerror = () => resolve(null)
    open.onblocked = () => resolve(null)
  })

  return opening
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T | null> {
  const db = await openAutosaveDb()

  if (!db) {
    return null
  }

  try {
    const transaction = db.transaction(AUTOSAVE_STORE, mode)

    return await run(transaction.objectStore(AUTOSAVE_STORE))
  } catch {
    return null
  }
}

export function readAll<T>(): Promise<T[] | null> {
  return withStore("readonly", (store) =>
    request(store.getAll() as IDBRequest<T[]>)
  )
}

export async function writeRecord(record: unknown): Promise<boolean> {
  const result = await withStore("readwrite", async (store) => {
    await request(store.put(record as never))

    return true
  })

  return result ?? false
}

export function deleteRecord(sessionId: string): Promise<unknown> {
  return withStore("readwrite", (store) => request(store.delete(sessionId)))
}

export function deleteRecords(sessionIds: readonly string[]): Promise<unknown> {
  if (sessionIds.length === 0) {
    return Promise.resolve(null)
  }

  return withStore("readwrite", async (store) => {
    for (const sessionId of sessionIds) {
      await request(store.delete(sessionId))
    }

    return true
  })
}
