<script lang="ts" setup>
import { ref, watch, onMounted } from 'vue'
import { Viewer } from '@bytemd/vue-next'
import highlight from '@bytemd/plugin-highlight'
import gfm from '@bytemd/plugin-gfm'
import math from '@bytemd/plugin-math'
import frontmatter from '@bytemd/plugin-frontmatter'
import webviewMessages from './utils/webviewMessages'
import { ON_FILE_CONTENT } from './utils/messageTypes'
import themes from './themes/index'
// import themes from 'juejin-markdown-themes'
import { configPromise, copyTextUsingRange } from './utils'
import { visit } from 'unist-util-visit'

const content = ref('')
const highlightType = ref(localStorage.getItem('markdown-joy-highlight') || 'vs2015')
const highlightStyle = ref('')
const highlights = ref([])
const themeType = ref(localStorage.getItem('markdown-joy-theme') || 'juejin')
const themeCss = ref('')
const wrapper = ref()
const imageMap = new Map()
const now = Date.now()
const plugins = [
  gfm(),
  highlight(),
  math(),
  frontmatter(),
  {
    remark: (processor: any) =>
      processor.use(() => (tree: any, file: any) => {
        visit(tree, 'image', (value) => {
          value.alt = value.url
          if (!/https?:|data:/.test(value.url)) {
            value.url = './img.svg?now=' + now
          }
        })
      }),
    viewerEffect({ markdownBody }: any) {
      // 复制按钮插件
      const els = markdownBody.querySelectorAll('img')
      if (els.length === 0) return
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        if (imageMap.has(el.alt)) {
          el.src = imageMap.get(el.alt)
        } else if (el.src.includes('img.svg?now=' + now)) {
          webviewMessages.getImage(el.alt).then((content) => {
            el.src = content
            imageMap.set(el.alt, content)
          })
        }
      }
    },
  },
  // Add more plugins here
]

const addTheme = () => {
  // let style = document.getElementById('markdown-theme-style')
  // if (style) {
  //   style.textContent = themes[themeType.value]?.style || ''
  // } else {
  //   let style = document.createElement('style')
  //   style.id = 'markdown-theme-style'
  //   style.textContent = themes[themeType.value]?.style || ''
  //   document.head.append(style)
  // }
  // 将CSS内容转换为Blob对象
  const blob = new Blob([themes[themeType.value] || ''], { type: 'text/css' })

  // 创建一个URL指向Blob对象
  themeCss.value = URL.createObjectURL(blob)
}
addTheme()

watch(
  () => themeType.value,
  () => {
    localStorage.setItem('markdown-joy-theme', themeType.value)
    addTheme()
  }
)

configPromise.then((config: any) => {
  highlightStyle.value = config.highlightBaseUrl + highlightType.value + '.css'
})

watch(
  () => highlightType.value,
  () => {
    localStorage.setItem('markdown-joy-highlight', highlightType.value)
    configPromise.then((config: any) => {
      highlightStyle.value = config.highlightBaseUrl + highlightType.value + '.css'
    })
  }
)

webviewMessages.getFileContent().then((data: any) => {
  content.value = data
})

webviewMessages.on(ON_FILE_CONTENT, (data: any) => {
  content.value = data
})

webviewMessages.getHighlightStyles().then((data: any) => {
  highlights.value = data
})

const copyContent = () => {
  copyTextUsingRange(wrapper.value.querySelector('.viewer'))
}
</script>

<template>
  <link rel="stylesheet" :href="themeCss" />
  <link rel="stylesheet" :href="highlightStyle" />
  <div ref="wrapper">
    <el-form inline class="tools">
      <el-form-item label="主题" style="margin: 0">
        <el-select class="tools-select" v-model="themeType" placeholder="选择主题样式">
          <el-option v-for="item in Object.keys(themes)" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="代码高亮" style="margin: 0">
        <el-select class="tools-select" v-model="highlightType" placeholder="选择代码高亮样式">
          <el-option v-for="item in highlights" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item style="margin: 0">
        <el-button type="primary" @click="copyContent">复制</el-button>
      </el-form-item>
    </el-form>
    <div class="viewer">
      <Viewer :value="content" :plugins="plugins"></Viewer>
      <section><br /></section>
    </div>
  </div>
</template>

<style>
.tools {
  position: fixed;
  z-index: 9999;
  top: 0;
  left: 0;
  width: 100%;
  padding: 5px 20px;
  display: flex;
  gap: 15px;
  background-color: #fff;
  box-shadow: 0 3px 5px #eee;
}

.tools-select {
  width: 120px;
}

.viewer {
  padding-top: 42px;
}
</style>
