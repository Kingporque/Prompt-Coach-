// UI-side helper: send a message to the service worker and unwrap the
// { ok, data, error } envelope into a resolved value or a thrown Error.
export function sendToWorker(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      const runtimeErr = chrome.runtime.lastError
      if (runtimeErr) return reject(new Error(runtimeErr.message))
      if (!res) return reject(new Error('No response from background worker.'))
      if (!res.ok) return reject(new Error(res.error || 'Unknown error.'))
      resolve(res.data)
    })
  })
}
