<template>
  <div class="create-page">
    <div class="page-header">
      <h1 class="page-title">Create Game</h1>
      <p class="page-subtitle">Describe your game idea and let Multi-Agent AI generate it for you</p>
    </div>

    <div class="create-layout">
      <!-- Left: Chat Area -->
      <div class="chat-area">
        <div class="chat-messages" ref="chatContainer">
          <div v-if="messages.length === 0" class="chat-welcome">
            <div class="welcome-icon">&#x1F3AE;</div>
            <h3>What kind of game would you like to create?</h3>
            <p>Describe your idea in words - our AI agents will design and code it for you</p>
            <div class="quick-prompts">
              <button
                v-for="prompt in quickPrompts"
                :key="prompt.text"
                @click="sendMessage(prompt.text)"
                class="prompt-chip"
              >
                <span class="prompt-emoji">{{ prompt.emoji }}</span>
                {{ prompt.text }}
              </button>
            </div>
          </div>

          <div v-for="(msg, i) in messages" :key="i" :class="['message', msg.role]">
            <div class="message-content">
              <div v-if="msg.role === 'assistant' && msg.steps">
                <div class="agent-steps">
                  <div class="agent-steps-title">Multi-Agent Pipeline</div>
                  <div
                    v-for="(step, si) in msg.steps"
                    :key="si"
                    :class="['agent-step', step.status]"
                  >
                    <span class="step-icon">
                      {{ step.status === 'done' ? '&#x2705;' : step.status === 'failed' ? '&#x274C;' : '&#x23F3;' }}
                    </span>
                    <div class="step-info">
                      <span class="step-agent">{{ step.agent }}</span>
                      <span class="step-message">{{ step.message }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="msg.gameUrl" class="generated-link">
                  <button @click="previewGame(msg.gameUrl)" class="btn btn-primary btn-sm">
                    Preview Game
                  </button>
                </div>
              </div>
              <div v-else-if="msg.role === 'system'">
                {{ msg.content }}
                <div v-if="msg.traceId" class="trace-link-row">
                  <button class="trace-link" @click="openTrace(msg.traceId)">
                    View generation trace
                  </button>
                </div>
                <div v-if="msg.steps && msg.steps.length" class="agent-steps" style="margin-top: 10px;">
                  <div class="agent-steps-title">Failed Pipeline</div>
                  <div
                    v-for="(step, si) in msg.steps"
                    :key="si"
                    :class="['agent-step', step.status]"
                  >
                    <span class="step-icon">
                      {{ step.status === 'done' ? '✅' : step.status === 'failed' ? '❌' : '⏳' }}
                    </span>
                    <div class="step-info">
                      <span class="step-agent">{{ step.agent }}</span>
                      <span class="step-message">{{ step.message }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else>
                {{ msg.content }}
                <div v-if="msg.attachments && msg.attachments.length" class="message-attachments">
                  <span
                    v-for="attachment in msg.attachments"
                    :key="attachment.url"
                    class="message-attachment"
                  >
                    {{ attachment.kind }}: {{ attachment.originalName || attachment.filename }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="chat-input-area">
          <div v-if="attachments.length || uploadingFiles.length" class="attachment-list">
            <div
              v-for="attachment in attachments"
              :key="attachment.url"
              class="attachment-item"
            >
              <span class="attachment-kind">{{ attachment.kind }}</span>
              <span class="attachment-name">{{ attachment.originalName || attachment.filename }}</span>
              <span class="attachment-size">{{ formatBytes(attachment.size) }}</span>
              <button
                class="attachment-remove"
                @click="removeAttachment(attachment.url)"
                :disabled="generating"
                title="Remove attachment"
              >
                x
              </button>
            </div>
            <div
              v-for="file in uploadingFiles"
              :key="file.name"
              class="attachment-item uploading"
            >
              <span class="attachment-kind">upload</span>
              <span class="attachment-name">{{ file.name }}</span>
              <span class="attachment-size">...</span>
            </div>
          </div>
          <div class="chat-input-row">
            <input
              ref="fileInput"
              type="file"
              class="file-input"
              multiple
              accept="image/*,video/*,.txt,.md,.json,.csv,.html,.js,.css,.zip"
              @change="handleFileSelect"
              :disabled="generating"
            />
            <button
              type="button"
              class="attach-btn"
              @click="openFilePicker"
              :disabled="generating"
              title="Attach images, videos, or files"
            >
              +
            </button>
            <textarea
              v-model="inputText"
              class="chat-textarea"
              placeholder="Describe your game idea, or attach images, videos, and files as references..."
              rows="1"
              @keydown.enter.exact.prevent="sendMessage()"
              @input="autoResize"
              ref="textarea"
              :disabled="generating"
            ></textarea>
            <button
              @click="sendMessage()"
              :disabled="(!inputText.trim() && attachments.length === 0) || generating || uploadingFiles.length > 0"
              class="send-btn"
            >
              {{ generating ? '...' : '&#x27A4;' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Right: Preview + Publish -->
      <div class="preview-area">
        <div class="preview-header">
          <h3>Game Preview</h3>
          <span v-if="generatedGame" class="preview-badge">Generated</span>
        </div>
        <div class="preview-content">
          <div v-if="previewGameUrl" class="preview-frame-container">
            <iframe
              :src="previewGameUrl"
              class="preview-frame"
              sandbox="allow-scripts allow-same-origin"
              @load="onPreviewLoaded"
            ></iframe>
          </div>
          <div v-else class="preview-empty">
            <template v-if="generating">
              <div class="spinner"></div>
              <p>{{ generatingMessage }}</p>
            </template>
            <template v-else>
              <div class="preview-placeholder-icon">&#x1F3B2;</div>
              <p>Your generated game will appear here</p>
              <p class="preview-hint">Describe your game in the chat and send it</p>
            </template>
          </div>
        </div>

        <div v-if="generatedGame" class="preview-footer">
          <div class="form-group">
            <label class="form-label">Game Title</label>
            <input v-model="editTitle" class="form-input" placeholder="Enter a title..." />
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea v-model="editDesc" class="form-input" rows="2" placeholder="Brief description..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Tags</label>
            <div class="tags-input-row">
              <span v-for="(tag, i) in editTags" :key="i" class="tag tag-removable">
                {{ tag }}
                <button @click="editTags.splice(i, 1)" class="tag-remove">&times;</button>
              </span>
              <input
                v-model="newTag"
                class="tag-input"
                placeholder="Add tag..."
                @keydown.enter.prevent="addTag"
                @keydown.comma.prevent="addTag"
              />
            </div>
          </div>
          <button @click="publishGame" :disabled="!editTitle.trim() || publishing" class="btn btn-primary btn-block btn-lg">
            {{ publishing ? 'Publishing...' : 'Publish Game' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const router = useRouter()
const auth = useAuthStore()

const inputText = ref('')
const messages = ref([])
const generating = ref(false)
const generatingMessage = ref('')
const previewGameUrl = ref('')
const generatedGame = ref(null)
const editTitle = ref('')
const editDesc = ref('')
const editTags = ref([])
const newTag = ref('')
const publishing = ref(false)
const chatContainer = ref(null)
const textarea = ref(null)
const fileInput = ref(null)
const attachments = ref([])
const uploadingFiles = ref([])

const quickPrompts = [
  { emoji: '🐍', text: 'Create a snake game with power-ups' },
  { emoji: '👾', text: 'Make a space shooter with waves of enemies' },
  { emoji: '🃏', text: 'Build a card matching memory game' },
  { emoji: '🏃', text: 'Design a 2D platformer with jumping and coins' },
  { emoji: '🧱', text: 'Create a brick breaker arcade game' },
  { emoji: '🎯', text: 'Make an aim trainer / target shooting game' },
]

onMounted(() => {
  if (!auth.isLoggedIn) {
    router.push('/login')
  }
})

function autoResize() {
  const el = textarea.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
}

function scrollToBottom() {
  nextTick(() => {
    const el = chatContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function openFilePicker() {
  if (fileInput.value && !generating.value) {
    fileInput.value.click()
  }
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function removeAttachment(url) {
  attachments.value = attachments.value.filter(attachment => attachment.url !== url)
}

async function handleFileSelect(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  uploadingFiles.value.push(...files.map(file => ({ name: file.name })))

  try {
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/upload/file', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000
      })
      attachments.value.push(res.data)
    }
  } catch (e) {
    const errMsg = e.response?.data?.error || e.message || 'Upload failed'
    messages.value.push({
      role: 'system',
      content: 'Upload error: ' + errMsg
    })
    scrollToBottom()
  } finally {
    uploadingFiles.value = []
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function sendMessage(promptText) {
  const text = (promptText || inputText.value.trim())
  if ((!text && attachments.value.length === 0) || generating.value || uploadingFiles.value.length > 0) return

  const selectedAttachments = attachments.value.map(attachment => ({ ...attachment }))
  messages.value.push({
    role: 'user',
    content: text || 'Use the uploaded references to create a小游戏.',
    attachments: selectedAttachments
  })
  inputText.value = ''
  attachments.value = []
  if (textarea.value) textarea.value.style.height = 'auto'
  scrollToBottom()

  generating.value = true
  generatingMessage.value = selectedAttachments.length
    ? 'Multimodal AI agents are analyzing your references...'
    : 'AI agents are working...'

  try {
    const res = await api.post('/games/generate', {
      prompt: text || 'Create a小游戏 based on the uploaded creative references.',
      attachments: selectedAttachments
    })
    const { game, steps, status, error, traceId } = res.data

    if (status === 'failed' || error) {
      messages.value.push({
        role: 'system',
        content: error || 'Generation failed',
        traceId,
        steps
      })
      generatingMessage.value = ''
      generating.value = false
      scrollToBottom()
      return
    }

    generatedGame.value = game
    editTitle.value = game?.title || ''
    editDesc.value = game?.description || ''
    editTags.value = game?.tags || []

    messages.value.push({
      role: 'assistant',
      content: '',
      steps,
      gameUrl: game?.gameUrl,
      traceId
    })
    previewGameUrl.value = game?.gameUrl
    generatingMessage.value = ''
  } catch (e) {
    const errData = e.response?.data
    const errMsg = errData?.error || e.message || 'Generation failed'
    const errTraceId = errData?.traceId || null

    messages.value.push({
      role: 'system',
      content: errTraceId ? `Generation failed [Trace: ${errTraceId.slice(0, 8)}...]: ` + errMsg : errMsg,
      traceId: errTraceId
    })
    generatingMessage.value = ''
  } finally {
    generating.value = false
    scrollToBottom()
  }
}

function previewGame(url) {
  previewGameUrl.value = url
  nextTick(() => {
    const iframe = document.querySelector('.preview-frame')
    if (iframe) iframe.src = url
  })
}

function onPreviewLoaded() {
  console.log('Game preview loaded')
}

function addTag() {
  const tag = newTag.value.trim().replace(',', '').trim()
  if (tag && !editTags.value.includes(tag)) {
    editTags.value.push(tag)
  }
  newTag.value = ''
}

function publishGame() {
  window.open('/play/' + generatedGame.value.id, '_blank')
  router.push('/game/' + generatedGame.value.id)
}

function openTrace(traceId) {
  window.open(`/trace/${traceId}`, '_blank')
}
</script>

<style scoped>
.create-layout {
  display: flex;
  gap: 24px;
  height: calc(100vh - 200px);
  min-height: 650px;
}

/* Chat Area */
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.chat-welcome { text-align: center; padding: 40px 20px; }
.welcome-icon { font-size: 48px; margin-bottom: 16px; }
.chat-welcome h3 { font-size: 18px; margin-bottom: 8px; }
.chat-welcome p { color: var(--text-muted); margin-bottom: 24px; font-size: 14px; }

.quick-prompts {
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
}

.prompt-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 18px; border-radius: 24px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text); cursor: pointer; font-size: 13px;
  transition: all 0.2s;
}
.prompt-chip:hover { border-color: var(--primary); background: rgba(99,102,241,0.1); }
.prompt-emoji { font-size: 16px; }

.message { max-width: 85%; padding: 14px 18px; border-radius: var(--radius-sm); font-size: 14px; line-height: 1.6; }
.message.user { align-self: flex-end; background: var(--primary); color: #fff; }
.message.assistant { align-self: flex-start; background: var(--border); width: 100%; max-width: 100%; }
.message.system { align-self: flex-start; background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
.message-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.message-attachment { max-width: 100%; padding: 4px 8px; border-radius: 6px; background: rgba(255,255,255,0.14); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Agent Steps */
.agent-steps { margin: 4px 0; }
.agent-steps-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; }
.agent-step { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.agent-step:last-child { border-bottom: none; }
.step-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.step-info { display: flex; flex-direction: column; gap: 2px; }
.step-agent { font-size: 13px; font-weight: 600; }
.step-message { font-size: 12px; color: var(--text-muted); }
.agent-step.failed .step-agent { color: #f87171; }

.generated-link { margin-top: 12px; }
.btn-sm { padding: 6px 16px; font-size: 13px; }

/* Input */
.chat-input-area { border-top: 1px solid var(--border); padding: 16px; }
.chat-input-row { display: flex; align-items: flex-end; gap: 10px; }
.file-input { display: none; }
.attach-btn {
  width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); cursor: pointer;
  font-size: 22px; line-height: 1; display: flex; align-items: center;
  justify-content: center; flex-shrink: 0; transition: all 0.2s;
}
.attach-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.attach-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.attachment-list {
  display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;
  max-height: 132px; overflow-y: auto;
}
.attachment-item {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border);
  background: var(--bg); font-size: 12px;
}
.attachment-kind {
  min-width: 44px; padding: 2px 7px; border-radius: 6px;
  background: rgba(99,102,241,0.16); color: var(--primary);
  text-align: center; text-transform: uppercase; font-size: 10px; font-weight: 700;
}
.attachment-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-size { color: var(--text-muted); white-space: nowrap; }
.attachment-remove {
  width: 22px; height: 22px; border: none; border-radius: 50%;
  background: transparent; color: var(--text-muted); cursor: pointer;
}
.attachment-remove:hover:not(:disabled) { color: #f87171; background: rgba(248,113,113,0.12); }
.attachment-item.uploading { opacity: 0.75; }
.chat-textarea {
  flex: 1; padding: 12px 16px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--bg);
  color: var(--text); font-size: 14px; font-family: inherit;
  resize: none; max-height: 120px;
}
.chat-textarea:focus { outline: none; border-color: var(--primary); }
.send-btn {
  width: 44px; height: 44px; border-radius: 50%; border: none;
  background: var(--primary); color: #fff; cursor: pointer;
  font-size: 18px; display: flex; align-items: center;
  justify-content: center; flex-shrink: 0; transition: background 0.2s;
}
.send-btn:disabled { background: var(--border); cursor: not-allowed; }
.send-btn:not(:disabled):hover { background: var(--primary-hover); }

.trace-link-row { margin-top: 10px; }
.trace-link {
  background: none; border: 1px solid rgba(248,113,113,0.4); border-radius: 6px;
  color: #f87171; cursor: pointer; font-size: 12px; padding: 4px 12px;
  transition: all 0.2s;
}
.trace-link:hover { background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.6); }

/* Preview */
.preview-area {
  width: 440px; display: flex; flex-direction: column;
  background: var(--bg-card); border-radius: var(--radius);
  border: 1px solid var(--border); overflow: hidden; flex-shrink: 0;
}
.preview-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--border); }
.preview-header h3 { font-size: 16px; font-weight: 600; }
.preview-badge { font-size: 11px; padding: 3px 10px; border-radius: 12px; background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
.preview-content { flex: 1; background: #000; }
.preview-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 24px; gap: 12px; }
.preview-placeholder-icon { font-size: 48px; }
.preview-empty p { color: var(--text-muted); font-size: 14px; text-align: center; }
.preview-hint { font-size: 12px !important; opacity: 0.6; }
.preview-frame-container { width: 100%; height: 100%; }
.preview-frame { width: 100%; height: 100%; border: none; }
.preview-footer { padding: 16px; border-top: 1px solid var(--border); }
.preview-footer .form-group { margin-bottom: 12px; }
.preview-footer .form-input { font-size: 13px; padding: 10px 12px; }
.tags-input-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 12px; background: var(--bg); border-radius: var(--radius-sm); border: 1px solid var(--border); min-height: 42px; }
.tag-removable { display: flex; align-items: center; gap: 4px; }
.tag-remove { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 16px; padding: 0 2px; line-height: 1; }
.tag-input { flex: 1; min-width: 80px; background: transparent; border: none; color: var(--text); font-size: 13px; outline: none; padding: 2px 4px; }

@media (max-width: 1024px) {
  .create-layout { flex-direction: column; height: auto; }
  .preview-area { width: 100%; height: 400px; }
}
</style>
