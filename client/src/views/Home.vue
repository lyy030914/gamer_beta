<template>
  <div class="home-page">
    <div class="page-header">
      <h1 class="page-title">Game Gallery</h1>
      <p class="page-subtitle">Discover and play interactive games created by the community</p>
    </div>

    <div class="tag-filter" v-if="allTags.length">
      <button
        :class="['tag-chip', { active: !activeTag && !showFavorites }]"
        @click="selectTag(''); showFavorites = false"
      >All</button>
      <button
        v-if="auth.isLoggedIn"
        :class="['tag-chip', 'fav-chip', { active: showFavorites }]"
        @click="showFavorites = !showFavorites; if(showFavorites){activeTag=''; loadFavorites()}else{selectTag('')}"
      >❤️ My Favorites</button>
      <button
        v-for="tag in allTags"
        :key="tag"
        :class="['tag-chip', { active: activeTag === tag }]"
        @click="selectTag(tag)"
      >{{ tag }}</button>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading games...</p>
    </div>

    <div v-else-if="games.length === 0" class="empty-state">
      <h3>No games yet</h3>
      <p>Be the first to create an interactive game!</p>
      <router-link to="/create" class="btn btn-primary btn-lg">Create a Game</router-link>
    </div>

    <div v-else class="game-grid">
      <div v-for="game in games" :key="game.id" class="game-card card">
        <div class="game-cover" @click="goToDetail(game.id)">
          <img v-if="game.coverUrl" :src="game.coverUrl" :alt="game.title" />
          <div v-else class="game-cover-placeholder">
            <span>{{ game.title.charAt(0).toUpperCase() }}</span>
          </div>
          <div class="game-cover-overlay">
            <button class="play-btn" @click.stop="playGame(game.id)">Play</button>
          </div>
        </div>
        <div class="game-info">
          <div class="game-info-top">
            <h3 class="game-title" @click="goToDetail(game.id)">{{ game.title }}</h3>
            <div class="card-actions">
              <button
                v-if="auth.isLoggedIn"
                class="fav-btn"
                :class="{ faved: isFaved(game.id) }"
                @click.stop="toggleFav(game.id)"
                :title="isFaved(game.id) ? 'Remove from favorites' : 'Add to favorites'"
              >{{ isFaved(game.id) ? '❤️' : '🤍' }}</button>
              <button
                v-if="auth.user && auth.user.id === game.author?.id"
                class="delete-btn"
                @click.stop="confirmDelete(game)"
                title="Delete game"
              >&#x1F5D1;</button>
            </div>
          </div>
          <p class="game-desc">{{ game.description || 'No description' }}</p>
          <div class="game-tags" v-if="game.tags && game.tags.length">
            <span v-for="tag in game.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
          <div class="game-meta">
            <div class="game-author">
              <span class="author-avatar">{{ game.author?.nickname?.charAt(0)?.toUpperCase() || '?' }}</span>
              <span class="author-name">{{ game.author?.nickname || 'Unknown' }}</span>
            </div>
            <div class="game-stats">
              <span class="play-count">{{ formatCount(game.playCount) }} plays</span>
              <span class="game-date">{{ formatDate(game.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="total > pageSize" class="pagination">
      <button :disabled="page <= 1" @click="changePage(page - 1)" class="btn">Previous</button>
      <span class="page-info">Page {{ page }}</span>
      <button :disabled="page * pageSize >= total" @click="changePage(page + 1)" class="btn">Next</button>
    </div>

    <div v-if="deleteTarget" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal-card">
        <h3>Delete Game</h3>
        <p>Are you sure you want to delete <strong>"{{ deleteTarget.title }}"</strong>? This action cannot be undone.</p>
        <div class="modal-actions">
          <button class="btn" @click="cancelDelete">Cancel</button>
          <button class="btn btn-danger" @click="doDelete">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useGamesStore } from '../stores/games'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const gamesStore = useGamesStore()
const auth = useAuthStore()
const router = useRouter()
const { games, total, loading } = storeToRefs(gamesStore)
const page = ref(1)
const pageSize = 20
const deleteTarget = ref(null)
const allTags = ref([])
const activeTag = ref('')
const showFavorites = ref(false)
const favedIds = ref(new Set())

onMounted(() => {
  fetchTags()
  gamesStore.fetchGames({ page: page.value, pageSize })
})

async function fetchTags() {
  try { const res = await api.get('/games/tags'); allTags.value = res.data.tags } catch {}
}

function selectTag(tag) {
  showFavorites.value = false
  activeTag.value = tag
  page.value = 1
  gamesStore.fetchGames({ page: 1, pageSize, tag: tag || undefined })
}

function isFaved(gameId) { return favedIds.value.has(gameId) }
async function toggleFav(gameId) {
  try {
    const res = await api.post(`/favorites/${gameId}`)
    if (res.data.favorited) favedIds.value.add(gameId)
    else favedIds.value.delete(gameId)
  } catch {}
}

async function loadFavorites() {
  try {
    const res = await api.get('/favorites', { params: { pageSize: 50 } })
    gamesStore.games = res.data.games
    gamesStore.total = res.data.total
    favedIds.value = new Set(res.data.games.map(g => g.id))
  } catch {}
}

function confirmDelete(game) {
  deleteTarget.value = game
}

async function doDelete() {
  if (!deleteTarget.value) return
  await gamesStore.deleteGame(deleteTarget.value.id)
  deleteTarget.value = null
}

function cancelDelete() {
  deleteTarget.value = null
}

onMounted(() => {
  gamesStore.fetchGames({ page: page.value, pageSize })
})

function changePage(p) {
  page.value = p
  gamesStore.fetchGames({ page: p, pageSize })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goToDetail(id) {
  router.push(`/game/${id}`)
}

function playGame(id) {
  router.push(`/play/${id}`)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatCount(count) {
  if (!count) return '0'
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M'
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K'
  return count.toString()
}
</script>

<style scoped>
.tag-filter {
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;
}
.tag-chip {
  padding: 6px 16px; border-radius: 20px; border: 1px solid var(--border);
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-size: 13px; transition: all 0.2s;
}
.tag-chip:hover { border-color: var(--primary); color: var(--primary); }
.tag-chip.active {
  background: var(--primary); border-color: var(--primary); color: #fff;
}
.fav-chip.active { background: #ef4444; border-color: #ef4444; }

.card-actions { display: flex; align-items: center; gap: 4px; }
.fav-btn { background: none; border: none; cursor: pointer; font-size: 16px; padding: 2px 4px; transition: transform 0.2s; }
.fav-btn:hover { transform: scale(1.2); }

.game-card {
  cursor: pointer;
}

.game-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: var(--bg);
}

.game-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.game-card:hover .game-cover img {
  transform: scale(1.05);
}

.game-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #a855f7);
}

.game-cover-placeholder span {
  font-size: 48px;
  font-weight: 700;
  color: #fff;
}

.game-cover-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.2s;
}

.game-card:hover .game-cover-overlay {
  opacity: 1;
}

.play-btn {
  padding: 10px 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.play-btn:hover {
  transform: scale(1.05);
}

.game-info {
  padding: 16px;
}

.game-info-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.delete-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
}
.delete-btn:hover {
  color: #ef4444;
  background: rgba(239,68,68,0.1);
}

.game-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.game-title:hover {
  color: var(--primary);
}

.game-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.game-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.game-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.game-author {
  display: flex;
  align-items: center;
  gap: 8px;
}

.author-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.author-name {
  font-size: 13px;
  color: var(--text-muted);
}

.game-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.play-count {
  font-size: 12px;
  color: var(--primary);
}

.game-date {
  font-size: 11px;
  color: var(--text-muted);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 40px;
  padding-bottom: 24px;
}

.page-info {
  font-size: 14px;
  color: var(--text-muted);
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
  border-color: #ef4444;
  color: #fff;
}
.btn-danger:hover {
  background: #dc2626;
}
</style>
