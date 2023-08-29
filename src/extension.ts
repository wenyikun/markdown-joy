import * as vscode from 'vscode'
import { basename, dirname } from 'path'
import { readFileSync } from 'fs'
import ExtensionMessage from './extPackage/ExtensionMessage'
import axios from 'axios'
import { encode } from 'gpt-3-encoder'
import { insertContent, replaceContent } from './extPackage/editOperator'

const stringLimit: any = {
	"gpt-3.5-turbo": 2000,
	"gpt-3.5-turbo-0301": 2000,
	"gpt-3.5-turbo-0613": 2000,
	"gpt-3.5-turbo-16k": 8000,
	"gpt-3.5-turbo-16k-0613": 8000,
	"gpt-4": 4000,
	"gpt-4-0314": 4000,
	"gpt-4-0613": 4000,
	"gpt-4-32k": 16000,
	"gpt-4-32k-0314": 16000,
	"gpt-4-32k-0613": 16000
}

// this is the entry point of your extension
export function activate(context: vscode.ExtensionContext) {
	// 打开文件并预览
	const openAndPreveiewFile = (resourceUri: vscode.Uri) => {
		if (resourceUri) {
			vscode.window.showTextDocument(resourceUri).then(() => {
				const staticUri = vscode.Uri.joinPath(context.extensionUri, 'dist/web/')
				const panel = vscode.window.createWebviewPanel(
					'markdown-joy',
					'Preview ' + basename(resourceUri.fsPath),
					vscode.ViewColumn.Beside,
					{
						enableScripts: true,
						retainContextWhenHidden: true,
						localResourceRoots: [vscode.Uri.file(dirname(resourceUri.fsPath)), context.extensionUri],
					}
				)
				const webviewContent = readFileSync(vscode.Uri.joinPath(context.extensionUri, 'dist/web/index.html').fsPath, {
					encoding: 'utf-8',
				})
				panel.webview.html = webviewContent.replace('BASE_URL', panel.webview.asWebviewUri(staticUri).toString())
				const extensionMessage = new ExtensionMessage(panel.webview, {
					resourceUri,
					context,
				})
				// 文件内容发生改变
				vscode.workspace.onDidChangeTextDocument((e) => {
					if (resourceUri.fsPath === e.document.fileName) {
						extensionMessage.sendFileContent()
					}
				})
			})
		}
	}

	const commands = ["markdown-joy.translateSelection", "markdown-joy.polishSelection", "markdown-joy.translateWhole", "markdown-joy.polishWhole"]

	const getMessages = (command: string, userContent: string, lang = '') => {
		if (command === "markdown-joy.translateSelection" || command === "markdown-joy.translateWhole") {
			return [
				{
					role: 'system',
					content: `你是一个翻译助手，用户将会提供一段文本，你需要保留原格式并翻译成${lang}，不需要其他任何说明。`,
				},
				{
					role: 'user',
					content: userContent,
				},
			]
		} else if (command === "markdown-joy.polishSelection" || command === "markdown-joy.polishWhole") {
			return [
				{
					role: 'system',
					content: '用户将会提供一段文本，你需要保留原来的格式润色文段，使逻辑更通顺，不需要其他任何说明。',
				},
				{
					role: 'user',
					content: userContent,
				},
			]
		} else {
			return [
				{
					role: 'user',
					content: userContent,
				},
			]
		}
	}

	const contentHandle = async (command: string) => {
		const activeEditor = vscode.window.activeTextEditor
		if (!activeEditor) {
			vscode.window.showErrorMessage('没有活动编辑器.')
			return
		}

		// 翻译需要选择目标语言
		let lang
		if (command === 'markdown-joy.translateSelection' || command === 'markdown-joy.translateWhole') {
			lang = await vscode.window.showQuickPick(['简体中文', 'English', '日本語', 'Español', 'Português', '한국어'], {
				title: '目标语言',
				canPickMany: false,
			})
		}
		const config = vscode.workspace.getConfiguration('markdown-joy')
		if (!config.get('chatApiKey') || !config.get('chatApi')) {
			const result = await vscode.window.showInformationMessage('操作依赖于ChatGPT，需要配置请求参数，是否去配置?', '是', '否')
			if (result === '是') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'markdown-joy')
			}
			return
		}
		vscode.window.setStatusBarMessage('$(sync~spin) Polishing...')
		const selection = activeEditor.selection
		let previous = ''
		let start = 0
		let end = 0
		if (selection.isEmpty) {
			previous = activeEditor.document.getText()
		} else {
			previous = activeEditor.document.getText(selection)
			start = end = activeEditor.document.offsetAt(selection.start)
		}

		// 判断字符是否超过限制
		const model = config.get('chatModel') as string
		if (encode(previous).length > stringLimit[model]) {
			vscode.window.showInformationMessage('字符超出 GPT 限制，建议采用分段处理')
			return
		}

		axios
			.post(
				config.get('chatApi') as string,
				{
					model,
					messages: getMessages(command, previous, lang),
					stream: true,
				},
				{
					headers: {
						'content-type': 'application/json',
						Authorization: `Bearer ${config.get('chatApiKey') as string}`,
					},
					responseType: 'stream',
				}
			)
			.then(async (res) => {
				const workspaceEdit = new vscode.WorkspaceEdit()
				workspaceEdit.delete(
					activeEditor.document.uri,
					selection.isEmpty ? new vscode.Range(0, 0, activeEditor.document.lineCount, 0) : selection
				)
				await vscode.workspace.applyEdit(workspaceEdit)
				let content = ''
				let adding = false
				const promises: Promise<any>[] = []
				res.data.on('data', (chunk: any) => {
					const datas = chunk.toString().split('\n\n')
					datas.forEach((list: string) => {
						const data = list.replace('data: ', '')
						if (data.startsWith('{')) {
							const json = JSON.parse(data)
							let deltaContent = json.choices[0].delta?.content || ''
							if (activeEditor.document.eol === 2) {
								deltaContent = deltaContent.replace(/\n/g, '\r\n')
							}
							content += deltaContent
							if (adding || deltaContent.length === 0) {
								return
							}
							adding = true
							const promise = insertContent(activeEditor, content, end).then(() => {
								adding = false
							})
							promises.push(promise)
							end += content.length
							content = ''
						}
					})
				})
				res.data.on('end', () => {
					// 把原来内容添加到上一级历史记录
					// const text = activeEditor.document.getText(new vscode.Range(activeEditor.document.positionAt(start), activeEditor.document.positionAt(end)))
					// replaceContent(activeEditor, previous, start, end).then(() => {
					// 	replaceContent(activeEditor, text, start, start + previous.length)
					// })
				})
			})
			.catch((err) => {
				if (err?.message) {
					vscode.window.showErrorMessage(err.message)
				} else {
					vscode.window.showErrorMessage('Error')
				}
			})
			.finally(() => {
				vscode.window.setStatusBarMessage('')
			})
	}

	// vscode.window.onDidChangeTextEditorVisibleRanges(event => {
	// 	console.log(event.textEditor.visibleRanges)
	// })

	context.subscriptions.push(vscode.commands.registerCommand(
		'markdown-joy.openAndPreveiewFile',
		openAndPreveiewFile
	))
	context.subscriptions.push(vscode.commands.registerCommand(
		'markdown-joy.preveiewFile',
		openAndPreveiewFile
	))
	commands.forEach(command => {
		context.subscriptions.push(vscode.commands.registerCommand(command, () => {
			contentHandle(command)
		}))
	})
}

export function deactivate() { }
