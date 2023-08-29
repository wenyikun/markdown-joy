import type { Webview, Uri, ExtensionContext } from 'vscode'
import * as vscode from 'vscode'
import axios from 'axios'
import { FETCH, CONFIG, SHOW_INFORMATION_MESSAGE, FILE_CONTENT, ON_FILE_CONTENT, HIGHLIGHT_STYLES, GET_IMAGE } from '../utils/messageTypes'
import { existsSync, readFile, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, extname, join } from 'path'
import { getType } from 'mime'
import sharp from 'sharp'

class ExtensionMessage {
  webview: Webview
  resourceUri: Uri | undefined
  context: ExtensionContext | undefined
  highlightStyles: string[] = []
  highlightBaseUrl: string
  imageMap: Map<string, string> = new Map()
  constructor(
    webview: Webview,
    options?: {
      resourceUri?: Uri
      context?: ExtensionContext
    }
  ) {
    this.webview = webview
    this.resourceUri = options?.resourceUri
    this.context = options?.context
    this.highlightBaseUrl = this.context ? this.context.extensionPath + '/node_modules/highlight.js/styles/' : ''

    const sharpPromiseMap = new Map()

    webview.onDidReceiveMessage((message) => {
      if (message.command.startsWith(FETCH)) {
        this.fetch(message.command, message.data)
      } else if (message.command.startsWith(CONFIG)) {
        const config = vscode.workspace.getConfiguration('markdown-joy')
        this.webview.postMessage({
          command: message.command,
          data: {
            chatApi: config.chatApi,
            chatApiKey: config.chatApiKey,
            chatModel: config.chatModel,
            highlightBaseUrl: this.highlightBaseUrl
          },
        })
      } else if (message.command.startsWith(FILE_CONTENT)) {
        if (!options?.resourceUri) {
          return
        }
        vscode.workspace.openTextDocument(options.resourceUri).then((doc) => {
          let data = doc.getText()
          // const regex = /!\[.*?\]\((.*?)\)/g;
          // const imageLinks = data.match(regex)?.map(item => item.match(/\((.*?)\)/)?.[1]);
          // data = data.replace(imageLinks![0]!, this.webview.asWebviewUri(vscode.Uri.file(join(dirname(options.resourceUri!.fsPath), imageLinks![0]!))).toString())
          this.webview.postMessage({
            command: message.command,
            data,
          })
        })
      } else if (message.command.startsWith(HIGHLIGHT_STYLES)) {
        if (!this.context) {
          return
        }
        this.webview.postMessage({
          command: message.command,
          data: this.getAllCSSFiles(this.highlightBaseUrl),
        })
      } else if (message.command.startsWith(GET_IMAGE)) {
        const filePath = join(dirname(this.resourceUri!.fsPath), message.data)
        // 判断文件是否存在
        if (!existsSync(filePath)) {
          return
        }
        const mimeType = getType(filePath)
        // 判断是否为图片
        if (!mimeType?.startsWith('image')) {
          return
        }
        if (!sharpPromiseMap.has(filePath)) {
          sharpPromiseMap.set(filePath, sharp(filePath).resize(1125).toBuffer())
        }
        // readFile(filePath, { encoding: 'base64' }, (err, data) => {
        //   if (err) return
        //   const imageData = `data:${getType(filePath)};base64,${data}`
        //   this.webview.postMessage({
        //     command: message.command,
        //     data: imageData
        //   })
        // })
        sharpPromiseMap.get(filePath).then((data: any) => {
          this.webview.postMessage({
            command: message.command,
            data: `data:${getType(filePath)};base64,${data.toString('base64')}`
          })
          sharpPromiseMap.delete(filePath)
        })
      } else if (message.command === SHOW_INFORMATION_MESSAGE) {
        vscode.window.showInformationMessage(message.data)
      }
    })
  }

  // 定义一个函数，用于获取指定目录下的所有 CSS 文件
  getAllCSSFiles(directoryPath: string, filesArray: string[] = []) {
    const files = readdirSync(directoryPath);

    for (const file of files) {
      const filePath = join(directoryPath, file);
      const fileStats = statSync(filePath);

      if (fileStats.isDirectory()) {
        // 如果是子目录，递归调用函数
        this.getAllCSSFiles(filePath, filesArray);
      } else if (fileStats.isFile() && extname(filePath) === '.css') {
        // 如果是文件且扩展名是 .css，将文件路径添加到数组中
        filesArray.push(filePath.replace(this.highlightBaseUrl, '').replace('.css', ''));
      }
    }

    return filesArray;
  }

  fetch(command: string, data: any) {
    axios
      .request(data)
      .then((res) => {
        if (data.responseType === 'stream') {
          res.data.on('data', (chunk: any) => {
            this.webview.postMessage({
              command: command,
              data: chunk.toString(),
              success: true,
              finished: false,
            })
          })
          res.data.on('end', () => {
            this.webview.postMessage({
              command: command,
              data: null,
              success: true,
              finished: true,
            })
          })
          return
        }
        this.webview.postMessage({
          command: command,
          data: res.data,
          success: true,
        })
      })
      .catch((err) => {
        this.webview.postMessage({
          command: command,
          data: null,
          success: false,
        })
      })
  }

  // Send a message to the webview
  sendFileContent() {
    if (!this.resourceUri) {
      return
    }
    vscode.workspace.openTextDocument(this.resourceUri).then((doc) => {
      this.webview.postMessage({
        command: ON_FILE_CONTENT,
        data: doc.getText(),
      })
    })
  }
}

export default ExtensionMessage
