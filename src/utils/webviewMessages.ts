import { CONFIG, FETCH, FILE_CONTENT, SHOW_INFORMATION_MESSAGE, HIGHLIGHT_STYLES, GET_IMAGE } from './messageTypes'
import type { AxiosRequestConfig } from 'axios'

// Define a class for handling communication with the webview
class WebviewMessages {
  vscode: any
  promises: Map<string, any> = new Map()
  callbacks: Map<string, any> = new Map()

  constructor() {
    if (!acquireVsCodeApi) {
      return
    }
    this.vscode = acquireVsCodeApi()

    // Add an event listener to handle incoming messages
    window.addEventListener('message', (event) => {
      if (this.callbacks.has(event.data.command)) {
        const callbacks = this.callbacks.get(event.data.command)
        for (const callback of callbacks) {
          callback(event.data.data)
        }
      } else if (this.promises.has(event.data.command)) {
        const { resolve, reject, stream, controller } = this.promises.get(event.data.command)
        if (event.data.command.startsWith(FETCH)) {
          if (event.data.success) {
            if (stream) {
              // Handle streaming data
              return event.data.finished ? controller.close() : controller.enqueue(event.data.data)
            }
            // Resolve the fetch promise with the data
            resolve(event.data.data)
          } else {
            // Reject the fetch promise with the error data
            reject(event.data.data)
          }
        } else {
          // Resolve the promise with the received data
          resolve(event.data.data)
        }
        // Delete the promise from the map
        this.promises.delete(event.data.command)
      }
    })
  }

  // Fetch data from the webview
  fetch(config: AxiosRequestConfig) {
    const command = this.getCommand(FETCH)
    const promise = new Promise((resolve, reject) => {
      if (config.responseType === 'stream') {
        // Handle streaming response
        const readableStream = new ReadableStream({
          start: (controller) => {
            this.promises.set(command, { resolve, reject, stream: true, controller })
          },
        })
        resolve(readableStream)
      } else {
        // Regular fetch promise
        this.promises.set(command, { resolve, reject })
      }
    })
    // Post fetch command and data to the webview
    this.vscode.postMessage({
      command,
      data: config,
    })
    return promise
  }

  // Post a message to the webview
  postMessage(type: string, data?: any) {
    const command = this.getCommand(type)
    const promise = new Promise((resolve, reject) => {
      this.promises.set(command, { resolve, reject })
    })
    this.vscode.postMessage({ command, data })
    return promise
  }

  // Get configuration from the webview
  getConfig() {
    return this.postMessage(CONFIG)
  }

  showInformationMessage(msg: string) {
    this.vscode.postMessage({ command: SHOW_INFORMATION_MESSAGE, data: msg })
  }

  // Generate a unique command based on the prefix and timestamp
  getCommand(prefix: string) {
    let command = `${prefix}-${Date.now()}-${(Math.random() * 10000) | 0}`
    while (this.promises.has(command)) {
      command = `${prefix}-${Date.now()}-${(Math.random() * 10000) | 0}`
    }
    return command
  }

  getFileContent() {
    return this.postMessage(FILE_CONTENT)
  }

  getHighlightStyles() {
    return this.postMessage(HIGHLIGHT_STYLES)
  }

  getImage(path: string) {
    return this.postMessage(GET_IMAGE, path)
  }

  on(type: string, callback: (data: any) => any) {
    if (this.callbacks.has(type)) {
      this.callbacks.get(type).push(callback)
    } else {
      this.callbacks.set(type, [callback])
    }
  }
}

// Export an instance of the WebviewMessages class
const webviewMessages = new WebviewMessages()
export default webviewMessages
