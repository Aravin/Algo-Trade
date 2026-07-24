interface ClientStateResponse<T> {
  value: T | null
}

async function parseJson<T>(response: Response): Promise<T> {
  return await response.json()
}

export async function loadRemoteState<T>(key: string): Promise<T | null> {
  const response = await fetch(
    `/api/client-state?key=${encodeURIComponent(key)}`,
  )
  if (!response.ok) {
    throw new Error(
      `Failed to load client state for ${key}: ${response.status}`,
    )
  }
  const payload = await parseJson<ClientStateResponse<T>>(response)
  return payload.value ?? null
}

export async function saveRemoteState<T>(key: string, value: T): Promise<void> {
  const response = await fetch('/api/client-state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to save client state for ${key}: ${response.status}`,
    )
  }
}
