import {
  ASSET_CREATED_INDEX,
  ASSET_STORE,
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
  if (!db.objectStoreNames.contains(AUTOSAVE_STORE)) {
    db.createObjectStore(AUTOSAVE_STORE, { keyPath: "sessionId" }).createIndex(
      AUTOSAVE_SAVED_INDEX,
      "savedAt"
    )
  }

  if (!db.objectStoreNames.contains(ASSET_STORE)) {
    db.createObjectStore(ASSET_STORE, { keyPath: "id" }).createIndex(
      ASSET_CREATED_INDEX,
      "createdAt"
    )
  }
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
  name: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T | null> {
  const db = await openAutosaveDb()

  if (!db) {
    return null
  }

  try {
    const transaction = db.transaction(name, mode)

    return await run(transaction.objectStore(name))
  } catch {
    return null
  }
}

export function readAllFrom<T>(name: string): Promise<T[] | null> {
  return withStore(name, "readonly", (store) =>
    request(store.getAll() as IDBRequest<T[]>)
  )
}

export async function putInto(name: string, record: unknown): Promise<boolean> {
  const result = await withStore(name, "readwrite", async (store) => {
    await request(store.put(record as never))

    return true
  })

  return result ?? false
}

export function deleteKeysFrom(
  name: string,
  keys: readonly string[]
): Promise<unknown> {
  if (keys.length === 0) {
    return Promise.resolve(null)
  }

  return withStore(name, "readwrite", async (store) => {
    for (const key of keys) {
      await request(store.delete(key))
    }

    return true
  })
}

export function readAll<T>(): Promise<T[] | null> {
  return readAllFrom<T>(AUTOSAVE_STORE)
}

export function writeRecord(record: unknown): Promise<boolean> {
  return putInto(AUTOSAVE_STORE, record)
}

export function deleteRecord(sessionId: string): Promise<unknown> {
  return deleteKeysFrom(AUTOSAVE_STORE, [sessionId])
}

export function deleteRecords(sessionIds: readonly string[]): Promise<unknown> {
  return deleteKeysFrom(AUTOSAVE_STORE, sessionIds)
}
