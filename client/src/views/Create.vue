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
              </div>
              <div v-else>{{ msg.content }}</div>
            </div>
          </div>
        </div>

        <div class="chat-input-area">
          <div class="chat-input-row">
            <textarea
              v-model="inputText"
              class="chat-textarea"
              placeholder="Describe your game idea... (e.g., 'Create a snake game where the snake grows faster each level')"
              rows="1"
              @keydown.enter.exact.prevent="sendMessage()"
              @input="autoResize"
              ref="textarea"
              :disabled="generating"
            ></textarea>
            <button
              @click="sendMessage()"
              :disabled="!inputText.trim() || generating"
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

async function sendMessage(promptText) {
  const text = (promptText || inputText.value.trim())
  if (!text || generating.value) return

  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  if (textarea.value) textarea.value.style.height = 'auto'
  scrollToBottom()

  generating.value = true
  generatingMessage.value = 'AI agents are working...'

  try {
    const res = await api.post('/games/generate', { prompt: text })
    const { game, steps } = res.data

    generatedGame.value = game
    editTitle.value = game.title || ''
    editDesc.value = game.description || ''
    editTags.value = game.tags || []

    messages.value.push({
      role: 'assistant',
      content: '',
      steps,
      gameUrl: game.gameUrl
    })
    previewGameUrl.value = game.gameUrl
    generatingMessage.value = ''
  } catch (e) {
    const errMsg = e.response?.data?.error || e.message || 'Generation failed'
    messages.value.push({
      role: 'system',
      content: 'Error: ' + errMsg
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
