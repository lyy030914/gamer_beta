<template>
  <div class="detail-page" v-if="game">
    <button @click="$router.back()" class="back-btn">&larr; Back</button>

    <div class="detail-hero">
      <div class="detail-cover">
        <img v-if="game.coverUrl" :src="game.coverUrl" :alt="game.title" />
        <div v-else class="cover-placeholder">
          <span>{{ game.title.charAt(0).toUpperCase() }}</span>
        </div>
      </div>
      <div class="detail-main">
        <h1 class="detail-title">{{ game.title }}</h1>
        <div class="detail-tags" v-if="game.tags && game.tags.length">
          <span v-for="tag in game.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <p class="detail-desc">{{ game.description || 'No description provided.' }}</p>
        <div class="detail-author">
          <span class="author-avatar">{{ game.author?.nickname?.charAt(0)?.toUpperCase() || '?' }}</span>
          <div>
            <div class="author-name">{{ game.author?.nickname || 'Unknown' }}</div>
            <div class="detail-date">Published {{ formatDate(game.createdAt) }}</div>
    <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
      <div class="modal-card">
        <h3>Delete Game</h3>
        <p>Are you sure you want to delete <strong>"{{ deleteTarget.title }}"</strong>? This action cannot be undone.</p>
        <div class="modal-actions">
          <button class="btn" @click="deleteTarget = null">Cancel</button>
          <button class="btn btn-danger" @click="handleDelete">Delete</button>
        </div>
      </div>
    </div>
  </div>
        </div>
        <div class="detail-stats">
          <span>{{ formatCount(game.playCount) }} plays</span>
        </div>
        <div class="detail-actions">
          <button @click="playGame" class="btn btn-primary btn-lg">Play Now</button>
          <button
            v-if="auth.user && auth.user.id === game.author?.id"
            @click="pushToGithub"
            :disabled="pushingGithub"
            class="btn btn-github-outline"
          >{{ pushingGithub ? 'Pushing...' : 'Push to GitHub' }}</button>
          <button
            v-if="auth.user && auth.user.id === game.author?.id"
            @click="deleteTarget = game"
            class="btn btn-danger-outline"
          >Delete Game</button>
        </div>
      </div>
    </div>

    <div class="detail-section" v-if="game.meta && Object.keys(game.meta).length">
      <h2>Game Info</h2>
      <div class="meta-grid">
        <div v-for="(value, key) in game.meta" :key="key" class="meta-item">
          <span class="meta-key">{{ key }}</span>
          <span class="meta-value">{{ value }}</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="loading" class="loading">
    <div class="spinner"></div>
    <p>Loading game...</p>
  </div>
  <div v-else class="empty-state">
    <h3>Game not found</h3>
    <router-link to="/" class="btn btn-primary">Back to Home</router-link>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGamesStore } from '../stores/games'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const route = useRoute()
const router = useRouter()
const gamesStore = useGamesStore()
const auth = useAuthStore()
const game = ref(null)
const loading = ref(true)
const deleteTarget = ref(null)
const pushingGithub = ref(false)

onMounted(async () => {
  try {
    game.value = await gamesStore.fetchGame(route.params.id)
  } catch (e) {
    game.value = null
  } finally {
    loading.value = false
  }
})

function playGame() {
  router.push(`/play/${game.value.id}`)
}

async function pushToGithub() {
  const repo = prompt('Repository name (default: your-username.github.io):')
  if (repo === null) return
  pushingGithub.value = true
  try {
    const res = await api.post(`/games/${game.value.id}/push-github`, { repo: repo || undefined })
    alert('Pushed! ' + res.data.url)
    window.open(res.data.url, '_blank')
  } catch (e) {
    alert(e.response?.data?.error || 'Push failed. Make sure you logged in with GitHub.')
  } finally {
    pushingGithub.value = false
  }
}

async function handleDelete() {
  if (!deleteTarget.value) return
  await gamesStore.deleteGame(deleteTarget.value.id)
  router.push('/')
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatCount(count) {
  if (!count) return '0'
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M'
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K'
  return count.toString()
}
</script>

<style scoped>
.back-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  margin-bottom: 24px;
  padding: 0;
}

.back-btn:hover {
  color: var(--primary);
}

.detail-hero {
  display: flex;
  gap: 40px;
  margin-bottom: 40px;
}

.detail-cover {
  width: 500px;
  aspect-ratio: 16 / 10;
  border-radius: var(--radius);
  overflow: hidden;
  flex-shrink: 0;
}

.detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #a855f7);
}

.cover-placeholder span {
  font-size: 64px;
  font-weight: 700;
  color: #fff;
}

.detail-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-title {
  font-size: 32px;
  font-weight: 700;
}

.detail-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-desc {
  color: var(--text-muted);
  font-size: 15px;
  line-height: 1.7;
  flex: 1;
}

.detail-author {
  display: flex;
  align-items: center;
  gap: 12px;
}

.author-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.author-name {
  font-weight: 600;
  font-size: 15px;
}

.detail-date {
  font-size: 13px;
  color: var(--text-muted);
}

.detail-stats {
  font-size: 14px;
  color: var(--text-muted);
}

.detail-section {
  margin-top: 40px;
}

.detail-section h2 {
  font-size: 20px;
  margin-bottom: 16px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.meta-item {
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-key {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.meta-value {
  font-size: 14px;
  color: var(--text);
}

.detail-actions {
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
}

.btn-github-outline {
  background: transparent; border: 1px solid rgba(63,185,80,0.4); color: #3fb950;
  padding: 10px 24px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-github-outline:hover { background: rgba(63,185,80,0.1); border-color: #3fb950; }
.btn-github-outline:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-danger-outline {
  background: transparent;
  border: 1px solid rgba(239,68,68,0.4);
  color: #ef4444;
  padding: 10px 24px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger-outline:hover {
  background: rgba(239,68,68,0.1);
  border-color: #ef4444;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  padding: 28px 32px;
  max-width: 420px;
  width: 90%;
}

.modal-card h3 {
  font-size: 20px;
  margin-bottom: 12px;
}

.modal-card p {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 24px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-danger {
  background: #ef4444;
  border: none;
  color: #fff;
  padding: 10px 24px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger:hover { background: #dc2626; }

@media (max-width: 768px) {
  .detail-hero {
    flex-direction: column;
  }
  .detail-cover {
    width: 100%;
  }
}
</style>
