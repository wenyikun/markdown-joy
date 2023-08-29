import webviewMessages from './webviewMessages'
import { ElMessage } from 'element-plus'

const styleProperties = [
  'display',
  'content',
  'left',
  'right',
  'top',
  'bottom',
  'width',
  'height',
  'line-height',
  'padding',
  'font-size',
  'color',
  'font-weight',
  'position',
  'z-index',
  'border-right',
  'border-bottom',
  'background-color',
  'text-align',
  'pointer-events',
  'opacity',
  'background-size',
  'background-image',
  'margin',
  'max-width',
  'background',
  'border-top-right-radius',
]

export const configPromise = webviewMessages.getConfig()

const replacePseudoElements = (element: any) => {
  for (let i = 0; i < element.children.length; i++) {
    const el = element.children[i]
    if (el.children.length > 0) {
      replacePseudoElements(el)
    }
    // 获取伪元素的样式
    const beforeStyles = window.getComputedStyle(el, ':before')
    const afterStyles = window.getComputedStyle(el, ':after')
    if (beforeStyles.content !== 'none') {
      // 创建新的伪元素并将样式应用到它们上
      const before = document.createElement('span')
      before.textContent = beforeStyles.content.replace(/"/g, '').replace(/'/g, '').replace(/;/g, '').trim()
      styleProperties.forEach((property: any) => {
        before.style[property] = beforeStyles[property]
      })
      // 将新的伪元素添加到新元素中
      el.insertBefore(before, el.firstChild)
    }

    if (afterStyles.content !== 'none') {
      const after = document.createElement('span')
      after.textContent = afterStyles.content.replace(/"/g, '').replace(/'/g, '').replace(/;/g, '').trim()
      styleProperties.forEach((property: any) => {
        after.style[property] = afterStyles[property]
      })
      // 将新的伪元素添加到新元素中
      el.appendChild(after)
    }
  }
}

export const copyTextUsingRange = (node: HTMLElement) => {
  const markdownBody = node.querySelector('.markdown-body') as HTMLElement
  const newBody = document.createElement('section')
  newBody.innerHTML = markdownBody.innerHTML
  newBody.className = markdownBody.className

  const themeStyle = Array.from(document.styleSheets).find((item) => item.href?.startsWith('blob:')) as CSSStyleSheet
  const pseudoElementsStyle = Object.create(null)
  Array.from(themeStyle.cssRules).forEach((rule: any) => {
    rule.selectorText?.split(',').forEach((selector: any) => {
      if (selector.includes(':before') || selector.includes(':after')) {
        const sel = selector.trim()
        if (!pseudoElementsStyle[sel]) {
          pseudoElementsStyle[sel] = ''
        }
        pseudoElementsStyle[sel] += rule.cssText.substring(rule.cssText.indexOf('{') + 1, rule.cssText.lastIndexOf('}'))
      }
    })
  })
  for (const key in pseudoElementsStyle) {
    const els = newBody.querySelectorAll(key.replace(/:+before/, '').replace(/:+after/, ''))
    Array.from(els).forEach((el: any) => {
      const content = pseudoElementsStyle[key].split(';').find((item: string) => item.includes('content'))
      const textContent = content
        ? content.split(':')[1].replace(/"/g, '').replace(/'/g, '').replace(/;/g, '').trim()
        : ''
      const span = document.createElement('span')
      span.textContent = textContent
      span.setAttribute('style', pseudoElementsStyle[key])
      if (key.includes(':before')) {
        console.log(el)
        el.insertBefore(span, el.firstChild)
      } else if (key.includes(':after')) {
        el.appendChild(span)
      }
    })
  }

  node.insertBefore(newBody, markdownBody)
  markdownBody.style.display = 'none'

  const range = document.createRange()
  range.selectNode(node)

  const selection = window.getSelection() as Selection
  selection.removeAllRanges()
  selection.addRange(range)

  try {
    document.execCommand('copy')
    ElMessage.success({
      message: '复制成功',
      offset: 60,
    })
  } catch (err) {
    ElMessage.error({
      message: '复制失败',
      offset: 60,
    })
  }

  selection.removeAllRanges()
  markdownBody.removeAttribute('style')
  node.removeChild(newBody)
}
