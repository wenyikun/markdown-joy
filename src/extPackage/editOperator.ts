import * as vscode from 'vscode'

// 插入内容
export function insertContent(activeEditor: vscode.TextEditor, content: string, start = 0) {
	return new Promise<void>((resolve, reject) => {
		const workspaceEdit = new vscode.WorkspaceEdit()
		workspaceEdit.insert(activeEditor.document.uri, activeEditor.document.positionAt(start), content)
		vscode.workspace.applyEdit(workspaceEdit).then(
			(success) => {
				resolve()
			},
			(err) => {
				reject({
					message: '内容写入失败',
				})
			}
		)
	})
}

// 替换内容
export function replaceContent(activeEditor: vscode.TextEditor, content: string, start = 0, end = activeEditor.document.getText().length) {
	return new Promise<void>((resolve, reject) => {
		const range = new vscode.Range(activeEditor.document.positionAt(start), activeEditor.document.positionAt(end))
		const workspaceEdit = new vscode.WorkspaceEdit()
		workspaceEdit.replace(activeEditor.document.uri, range, content)
		vscode.workspace.applyEdit(workspaceEdit).then(
			(success) => {
				resolve()
			},
			(err) => {
				reject({
					message: '内定替换失败',
				})
			}
		)
	})
}
